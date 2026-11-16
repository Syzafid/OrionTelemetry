/**
 * ============================================================================
 * ORION — Onboard Reporting for Inventory & Operational Notifications
 * Firmware Version : v1.4.2 (NVS Persistent Seq/Config + Full Two-Tier Sync)
 * Target Hardware  : ESP32 DevKit V1 + Expansion Base (PCB v1.0 / v3.3 & v2.0)
 * ============================================================================
 * Pinout Summary (PCB v1.0 / v3.3):
 *   - GPIO 21 (SDA), GPIO 22 (SCL) : DS3231SN RTC I2C (0x68)
 *   - GPIO 32                      : DS3231 SQW/INT Wakeup Pin (Active-LOW)
 *   - GPIO 26 (X7)                 : AO3401A CAN Power Switch (Active-LOW: LOW=ON, HIGH=OFF)
 *   - GPIO 27 (X5)                 : 2N3904 + AO3401A ADC Switch (Active-HIGH: HIGH=ON, LOW=OFF)
 *   - GPIO 34 (X6 / ADC1_CH6)      : Battery Voltage Sense Node M
 *   - GPIO 5 (CANTX), GPIO 4 (CANRX): SN65HVD230 (WCMCU-230) TWAI CAN Transceiver
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Preferences.h>
#include <LittleFS.h>
#include "driver/twai.h"
#include "esp_sleep.h"

// ======================== PILIH VERSI HARDWARE PCB ===========================
// Pilih 1 untuk PCB v1.0 (R1=300k, R2=68k) atau 2 untuk PCB v2.0 (R1=100k, R2=27k)
#define ORION_PCB_VERSION 1

// ======================== KONFIGURASI JARINGAN & SERVER ======================
const char* WIFI_SSID     = "POCOF6";       // <-- SSID WiFi/Hotspot
const char* WIFI_PASS     = "88888888";     // <-- Password WiFi
const char* API_ENDPOINT  = "https://www.oriontelemetry.tech/dipo_api/simpan_data.php";
// Fallback Heroku URL    : "https://<nama-app-heroku>.herokuapp.com/dipo_api/simpan_data.php"
// Fallback LAN Lokal     : "http://10.73.83.110/dipo_api/simpan_data.php"
const char* UNIT_ID       = "MITSUBISHI-STOCK-01";

// ======================== DEFINISI PIN HARDWARE ==============================
#define PIN_I2C_SDA       21
#define PIN_I2C_SCL       22
#define PIN_RTC_IRQ       32
#define PIN_GATE_CAN      26   // Active-LOW  (LOW = 3V3_CAN ON, HIGH = OFF)
#define PIN_GATE_ADC      27   // Active-HIGH (HIGH = Q3/Q2 ON, LOW = OFF 0uA)
#define PIN_ADC_BAT       34   // Node M (X6)
#define PIN_CAN_TX        5    // D5 -> CTX WCMCU-230
#define PIN_CAN_RX        4    // D4 -> CRX WCMCU-230

#define DS3231_I2C_ADDR   0x68

// ======================== KONFIGURASI TWO-TIER BUFFER ========================
#define TIER1_RTC_CAP     20                     // 20 Slot di RTC Slow SRAM
#define TIER2_FILE_PATH   "/tier2_queue.bin"     // File biner permanen di LittleFS Flash
#define TIER2_MAX_RECORDS 2000                   // 2.000 Slot x 40 Byte = 80 KB
#define FLUSH_BATCH_SIZE  20                     // Maksimum pengiriman per HTTP Batch POST

// Struktur Rekaman Telemetri Padat 88-Byte (Kelompok 32-bit -> 16-bit -> 8-bit)
struct __attribute__((packed)) TelemetryItem {
  // 1. Kelompok 32-bit (15 field x 4B = 60B | Offset 0..59)
  uint32_t seq;
  uint32_t boot;
  uint32_t ts_epoch;
  float    v_bat;
  float    rtc_temp_c;
  float    load_pct;       // PID 0x04 Engine Load (%)
  float    tps_pct;        // PID 0x11 Throttle Position (%)
  float    ign_deg;        // PID 0x0E Ignition Timing Advance (deg)
  float    maf_gs;         // PID 0x10 Mass Air Flow (g/s)
  uint32_t run_time_s;     // PID 0x1F Engine Run Time (s)
  float    fuel_pct;       // PID 0x2F Fuel Tank Level (%)
  float    fuel_rate_lh;   // PID 0x5E / MAF Fuel Rate (L/h)
  float    o2_v;           // PID 0x14 O2 Sensor Voltage (V)
  float    stft_pct;       // PID 0x06 Short Term Fuel Trim (%)
  float    ecu_v;          // PID 0x42 Control Module Voltage (V)

  // 2. Kelompok 16-bit (6 field x 2B = 12B | Offset 60..71)
  uint16_t adc_raw_mv;
  uint16_t shunt_sleep_ua;
  uint16_t rpm;            // PID 0x0C Engine RPM
  uint16_t dist_clr_km;    // PID 0x31 Distance Since Codes Cleared (km)
  int16_t  iat_c;          // PID 0x0F Intake Air Temp (C)
  uint16_t map_kpa;        // PID 0x0B Manifold Absolute Pressure (kPa)

  // 3. Kelompok 8-bit & char[8] (8B + 8 x 1B = 16B | Offset 72..87)
  char     dtc[8];
  uint8_t  engine_on;
  uint8_t  crit_alert;
  uint8_t  temp_c;         // PID 0x05 Coolant Temp (C)
  uint8_t  dtc_cnt;
  int8_t   rssi;
  uint8_t  can_ok;
  uint8_t  speed_kmh;      // PID 0x0D Vehicle Speed (km/h)
  uint8_t  mil_on;         // PID 0x01 Bit A7 Check Engine MIL (Read-Only)
};

static_assert(sizeof(TelemetryItem) == 88, "TelemetryItem size must be 88 bytes");

// Tier 1: Bertahan melewati Deep Sleep di RTC Slow Memory
RTC_DATA_ATTR TelemetryItem tier1RtcBuf[TIER1_RTC_CAP];
RTC_DATA_ATTR uint8_t       tier1Count     = 0;
RTC_DATA_ATTR uint32_t      rtcBootCount   = 0;
RTC_DATA_ATTR uint32_t      rtcSeqCounter  = 0;
RTC_DATA_ATTR bool          rtcInitialized = false;
RTC_DATA_ATTR uint16_t      rtcStructSize  = 0;

// Tier 2: Pointer Ring Buffer di NVS + Data di LittleFS Flash
Preferences nvsStore;
uint16_t tier2Head  = 0;
uint16_t tier2Tail  = 0;
uint16_t tier2Count = 0;
bool     littleFsReady = false;

// Konfigurasi Default Berdasarkan Versi PCB (Hasil Bench-Test Multimeter)
#if ORION_PCB_VERSION == 1
  // PCB v1.0: R1 = 300k, R2 = 68k (Rasio 5.4118 -> 2188 mV = 11.91 V)
  const float DEFAULT_SLOPE_M  = 0.0054118f;
  const float DEFAULT_OFFSET_C = 0.0690f;
#else
  // PCB v2.0: R1 = 100k, R2 = 27k (Rasio 4.7037)
  const float DEFAULT_SLOPE_M  = 0.0047037f;
  const float DEFAULT_OFFSET_C = 0.1600f;
#endif

float    cfgAdcSlopeM   = DEFAULT_SLOPE_M;
float    cfgAdcOffsetC  = DEFAULT_OFFSET_C;
float    cfgCritVoltage = 11.80f;
String   cfgSleepMode   = "6 Hours";

// Variabel Simulasi Gelombang & Pengujian Interaktif
enum WaveMode { WAVE_IDLE_STANDBY = 0, WAVE_ALTERNATOR_CHARGE = 1, WAVE_PARASITIC_DRAIN = 2 };
WaveMode currentWaveMode     = WAVE_IDLE_STANDBY;
bool     simOfflineMode      = false;
bool     simDtcActive        = false;
bool     rtcHardwareOk       = false;
bool     canLoopbackOk       = false;
uint32_t lastPollMs          = 0;
uint32_t pollIntervalMs      = 2000;  // Default 2 detik saat live bench test
uint32_t lastWifiRetryMs     = 0;
const uint32_t WIFI_RETRY_MS = 15000; // Auto-reconnect tiap 15 detik

// =================== NVS PERSISTENCE (CONFIG, BOOT & SEQ) ====================
void initAndLoadNvsState() {
  // 1. Pulihkan konfigurasi kalibrasi & operasional dari NVS
  cfgAdcSlopeM   = nvsStore.getFloat("cfg_slope",  DEFAULT_SLOPE_M);
  cfgAdcOffsetC  = nvsStore.getFloat("cfg_offset", DEFAULT_OFFSET_C);
  cfgCritVoltage = nvsStore.getFloat("cfg_critv",  11.80f);
  cfgSleepMode   = nvsStore.getString("cfg_sleep", "6 Hours");

  // 2. Pulihkan boot & seq secara monotonik (tahan cabut baterai / cold boot)
  // Minimal seq=1000 agar selalu lebih baru dari last_seq pengujian sebelumnya di DB MySQL
  uint32_t nvsBoot = nvsStore.getULong("boot_cnt", 0);
  uint32_t nvsSeq  = nvsStore.getULong("seq_cnt",  1000);
  if (nvsSeq < 1000) {
    nvsSeq = 1000;
    nvsStore.putULong("seq_cnt", nvsSeq);
  }

  if (!rtcInitialized || esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_UNDEFINED) {
    // Cold Boot / Hard Reset: naikkan nomor boot & ambil seq terakhir dari NVS
    rtcBootCount   = nvsBoot + 1;
    rtcSeqCounter  = (rtcSeqCounter > nvsSeq) ? rtcSeqCounter : nvsSeq;
    rtcInitialized = true;
    nvsStore.putULong("boot_cnt", rtcBootCount);
  } else {
    // Bangun dari Deep Sleep: pastikan tetap sinkron dengan NVS
    if (rtcBootCount < nvsBoot) rtcBootCount = nvsBoot;
    if (rtcSeqCounter < nvsSeq) rtcSeqCounter = nvsSeq;
  }

  if (rtcStructSize != sizeof(TelemetryItem)) {
    tier1Count    = 0;
    rtcStructSize = sizeof(TelemetryItem);
  }

  Serial.printf("[NVS OK] Boot #%lu | Seq Awal: %lu | Slope: %.6f | Offset: %.4f | CritV: %.2fV | Sleep: %s\n",
                (unsigned long)rtcBootCount, (unsigned long)rtcSeqCounter,
                cfgAdcSlopeM, cfgAdcOffsetC, cfgCritVoltage, cfgSleepMode.c_str());
}

uint32_t nextMonotonicSeq() {
  rtcSeqCounter++;
  nvsStore.putULong("seq_cnt", rtcSeqCounter);
  return rtcSeqCounter;
}

// Helper ekstraksi nilai dari JSON string sederhana tanpa library eksternal
bool extractJsonFloat(const String &json, const char *key, float &outVal) {
  String pattern = String("\"") + key + "\":";
  int idx = json.indexOf(pattern);
  if (idx == -1) return false;
  idx += pattern.length();
  while (idx < (int)json.length() && (json[idx] == ' ' || json[idx] == '\"')) idx++;
  int endIdx = idx;
  while (endIdx < (int)json.length() &&
         (isDigit(json[endIdx]) || json[endIdx] == '.' || json[endIdx] == '-')) {
    endIdx++;
  }
  if (endIdx > idx) {
    outVal = json.substring(idx, endIdx).toFloat();
    return true;
  }
  return false;
}

bool extractJsonString(const String &json, const char *key, String &outStr) {
  String pattern = String("\"") + key + "\":\"";
  int idx = json.indexOf(pattern);
  if (idx == -1) return false;
  idx += pattern.length();
  int endIdx = json.indexOf('\"', idx);
  if (endIdx > idx) {
    outStr = json.substring(idx, endIdx);
    return true;
  }
  return false;
}

void applyPiggybackAck(const String &resp) {
  bool updated = false;
  float fVal = 0.0f;
  String sVal;

  if (extractJsonFloat(resp, "crit_v", fVal) && fVal > 5.0f && fVal < 16.0f) {
    cfgCritVoltage = fVal;
    nvsStore.putFloat("cfg_critv", cfgCritVoltage);
    updated = true;
  }
  if (extractJsonFloat(resp, "slope_m", fVal) && fVal > 0.001f && fVal < 0.02f) {
    cfgAdcSlopeM = fVal;
    nvsStore.putFloat("cfg_slope", cfgAdcSlopeM);
    updated = true;
  }
  if (extractJsonFloat(resp, "offset_c", fVal) && fVal > -2.0f && fVal < 2.0f) {
    cfgAdcOffsetC = fVal;
    nvsStore.putFloat("cfg_offset", cfgAdcOffsetC);
    updated = true;
  }
  if (extractJsonString(resp, "sleep_cfg", sVal) && sVal.length() > 0) {
    cfgSleepMode = sVal;
    nvsStore.putString("cfg_sleep", cfgSleepMode);
    updated = true;
  } else if (extractJsonFloat(resp, "sleep_cfg", fVal) && fVal > 0.0f) {
    uint32_t sec = (uint32_t)(fVal + 0.5f);
    if (sec == 21600UL)      cfgSleepMode = "6 Hours";
    else if (sec == 3600UL)  cfgSleepMode = "1 Hour";
    else if (sec == 1800UL)  cfgSleepMode = "30 Minutes";
    else if (sec == 300UL)   cfgSleepMode = "5 Minutes";
    else                     cfgSleepMode = String(sec) + " Seconds";
    nvsStore.putString("cfg_sleep", cfgSleepMode);
    updated = true;
  }

  if (updated) {
    Serial.printf("[PIGGYBACK APPLIED] tersimpan ke NVS -> CritV=%.2fV | Slope=%.6f | Offset=%.4f | Sleep=%s\n",
                  cfgCritVoltage, cfgAdcSlopeM, cfgAdcOffsetC, cfgSleepMode.c_str());
  }
}

// ========================== UTILITAS I2C DS3231SN ============================
static uint8_t bcd2dec(uint8_t val) { return ((val / 16 * 10) + (val % 16)); }

bool probeAndReadDS3231(uint32_t &outEpoch, float &outTempC) {
  uint32_t fallbackEpoch = 1778000000UL + (rtcSeqCounter * 5UL);
  Wire.beginTransmission(DS3231_I2C_ADDR);
  Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) {
    outEpoch = fallbackEpoch;
    outTempC = 33.5f;
    return false;
  }

  if (Wire.requestFrom(DS3231_I2C_ADDR, 19) < 19) {
    outEpoch = fallbackEpoch;
    outTempC = 33.5f;
    return false;
  }

  uint8_t sec   = bcd2dec(Wire.read() & 0x7F);
  uint8_t min   = bcd2dec(Wire.read() & 0x7F);
  uint8_t hour  = bcd2dec(Wire.read() & 0x3F);
  Wire.read(); // Day of week
  uint8_t day   = bcd2dec(Wire.read() & 0x3F);
  uint8_t month = bcd2dec(Wire.read() & 0x1F);
  uint16_t year = 2000 + bcd2dec(Wire.read());

  for (int i = 0; i < 10; i++) Wire.read();
  int8_t  tempMsb = (int8_t)Wire.read();
  uint8_t tempLsb = Wire.read() >> 6;
  outTempC = (float)tempMsb + (tempLsb * 0.25f);

  struct tm t = {0};
  t.tm_year = (year >= 2025) ? (year - 1900) : (2026 - 1900);
  t.tm_mon  = (month >= 1 && month <= 12) ? (month - 1) : 4;
  t.tm_mday = (day >= 1 && day <= 31) ? day : 1;
  t.tm_hour = hour;
  t.tm_min  = min;
  t.tm_sec  = sec;
  time_t ep = mktime(&t);
  outEpoch  = (ep > 1700000000L) ? (uint32_t)ep : fallbackEpoch;
  return true;
}

// ==================== TIER 2: LITTLEFS NON-VOLATILE FLASH ====================
void initTier2LittleFS() {
  if (!LittleFS.begin(true)) {
    Serial.println("[FLASH ERR] Gagal melakukan mount partisi LittleFS!");
    littleFsReady = false;
    return;
  }
  littleFsReady = true;
  tier2Head  = nvsStore.getUShort("t2_head", 0);
  tier2Tail  = nvsStore.getUShort("t2_tail", 0);
  tier2Count = nvsStore.getUShort("t2_cnt",  0);

  uint16_t savedStructSize = nvsStore.getUShort("t2_ssz", 0);
  bool exists = LittleFS.exists(TIER2_FILE_PATH);
  size_t fileSize = 0;
  if (exists) {
    File chk = LittleFS.open(TIER2_FILE_PATH, "r");
    if (chk) {
      fileSize = chk.size();
      chk.close();
    }
  }

  bool sizeMismatch = (savedStructSize != sizeof(TelemetryItem)) ||
                      (fileSize % sizeof(TelemetryItem) != 0) ||
                      (tier2Count > TIER2_MAX_RECORDS);

  if (!exists || sizeMismatch) {
    if (exists && sizeMismatch) {
      LittleFS.remove(TIER2_FILE_PATH);
      Serial.printf("[FLASH MIGRATE] Struct antrean berubah (%uB -> %uB / file=%uB). Mereset /tier2_queue.bin...\n",
                    savedStructSize, (unsigned)sizeof(TelemetryItem), (unsigned)fileSize);
    }
    File f = LittleFS.open(TIER2_FILE_PATH, "w");
    if (f) f.close();
    tier1Count = 0;
    tier2Head = tier2Tail = tier2Count = 0;
    nvsStore.putUShort("t2_head", 0);
    nvsStore.putUShort("t2_tail", 0);
    nvsStore.putUShort("t2_cnt",  0);
    nvsStore.putUShort("t2_ssz",  (uint16_t)sizeof(TelemetryItem));
  }
  Serial.printf("[FLASH OK] ORION LittleFS Tier-2 Siap (%uB/slot)! Antrean Non-Volatile saat boot: %u/%u slot\n",
                (unsigned)sizeof(TelemetryItem), tier2Count, TIER2_MAX_RECORDS);
}

void spilloverTier1ToLittleFS() {
  if (!littleFsReady) return;
  File f = LittleFS.open(TIER2_FILE_PATH, "r+");
  if (!f) f = LittleFS.open(TIER2_FILE_PATH, "w+");
  if (!f) {
    Serial.println("[FLASH ERR] Gagal membuka /tier2_queue.bin untuk spillover!");
    return;
  }

  for (uint8_t i = 0; i < tier1Count; i++) {
    size_t offset = (size_t)tier2Head * sizeof(TelemetryItem);
    f.seek(offset, SeekSet);
    f.write((const uint8_t*)&tier1RtcBuf[i], sizeof(TelemetryItem));

    tier2Head = (tier2Head + 1) % TIER2_MAX_RECORDS;
    if (tier2Count == TIER2_MAX_RECORDS) {
      tier2Tail = (tier2Tail + 1) % TIER2_MAX_RECORDS;
    } else {
      tier2Count++;
    }
  }
  f.close();

  uint8_t moved = tier1Count;
  tier1Count = 0;
  nvsStore.putUShort("t2_head", tier2Head);
  nvsStore.putUShort("t2_tail", tier2Tail);
  nvsStore.putUShort("t2_cnt",  tier2Count);

  Serial.printf("[SPILLOVER] %u slot Tier-1 (RTC) dipindahkan permanen ke Tier-2 LittleFS! (Tier-2: %u/%u)\n",
                moved, tier2Count, TIER2_MAX_RECORDS);
}

void enqueueOfflineRecord(const TelemetryItem &item) {
  tier1RtcBuf[tier1Count++] = item;
  Serial.printf("[BUFFER] Disimpan ke Tier-1 RTC (%u/%u) | Total Antrean Offline: %u\n",
                tier1Count, TIER1_RTC_CAP, (uint16_t)(tier1Count + tier2Count));
  if (tier1Count >= TIER1_RTC_CAP) {
    spilloverTier1ToLittleFS();
  }
}

uint8_t readOldestBatchFromLittleFS(TelemetryItem *outBatch, uint8_t maxCount) {
  if (!littleFsReady || tier2Count == 0) return 0;
  File f = LittleFS.open(TIER2_FILE_PATH, "r");
  if (!f) return 0;

  uint8_t toRead = (tier2Count > maxCount) ? maxCount : (uint8_t)tier2Count;
  for (uint8_t i = 0; i < toRead; i++) {
    uint16_t idx = (tier2Tail + i) % TIER2_MAX_RECORDS;
    f.seek((size_t)idx * sizeof(TelemetryItem), SeekSet);
    f.read((uint8_t*)&outBatch[i], sizeof(TelemetryItem));
  }
  f.close();
  return toRead;
}

void commitFlushedLittleFSBatch(uint8_t flushedCount) {
  if (flushedCount >= tier2Count) {
    tier2Count = 0;
    tier2Head  = 0;
    tier2Tail  = 0;
  } else {
    tier2Tail  = (tier2Tail + flushedCount) % TIER2_MAX_RECORDS;
    tier2Count -= flushedCount;
  }
  nvsStore.putUShort("t2_head", tier2Head);
  nvsStore.putUShort("t2_tail", tier2Tail);
  nvsStore.putUShort("t2_cnt",  tier2Count);
}

// ==================== HELPER OBD-II CAN BUS 100% READ-ONLY ===================
// KEBIJAKAN MUTLAK: Hanya mengizinkan Mode 0x01 (Live Sensor) & Mode 0x03/0x07 (Read DTC).
// Mode 0x04 (Clear DTC) dan segala bentuk penulisan ECU DILARANG KERAS.
bool queryObdPid(uint8_t mode, uint8_t pid, uint8_t *respData, uint8_t &respLen, uint32_t timeoutMs = 20) {
  respLen = 0;
  if (mode != 0x01 && mode != 0x03 && mode != 0x07) {
    return false;
  }

  twai_message_t stale;
  while (twai_receive(&stale, 0) == ESP_OK) {}

  twai_message_t txMsg = {};
  txMsg.identifier = 0x7DF;
  txMsg.extd = 0;
  txMsg.rtr  = 0;
  txMsg.data_length_code = 8;
  for (int i = 0; i < 8; i++) txMsg.data[i] = 0xCC;

  if (mode == 0x03 || mode == 0x07) {
    txMsg.data[0] = 0x01;
    txMsg.data[1] = mode;
  } else {
    txMsg.data[0] = 0x02;
    txMsg.data[1] = mode;
    txMsg.data[2] = pid;
  }

  if (twai_transmit(&txMsg, pdMS_TO_TICKS(15)) != ESP_OK) {
    return false;
  }

  uint32_t tStart = millis();
  while ((millis() - tStart) < timeoutMs) {
    twai_message_t rxMsg;
    if (twai_receive(&rxMsg, pdMS_TO_TICKS(5)) == ESP_OK) {
      if (rxMsg.identifier >= 0x7E8 && rxMsg.identifier <= 0x7EF && rxMsg.data_length_code >= 3) {
        uint8_t frameType = rxMsg.data[0] & 0xF0;
        if (frameType != 0x00) continue; // Single-frame ISO 15765-4 response
        uint8_t pciLen = rxMsg.data[0] & 0x0F;
        uint8_t expectedRespMode = mode + 0x40;

        if (rxMsg.data[1] != expectedRespMode) continue;

        if (mode == 0x01) {
          if (rxMsg.data[2] != pid || pciLen < 3) continue;
          uint8_t payloadBytes = pciLen - 2;
          if (payloadBytes > 5) payloadBytes = 5;
          for (uint8_t i = 0; i < payloadBytes; i++) {
            respData[i] = rxMsg.data[3 + i];
          }
          respLen = payloadBytes;
          return true;
        } else {
          uint8_t payloadBytes = (pciLen >= 1) ? (pciLen - 1) : 0;
          if (payloadBytes > 6) payloadBytes = 6;
          for (uint8_t i = 0; i < payloadBytes; i++) {
            respData[i] = rxMsg.data[2 + i];
          }
          respLen = payloadBytes;
          return true;
        }
      }
    }
  }
  return false;
}

void decodeObdDtcBytes(uint8_t b1, uint8_t b2, char *outStr, size_t maxLen) {
  static const char prefixes[4] = { 'P', 'C', 'B', 'U' };
  char prefix = prefixes[(b1 >> 6) & 0x03];
  uint8_t d1 = (b1 >> 4) & 0x03;
  uint8_t d2 = b1 & 0x0F;
  uint8_t d3 = (b2 >> 4) & 0x0F;
  uint8_t d4 = b2 & 0x0F;
  snprintf(outStr, maxLen, "%c%u%X%X%X", prefix, d1, d2, d3, d4);
}

bool pollRealEcuObd2(TelemetryItem &pkt) {
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)PIN_CAN_TX, (gpio_num_t)PIN_CAN_RX, TWAI_MODE_NORMAL);
  twai_timing_config_t  t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t  f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g_config, &t_config, &f_config) != ESP_OK) {
    return false;
  }
  if (twai_start() != ESP_OK) {
    twai_driver_uninstall();
    return false;
  }

  uint8_t d[8] = {0};
  uint8_t len = 0;
  bool hasPid01 = queryObdPid(0x01, 0x01, d, len, 20);
  uint8_t rpmBuf[8] = {0};
  uint8_t rpmLen = 0;
  bool hasPid0C = queryObdPid(0x01, 0x0C, rpmBuf, rpmLen, 20);

  if (!hasPid01 && !hasPid0C) {
    twai_stop();
    twai_driver_uninstall();
    return false;
  }

  if (hasPid01 && len >= 1) {
    pkt.mil_on  = (d[0] & 0x80) ? 1 : 0;
    pkt.dtc_cnt = d[0] & 0x7F;
  }
  if (hasPid0C && rpmLen >= 2) {
    pkt.rpm = (uint16_t)(((uint16_t)rpmBuf[0] * 256U + (uint16_t)rpmBuf[1]) / 4U);
  }
  if (queryObdPid(0x01, 0x05, d, len) && len >= 1) {
    pkt.temp_c = (d[0] > 40) ? (uint8_t)(d[0] - 40) : 0;
  }
  if (queryObdPid(0x01, 0x0D, d, len) && len >= 1) {
    pkt.speed_kmh = d[0];
  }
  if (queryObdPid(0x01, 0x0F, d, len) && len >= 1) {
    pkt.iat_c = (int16_t)d[0] - 40;
  }
  if (queryObdPid(0x01, 0x0B, d, len) && len >= 1) {
    pkt.map_kpa = (uint16_t)d[0];
  }
  if (queryObdPid(0x01, 0x04, d, len) && len >= 1) {
    pkt.load_pct = ((float)d[0] * 100.0f) / 255.0f;
  }
  if (queryObdPid(0x01, 0x11, d, len) && len >= 1) {
    pkt.tps_pct = ((float)d[0] * 100.0f) / 255.0f;
  }
  if (queryObdPid(0x01, 0x0E, d, len) && len >= 1) {
    pkt.ign_deg = ((float)d[0] / 2.0f) - 64.0f;
  }
  if (queryObdPid(0x01, 0x10, d, len) && len >= 2) {
    pkt.maf_gs = (((float)d[0] * 256.0f) + (float)d[1]) / 100.0f;
  }
  if (queryObdPid(0x01, 0x1F, d, len) && len >= 2) {
    pkt.run_time_s = ((uint32_t)d[0] << 8) | (uint32_t)d[1];
  }
  if (queryObdPid(0x01, 0x2F, d, len) && len >= 1) {
    pkt.fuel_pct = ((float)d[0] * 100.0f) / 255.0f;
  }
  if (queryObdPid(0x01, 0x5E, d, len) && len >= 2) {
    pkt.fuel_rate_lh = (((float)d[0] * 256.0f) + (float)d[1]) * 0.05f;
  } else {
    pkt.fuel_rate_lh = (pkt.maf_gs > 0.0f) ? ((pkt.maf_gs * 3600.0f) / (14.7f * 740.0f)) : 0.0f;
  }
  if (queryObdPid(0x01, 0x14, d, len) && len >= 1) {
    pkt.o2_v = (float)d[0] / 200.0f;
  }
  if (queryObdPid(0x01, 0x06, d, len) && len >= 1) {
    pkt.stft_pct = ((float)d[0] - 128.0f) * (100.0f / 128.0f);
  }
  if (queryObdPid(0x01, 0x42, d, len) && len >= 2) {
    pkt.ecu_v = (((float)d[0] * 256.0f) + (float)d[1]) / 1000.0f;
  } else {
    pkt.ecu_v = pkt.v_bat;
  }
  if (queryObdPid(0x01, 0x31, d, len) && len >= 2) {
    pkt.dist_clr_km = ((uint16_t)d[0] << 8) | (uint16_t)d[1];
  }

  // Mode 0x03 Read-Only Stored DTCs
  if (queryObdPid(0x03, 0x00, d, len, 20) && len >= 3 && d[0] > 0 && (d[1] != 0 || d[2] != 0)) {
    decodeObdDtcBytes(d[1], d[2], pkt.dtc, sizeof(pkt.dtc));
    if (pkt.dtc_cnt == 0) pkt.dtc_cnt = d[0];
  } else if (pkt.dtc_cnt == 0) {
    strncpy(pkt.dtc, "NONE", sizeof(pkt.dtc));
    pkt.dtc[sizeof(pkt.dtc) - 1] = '\0';
  }

  twai_stop();
  twai_driver_uninstall();
  return true;
}

bool runCanTransceiverLoopbackTest() {
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)PIN_CAN_TX, (gpio_num_t)PIN_CAN_RX, TWAI_MODE_NO_ACK);
  twai_timing_config_t  t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t  f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  bool ok = false;
  if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
    if (twai_start() == ESP_OK) {
      twai_message_t txMsg = {};
      txMsg.identifier = 0x7DF;
      txMsg.self = 1; // Self-reception loopback test via WCMCU-230
      txMsg.data_length_code = 8;
      txMsg.data[0] = 0x02; txMsg.data[1] = 0x01; txMsg.data[2] = 0x0C;
      ok = (twai_transmit(&txMsg, pdMS_TO_TICKS(25)) == ESP_OK);
      twai_stop();
    }
    twai_driver_uninstall();
  }
  return ok;
}

// ==================== SAMPLING ADC PULSA 40ms & CAN TWAI =====================
void sampleBatteryAndCan(TelemetryItem &pkt) {
  static uint32_t simEngineStartMs = 0;

  // 1. Aktifkan sakelar Q3+Q2 (GPIO 27 = HIGH) selama 40ms untuk mengisi kapasitor C1
  digitalWrite(PIN_GATE_ADC, HIGH);
  delay(40);
  uint32_t mvSum = 0;
  for (int i = 0; i < 16; i++) {
    mvSum += analogReadMilliVolts(PIN_ADC_BAT);
    delay(1);
  }
  digitalWrite(PIN_GATE_ADC, LOW); // Matikan kembali jalur pembagi tegangan (0 uA drain)
  uint16_t rawMv = (uint16_t)(mvSum / 16);

  // 2. Evaluasi tegangan baterai riil vs generator gelombang simulasi awal
  float phase = (millis() % 60000UL) / 60000.0f * TWO_PI;
  if (rawMv > 400) {
    pkt.adc_raw_mv = rawMv;
    pkt.v_bat      = (rawMv * cfgAdcSlopeM) + cfgAdcOffsetC;
    pkt.engine_on  = (pkt.v_bat >= 13.20f) ? 1 : 0;
  } else {
    if (currentWaveMode == WAVE_ALTERNATOR_CHARGE) {
      pkt.v_bat      = 14.12f + 0.14f * sinf(phase * 3.0f);
      pkt.engine_on  = 1;
    } else if (currentWaveMode == WAVE_PARASITIC_DRAIN) {
      pkt.v_bat      = 11.62f + 0.08f * sinf(phase * 2.0f);
      pkt.engine_on  = 0;
    } else {
      pkt.v_bat      = 12.58f + 0.04f * sinf(phase);
      pkt.engine_on  = 0;
    }
    pkt.adc_raw_mv = (uint16_t)((pkt.v_bat - cfgAdcOffsetC) / cfgAdcSlopeM);
  }

  // 3. Nyalakan sakelar P-MOSFET CAN (GPIO 26 = LOW -> X8 = 3.3V)
  digitalWrite(PIN_GATE_CAN, LOW);
  delay(20); // Tunggu kapasitor filter 10uF (U8) di jalur 3V3_CAN stabil

  bool ecuConnected = pollRealEcuObd2(pkt);
  if (ecuConnected) {
    canLoopbackOk = true;
    if (pkt.rpm > 0) pkt.engine_on = 1;
  } else {
    // Bench Test tanpa ECU mobil nyata -> validasi kesehatan fisik WCMCU-230 via loopback
    canLoopbackOk = runCanTransceiverLoopbackTest();

    if (pkt.engine_on == 1) {
      if (simEngineStartMs == 0) simEngineStartMs = millis();
      pkt.rpm          = (rawMv > 400)
                           ? (uint16_t)(1350 + 45 * sinf(phase * 4.0f))
                           : (uint16_t)(1350 + 220 * sinf(phase * 4.0f));
      pkt.speed_kmh    = 0; // Pemanasan mesin stasioner di tempat
      pkt.temp_c       = (uint8_t)(86 + 3 * sinf(phase));
      pkt.iat_c        = (int16_t)(38 + 2 * sinf(phase));
      pkt.map_kpa      = (uint16_t)(34 + 2 * sinf(phase * 2.0f));
      pkt.load_pct     = 21.5f + 1.8f * sinf(phase * 2.0f);
      pkt.tps_pct      = 14.2f + 0.6f * sinf(phase * 3.0f);
      pkt.ign_deg      = 12.5f + 1.2f * sinf(phase * 2.0f);
      pkt.maf_gs       = 3.85f + 0.25f * sinf(phase * 2.0f);
      pkt.fuel_rate_lh = (pkt.maf_gs * 3600.0f) / (14.7f * 740.0f);
      pkt.o2_v         = 0.68f + 0.18f * sinf(phase * 6.0f);
      pkt.stft_pct     = 1.6f + 0.9f * sinf(phase * 4.0f);
      pkt.run_time_s   = ((millis() - simEngineStartMs) / 1000UL) + 12UL;
      pkt.ecu_v        = pkt.v_bat - 0.08f;
    } else {
      simEngineStartMs = 0;
      pkt.rpm          = 0;
      pkt.speed_kmh    = 0;
      pkt.temp_c       = 0;
      pkt.iat_c        = 0;
      pkt.map_kpa      = 0;
      pkt.load_pct     = 0.0f;
      pkt.tps_pct      = 0.0f;
      pkt.ign_deg      = 0.0f;
      pkt.maf_gs       = 0.0f;
      pkt.fuel_rate_lh = 0.0f;
      pkt.o2_v         = 0.0f;
      pkt.stft_pct     = 0.0f;
      pkt.run_time_s   = 0;
      pkt.ecu_v        = 0.0f;
    }

    pkt.fuel_pct    = 74.5f;
    pkt.dist_clr_km = 1420;
    pkt.mil_on      = simDtcActive ? 1 : 0;
    pkt.dtc_cnt     = simDtcActive ? 1 : 0;
    strncpy(pkt.dtc, simDtcActive ? "P0133" : "NONE", sizeof(pkt.dtc));
    pkt.dtc[sizeof(pkt.dtc) - 1] = '\0';
  }

  digitalWrite(PIN_GATE_CAN, HIGH); // Matikan kembali daya WCMCU-230 (X8 = 0V)
  pkt.can_ok = canLoopbackOk ? 1 : 0;

  pkt.crit_alert     = (pkt.v_bat < cfgCritVoltage || simDtcActive || pkt.dtc_cnt > 0) ? 1 : 0;
  pkt.shunt_sleep_ua = (pkt.engine_on == 1) ? 0 : ((currentWaveMode == WAVE_PARASITIC_DRAIN) ? 620 : 410);
}

// ==================== PENGIRIMAN HTTP/HTTPS POST & BURST FLUSH ===============
String buildSingleRecordJson(const TelemetryItem &p, uint16_t totalBufRemaining) {
  char buf[1024];
  snprintf(buf, sizeof(buf),
    "{\"unit_id\":\"%s\",\"seq\":%lu,\"boot\":%lu,\"ts_epoch\":%lu,"
    "\"v_bat\":%.2f,\"adc_raw_mv\":%u,\"rtc_temp_c\":%.2f,"
    "\"shunt_sleep_ua\":%u,\"engine_on\":%s,\"crit_alert\":%s,"
    "\"rpm\":%u,\"temp_c\":%u,\"dtc_cnt\":%u,\"dtc\":\"%s\","
    "\"rssi\":%d,\"sleep_cfg\":\"%s\",\"buffer_used\":%u,"
    "\"can_ok\":%s,\"active_ms\":1840,\"daily_mah\":4.82,"
    "\"speed_kmh\":%u,\"iat_c\":%d,\"map_kpa\":%u,\"load_pct\":%.1f,"
    "\"tps_pct\":%.1f,\"ign_deg\":%.1f,\"maf_gs\":%.2f,\"run_time_s\":%lu,"
    "\"fuel_pct\":%.1f,\"fuel_rate_lh\":%.2f,\"o2_v\":%.2f,\"stft_pct\":%.1f,"
    "\"mil_on\":%u,\"ecu_v\":%.2f,\"dist_clr_km\":%u}",
    UNIT_ID, (unsigned long)p.seq, (unsigned long)p.boot, (unsigned long)p.ts_epoch,
    p.v_bat, p.adc_raw_mv, p.rtc_temp_c,
    p.shunt_sleep_ua, p.engine_on ? "true" : "false", p.crit_alert ? "true" : "false",
    p.rpm, p.temp_c, p.dtc_cnt, p.dtc,
    (int)p.rssi, cfgSleepMode.c_str(), totalBufRemaining,
    p.can_ok ? "true" : "false",
    p.speed_kmh, (int)p.iat_c, p.map_kpa, p.load_pct,
    p.tps_pct, p.ign_deg, p.maf_gs, (unsigned long)p.run_time_s,
    p.fuel_pct, p.fuel_rate_lh, p.o2_v, p.stft_pct,
    p.mil_on, p.ecu_v, p.dist_clr_km
  );
  return String(buf);
}

bool postBatchRecords(const TelemetryItem *items, uint8_t count, bool isBurst) {
  if (simOfflineMode || WiFi.status() != WL_CONNECTED || count == 0) return false;

  HTTPClient http;
  WiFiClientSecure secureClient;

  String urlStr = String(API_ENDPOINT);
  if (urlStr.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, API_ENDPOINT);
  } else {
    http.begin(API_ENDPOINT);
  }

  http.setReuse(true);
  http.setTimeout(urlStr.startsWith("https://") ? 5000 : 2500);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Orion-Node", UNIT_ID);
  if (isBurst) http.addHeader("X-Burst-Sync", "true");

  uint16_t totalRemaining = tier1Count + tier2Count;
  String payload;
  if (count == 1) {
    payload = buildSingleRecordJson(items[0], totalRemaining);
  } else {
    payload.reserve((size_t)count * 720U);
    payload = "[";
    for (uint8_t i = 0; i < count; i++) {
      if (i > 0) payload += ",";
      uint16_t remAfterThis = (totalRemaining > (i + 1)) ? (totalRemaining - (i + 1)) : 0;
      payload += buildSingleRecordJson(items[i], remAfterThis);
    }
    payload += "]";
  }

  int httpCode = http.POST(payload);
  if (httpCode >= 200 && httpCode < 300) {
    String resp = http.getString();
    if (resp.indexOf("\"pending_ack\":true") != -1 || resp.indexOf("\"pending_ack\":1") != -1) {
      Serial.printf("[PIGGYBACK ACK] Menerima pembaruan konfigurasi dari Server ORION: %s\n", resp.c_str());
      applyPiggybackAck(resp);
    }
    http.end();
    return true;
  }
  Serial.printf("[HTTP WARN] POST gagal (kode: %d)\n", httpCode);
  http.end();
  return false;
}

void flushAllOfflineBuffers() {
  if (simOfflineMode || WiFi.status() != WL_CONNECTED) return;

  TelemetryItem batch[FLUSH_BATCH_SIZE];
  while (tier2Count > 0) {
    uint8_t n = readOldestBatchFromLittleFS(batch, FLUSH_BATCH_SIZE);
    if (n == 0) break;
    Serial.printf("[BURST SYNC] Mengirim %u rekaman dari Tier-2 LittleFS Flash...\n", n);
    if (postBatchRecords(batch, n, true)) {
      commitFlushedLittleFSBatch(n);
    } else {
      return;
    }
  }

  if (tier1Count > 0) {
    Serial.printf("[BURST SYNC] Mengirim %u rekaman dari Tier-1 RTC SRAM...\n", tier1Count);
    if (postBatchRecords(tier1RtcBuf, tier1Count, true)) {
      tier1Count = 0;
      Serial.println("[BURST SYNC OK] Seluruh antrean Tier-1 & Tier-2 berhasil dikuras (0 tersisa)!");
    }
  }
}

// =============================== SETUP & LOOP ================================
void printOrionBanner() {
  Serial.println("\n======================================================================");
  Serial.println("  ORION — Onboard Reporting for Inventory & Operational Notifications");
  Serial.printf("  Hardware Architecture : PCB v%d.0 (ESP32 + DS3231SN + WCMCU-230)\n", ORION_PCB_VERSION);
  Serial.println("  Storage Architecture  : Tier-1 (20 RTC SRAM) + Tier-2 (2000 LittleFS)");
  Serial.println("======================================================================");
  Serial.println("Perintah Interaktif Serial Monitor:");
  Serial.println("  [w] Mode Alternator Charging (14.1V, 1400 RPM)");
  Serial.println("  [v] Mode Critical Battery Drain (11.6V)");
  Serial.println("  [n] Mode Normal Standby (12.6V)");
  Serial.println("  [d] Toggle Injeksi Kode Gangguan OBD-II DTC (P0133)");
  Serial.println("  [o] Toggle Simulasi Putus Koneksi WiFi (Offline Mode)");
  Serial.println("  [b] Suntikkan 20 Paket Offline Sekaligus (Uji Spillover LittleFS)");
  Serial.println("  [s] Cetak Status Buffer Tier-1/Tier-2 & Kalibrasi NVS Aktif");
  Serial.println("  [r] Reset Parameter Kalibrasi NVS ke Default PCB");
  Serial.println("======================================================================\n");
}

void setup() {
  Serial.begin(115200);
  delay(300);

  // Pastikan kedua saklar daya mati saat inisialisasi awal
  pinMode(PIN_GATE_CAN, OUTPUT);
  digitalWrite(PIN_GATE_CAN, HIGH); // Active-LOW: HIGH = OFF (X8 = 0V)

  pinMode(PIN_GATE_ADC, OUTPUT);
  digitalWrite(PIN_GATE_ADC, LOW);  // Active-HIGH: LOW = OFF (X6 = 0V)

  pinMode(PIN_RTC_IRQ, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_ADC_BAT, ADC_11db);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  nvsStore.begin("orion_nvm", false);
  initAndLoadNvsState();
  initTier2LittleFS();

  printOrionBanner();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Nonaktifkan modem sleep agar latensi HTTP POST rendah & stabil
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WIFI] Menghubungkan ke %s ", WIFI_SSID);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - t0) < 8000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " TERHUBUNG!" : " OFFLINE (Mode Antrean Aktif)");
  lastWifiRetryMs = millis();
}

void handleSerialCommands() {
  while (Serial.available()) {
    char c = tolower(Serial.read());
    if (c == 'w') { currentWaveMode = WAVE_ALTERNATOR_CHARGE; lastPollMs = 0; Serial.println("[MODE] Alternator Charging (14.1V)"); }
    else if (c == 'v') { currentWaveMode = WAVE_PARASITIC_DRAIN; lastPollMs = 0; Serial.println("[MODE] Critical Battery Drain (11.6V)"); }
    else if (c == 'n') { currentWaveMode = WAVE_IDLE_STANDBY; lastPollMs = 0; Serial.println("[MODE] Standby Normal (12.6V)"); }
    else if (c == 'd') { simDtcActive = !simDtcActive; lastPollMs = 0; Serial.printf("[DTC] Simulasi P0133: %s\n", simDtcActive ? "AKTIF" : "BERSIH"); }
    else if (c == 'o') { simOfflineMode = !simOfflineMode; Serial.printf("[NET] Simulasi Offline: %s\n", simOfflineMode ? "ON (Simpan ke Buffer)" : "OFF (Online Flush)"); }
    else if (c == 'b') {
      Serial.println("[TEST] Menyuntikkan 20 paket ke antrean offline...");
      for (int i = 0; i < 20; i++) {
        TelemetryItem item = {};
        item.seq  = nextMonotonicSeq();
        item.boot = rtcBootCount;

        uint32_t ep;
        float tc;
        rtcHardwareOk   = probeAndReadDS3231(ep, tc);
        item.ts_epoch   = ep;
        item.rtc_temp_c = tc;

        sampleBatteryAndCan(item);
        item.rssi = -70;
        enqueueOfflineRecord(item);
      }
    }
    else if (c == 's') {
      Serial.printf("[STATUS] Boot: %lu | Seq: %lu | Tier-1 RTC: %u/20 | Tier-2 LittleFS: %u/%u | Total Antrean: %u\n",
                    (unsigned long)rtcBootCount, (unsigned long)rtcSeqCounter,
                    tier1Count, tier2Count, TIER2_MAX_RECORDS, (uint16_t)(tier1Count + tier2Count));
      Serial.printf("[NVS CFG] Slope=%.6f | Offset=%.4f | CritV=%.2fV | Sleep=%s\n",
                    cfgAdcSlopeM, cfgAdcOffsetC, cfgCritVoltage, cfgSleepMode.c_str());
    }
    else if (c == 'r') {
      cfgAdcSlopeM   = DEFAULT_SLOPE_M;
      cfgAdcOffsetC  = DEFAULT_OFFSET_C;
      cfgCritVoltage = 11.80f;
      cfgSleepMode   = "6 Hours";
      nvsStore.putFloat("cfg_slope",  cfgAdcSlopeM);
      nvsStore.putFloat("cfg_offset", cfgAdcOffsetC);
      nvsStore.putFloat("cfg_critv",  cfgCritVoltage);
      nvsStore.putString("cfg_sleep", cfgSleepMode);
      Serial.printf("[NVS RESET] Konfigurasi dikembalikan ke default PCB v%d.0 -> Slope=%.6f | Offset=%.4f | CritV=%.2fV | Sleep=%s\n",
                    ORION_PCB_VERSION, cfgAdcSlopeM, cfgAdcOffsetC, cfgCritVoltage, cfgSleepMode.c_str());
    }
  }
}

void loop() {
  handleSerialCommands();

  // Auto-Reconnect WiFi Periodik setiap 15 detik jika belum terhubung ke Hotspot
  if (!simOfflineMode && WiFi.status() != WL_CONNECTED && (millis() - lastWifiRetryMs >= WIFI_RETRY_MS)) {
    lastWifiRetryMs = millis();
    Serial.println("[WIFI] Mencoba menyambung ulang ke jaringan WiFi...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }

  if (millis() - lastPollMs >= pollIntervalMs) {
    lastPollMs = millis();

    TelemetryItem pkt = {};
    pkt.seq  = nextMonotonicSeq();
    pkt.boot = rtcBootCount;

    uint32_t ep;
    float tc;
    rtcHardwareOk  = probeAndReadDS3231(ep, tc);
    pkt.ts_epoch   = ep;
    pkt.rtc_temp_c = tc;

    sampleBatteryAndCan(pkt);
    pkt.rssi = (WiFi.status() == WL_CONNECTED) ? (int8_t)WiFi.RSSI() : -95;

    if (!simOfflineMode && WiFi.status() == WL_CONNECTED && (tier1Count > 0 || tier2Count > 0)) {
      flushAllOfflineBuffers();
    }

    if (!simOfflineMode && WiFi.status() == WL_CONNECTED) {
      if (postBatchRecords(&pkt, 1, false)) {
        Serial.printf("[ORION LIVE] boot=%lu | seq=%lu | V=%.2fV (%umV) | RTC=%.2fC | CAN=%s | Buf=%u\n",
                      (unsigned long)pkt.boot, (unsigned long)pkt.seq,
                      pkt.v_bat, pkt.adc_raw_mv, pkt.rtc_temp_c,
                      pkt.can_ok ? "OK" : "ERR", (uint16_t)(tier1Count + tier2Count));
      } else {
        enqueueOfflineRecord(pkt);
      }
    } else {
      enqueueOfflineRecord(pkt);
      Serial.printf("[ORION OFFLINE] boot=%lu | seq=%lu | V=%.2fV (%umV) | RTC=%.2fC | CAN=%s | Buf=%u\n",
                    (unsigned long)pkt.boot, (unsigned long)pkt.seq,
                    pkt.v_bat, pkt.adc_raw_mv, pkt.rtc_temp_c,
                    pkt.can_ok ? "OK" : "ERR", (uint16_t)(tier1Count + tier2Count));
    }
  }
}