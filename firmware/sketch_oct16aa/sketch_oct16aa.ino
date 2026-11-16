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
const char* API_ENDPOINT  = "https://oriontelemetry.tech/dipo_api/simpan_data.php";
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

// Struktur Rekaman Telemetri Padat (Tetap 40 Byte per Slot, reserved -> can_ok)
struct __attribute__((packed)) TelemetryItem {
  uint32_t seq;
  uint32_t boot;
  uint32_t ts_epoch;
  float    v_bat;
  uint16_t adc_raw_mv;
  float    rtc_temp_c;
  uint16_t shunt_sleep_ua;
  uint8_t  engine_on;
  uint8_t  crit_alert;
  uint16_t rpm;
  uint8_t  temp_c;
  uint8_t  dtc_cnt;
  char     dtc[8];
  int8_t   rssi;
  uint8_t  can_ok;   // Menggantikan 'reserved': menyimpan status CAN saat sampel diambil
};

// Tier 1: Bertahan melewati Deep Sleep di RTC Slow Memory
RTC_DATA_ATTR TelemetryItem tier1RtcBuf[TIER1_RTC_CAP];
RTC_DATA_ATTR uint8_t       tier1Count     = 0;
RTC_DATA_ATTR uint32_t      rtcBootCount   = 0;
RTC_DATA_ATTR uint32_t      rtcSeqCounter  = 0;
RTC_DATA_ATTR bool          rtcInitialized = false;

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

  if (!LittleFS.exists(TIER2_FILE_PATH)) {
    File f = LittleFS.open(TIER2_FILE_PATH, "w");
    if (f) f.close();
    tier2Head = tier2Tail = tier2Count = 0;
    nvsStore.putUShort("t2_head", 0);
    nvsStore.putUShort("t2_tail", 0);
    nvsStore.putUShort("t2_cnt",  0);
  }
  Serial.printf("[FLASH OK] ORION LittleFS Tier-2 Siap! Antrean Non-Volatile saat boot: %u/%u slot\n",
                tier2Count, TIER2_MAX_RECORDS);
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

// ==================== SAMPLING ADC PULSA 40ms & CAN TWAI =====================
void sampleBatteryAndCan(TelemetryItem &pkt) {
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

  // 2. Nyalakan sakelar P-MOSFET CAN (GPIO 26 = LOW -> X8 = 3.3V) & Uji Transceiver
  digitalWrite(PIN_GATE_CAN, LOW);
  delay(20); // Tunggu kapasitor filter 10uF (U8) di jalur 3V3_CAN stabil

  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)PIN_CAN_TX, (gpio_num_t)PIN_CAN_RX, TWAI_MODE_NO_ACK);
  twai_timing_config_t  t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t  f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  canLoopbackOk = false;
  if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
    if (twai_start() == ESP_OK) {
      twai_message_t txMsg = {};
      txMsg.identifier = 0x7DF;
      txMsg.self = 1; // Self-reception loopback test via WCMCU-230
      txMsg.data_length_code = 8;
      txMsg.data[0] = 0x02; txMsg.data[1] = 0x01; txMsg.data[2] = 0x0C;
      canLoopbackOk = (twai_transmit(&txMsg, pdMS_TO_TICKS(25)) == ESP_OK);
      twai_stop();
    }
    twai_driver_uninstall();
  }
  digitalWrite(PIN_GATE_CAN, HIGH); // Matikan kembali daya WCMCU-230 (X8 = 0V)
  pkt.can_ok = canLoopbackOk ? 1 : 0; // Simpan status CAN langsung ke dalam paket!

  // 3. Evaluasi tegangan baterai riil vs generator gelombang simulasi
  float phase = (millis() % 60000UL) / 60000.0f * TWO_PI;
  if (rawMv > 400) {
    pkt.adc_raw_mv = rawMv;
    pkt.v_bat      = (rawMv * cfgAdcSlopeM) + cfgAdcOffsetC;
    pkt.engine_on  = (pkt.v_bat >= 13.20f) ? 1 : 0;
    pkt.rpm        = pkt.engine_on ? 1350 : 0;
    pkt.temp_c     = pkt.engine_on ? 86 : 0;
  } else {
    if (currentWaveMode == WAVE_ALTERNATOR_CHARGE) {
      pkt.v_bat      = 14.12f + 0.14f * sinf(phase * 3.0f);
      pkt.engine_on  = 1;
      pkt.rpm        = (uint16_t)(1350 + 220 * sinf(phase * 4.0f));
      pkt.temp_c     = (uint8_t)(86 + 3 * sinf(phase));
    } else if (currentWaveMode == WAVE_PARASITIC_DRAIN) {
      pkt.v_bat      = 11.62f + 0.08f * sinf(phase * 2.0f);
      pkt.engine_on  = 0;
      pkt.rpm        = 0;
      pkt.temp_c     = 0;
    } else {
      pkt.v_bat      = 12.58f + 0.04f * sinf(phase);
      pkt.engine_on  = 0;
      pkt.rpm        = 0;
      pkt.temp_c     = 0;
    }
    pkt.adc_raw_mv = (uint16_t)((pkt.v_bat - cfgAdcOffsetC) / cfgAdcSlopeM);
  }

  pkt.crit_alert     = (pkt.v_bat < cfgCritVoltage || simDtcActive) ? 1 : 0;
  pkt.shunt_sleep_ua = (currentWaveMode == WAVE_PARASITIC_DRAIN) ? 620 : 410;
  pkt.dtc_cnt        = simDtcActive ? 1 : 0;
  strncpy(pkt.dtc, simDtcActive ? "P0133" : "NONE", sizeof(pkt.dtc));
}

// ==================== PENGIRIMAN HTTP/HTTPS POST & BURST FLUSH ===============
String buildSingleRecordJson(const TelemetryItem &p, uint16_t totalBufRemaining) {
  char buf[512];
  snprintf(buf, sizeof(buf),
    "{\"unit_id\":\"%s\",\"seq\":%lu,\"boot\":%lu,\"ts_epoch\":%lu,"
    "\"v_bat\":%.2f,\"adc_raw_mv\":%u,\"rtc_temp_c\":%.2f,"
    "\"shunt_sleep_ua\":%u,\"engine_on\":%s,\"crit_alert\":%s,"
    "\"rpm\":%u,\"temp_c\":%u,\"dtc_cnt\":%u,\"dtc\":\"%s\","
    "\"rssi\":%d,\"sleep_cfg\":\"%s\",\"buffer_used\":%u,"
    "\"can_ok\":%s,\"active_ms\":1840,\"daily_mah\":4.82}",
    UNIT_ID, (unsigned long)p.seq, (unsigned long)p.boot, (unsigned long)p.ts_epoch,
    p.v_bat, p.adc_raw_mv, p.rtc_temp_c,
    p.shunt_sleep_ua, p.engine_on ? "true" : "false", p.crit_alert ? "true" : "false",
    p.rpm, p.temp_c, p.dtc_cnt, p.dtc,
    (int)p.rssi, cfgSleepMode.c_str(), totalBufRemaining,
    p.can_ok ? "true" : "false"
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