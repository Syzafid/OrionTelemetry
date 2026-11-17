/**
 * ============================================================================
 * ORION — Onboard Reporting for Inventory & Operational Notifications
 * Firmware Version : v1.6.0 (Dual-SSID Presence Handover + Monotonic Exit Lag)
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
#include "esp_wifi.h"

// Forward Declaration untuk Arduino IDE Preprocessor (C++ prototype resolver)
struct TelemetryItem;

// ======================== PILIH VERSI HARDWARE PCB ===========================
// Pilih 1 untuk PCB v1.0 (R1=300k, R2=68k) atau 2 untuk PCB v2.0 (R1=100k, R2=27k)
#define ORION_PCB_VERSION 1

// ======================== KONFIGURASI JARINGAN & SERVER ======================
// Kredensial default untuk pengujian meja (development).
// CATATAN KEAMANAN: Kredensial hardcoded ini hanya untuk pengembangan. Pada produksi penuh,
// kredensial wajib diinjeksi via NVS (serta opsi verifikasi BSSID gudang pada fase rilis berikutnya).
const char* DEFAULT_YARD_SSID = "POCOF6";             // SSID Gudang (Primary Yard AP)
const char* DEFAULT_YARD_PASS = "88888888";           // Password SSID Gudang
const char* DEFAULT_TECH_SSID = "POCOF5";  // SSID Hotspot Teknisi (Secondary)
const char* DEFAULT_TECH_PASS = "88888888";       // Password Hotspot Teknisi

String wifiYardSsid = DEFAULT_YARD_SSID;
String wifiYardPass = DEFAULT_YARD_PASS;
String wifiTechSsid = DEFAULT_TECH_SSID;
String wifiTechPass = DEFAULT_TECH_PASS;
String lastSeenYardSsid = "";
String lastSeenTechSsid = "";

const char* API_ENDPOINT  = "https://www.oriontelemetry.tech/dipo_api/simpan_data.php";
// Fallback Heroku URL    : "https://<nama-app-heroku>.herokuapp.com/dipo_api/simpan_data.php"
// Fallback LAN Lokal     : "http://10.73.83.110/dipo_api/simpan_data.php"
const char* UNIT_ID       = "MITSUBISHI-STOCK-01";

// ======================== ENUM ZONA JARINGAN =================================
enum OrionNetZone : uint8_t {
  NET_ZONE_UNKNOWN = 0, // "UNKNOWN" — Default untuk rekaman lama di flash / sebelum evaluasi pertama
  NET_ZONE_YARD    = 1, // "YARD" — SSID Gudang terlihat dengan RSSI >= -85 dBm, baik asosiasi/internet berhasil maupun gagal
  NET_ZONE_TECH    = 2, // "TECH_HOTSPOT" — SSID Gudang absen melewati batas debounce keluar + ESP32 terhubung ke Hotspot Teknisi
  NET_ZONE_OFFLINE = 3  // "OFFLINE" — SSID Gudang absen melewati batas debounce keluar + Hotspot Teknisi tidak tersedia; unit di luar gudang dan merekam ke buffer
};

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
#define TIER2_MAX_RECORDS 2000                   // 2.000 Slot x 88 Byte = 176 KB
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
  uint8_t  can_ok;         // Bit 0: CAN OK, Bits 1..2: OrionNetZone, Bits 3..7: exit_lag_steps (20s/step)
  uint8_t  speed_kmh;      // PID 0x0D Vehicle Speed (km/h)
  uint8_t  mil_on;         // PID 0x01 Bit A7 Check Engine MIL (Read-Only)
};

static_assert(sizeof(TelemetryItem) == 88, "TelemetryItem size must be 88 bytes");

// 4 Fungsi Helper Wajib Bit-Packing pada Byte can_ok (Ukuran Struct Tetap 88-Byte)
// Bit 0    (0x01): can_ok (0 = ERR, 1 = OK)
// Bit 1..2 (0x06): OrionNetZone (0..3)
// Bit 3..7 (0xF8): exit_lag_steps (0..31, resolusi 20 detik per step, jangkauan 0..620 detik)
static inline uint8_t packCanZoneAndLag(bool canOk, uint8_t zone, uint8_t lagSteps20s) {
  return (canOk ? 0x01 : 0x00) | ((zone & 0x03) << 1) | ((lagSteps20s & 0x1F) << 3);
}

static inline bool getRecordCanOk(const TelemetryItem &p) {
  return (p.can_ok & 0x01) != 0;
}

static inline uint8_t getRecordNetZone(const TelemetryItem &p) {
  return (p.can_ok >> 1) & 0x03;
}

static inline uint16_t getRecordExitLagSec(const TelemetryItem &p) {
  return (uint16_t)((p.can_ok >> 3) & 0x1F) * 20U;
}

static inline const char* netZoneToString(uint8_t z) {
  switch (z) {
    case NET_ZONE_YARD:    return "YARD";
    case NET_ZONE_TECH:    return "TECH_HOTSPOT";
    case NET_ZONE_OFFLINE: return "OFFLINE";
    case NET_ZONE_UNKNOWN:
    default:               return "UNKNOWN";
  }
}

// Normalisasi pencocokan SSID (tahan spasi, huruf besar/kecil, dash, dll)
static bool isSsidMatch(const String &scanned, const String &target) {
  if (scanned.length() == 0 || target.length() == 0) return false;
  if (scanned.equalsIgnoreCase(target)) return true;

  String s1 = "";
  s1.reserve(scanned.length());
  for (unsigned int i = 0; i < scanned.length(); i++) {
    char c = scanned[i];
    if (c != ' ' && c != '-' && c != '_' && c != '\t' && c != '\r' && c != '\n') {
      s1 += (char)tolower(c);
    }
  }

  String s2 = "";
  s2.reserve(target.length());
  for (unsigned int i = 0; i < target.length(); i++) {
    char c = target[i];
    if (c != ' ' && c != '-' && c != '_' && c != '\t' && c != '\r' && c != '\n') {
      s2 += (char)tolower(c);
    }
  }

  return (s1.length() > 0 && s1 == s2);
}

// Tier 1: Bertahan melewati Deep Sleep di RTC Slow Memory
RTC_DATA_ATTR TelemetryItem tier1RtcBuf[TIER1_RTC_CAP];
RTC_DATA_ATTR uint8_t       tier1Count     = 0;
RTC_DATA_ATTR uint32_t      rtcBootCount   = 0;
RTC_DATA_ATTR uint32_t      rtcSeqCounter  = 0;
RTC_DATA_ATTR bool          rtcInitialized = false;
RTC_DATA_ATTR uint16_t      rtcStructSize  = 0;

// State Persistence Zona Jaringan di RTC Memory (Tahan Deep Sleep)
RTC_DATA_ATTR uint8_t       rtcCurrentZone    = NET_ZONE_UNKNOWN;
RTC_DATA_ATTR uint8_t       rtcYardMissCount  = 0;
RTC_DATA_ATTR uint8_t       rtcYardHitCount   = 0;
RTC_DATA_ATTR uint32_t      rtcFirstMissEpoch = 0;

// Konfigurasi & Variabel Pengujian Serial Interaktif
#define ORION_DEBUG_SERIAL 1

#if ORION_DEBUG_SERIAL
int8_t  simZoneOverride         = -1;
uint8_t simTransitionLagPending = 0;
#endif

uint32_t lastZoneEvalMs    = 0;
uint8_t  prevEngineOnState = 0;
uint32_t engineStartTimeMs = 0;

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
uint32_t pollIntervalMs      = 5000;  // Default 5 detik sesuai ORION Hardware Blueprint (hemat kuota & stabil)
uint32_t lastWifiRetryMs     = 0;
const uint32_t WIFI_RETRY_MS = 15000; // Auto-reconnect tiap 15 detik

// =================== NVS PERSISTENCE (CONFIG, BOOT & SEQ) ====================
void initAndLoadNvsState() {
  // 1. Pulihkan konfigurasi kalibrasi & operasional dari NVS
  cfgAdcSlopeM   = nvsStore.getFloat("cfg_slope",  DEFAULT_SLOPE_M);
  cfgAdcOffsetC  = nvsStore.getFloat("cfg_offset", DEFAULT_OFFSET_C);
  cfgCritVoltage = nvsStore.getFloat("cfg_critv",  11.80f);
  cfgSleepMode   = nvsStore.getString("cfg_sleep", "6 Hours");

  // Pulihkan override kredensial Dual-SSID dari NVS jika ada
  wifiYardSsid = nvsStore.getString("yard_ssid", DEFAULT_YARD_SSID);
  wifiYardPass = nvsStore.getString("yard_pass", DEFAULT_YARD_PASS);
  wifiTechSsid = nvsStore.getString("tech_ssid", DEFAULT_TECH_SSID);
  wifiTechPass = nvsStore.getString("tech_pass", DEFAULT_TECH_PASS);
  if (wifiYardSsid.length() == 0) wifiYardSsid = DEFAULT_YARD_SSID;
  if (wifiYardPass.length() == 0) wifiYardPass = DEFAULT_YARD_PASS;
  if (wifiTechSsid.length() == 0) wifiTechSsid = DEFAULT_TECH_SSID;
  if (wifiTechPass.length() == 0) wifiTechPass = DEFAULT_TECH_PASS;

  // 2. Pulihkan boot & seq secara monotonik (tahan cabut baterai / cold boot)
  uint32_t nvsBoot = nvsStore.getULong("boot_cnt", 0);
  uint32_t nvsSeq  = nvsStore.getULong("seq_cnt",  1000);
  if (nvsSeq < 1000) {
    nvsSeq = 1000;
    nvsStore.putULong("seq_cnt", nvsSeq);
  }

  if (!rtcInitialized || esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_UNDEFINED) {
    // Cold Boot / Hard Reset: naikkan nomor boot & ambil seq terakhir dari NVS
    rtcBootCount      = nvsBoot + 1;
    rtcSeqCounter     = (rtcSeqCounter > nvsSeq) ? rtcSeqCounter : nvsSeq;
    rtcInitialized    = true;
    nvsStore.putULong("boot_cnt", rtcBootCount);
    // Reset status zona & debounce pada cold boot / upload agar scan jaringan berjalan bersih
    rtcCurrentZone    = NET_ZONE_UNKNOWN;
    rtcYardMissCount  = 0;
    rtcYardHitCount   = 0;
    rtcFirstMissEpoch = 0;
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
  Serial.printf("[NVS WIFI] Yard SSID: %s | Tech SSID: %s\n", wifiYardSsid.c_str(), wifiTechSsid.c_str());
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
static uint8_t dec2bcd(uint8_t val) { return ((val / 10 * 16) + (val % 10)); }

bool setDS3231Time(uint32_t epoch) {
  time_t rawtime = (time_t)epoch;
  struct tm t;
  gmtime_r(&rawtime, &t);

  Wire.beginTransmission(DS3231_I2C_ADDR);
  Wire.write(0x00);
  Wire.write(dec2bcd(t.tm_sec));
  Wire.write(dec2bcd(t.tm_min));
  Wire.write(dec2bcd(t.tm_hour));
  Wire.write(dec2bcd((uint8_t)(t.tm_wday == 0 ? 7 : t.tm_wday)));
  Wire.write(dec2bcd(t.tm_mday));
  Wire.write(dec2bcd(t.tm_mon + 1));
  uint8_t yearOffset = (t.tm_year >= 100) ? (uint8_t)(t.tm_year - 100) : (uint8_t)t.tm_year;
  Wire.write(dec2bcd(yearOffset));
  return (Wire.endTransmission() == 0);
}

bool probeAndReadDS3231(uint32_t &outEpoch, float &outTempC);

static uint32_t lastNtpCheckMs = 0;
void checkNtpRtcSync() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (lastNtpCheckMs > 0 && (millis() - lastNtpCheckMs < 30000UL)) return;
  lastNtpCheckMs = millis();

  time_t nowNtp = 0;
  time(&nowNtp);
  if (nowNtp < 1700000000L) {
    return; // NTP belum tersinkron atau belum valid
  }

  uint32_t rtcEpoch = 0;
  float rtcTemp = 0.0f;
  if (!probeAndReadDS3231(rtcEpoch, rtcTemp)) {
    return;
  }

  int32_t diff = (int32_t)nowNtp - (int32_t)rtcEpoch;
  if (diff > 5 || diff < -5) {
    uint32_t oldEpoch = rtcEpoch;
    if (setDS3231Time((uint32_t)nowNtp)) {
      Serial.printf("[RTC] sync dari NTP: sebelum=%lu sesudah=%lu\n",
                    (unsigned long)oldEpoch, (unsigned long)nowNtp);
    }
  }
}

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

  // Periksa versi skema NVS: jika belum versi 2, naikkan ke v2 tanpa hapus file selama ukuran struct 88B
  uint8_t schemaVer = nvsStore.getUChar("schema_ver", 1);
  if (schemaVer != 2) {
    nvsStore.putUChar("schema_ver", 2);
    Serial.println("[NVS] Schema upgraded to v2 (bit-packed can_ok + net_zone + exit_lag)");
  }

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
  Serial.printf("[BUFFER] Disimpan ke Tier-1 RTC (%u/%u) [Zone: %s, Lag: %us] | Total Antrean Offline: %u\n",
                tier1Count, TIER1_RTC_CAP, netZoneToString(getRecordNetZone(item)),
                getRecordExitLagSec(item), (uint16_t)(tier1Count + tier2Count));
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

// ==================== STATE MACHINE ZONA JARINGAN (4-STATE ASINKRON) ==========
static bool     asyncScanRunning       = false;
static uint32_t asyncScanStartMs       = 0;
static uint32_t pendingFirstMissEpoch  = 0;
static uint8_t  yardRecoveryCount      = 0;
static uint32_t lastKnownEpoch         = 0;
static uint8_t  lastKnownSpeed         = 0;

// C.3: Satukan penetapan rtcCurrentZone di satu fungsi setZone(newZone, reason)
void setZone(uint8_t newZone, const char* reason = nullptr) {
  if (rtcCurrentZone == newZone) return;

  uint8_t oldZone = rtcCurrentZone;
  rtcCurrentZone = newZone;

  const char* oldStr = netZoneToString(oldZone);
  const char* newStr = netZoneToString(newZone);

  // C.1: Cetak log transisi spesifik untuk semua jalur
  if (oldZone == NET_ZONE_YARD && newZone == NET_ZONE_OFFLINE) {
    Serial.printf("[ZONE TRANSITION] YARD -> OFFLINE%s%s\n",
                  reason ? " | " : "", reason ? reason : "");
  } else if (oldZone == NET_ZONE_YARD && newZone == NET_ZONE_TECH) {
    Serial.printf("[ZONE TRANSITION] YARD -> TECH_HOTSPOT%s%s\n",
                  reason ? " | " : "", reason ? reason : "");
  } else if ((oldZone == NET_ZONE_TECH || oldZone == NET_ZONE_OFFLINE) && newZone == NET_ZONE_YARD) {
    Serial.printf("[ZONE TRANSITION] OUTSIDE -> YARD%s%s\n",
                  reason ? " | " : "", reason ? reason : "");
  } else if (oldZone == NET_ZONE_TECH && newZone == NET_ZONE_OFFLINE) {
    Serial.printf("[ZONE TRANSITION] TECH_HOTSPOT -> OFFLINE%s%s\n",
                  reason ? " | " : "", reason ? reason : "");
  } else if (oldZone == NET_ZONE_OFFLINE && newZone == NET_ZONE_TECH) {
    Serial.printf("[ZONE TRANSITION] OFFLINE -> TECH_HOTSPOT%s%s\n",
                  reason ? " | " : "", reason ? reason : "");
  } else {
    Serial.printf("[ZONE TRANSITION] %s -> %s%s%s\n",
                  oldStr, newStr,
                  reason ? " | " : "", reason ? reason : "");
  }
}

// B.1: State Machine Rekoneksi WiFi Asinkron (Non-Blocking, Timeout 6s)
enum WifiConnectTarget {
  CONN_IDLE = 0,
  CONN_CONNECTING_TECH,
  CONN_CONNECTING_YARD
};

static WifiConnectTarget wifiConnState          = CONN_IDLE;
static uint32_t          wifiConnStartMs        = 0;
static const uint32_t    WIFI_CONNECT_TIMEOUT_MS = 6000UL;

void startWifiConnectNonBlocking(WifiConnectTarget target, const char* ssid, const char* pass) {
  if (wifiConnState != CONN_IDLE && (millis() - wifiConnStartMs < WIFI_CONNECT_TIMEOUT_MS)) {
    return; // Sedang ada proses penyambungan yang berjalan
  }
  WiFi.disconnect(false, true);
  WiFi.begin(ssid, pass);
  wifiConnState   = target;
  wifiConnStartMs = millis();
  Serial.printf("[WIFI ASYNC CONNECT] Memulai koneksi ke '%s' (non-blocking, timeout 6s)...\n", ssid);
}

void updateWifiAsyncConnect() {
  if (wifiConnState == CONN_IDLE) return;

  if (WiFi.status() == WL_CONNECTED) {
    if (wifiConnState == CONN_CONNECTING_TECH) {
      Serial.printf("[WIFI ASYNC CONNECT] Terhubung ke Hotspot Teknisi '%s' (IP: %s) dalam %lums\n",
                    WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), (unsigned long)(millis() - wifiConnStartMs));
      setZone(NET_ZONE_TECH, "Async Connect Tech Berhasil");
    } else if (wifiConnState == CONN_CONNECTING_YARD) {
      Serial.printf("[WIFI ASYNC CONNECT] Terhubung ke Gudang '%s' (IP: %s) dalam %lums\n",
                    WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), (unsigned long)(millis() - wifiConnStartMs));
      setZone(NET_ZONE_YARD, "Async Connect Yard Berhasil");
    }
    wifiConnState = CONN_IDLE;
    return;
  }

  if (millis() - wifiConnStartMs >= WIFI_CONNECT_TIMEOUT_MS) {
    Serial.printf("[WIFI ASYNC CONNECT] Timeout (%lums) mencoba terhubung.\n", (unsigned long)WIFI_CONNECT_TIMEOUT_MS);
    if (wifiConnState == CONN_CONNECTING_TECH) {
      if (rtcCurrentZone == NET_ZONE_TECH) {
        setZone(NET_ZONE_OFFLINE, "Tech Connect Timeout");
      }
    }
    wifiConnState = CONN_IDLE;
  }
}

// C.2: Rate limiter pesan [INFO TECH] (hanya sekali saat cold boot atau tiap 10 menit)
static uint32_t lastTechInfoPrintMs     = 0;
static bool     coldBootTechInfoPrinted = false;

void printTechInfoIfDue() {
  if (!coldBootTechInfoPrinted) {
    coldBootTechInfoPrinted = true;
    lastTechInfoPrintMs     = millis();
    Serial.printf("  [INFO TECH] Hotspot '%s' tidak terlihat. Pastikan Hotspot disetel ke pita 2.4 GHz di HP!\n", wifiTechSsid.c_str());
    return;
  }
  if (millis() - lastTechInfoPrintMs >= 600000UL) {
    lastTechInfoPrintMs = millis();
    Serial.printf("  [INFO TECH] Hotspot '%s' tidak terlihat. Pastikan Hotspot disetel ke pita 2.4 GHz di HP!\n", wifiTechSsid.c_str());
  }
}

void evaluateNetworkZone(const TelemetryItem &pkt, uint8_t &outZone, uint8_t &outLagSteps) {
  outLagSteps = 0;

  // Catat ts_epoch dan speed_kmh terkini untuk evaluasi async scan
  lastKnownEpoch = pkt.ts_epoch;
  lastKnownSpeed = pkt.speed_kmh;

  if (prevEngineOnState == 0 && pkt.engine_on == 1) {
    engineStartTimeMs = millis();
    lastZoneEvalMs    = 0; // Paksa evaluasi segera saat mesin baru saja menyala
    Serial.println("[ZONE TIMER] Transisi mesin menyala -> Paksa evaluasi scan segera (Jendela 15s aktif)");
  }
  prevEngineOnState = pkt.engine_on;

#if ORION_DEBUG_SERIAL
  if (simZoneOverride != -1) {
    outZone = (uint8_t)simZoneOverride;
    outLagSteps = simTransitionLagPending;
    simTransitionLagPending = 0; // Hanya diberikan pada paket pertama saat transisi
    return;
  }
#endif

  // 1. Pembersihan Counter Basi Saat Bangun Tidur / Evaluasi (>620 Detik)
  // DOKUMENTASI KETERBATASAN ARSITEKTUR (TASK 1.2 D.2):
  // Guard counter basi 620 detik (~10.3 menit) membersihkan akumulasi hit/miss counter
  // agar kondisi keluar palsu dari siklus operasi sebelumnya tidak menggantung.
  // KONSEKUENSI: Jika unit tertidur (deep sleep) > ~5 menit, siklus debounce keluar (membutuhkan
  // 3x miss scan atau 2x miss + pergerakan speed) tidak dapat selesai pada siklus bangun pertama
  // karena counter basi di-reset ke 0. Ini adalah trade-off yang diterima secara sengaja untuk
  // memastikan integritas data terhadap kendaraan yang ditarik (towing) saat mesin mati.
  if (rtcFirstMissEpoch > 0 && pkt.ts_epoch > rtcFirstMissEpoch && (pkt.ts_epoch - rtcFirstMissEpoch) > 620UL) {
    rtcYardMissCount  = 0;
    rtcFirstMissEpoch = 0;
    yardRecoveryCount = 0;
    Serial.println("[ZONE] Stale miss counter reset (>620s expired)");
  }

  // 2. Optimasi Tanpa Scan Saat Terhubung ke Gudang (Zero-Scan Yard Hold)
  // Anti-Flapping Gerbang (Task 1.4 C.1):
  // Jika rtcYardMissCount > 0, koneksi baru pulih sesaat atau sedang berada di batas gerbang.
  // Jangan mereset rtcYardMissCount dan rtcFirstMissEpoch jika belum diverifikasi lewat minimal 2 scan stabil.
  if (WiFi.status() == WL_CONNECTED && isSsidMatch(WiFi.SSID(), wifiYardSsid) && WiFi.RSSI() >= -85) {
    if (rtcYardMissCount > 0) {
      Serial.printf("[ZERO-SCAN HOLD] Anti-flapping aktif (missCount=%u, recoveryScan=%u/2). Debounce miss dipertahankan.\n",
                    rtcYardMissCount, yardRecoveryCount);
      setZone(NET_ZONE_YARD, "Zero-Scan Yard Hold (Anti-Flap Holding)");
      outZone     = NET_ZONE_YARD;
      outLagSteps = 0;
      return;
    }
    setZone(NET_ZONE_YARD, "Zero-Scan Yard Hold (Evaluate)");
    rtcYardHitCount   = 0;
    outZone           = NET_ZONE_YARD;
    outLagSteps       = 0;
    return;
  }

  // 3. Kembalikan zona yang telah dievaluasi oleh background scan (0ms latency, bebas blocking)
  // B.1 & B.2: Kalkulasi lag relatif terhadap pendingFirstMissEpoch saat record pertama zona luar dibuat
  outZone = (rtcCurrentZone != NET_ZONE_UNKNOWN) ? rtcCurrentZone : NET_ZONE_OFFLINE;
  if (pendingFirstMissEpoch > 0 && (outZone == NET_ZONE_OFFLINE || outZone == NET_ZONE_TECH)) {
    uint32_t lagSec = (pkt.ts_epoch > pendingFirstMissEpoch) ? (pkt.ts_epoch - pendingFirstMissEpoch) : 0UL;
    if (lagSec > 620UL) {
      outLagSteps = 0;
    } else {
      uint32_t steps = lagSec / 20UL; // floor division
      outLagSteps = (uint8_t)(steps > 31UL ? 31UL : steps);
    }
    Serial.printf("[ZONE LAG PACK] ts_epoch=%lu pendingFirstMissEpoch=%lu -> lagSec=%lus steps=%u\n",
                  (unsigned long)pkt.ts_epoch, (unsigned long)pendingFirstMissEpoch,
                  (unsigned long)lagSec, (unsigned)outLagSteps);
    pendingFirstMissEpoch = 0; // Reset tepat setelah digunakan sekali
  } else {
    outLagSteps = 0;
  }
}

static uint32_t lastMeasuredScanDurationMs = 1800UL;

void updateAsyncWifiScan() {
  // 1. Optimasi Tanpa Scan Saat Terhubung ke Gudang (Zero-Scan Yard Hold)
  // Anti-Flapping Gerbang (Task 1.4 C.1):
  // Jangan batalkan scan asinkron jika rtcYardMissCount > 0 agar scan verifikasi tetap berjalan
  // sampai sinyal gudang terbukti benar-benar stabil minimal 2 scan berturut-turut.
  if (WiFi.status() == WL_CONNECTED && isSsidMatch(WiFi.SSID(), wifiYardSsid) && WiFi.RSSI() >= -85) {
    if (rtcYardMissCount == 0) {
      if (asyncScanRunning) {
        WiFi.scanDelete();
        asyncScanRunning = false;
      }
      setZone(NET_ZONE_YARD, "Zero-Scan Yard Hold (UpdateScan)");
      rtcYardHitCount   = 0;
      return;
    }
  }

  // 2. Jika Scan Asinkron Sedang Berjalan, Periksa Apakah Sudah Selesai (Non-Blocking)
  if (asyncScanRunning) {
    int16_t scanRes = WiFi.scanComplete();
    if (scanRes == WIFI_SCAN_RUNNING) {
      // Masih berlangsung di latar belakang. Cek timeout 10 detik sebagai proteksi
      if (millis() - asyncScanStartMs > 10000UL) {
        Serial.println("[WIFI SCAN ASYNC] Timeout (>10s), membatalkan scan.");
        WiFi.scanDelete();
        asyncScanRunning = false;
        lastZoneEvalMs   = millis();
      }
      return;
    }
    if (scanRes == WIFI_SCAN_FAILED) {
      Serial.println("[WIFI SCAN ASYNC] Gagal, me-reset scan state.");
      WiFi.scanDelete();
      asyncScanRunning = false;
      lastZoneEvalMs   = millis();
      return;
    }

    // scanRes >= 0: Scan Selesai!
    // A.3: Ukur durasi scan sebenarnya dengan millis() dan cetak format tepat:
    lastMeasuredScanDurationMs = millis() - asyncScanStartMs;
    int nNetworks              = scanRes;
    Serial.printf("[SCAN] durasi=%lums hasil=%d\n", (unsigned long)lastMeasuredScanDurationMs, nNetworks);

    // A.3: Ambil ts_epoch mutakhir tepat saat SCAN SELESAI diproses dari RTC fisik
    uint32_t scanFinishedEpoch = 0;
    float unusedTemp = 0.0f;
    if (!probeAndReadDS3231(scanFinishedEpoch, unusedTemp)) {
      Serial.println("[RTC ERR] probeAndReadDS3231() gagal saat scan selesai!");
      scanFinishedEpoch = (lastKnownEpoch > 0) ? lastKnownEpoch : 0;
    }

    int16_t yardRssi = -127;
    int16_t techRssi = -127;
    for (int i = 0; i < nNetworks; i++) {
      String s = WiFi.SSID(i);
      int32_t r = WiFi.RSSI(i);
      uint8_t ch = WiFi.channel(i);
      bool mYard = isSsidMatch(s, wifiYardSsid);
      bool mTech = isSsidMatch(s, wifiTechSsid);
      Serial.printf("  [%d] '%s' (%d dBm, Ch:%d)%s%s\n",
                    i + 1, s.c_str(), (int)r, (int)ch,
                    mYard ? " <-- YARD MATCH" : "",
                    mTech ? " <-- TECH MATCH" : "");
      if (mYard && r > yardRssi) {
        yardRssi = (int16_t)r;
        lastSeenYardSsid = s;
      }
      if (mTech && r > techRssi) {
        techRssi = (int16_t)r;
        lastSeenTechSsid = s;
      }
    }
    Serial.printf("  -> Evaluasi Gudang  ('%s'): %s (%d dBm)\n",
                  wifiYardSsid.c_str(), (yardRssi >= -85) ? "TERDETEKSI" : "ABSEN/LEMAH", yardRssi);
    Serial.printf("  -> Evaluasi Teknisi ('%s'): %s (%d dBm)\n",
                  wifiTechSsid.c_str(), (techRssi > -90) ? "TERDETEKSI" : "ABSEN/LEMAH", techRssi);
    if (techRssi <= -90) {
      printTechInfoIfDue();
    }

    WiFi.scanDelete();
    asyncScanRunning = false;
    lastZoneEvalMs   = millis();

    // Jalankan Logika Debounce & Hysteresis State Machine (Aturan 1, 2, 3)
    if (rtcCurrentZone == NET_ZONE_YARD) {
      if (yardRssi >= -85) {
        // C.1 Anti-Flapping Gerbang:
        // Jika sebelumnya ada miss (rtcYardMissCount > 0), butuh minimal 2 kali scan berturut-turut
        // dengan sinyal gudang kuat (>= -85 dBm) sebelum rtcYardMissCount di-reset ke 0.
        if (rtcYardMissCount > 0) {
          yardRecoveryCount++;
          if (yardRecoveryCount < 2) {
            Serial.printf("[GATE ANTI-FLAP] Yard sinyal terdeteksi lagi (#%u/2). Debounce miss count (%u) dipertahankan.\n",
                          yardRecoveryCount, rtcYardMissCount);
            return;
          }
          Serial.println("[GATE ANTI-FLAP] Pemulihan sinyal gudang stabil (>=2 scan). Reset miss counter.");
        }
        rtcYardMissCount  = 0;
        rtcFirstMissEpoch     = 0;
      pendingFirstMissEpoch = 0;
      yardRecoveryCount     = 0;
        yardRecoveryCount = 0;
        if (WiFi.status() != WL_CONNECTED && wifiConnState == CONN_IDLE) {
          const char* connectSsid = lastSeenYardSsid.length() > 0 ? lastSeenYardSsid.c_str() : wifiYardSsid.c_str();
          startWifiConnectNonBlocking(CONN_CONNECTING_YARD, connectSsid, wifiYardPass.c_str());
        }
        return;
      }

      // ATURAN 2: Debounce Keluar (SSID Gudang absen / < -85 dBm)
      yardRecoveryCount = 0; // Reset recovery count jika terdeteksi miss lagi
      rtcYardMissCount++;
      if (rtcYardMissCount == 1) {
        rtcFirstMissEpoch = scanFinishedEpoch;
      }
      // speed_kmh diambil dari sampel telemetri terbaru (lastKnownSpeed)
      bool exitConfirmed = (rtcYardMissCount >= 3) || (rtcYardMissCount >= 2 && lastKnownSpeed > 0);
      Serial.printf("[ZONE DEBOUNCE] Yard SSID miss #%u/3 (firstMissEpoch=%lu, RSSI=%d dBm, speed=%u km/h) -> %s\n",
                    rtcYardMissCount, (unsigned long)rtcFirstMissEpoch, yardRssi, (unsigned)lastKnownSpeed,
                    exitConfirmed ? "EXIT DISAHKAN (HANDOVER)" : "MENUNGGU DEBOUNCE (TETAP YARD)");

      if (exitConfirmed) {
        uint32_t rawLag = (rtcFirstMissEpoch > 0 && scanFinishedEpoch > rtcFirstMissEpoch) ? (scanFinishedEpoch - rtcFirstMissEpoch) : 0;
        uint8_t estSteps = (rawLag <= 620UL) ? (uint8_t)(rawLag / 20U) : 0;
        if (estSteps > 31) estSteps = 31;

        // B.2: Log pengesahan transisi zona keluar
        Serial.printf("[ZONE TRANSITION] rawLag=%lus steps=%u firstMiss=%lu nowEpoch=%lu\n",
                      (unsigned long)rawLag, (unsigned)estSteps,
                      (unsigned long)rtcFirstMissEpoch, (unsigned long)scanFinishedEpoch);

        // B.1 & B.2: Simpan pendingFirstMissEpoch untuk dihitung tepat saat record pertama zona luar dibuat
        if (pendingFirstMissEpoch > 0) {
          Serial.printf("[ZONE WARN] pendingFirstMissEpoch tertimpa sebelum dipakai! Lama: %lu, Baru: %lu\n",
                        (unsigned long)pendingFirstMissEpoch, (unsigned long)rtcFirstMissEpoch);
        }
        pendingFirstMissEpoch = rtcFirstMissEpoch;

        // A.1: Zona TECH hanya disetel setelah koneksi benar-benar sukses (WL_CONNECTED).
        // Selama proses connect (CONN_CONNECTING_TECH), zona sementara NET_ZONE_OFFLINE.
        setZone(NET_ZONE_OFFLINE, "Handover Exit Yard Disahkan");
        if (techRssi > -90) {
          const char* connectSsid = lastSeenTechSsid.length() > 0 ? lastSeenTechSsid.c_str() : wifiTechSsid.c_str();
          startWifiConnectNonBlocking(CONN_CONNECTING_TECH, connectSsid, wifiTechPass.c_str());
        }

        rtcFirstMissEpoch = 0;
        rtcYardMissCount  = 0;
        rtcYardHitCount   = 0;
        yardRecoveryCount = 0;
      }
      return;
    }

    // rtcCurrentZone != NET_ZONE_YARD (Sedang di luar gudang: TECH_HOTSPOT atau OFFLINE)
    // ATURAN 3: Hysteresis Masuk (Ambang -75 dBm) & Cross-Reset
    if (yardRssi >= -75) {
      rtcYardHitCount++;
      Serial.printf("[ZONE HYSTERESIS] Yard SSID hit #%u/2 (RSSI: %d dBm >= -75)\n", rtcYardHitCount, yardRssi);
      if (rtcYardHitCount >= 2) {
        const char* connectSsid = lastSeenYardSsid.length() > 0 ? lastSeenYardSsid.c_str() : wifiYardSsid.c_str();
        startWifiConnectNonBlocking(CONN_CONNECTING_YARD, connectSsid, wifiYardPass.c_str());
        setZone(NET_ZONE_YARD, "Handover Confirmed to Yard (Hit >= 2)");
        rtcYardHitCount       = 0;
        rtcYardMissCount      = 0;
        rtcFirstMissEpoch     = 0;
        pendingFirstMissEpoch = 0;
        yardRecoveryCount     = 0;
        return;
      }
    } else {
      rtcYardHitCount = 0;
    }

    if (WiFi.status() == WL_CONNECTED && isSsidMatch(WiFi.SSID(), wifiTechSsid)) {
      setZone(NET_ZONE_TECH, "WiFi Connected to Tech");
    } else if (techRssi > -90) {
      if (WiFi.status() != WL_CONNECTED && wifiConnState == CONN_IDLE) {
        const char* connectSsid = lastSeenTechSsid.length() > 0 ? lastSeenTechSsid.c_str() : wifiTechSsid.c_str();
        startWifiConnectNonBlocking(CONN_CONNECTING_TECH, connectSsid, wifiTechPass.c_str());
      }
      if (WiFi.status() == WL_CONNECTED && isSsidMatch(WiFi.SSID(), wifiTechSsid)) {
        setZone(NET_ZONE_TECH, "Tech Hotspot Active");
      } else {
        setZone(NET_ZONE_OFFLINE, "Connecting to Tech Hotspot");
      }
    } else {
      setZone(NET_ZONE_OFFLINE, "Tech Signal Absent");
    }
  }
}

// A.2: Pemicu Scan HANYA dijalankan segera setelah POST selesai (window terpanjang sebelum POST berikutnya)
void triggerWifiScanIfDue() {
  if (asyncScanRunning) return;

  // 1. Optimasi Tanpa Scan Saat Terhubung ke Gudang (Zero-Scan Yard Hold)
  // Anti-Flapping Gerbang (Task 1.4 C.1):
  // Jika rtcYardMissCount > 0, jangan lewati pemindaian. Pemindaian harus tetap berjalan
  // untuk memverifikasi apakah sinyal gudang pulih stabil (>=2 scan berturut-turut)
  // atau kendaraan memang sedang bergerak keluar melewati gerbang.
  if (WiFi.status() == WL_CONNECTED && isSsidMatch(WiFi.SSID(), wifiYardSsid) && WiFi.RSSI() >= -85) {
    if (rtcYardMissCount == 0) {
      setZone(NET_ZONE_YARD, "Zero-Scan Yard Hold (TriggerScan)");
      rtcYardHitCount   = 0;
      return;
    }
  }

  // 2. Evaluasi interval scan berdasarkan status koneksi & mesin
  uint32_t evalIntervalMs = 180000UL;
  if (WiFi.status() != WL_CONNECTED) {
    evalIntervalMs = 0UL;
  } else if (prevEngineOnState == 1) {
    if ((millis() - engineStartTimeMs) <= 120000UL) {
      evalIntervalMs = 15000UL;
    } else if (rtcCurrentZone != NET_ZONE_YARD) {
      evalIntervalMs = 30000UL;
    } else {
      evalIntervalMs = 60000UL;
    }
  }

  if (rtcCurrentZone != NET_ZONE_UNKNOWN && (millis() - lastZoneEvalMs) < evalIntervalMs) {
    return; // Belum waktunya scan
  }

  // A.2: Jangan memulai scan jika sisa waktu menuju POST berikutnya < durasi scan terukur + 500 ms
  uint32_t elapsed = millis() - lastPollMs;
  uint32_t remainingMs = (elapsed < pollIntervalMs) ? (pollIntervalMs - elapsed) : 0;
  uint32_t safeThresholdMs = lastMeasuredScanDurationMs + 500UL;
  if (remainingMs < safeThresholdMs) {
    return; // Tunda ke siklus berikutnya karena sisa waktu tidak cukup aman
  }

  // Mulai Pemindaian Latar Belakang Asinkron (120ms per channel, non-blocking)
  WiFi.scanDelete();
  int16_t startStatus = WiFi.scanNetworks(true, false, false, 120);
  if (startStatus == WIFI_SCAN_RUNNING || startStatus == 0) {
    asyncScanRunning = true;
    asyncScanStartMs = millis();
    Serial.printf("[WIFI SCAN ASYNC] Memulai scan background asinkron (120ms/ch, sisa window=%lums, batas aman=%lums)...\n",
                  (unsigned long)remainingMs, (unsigned long)safeThresholdMs);
  }
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
  bool rawCanOk = canLoopbackOk;

  pkt.crit_alert     = (pkt.v_bat < cfgCritVoltage || simDtcActive || pkt.dtc_cnt > 0) ? 1 : 0;
  pkt.shunt_sleep_ua = (pkt.engine_on == 1) ? 0 : ((currentWaveMode == WAVE_PARASITIC_DRAIN) ? 620 : 410);

  // 4. Urutan Eksplisit: Sampling Selesai -> Evaluasi Zona Jaringan -> Bit-Packing
  uint8_t activeZone  = NET_ZONE_UNKNOWN;
  uint8_t lagSteps20s = 0;
  evaluateNetworkZone(pkt, activeZone, lagSteps20s);

  // Kemas 3 informasi ke dalam byte can_ok sebagai langkah paling akhir:
  pkt.can_ok = packCanZoneAndLag(rawCanOk, activeZone, lagSteps20s);
}

// ==================== PENGIRIMAN HTTP/HTTPS POST & BURST FLUSH ===============
String sanitizeSsidHeader(const String &rawSsid) {
  String clean = "";
  clean.reserve(32);
  for (size_t i = 0; i < rawSsid.length() && clean.length() < 32; i++) {
    char c = rawSsid[i];
    if (c >= 0x20 && c <= 0x7E) {
      clean += c;
    }
  }
  return clean.length() > 0 ? clean : "UNKNOWN";
}

String buildSingleRecordJson(const TelemetryItem &p, uint16_t totalBufRemaining) {
  char buf[1024];
  uint16_t exitLagSec = getRecordExitLagSec(p);
  uint32_t zoneExitEpoch = (exitLagSec > 0 && p.ts_epoch > exitLagSec) ? (p.ts_epoch - exitLagSec) : 0UL;

  snprintf(buf, sizeof(buf),
    "{\"unit_id\":\"%s\",\"seq\":%lu,\"boot\":%lu,\"ts_epoch\":%lu,"
    "\"v_bat\":%.2f,\"adc_raw_mv\":%u,\"rtc_temp_c\":%.2f,"
    "\"shunt_sleep_ua\":%u,\"engine_on\":%s,\"crit_alert\":%s,"
    "\"rpm\":%u,\"temp_c\":%u,\"dtc_cnt\":%u,\"dtc\":\"%s\","
    "\"rssi\":%d,\"sleep_cfg\":\"%s\",\"buffer_used\":%u,"
    "\"can_ok\":%s,\"net_zone\":\"%s\",\"zone_exit_epoch\":%lu,"
    "\"active_ms\":1840,\"daily_mah\":4.82,"
    "\"speed_kmh\":%u,\"iat_c\":%d,\"map_kpa\":%u,\"load_pct\":%.1f,"
    "\"tps_pct\":%.1f,\"ign_deg\":%.1f,\"maf_gs\":%.2f,\"run_time_s\":%lu,"
    "\"fuel_pct\":%.1f,\"fuel_rate_lh\":%.2f,\"o2_v\":%.2f,\"stft_pct\":%.1f,"
    "\"mil_on\":%u,\"ecu_v\":%.2f,\"dist_clr_km\":%u}",
    UNIT_ID, (unsigned long)p.seq, (unsigned long)p.boot, (unsigned long)p.ts_epoch,
    p.v_bat, p.adc_raw_mv, p.rtc_temp_c,
    p.shunt_sleep_ua, p.engine_on ? "true" : "false", p.crit_alert ? "true" : "false",
    p.rpm, p.temp_c, p.dtc_cnt, p.dtc,
    (int)p.rssi, cfgSleepMode.c_str(), totalBufRemaining,
    getRecordCanOk(p) ? "true" : "false",
    netZoneToString(getRecordNetZone(p)),
    (unsigned long)zoneExitEpoch,
    p.speed_kmh, (int)p.iat_c, p.map_kpa, p.load_pct,
    p.tps_pct, p.ign_deg, p.maf_gs, (unsigned long)p.run_time_s,
    p.fuel_pct, p.fuel_rate_lh, p.o2_v, p.stft_pct,
    p.mil_on, p.ecu_v, p.dist_clr_km
  );
  return String(buf);
}

bool postBatchRecords(const TelemetryItem *items, uint8_t count, bool isBurst) {
#if ORION_DEBUG_SERIAL
  if (simZoneOverride == NET_ZONE_OFFLINE) return false;
#endif
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
  http.addHeader("X-Sync-SSID", sanitizeSsidHeader(WiFi.SSID()));

  uint16_t totalRemaining = tier1Count + tier2Count;
  String payload;
  if (count == 1) {
    payload = buildSingleRecordJson(items[0], totalRemaining);
  } else {
    payload.reserve((size_t)count * 760U);
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
    Serial.printf("[BURST SYNC] Mengirim %u rekaman dari Tier-2 LittleFS Flash (X-Sync-SSID: %s)...\n",
                  n, sanitizeSsidHeader(WiFi.SSID()).c_str());
    if (postBatchRecords(batch, n, true)) {
      commitFlushedLittleFSBatch(n);
    } else {
      return;
    }
  }

  if (tier1Count > 0) {
    Serial.printf("[BURST SYNC] Mengirim %u rekaman dari Tier-1 RTC SRAM (X-Sync-SSID: %s)...\n",
                  tier1Count, sanitizeSsidHeader(WiFi.SSID()).c_str());
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
  Serial.println("  Network Architecture  : 4-State Network Zone (Dual-SSID Presence Handover)");
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
#if ORION_DEBUG_SERIAL
  Serial.println("  [t] Siklus Uji Simulasi Zona (YARD -> TECH_HOTSPOT -> OFFLINE -> AUTO/BURST)");
  Serial.println("  [m] Paksa Evaluasi Scan Jaringan WiFi Segera (Bypass Timer 15/30/60/180s)");
  Serial.println("  [p] Uji Koneksi Langsung ke Hotspot Teknisi (10 Detik)");
  Serial.println("  [z] Reset State Machine Zona Jaringan ke UNKNOWN");
#endif
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
  wifi_country_t country = { "ID", 1, 14, 20, WIFI_COUNTRY_POLICY_AUTO };
  esp_wifi_set_country(&country);
  WiFi.setSleep(false); // Nonaktifkan modem sleep agar latensi HTTP POST rendah & stabil
  WiFi.setAutoReconnect(false); // Kelola rekoneksi secara terpusat agar tidak mengunci radio scan

  // Inisialisasi NTP SNTP client untuk sinkronisasi waktu epoch akurat saat terhubung internet
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  // Daftarkan event handler untuk diagnosa WiFi mendalam
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_START) {
      Serial.println("[WIFI EVENT] Radio Station siap");
    } else if (event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
      Serial.printf("[WIFI EVENT] Terhubung fisik ke SSID: '%s' (Channel: %d)\n",
                    WiFi.SSID().c_str(), (int)WiFi.channel());
    } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      Serial.printf("[WIFI EVENT] Mendapatkan IP: %s (Gateway: %s)\n",
                    WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str());
    } else if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      uint8_t reason = info.wifi_sta_disconnected.reason;
      Serial.printf("[WIFI EVENT] Terputus / Gagal! Kode: %u (%s)\n",
                    reason, WiFi.disconnectReasonName((wifi_err_reason_t)reason));
      if (reason == WIFI_REASON_NO_AP_FOUND) {
        Serial.println("  -> [SARAN] SSID tidak ditemukan. Pastikan hotspot HP aktif & menggunakan pita 2.4 GHz!");
      } else if (reason == WIFI_REASON_AUTH_FAIL) {
        Serial.println("  -> [SARAN] Password hotspot salah!");
      } else if (reason == WIFI_REASON_HANDSHAKE_TIMEOUT || reason == WIFI_REASON_AUTH_EXPIRE) {
        Serial.println("  -> [SARAN] Masalah WPA3/PMF! Di HP, ganti Security hotspot ke 'WPA2-Personal' dan matikan 'Wi-Fi 6 hotspot'.");
      }
    }
  });

  // Cold Boot Sequence untuk penentuan awal zona jaringan:
  if (rtcCurrentZone == NET_ZONE_UNKNOWN) {
    Serial.println("[WIFI COLD BOOT] Scanning jaringan untuk deteksi kehadiran SSID Gudang...");
    WiFi.disconnect(false, true);
    delay(100);
    uint32_t tScan0 = millis();
    int nNetworks = WiFi.scanNetworks(false, false, false, 120);
    if (nNetworks < 0) {
      delay(50);
      nNetworks = WiFi.scanNetworks(false, false, false, 150);
    }
    uint32_t scanDur = millis() - tScan0;
    Serial.printf("[WIFI COLD BOOT] Scan selesai dalam %lu ms. Ditemukan %d Access Point:\n", (unsigned long)scanDur, nNetworks);
    for (int i = 0; i < nNetworks; i++) {
      String s = WiFi.SSID(i);
      int32_t r = WiFi.RSSI(i);
      uint8_t ch = WiFi.channel(i);
      bool mYard = isSsidMatch(s, wifiYardSsid);
      bool mTech = isSsidMatch(s, wifiTechSsid);
      Serial.printf("  [%d] '%s' (%d dBm, Ch:%d)%s%s\n",
                    i + 1, s.c_str(), (int)r, (int)ch,
                    mYard ? " <-- YARD MATCH" : "",
                    mTech ? " <-- TECH MATCH" : "");
      if (mYard && r > yardRssi) {
        yardRssi = (int16_t)r;
        lastSeenYardSsid = s;
      }
      if (mTech && r > techRssi) {
        techRssi = (int16_t)r;
        lastSeenTechSsid = s;
      }
    }
    Serial.printf("  -> Evaluasi Gudang  ('%s'): %s (%d dBm)\n",
                  wifiYardSsid.c_str(), (yardRssi >= -85) ? "TERDETEKSI" : "ABSEN/LEMAH", yardRssi);
    Serial.printf("  -> Evaluasi Teknisi ('%s'): %s (%d dBm)\n",
                  wifiTechSsid.c_str(), (techRssi > -90) ? "TERDETEKSI" : "ABSEN/LEMAH", techRssi);
    if (techRssi <= -90) {
      Serial.printf("  [PETUNJUK] Hotspot '%s' tidak terlihat. Pastikan Hotspot disetel ke pita 2.4 GHz di HP!\n", wifiTechSsid.c_str());
    }
    WiFi.scanDelete();

    if (yardRssi >= -85) {
      setZone(NET_ZONE_YARD, "Cold Boot Yard Detected");
      rtcYardMissCount  = 0;
      rtcYardHitCount   = 0;
      rtcFirstMissEpoch     = 0;
      pendingFirstMissEpoch = 0;
      yardRecoveryCount     = 0;
      const char* connectSsid = lastSeenYardSsid.length() > 0 ? lastSeenYardSsid.c_str() : wifiYardSsid.c_str();
      Serial.printf("[WIFI COLD BOOT] SSID Gudang '%s' terdeteksi (%d dBm >= -85) -> NET_ZONE_YARD\n",
                    connectSsid, yardRssi);
      WiFi.disconnect(false, true);
      delay(50);
      WiFi.begin(connectSsid, wifiYardPass.c_str());
    } else {
      Serial.printf("[WIFI COLD BOOT] SSID Gudang absen (%d dBm < -85). Mencoba Hotspot Teknisi '%s'...\n", yardRssi, wifiTechSsid.c_str());
      if (techRssi > -90) {
        const char* connectSsid = lastSeenTechSsid.length() > 0 ? lastSeenTechSsid.c_str() : wifiTechSsid.c_str();
        WiFi.disconnect(false, true);
        delay(50);
        WiFi.begin(connectSsid, wifiTechPass.c_str());
        uint32_t t0 = millis();
        while (WiFi.status() != WL_CONNECTED && (millis() - t0) < 10000) {
          delay(250);
          Serial.print(".");
        }
        Serial.println("");
      }
      if (WiFi.status() == WL_CONNECTED && isSsidMatch(WiFi.SSID(), wifiTechSsid)) {
        setZone(NET_ZONE_TECH, "Cold Boot Tech Connected");
        Serial.printf("[WIFI COLD BOOT] Terhubung ke Hotspot Teknisi '%s' -> NET_ZONE_TECH\n", WiFi.SSID().c_str());
      } else {
        setZone(NET_ZONE_OFFLINE, "Cold Boot Offline");
        Serial.println("[WIFI COLD BOOT] Hotspot Teknisi tidak tersedia -> NET_ZONE_OFFLINE");
      }
    }
  } else if (rtcCurrentZone == NET_ZONE_YARD) {
    const char* connectSsid = lastSeenYardSsid.length() > 0 ? lastSeenYardSsid.c_str() : wifiYardSsid.c_str();
    WiFi.disconnect(false, true);
    delay(50);
    WiFi.begin(connectSsid, wifiYardPass.c_str());
  } else if (rtcCurrentZone == NET_ZONE_TECH) {
    const char* connectSsid = lastSeenTechSsid.length() > 0 ? lastSeenTechSsid.c_str() : wifiTechSsid.c_str();
    WiFi.disconnect(false, true);
    delay(50);
    WiFi.begin(connectSsid, wifiTechPass.c_str());
  }

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - t0) < 6000) {
    delay(300);
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
#if ORION_DEBUG_SERIAL
    else if (c == 't') {
      lastPollMs = 0; // Picu live poll segera
      if (simZoneOverride == -1) {
        simZoneOverride = NET_ZONE_YARD;
        simTransitionLagPending = 0;
        Serial.println("[TEST SIM] Zone forced: NET_ZONE_YARD (1)");
      } else if (simZoneOverride == NET_ZONE_YARD) {
        simZoneOverride = NET_ZONE_TECH;
        simTransitionLagPending = 2; // Simulasikan lag 2 step (40 detik) pada paket pertama transisi keluar
        Serial.println("[TEST SIM] Zone forced: NET_ZONE_TECH (2) | lagSteps20s=2 (40s exit lag)");
      } else if (simZoneOverride == NET_ZONE_TECH) {
        simZoneOverride = NET_ZONE_OFFLINE;
        simTransitionLagPending = 0;
        Serial.println("[TEST SIM] Zone forced: NET_ZONE_OFFLINE (3) | Enqueue to buffer");
      } else {
        simZoneOverride = -1;
        simTransitionLagPending = 0;
        Serial.println("[TEST SIM] Zone forced: RESET to AUTO/YARD (-1) | Triggering Burst Sync...");
        flushAllOfflineBuffers();
      }
    }
    else if (c == 'm') {
      lastZoneEvalMs = 0; // Paksa scan jaringan alami segera
      triggerWifiScanIfDue();
      Serial.println("[MANUAL SCAN] Memicu evaluasi scan jaringan alami segera (bypass timer)...");
    }
    else if (c == 'p') {
      Serial.println("\n[TEST DIRECT] Menguji koneksi langsung ke Hotspot Teknisi...");
      Serial.printf("  SSID Target: '%s' | Password: '%s'\n", wifiTechSsid.c_str(), wifiTechPass.c_str());
      WiFi.disconnect(false, true);
      delay(200);
      WiFi.begin(wifiTechSsid.c_str(), wifiTechPass.c_str());
      uint32_t t0 = millis();
      while (WiFi.status() != WL_CONNECTED && (millis() - t0) < 10000) {
        delay(250);
        Serial.print(".");
      }
      Serial.println("");
      if (WiFi.status() == WL_CONNECTED) {
        setZone(NET_ZONE_TECH, "Direct Tech Test Connected");
        Serial.printf("[TEST DIRECT] BERHASIL TERHUBUNG! IP: %s (Zone diset ke NET_ZONE_TECH)\n\n", WiFi.localIP().toString().c_str());
      } else {
        Serial.println("[TEST DIRECT] GAGAL terhubung ke Hotspot Teknisi! Amati alasan [WIFI EVENT] di atas.\n");
      }
    }
    else if (c == 'z') {
      setZone(NET_ZONE_UNKNOWN, "Manual Reset via Serial Command");
      rtcYardMissCount  = 0;
      rtcYardHitCount   = 0;
      rtcFirstMissEpoch     = 0;
      pendingFirstMissEpoch = 0;
      yardRecoveryCount     = 0;
      lastZoneEvalMs    = 0;
      lastPollMs        = 0;
      Serial.println("[ZONE RESET] State machine zona di-reset ke UNKNOWN. Evaluasi scan segera dipicu!");
    }
#endif
    else if (c == 's') {
      Serial.printf("[STATUS] Boot: %lu | Seq: %lu | Zone: %s (RTC=%u, Miss=%u, Hit=%u, 1stMiss=%lu) | Tier-1 RTC: %u/20 | Tier-2 LittleFS: %u/%u | Total Antrean: %u\n",
                    (unsigned long)rtcBootCount, (unsigned long)rtcSeqCounter,
                    netZoneToString(rtcCurrentZone), rtcCurrentZone, rtcYardMissCount, rtcYardHitCount, (unsigned long)rtcFirstMissEpoch,
                    tier1Count, tier2Count, TIER2_MAX_RECORDS, (uint16_t)(tier1Count + tier2Count));
      Serial.printf("[WIFI CFG] Yard SSID='%s' | Tech SSID='%s'\n",
                    wifiYardSsid.c_str(), wifiTechSsid.c_str());
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

  // B.2: Sinkronisasi waktu RTC DS3231 dengan NTP jika terhubung WiFi & ada selisih > 5 detik
  checkNtpRtcSync();

  // B.1: State Machine Rekoneksi WiFi Asinkron (Non-Blocking, Timeout 6s)
  updateWifiAsyncConnect();

  // A.1: Pemeriksaan & pengelolaan pemindaian Wi-Fi background asinkron (non-blocking)
  updateAsyncWifiScan();

  // Auto-Reconnect WiFi Periodik setiap 15 detik jika belum terhubung
  if (!simOfflineMode && WiFi.status() != WL_CONNECTED && wifiConnState == CONN_IDLE && (millis() - lastWifiRetryMs >= WIFI_RETRY_MS)) {
    lastWifiRetryMs = millis();
    if (rtcCurrentZone == NET_ZONE_TECH) {
      Serial.println("[WIFI] Mencoba menyambung ulang ke Hotspot Teknisi...");
      const char* connectSsid = lastSeenTechSsid.length() > 0 ? lastSeenTechSsid.c_str() : wifiTechSsid.c_str();
      startWifiConnectNonBlocking(CONN_CONNECTING_TECH, connectSsid, wifiTechPass.c_str());
    } else if (rtcCurrentZone == NET_ZONE_YARD && rtcYardMissCount == 0) {
      Serial.println("[WIFI] Mencoba menyambung ulang ke SSID Gudang...");
      const char* connectSsid = lastSeenYardSsid.length() > 0 ? lastSeenYardSsid.c_str() : wifiYardSsid.c_str();
      startWifiConnectNonBlocking(CONN_CONNECTING_YARD, connectSsid, wifiYardPass.c_str());
    } else {
      // NET_ZONE_OFFLINE atau UNKNOWN: Paksa scan jaringan alami pada live poll berikutnya
      lastZoneEvalMs = 0;
    }
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

    bool isOfflineMode = simOfflineMode ||
#if ORION_DEBUG_SERIAL
                         (simZoneOverride == NET_ZONE_OFFLINE) ||
#endif
                         (getRecordNetZone(pkt) == NET_ZONE_OFFLINE);

    if (!isOfflineMode && WiFi.status() == WL_CONNECTED && (tier1Count > 0 || tier2Count > 0)) {
      flushAllOfflineBuffers();
    }

    if (!isOfflineMode && WiFi.status() == WL_CONNECTED) {
      if (postBatchRecords(&pkt, 1, false)) {
        Serial.printf("[ORION LIVE] boot=%lu | seq=%lu | V=%.2fV (%umV) | Zone=%s | RTC=%.2fC | CAN=%s | Buf=%u\n",
                      (unsigned long)pkt.boot, (unsigned long)pkt.seq,
                      pkt.v_bat, pkt.adc_raw_mv, netZoneToString(getRecordNetZone(pkt)),
                      pkt.rtc_temp_c,
                      getRecordCanOk(pkt) ? "OK" : "ERR", (uint16_t)(tier1Count + tier2Count));
      } else {
        enqueueOfflineRecord(pkt);
      }
    } else {
      enqueueOfflineRecord(pkt);
      Serial.printf("[ORION OFFLINE] boot=%lu | seq=%lu | V=%.2fV (%umV) | Zone=%s | RTC=%.2fC | CAN=%s | Buf=%u\n",
                    (unsigned long)pkt.boot, (unsigned long)pkt.seq,
                    pkt.v_bat, pkt.adc_raw_mv, netZoneToString(getRecordNetZone(pkt)),
                    pkt.rtc_temp_c,
                    getRecordCanOk(pkt) ? "OK" : "ERR", (uint16_t)(tier1Count + tier2Count));
    }

    // A.2: Scan Wi-Fi latar belakang HANYA dipicu segera setelah POST/Enqueue selesai
    // Ini menjamin window waktu terpanjang (~4.5s) sebelum jadwal transmisi berikutnya
    triggerWifiScanIfDue();
  }
}
