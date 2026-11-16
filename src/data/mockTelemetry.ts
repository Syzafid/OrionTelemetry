/**
 * Mock telemetry layer. Shapes mirror the ESP32 Master Firmware v1.5.0 JSON contract
 * (20 core fields + 15 Read-Only OBD-II Mode 01/03/07 fields)
 * so these can be swapped for real API responses without refactoring the UI.
 */

/** Raw payload as published by the ESP32 node each wake cycle. */
export interface TelemetryPayload {
  unit_id: string;
  seq?: number;
  boot: number;
  ts_epoch?: number;
  v_bat: number;
  engine_on: boolean;
  crit_alert: boolean;
  /** 0 (or -1) when engine is off / PID unavailable */
  rpm: number;
  /** 0 (or -99) when engine is off / PID unavailable */
  temp_c: number;
  dtc_cnt: number;
  dtc: string; // "NONE" or e.g. "P0102", "P0115"
  rssi: number;
  sleep_cfg: number; // seconds
  active_ms: number;
  daily_mah: number;
  /** DS3231SN die temperature in °C, still reported in deep sleep */
  rtc_temp_c: number;
  /** Raw voltage at GPIO34 Node M behind the 300k/68k divider, in mV */
  adc_raw_mv: number;
  /** Deep-sleep quiescent current measured over the 10Ω shunt, in µA (0 when engine on) */
  shunt_sleep_ua: number;
  /** TWAI CAN transceiver status (Mode 01/03 Read-Only or loopback self-test) */
  can_ok?: boolean;

  // --- 15 Parameter OBD-II Read-Only (Mode 0x01 / Mode 0x03 / 0x07) ---
  /** Mode 01 PID 0x0D: Vehicle Speed (km/h) */
  speed_kmh?: number;
  /** Mode 01 PID 0x0F: Intake Air Temperature (°C) */
  iat_c?: number;
  /** Mode 01 PID 0x0B: Intake Manifold Absolute Pressure (kPa) */
  map_kpa?: number;
  /** Mode 01 PID 0x04: Calculated Engine Load (%) */
  load_pct?: number;
  /** Mode 01 PID 0x11: Absolute Throttle Position (%) */
  tps_pct?: number;
  /** Mode 01 PID 0x0E: Ignition Timing Advance (° BTDC) */
  ign_deg?: number;
  /** Mode 01 PID 0x10: Mass Air Flow Rate (g/s) */
  maf_gs?: number;
  /** Mode 01 PID 0x1F: Engine Run Time Since Engine Start (s) */
  run_time_s?: number;
  /** Mode 01 PID 0x2F: Fuel Tank Level Input (%) */
  fuel_pct?: number;
  /** Mode 01 PID 0x5E (or MAF calc): Real-Time Fuel Consumption Rate (L/h) */
  fuel_rate_lh?: number;
  /** Mode 01 PID 0x14: Upstream O2 Sensor Voltage (V) */
  o2_v?: number;
  /** Mode 01 PID 0x06: Short Term Fuel Trim Bank 1 (%) */
  stft_pct?: number;
  /** Mode 01 PID 0x01 Bit A7: Malfunction Indicator Lamp / Check Engine Status (Read-Only) */
  mil_on?: boolean;
  /** Mode 01 PID 0x42: Control Module Voltage (V) */
  ecu_v?: number;
  /** Mode 01 PID 0x31: Distance Traveled Since Codes Cleared (km) */
  dist_clr_km?: number;
}

export type SimState = "STANDBY" | "WARMUP" | "CRITICAL" | "DEPARTED";

export interface VehicleUnit {
  unit_id: string;
  bay: string;
  model: string;
  trim: string;
  vin: string;
  color: string;
  status_label: string;
  state: SimState;
  in_yard: boolean;
  online_status?: "ONLINE" | "OFFLINE";
  last_seen_sec?: number;
  last_seen?: string | null;
  connection_badge?: string;
  buffer_used: number; // rtcRingBuffer occupied slots
  telemetry: TelemetryPayload;
}

export interface UnitConnectionState {
  isOnline: boolean;
  badgeText: "LIVE / ONLINE" | "OFFLINE / DEEP SLEEP";
  lastSeenSec: number | null;
}

export const LIVE_ONLINE_THRESHOLD_SEC = 6;

/**
 * Evaluates whether a telemetry unit is LIVE / ONLINE (last_seen <= 6s)
 * or OFFLINE / DEEP SLEEP (> 6s), keeping compatibility with local simulator mode.
 */
export function getUnitConnectionState(u: VehicleUnit): UnitConnectionState {
  let isOnline: boolean;
  if (typeof u.last_seen_sec === "number" && Number.isFinite(u.last_seen_sec)) {
    isOnline = u.last_seen_sec <= LIVE_ONLINE_THRESHOLD_SEC && u.in_yard;
  } else if (u.online_status === "ONLINE" || u.online_status === "OFFLINE") {
    isOnline = u.online_status === "ONLINE" && u.in_yard;
  } else {
    isOnline = u.in_yard && u.telemetry.engine_on;
  }

  return {
    isOnline,
    badgeText: isOnline ? "LIVE / ONLINE" : "OFFLINE / DEEP SLEEP",
    lastSeenSec: typeof u.last_seen_sec === "number" ? u.last_seen_sec : null,
  };
}

export interface VoltagePoint {
  t: string;
  v: number;
  ts?: number;
}

export interface WarmupPoint {
  t: string;
  rpm: number;
  temp: number;
  v: number;
  ts?: number;
}

export type OperationalTag = "Test Drive" | "PDI Workshop" | "Detailing" | "Customer Delivery";
export const OPERATIONAL_TAGS: OperationalTag[] = ["Test Drive", "PDI Workshop", "Detailing", "Customer Delivery"];

export interface MovementEvent {
  id: string;
  unit_id: string;
  departed: string;
  returned: string | null;
  away_min: number | null;
  debounce_hits: number;
  tag: OperationalTag | null;
}

export interface PiggybackConfig {
  unit_id: string;
  sleep_cfg: number; // seconds
  fast_poll_s: number;
  crit_v: number;
  debounce_cnt: number;
  /** SOP C.1 linear regression: V_bat = adc_raw_mv * cal_slope + cal_offset */
  cal_slope: number;
  cal_offset: number;
}

export type AuditSeverity = "INFO" | "WARN" | "CRITICAL";

export interface AuditLogEntry {
  id: number;
  unit_id: string;
  event_type: string;
  severity: AuditSeverity;
  message: string;
  created_at: string;
}

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export interface MaintenanceTicket {
  id: number;
  ticket_code: string;
  unit_id: string;
  bay: string;
  issue_summary: string;
  status: TicketStatus;
  assigned_to: string;
  handover_note: string;
  updated_at: string;
}

export interface WiringNode {
  id: string;
  wire: string;
  path: string;
  signal: string;
  status: "OK" | "WARN" | "FAULT";
  reading: string;
}

export const GATEWAY = { ap: "AP-GUDANG-01", channel: 11, rssi: -40 };
export const ALT_VERIFY_V = 13.5;

export const UNITS: VehicleUnit[] = [
  {
    unit_id: "MITSUBISHI-STOCK-01",
    bay: "A-01",
    model: "PAJERO SPORT",
    trim: "DAKAR 4x4",
    vin: "MMBGUKS10RH004121",
    color: "Graphite Grey",
    status_label: "Standby (Deep Sleep)",
    state: "STANDBY",
    in_yard: true,
    buffer_used: 3,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-01", boot: 41, v_bat: 12.60, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -44, sleep_cfg: 300, active_ms: 1613, daily_mah: 5.95,
      rtc_temp_c: 31.2, adc_raw_mv: 2262, shunt_sleep_ua: 410, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 74.5, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 1420,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-02",
    bay: "A-04",
    model: "XFORCE",
    trim: "ULTIMATE CVT",
    vin: "MMBXFUJ40SH000877",
    color: "Energetic Yellow",
    status_label: "Low Battery Warning",
    state: "STANDBY",
    in_yard: true,
    buffer_used: 6,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-02", boot: 112, v_bat: 12.18, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -52, sleep_cfg: 300, active_ms: 1488, daily_mah: 6.41,
      rtc_temp_c: 32.0, adc_raw_mv: 2184, shunt_sleep_ua: 440, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 68.0, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 1180,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-03",
    bay: "B-02",
    model: "XPANDER CROSS",
    trim: "ELITE",
    vin: "MK2NCXTARRJ012550",
    color: "Quartz White",
    status_label: "Critical Battery Drain",
    state: "CRITICAL",
    in_yard: true,
    buffer_used: 17,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-03", boot: 41, v_bat: 11.65, engine_on: false, crit_alert: true,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -48, sleep_cfg: 300, active_ms: 1702, daily_mah: 5.71,
      rtc_temp_c: 33.4, adc_raw_mv: 2086, shunt_sleep_ua: 490, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 62.5, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 980,
    },
  },
];

/**
 * Full 12-unit stock yard dataset for scalable multi-unit (10-20+ units) testing and live demonstration.
 * Includes the 3 core ESP32 hardware-synced units (STOCK-01..03) plus 9 additional yard bays (A-02..C-04).
 */
export const EXPANDED_YARD_UNITS: VehicleUnit[] = [
  ...UNITS,
  {
    unit_id: "MITSUBISHI-STOCK-04",
    bay: "A-02",
    model: "TRITON",
    trim: "HDX 4x4 MT",
    vin: "MMBJNKL10RH009214",
    color: "White Diamond",
    status_label: "Critical Drain & ECU DTC",
    state: "CRITICAL",
    in_yard: true,
    buffer_used: 11,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-04", boot: 88, v_bat: 11.72, engine_on: false, crit_alert: true,
      rpm: 0, temp_c: 0, dtc_cnt: 1, dtc: "P0133", rssi: -55, sleep_cfg: 300, active_ms: 1680, daily_mah: 6.82,
      rtc_temp_c: 32.8, adc_raw_mv: 2099, shunt_sleep_ua: 520, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 71.0, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: true, ecu_v: 0, dist_clr_km: 1540,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-05",
    bay: "A-03",
    model: "L300",
    trim: "EURO 4 CAB CHASSIS",
    vin: "MHML300P0RJ003410",
    color: "Jet Black",
    status_label: "Standby (Deep Sleep)",
    state: "STANDBY",
    in_yard: true,
    buffer_used: 0,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-05", boot: 29, v_bat: 12.68, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -42, sleep_cfg: 600, active_ms: 1410, daily_mah: 4.85,
      rtc_temp_c: 30.4, adc_raw_mv: 2277, shunt_sleep_ua: 380, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 84.0, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 850,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-06",
    bay: "B-01",
    model: "PAJERO SPORT",
    trim: "EXCEED 4x2 AT",
    vin: "MMBGUKS30RH007612",
    color: "Sterling Silver",
    status_label: "Engine Warm-up Active",
    state: "WARMUP",
    in_yard: true,
    buffer_used: 0,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-06", boot: 64, v_bat: 14.18, engine_on: true, crit_alert: false,
      rpm: 860, temp_c: 84, dtc_cnt: 0, dtc: "NONE", rssi: -41, sleep_cfg: 300, active_ms: 245000, daily_mah: 5.40,
      rtc_temp_c: 36.2, adc_raw_mv: 2554, shunt_sleep_ua: 0, can_ok: true,
      speed_kmh: 0, iat_c: 35, map_kpa: 34, load_pct: 22.4, tps_pct: 14.5, ign_deg: 12.5, maf_gs: 3.45, run_time_s: 245,
      fuel_pct: 78.0, fuel_rate_lh: 1.14, o2_v: 0.65, stft_pct: 1.2, mil_on: false, ecu_v: 14.12, dist_clr_km: 1640,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-07",
    bay: "B-03",
    model: "XPANDER",
    trim: "ULTIMATE CVT",
    vin: "MK2NCXPARRJ018823",
    color: "Blade Silver",
    status_label: "Low Battery Warning",
    state: "STANDBY",
    in_yard: true,
    buffer_used: 4,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-07", boot: 95, v_bat: 12.12, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -58, sleep_cfg: 300, active_ms: 1530, daily_mah: 6.55,
      rtc_temp_c: 32.1, adc_raw_mv: 2173, shunt_sleep_ua: 455, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 66.5, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 1310,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-08",
    bay: "B-04",
    model: "XFORCE",
    trim: "EXCEED CVT",
    vin: "MMBXFUJ20SH001944",
    color: "Red Metallic",
    status_label: "Out of Yard (Test Drive)",
    state: "DEPARTED",
    in_yard: false,
    buffer_used: 34,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-08", boot: 53, v_bat: 12.48, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -127, sleep_cfg: 300, active_ms: 1590, daily_mah: 5.80,
      rtc_temp_c: 33.9, adc_raw_mv: 2240, shunt_sleep_ua: 415, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 73.0, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 2140,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-09",
    bay: "C-01",
    model: "TRITON",
    trim: "ATHLETE 4x4 AT",
    vin: "MMBJNKL60RH005531",
    color: "Impulse Blue",
    status_label: "Standby (Deep Sleep)",
    state: "STANDBY",
    in_yard: true,
    buffer_used: 1,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-09", boot: 37, v_bat: 12.64, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -49, sleep_cfg: 600, active_ms: 1475, daily_mah: 5.12,
      rtc_temp_c: 31.0, adc_raw_mv: 2269, shunt_sleep_ua: 395, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 80.5, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 1090,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-10",
    bay: "C-02",
    model: "XPANDER CROSS",
    trim: "MT",
    vin: "MK2NCXTM0RJ014209",
    color: "Green Bronze",
    status_label: "Critical Battery Drain",
    state: "CRITICAL",
    in_yard: true,
    buffer_used: 26,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-10", boot: 119, v_bat: 11.58, engine_on: false, crit_alert: true,
      rpm: 0, temp_c: 0, dtc_cnt: 1, dtc: "P0115", rssi: -63, sleep_cfg: 300, active_ms: 1740, daily_mah: 7.15,
      rtc_temp_c: 33.7, adc_raw_mv: 2073, shunt_sleep_ua: 540, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 64.0, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: true, ecu_v: 0, dist_clr_km: 1755,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-11",
    bay: "C-03",
    model: "PAJERO SPORT",
    trim: "DAKAR ULTIMATE",
    vin: "MMBGUKS50RH008390",
    color: "Deep Bronze",
    status_label: "Low Battery Warning",
    state: "STANDBY",
    in_yard: true,
    buffer_used: 8,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-11", boot: 77, v_bat: 12.06, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -59, sleep_cfg: 300, active_ms: 1560, daily_mah: 6.68,
      rtc_temp_c: 31.8, adc_raw_mv: 2162, shunt_sleep_ua: 465, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 69.5, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 1280,
    },
  },
  {
    unit_id: "MITSUBISHI-STOCK-12",
    bay: "C-04",
    model: "L300",
    trim: "BOX ALUMINIUM",
    vin: "MHML300B0RJ006188",
    color: "Polar White",
    status_label: "Out of Yard (PDI Workshop)",
    state: "DEPARTED",
    in_yard: false,
    buffer_used: 14,
    telemetry: {
      unit_id: "MITSUBISHI-STOCK-12", boot: 46, v_bat: 12.54, engine_on: false, crit_alert: false,
      rpm: 0, temp_c: 0, dtc_cnt: 0, dtc: "NONE", rssi: -127, sleep_cfg: 300, active_ms: 1505, daily_mah: 5.32,
      rtc_temp_c: 32.5, adc_raw_mv: 2251, shunt_sleep_ua: 405, can_ok: true,
      speed_kmh: 0, iat_c: 0, map_kpa: 0, load_pct: 0, tps_pct: 0, ign_deg: 0, maf_gs: 0, run_time_s: 0,
      fuel_pct: 76.0, fuel_rate_lh: 0, o2_v: 0, stft_pct: 0, mil_on: false, ecu_v: 0, dist_clr_km: 1920,
    },
  },
];

/**
 * Deterministic 24h voltage curve with hourly epoch timestamps (`ts`) tailored to the unit profile:
 * - Charging (`warm = true`): rises from 12.35V to `endV` (~14.2V)
 * - Healthy Standby (`endV >= 12.55`): gentle/minimal drift (`~0 to -1.5 mV/h`) so OLS classifies as Stable
 * - Warning / Critical (`endV < 12.55`): realistic discharge slope (`-18 to -35 mV/h`) for accurate TTC estimation
 */
export function voltageHistory(endV: number, warm = false): VoltagePoint[] {
  const pts: VoltagePoint[] = [];
  const baseTs = 1793600000;
  const isHealthyStandby = !warm && endV >= 12.55;
  const start = warm
    ? 12.35
    : isHealthyStandby
      ? endV + 0.03
      : Math.min(12.74, endV + 0.58);

  for (let h = 0; h <= 24; h++) {
    const k = h / 24;
    let v: number;
    if (warm) {
      v = h < 18 ? 12.35 + (h / 18) * 0.15 : 12.5 + ((h - 18) / 6) * (endV - 12.5);
    } else if (isHealthyStandby) {
      v = start - (start - endV) * k + Math.sin(h * 1.3) * 0.004;
    } else {
      v = start - (start - endV) * Math.pow(k, 1.15) + Math.sin(h * 1.7) * 0.01;
    }
    const clamped = Number(Math.min(warm && h === 24 ? endV : v, 14.4).toFixed(2));
    pts.push({
      t: `${String(h).padStart(2, "0")}:00`,
      v: h === 24 ? Number(endV.toFixed(2)) : clamped,
      ts: baseTs + h * 3600,
    });
  }
  return pts;
}

export const WARMUP_SESSION: WarmupPoint[] = Array.from({ length: 16 }, (_, i) => {
  const s = i * 30;
  const rpm = i === 0 ? 0 : i < 3 ? 1450 - i * 150 : 850 + Math.round(Math.sin(i) * 25);
  const temp = Math.round(29 + 53 * (1 - Math.exp(-i / 5)));
  const v = i === 0 ? 12.41 : 14.0 + Math.min(0.18, i * 0.02);
  return { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, rpm, temp, v: +v.toFixed(2) };
});

export const MOVEMENT_LOG: MovementEvent[] = [
  { id: "EV-0421", unit_id: "MITSUBISHI-STOCK-08", departed: "2026-10-15 11:15:22", returned: null, away_min: null, debounce_hits: 3, tag: "Test Drive" },
  { id: "EV-0420", unit_id: "MITSUBISHI-STOCK-12", departed: "2026-10-15 10:55:10", returned: null, away_min: null, debounce_hits: 3, tag: "PDI Workshop" },
  { id: "EV-0419", unit_id: "MITSUBISHI-STOCK-03", departed: "2026-10-15 10:42:08", returned: "2026-10-15 11:08:40", away_min: 26, debounce_hits: 3, tag: "Test Drive" },
  { id: "EV-0418", unit_id: "MITSUBISHI-STOCK-01", departed: "2026-10-14 15:10:51", returned: "2026-10-14 16:02:17", away_min: 51, debounce_hits: 3, tag: "PDI Workshop" },
  { id: "EV-0417", unit_id: "MITSUBISHI-STOCK-02", departed: "2026-10-14 09:05:33", returned: "2026-10-14 11:47:02", away_min: 161, debounce_hits: 3, tag: "Detailing" },
  { id: "EV-0416", unit_id: "MITSUBISHI-STOCK-03", departed: "2026-10-13 13:21:40", returned: "2026-10-13 13:58:12", away_min: 36, debounce_hits: 3, tag: null },
  { id: "EV-0415", unit_id: "MITSUBISHI-STOCK-01", departed: "2026-10-12 08:30:00", returned: "2026-10-12 10:15:44", away_min: 105, debounce_hits: 3, tag: "Customer Delivery" },
];

export const AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 4,
    unit_id: "MITSUBISHI-STOCK-03",
    event_type: "WARMUP_DISPATCH",
    severity: "INFO",
    message: "Operator queued priority 10-minute alternator warm-up inspection",
    created_at: "2026-11-04 14:30:00",
  },
  {
    id: 3,
    unit_id: "MITSUBISHI-STOCK-03",
    event_type: "CRITICAL_DRAIN",
    severity: "CRITICAL",
    message: "Critical battery alert triggered at 11.65V (shunt sleep current 490 uA)",
    created_at: "2026-11-04 14:00:00",
  },
  {
    id: 2,
    unit_id: "MITSUBISHI-STOCK-02",
    event_type: "LOW_BATTERY_WARN",
    severity: "WARN",
    message: "Open-circuit voltage dropped below 12.20V PDI threshold (12.18V)",
    created_at: "2026-11-04 13:00:00",
  },
  {
    id: 1,
    unit_id: "MITSUBISHI-STOCK-01",
    event_type: "ADC_CALIBRATION",
    severity: "INFO",
    message: "SOP C.1 4-point OLS calibration applied (slope=0.005412, offset=0.358)",
    created_at: "2026-11-04 11:00:00",
  },
];

export const INITIAL_TICKETS: MaintenanceTicket[] = [
  {
    id: 1,
    ticket_code: "TKT-0401",
    unit_id: "MITSUBISHI-STOCK-03",
    bay: "B-02",
    issue_summary: "Critical Battery Drain (11.65V < 11.80V SOP Threshold)",
    status: "IN_PROGRESS",
    assigned_to: "R. Pratama (Shift A)",
    handover_note: "Queued 10-min alternator warm-up; re-verify shunt sleep current after cool-down.",
    updated_at: "2026-11-05 08:30:00",
  },
  {
    id: 2,
    ticket_code: "TKT-0402",
    unit_id: "MITSUBISHI-STOCK-04",
    bay: "A-02",
    issue_summary: "Critical Voltage (11.72V) & Stored OBD-II Fault P0133",
    status: "OPEN",
    assigned_to: "Unassigned",
    handover_note: "Inspect Bank 1 Sensor 1 O2 heater supply and perform 10-min charging cycle.",
    updated_at: "2026-11-05 08:15:00",
  },
  {
    id: 3,
    ticket_code: "TKT-0403",
    unit_id: "MITSUBISHI-STOCK-10",
    bay: "C-02",
    issue_summary: "Severe Parasitic Drain (11.58V, 540 uA) & ECT Fault P0115",
    status: "OPEN",
    assigned_to: "Unassigned",
    handover_note: "Priority triage required in Bay C-02 before PDI release.",
    updated_at: "2026-11-05 08:00:00",
  },
  {
    id: 4,
    ticket_code: "TKT-0404",
    unit_id: "MITSUBISHI-STOCK-02",
    bay: "A-04",
    issue_summary: "Low Open-Circuit Voltage Warning (12.18V)",
    status: "OPEN",
    assigned_to: "D. Santoso (Shift B)",
    handover_note: "Scheduled for afternoon preventive warm-up rotation.",
    updated_at: "2026-11-05 07:45:00",
  },
];

/**
 * Pure helper to transition or upsert a maintenance ticket for a given vehicle unit.
 */
export function applyTicketTransition(
  tickets: MaintenanceTicket[],
  unit: Pick<VehicleUnit, "unit_id" | "bay" | "status_label">,
  status: TicketStatus,
  assignedTo?: string,
  handoverNote?: string,
  timestampStr?: string,
): MaintenanceTicket[] {
  const nowStr = timestampStr ?? new Date().toISOString().replace("T", " ").slice(0, 19);
  const existingIdx = tickets.findIndex((t) => t.unit_id === unit.unit_id);

  if (existingIdx >= 0) {
    const cur = tickets[existingIdx]!;
    const nextAssignee =
      assignedTo !== undefined && assignedTo.trim().length > 0
        ? assignedTo.trim()
        : status === "IN_PROGRESS" && cur.assigned_to === "Unassigned"
          ? "Yard Tech (On-Duty)"
          : cur.assigned_to;
    const nextNote =
      handoverNote !== undefined && handoverNote.trim().length > 0
        ? handoverNote.trim()
        : cur.handover_note;

    const updated: MaintenanceTicket = {
      ...cur,
      status,
      assigned_to: nextAssignee,
      handover_note: nextNote,
      updated_at: nowStr,
    };
    return tickets.map((t, i) => (i === existingIdx ? updated : t));
  }

  const nextId = tickets.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const suffix = unit.unit_id.replace(/[^0-9]/g, "").padStart(2, "0") || String(nextId).padStart(2, "0");
  const newTicket: MaintenanceTicket = {
    id: nextId,
    ticket_code: `TKT-04${suffix}`,
    unit_id: unit.unit_id,
    bay: unit.bay,
    issue_summary: unit.status_label || "Preventive Battery & ECU Inspection",
    status,
    assigned_to:
      assignedTo && assignedTo.trim().length > 0
        ? assignedTo.trim()
        : status === "OPEN"
          ? "Unassigned"
          : "Yard Tech (On-Duty)",
    handover_note:
      handoverNote && handoverNote.trim().length > 0
        ? handoverNote.trim()
        : "Ticket logged via ORION Control Room.",
    updated_at: nowStr,
  };
  return [newTicket, ...tickets];
}

export const WIRING: WiringNode[] = [
  { id: "W-01", wire: "OBD PIN 16 (+12V)", path: "1A Fuse -> B2 (Male) -> 1N5819 (C2-G2) + SMBJ15A TVS (F4-F17)", signal: "+12V (Protected)", status: "OK", reading: "12.25 V" },
  { id: "W-02", wire: "OBD PIN 4+5 (GND)", path: "G17 (Female Poka-Yoke) -> Row 17 & Col W Common GND Busbar", signal: "Main Ground", status: "OK", reading: "0.00 Ω" },
  { id: "W-03", wire: "BUCK MP1584 (3.30V)", path: "G3 (IN+) / D16 (IN-) -> Off-Board MP1584 -> I6 (OUT+) + 220µF/100nF (H11/I11) -> X3", signal: "3.3V System", status: "OK", reading: "3.30 V" },
  { id: "W-04", wire: "GPIO27 (ADC TRIG)", path: "X5 -> R_BASE 10k (N12) + R_PD 100k (N17) -> 2N3904 (L10-N10) -> AO3401A #1 (L4-N4-M2) + Zener 10V (K6-N6)", signal: "D27 Trigger", status: "OK", reading: "PULSED 40ms" },
  { id: "W-05", wire: "GPIO34 (ADC1_CH6)", path: "M2 -> R1 300k (P1-P4) + R2 68k (P5-P8) + C_ADC 100nF (Q6) -> X6 Node M", signal: "Battery Sense", status: "OK", reading: "2262 mV" },
  { id: "W-06", wire: "GPIO26 (CAN GATE)", path: "X7 -> R_GS2 100k (S6-S9) + AO3401A #2 (S3-S5-U4) -> U8/V8 (10µF/100nF) -> X8", signal: "3.3V CAN", status: "OK", reading: "GATED / 3.3V" },
  { id: "W-07", wire: "GPIO5 / GPIO4 (TWAI)", path: "ESP32 D5 (TX->CTX) & D4 (RX<-CRX) -> WCMCU-230 SN65HVD230 -> OBD Pin 6/14", signal: "CAN 500 kbps", status: "OK", reading: "500 kbps" },
  { id: "W-08", wire: "GPIO21 / GPIO22 (I2C)", path: "ESP32 D21 (SDA) & D22 (SCL) -> ZS-042 DS3231SN RTC (0x68) + CR2032", signal: "I2C RTC", status: "OK", reading: "31.2 °C" },
];

export const DTC_LIBRARY: Record<string, { title: string; system: string; detail: string }> = {
  P0102: {
    title: "MASS OR VOLUME AIR FLOW 'A' CIRCUIT LOW INPUT",
    system: "Powertrain (MAF Sensor - Mode 03 Read-Only)",
    detail: "ECM detected MAF sensor signal frequency/voltage below minimum threshold (< 0.2 V). Inspect intake air ducting and MAF harness connector.",
  },
  P0115: {
    title: "ENGINE COOLANT TEMPERATURE CIRCUIT MALFUNCTION",
    system: "Powertrain (ECT Sensor)",
    detail: "ECM detected ECT sensor voltage outside 0.1 V - 4.8 V window for > 2 s. Inspect sensor connector and harness.",
  },
  P0133: {
    title: "O2 SENSOR CIRCUIT SLOW RESPONSE (BANK 1 SENSOR 1)",
    system: "Fuel & Emission Control (Upstream O2)",
    detail: "Heated oxygen sensor switching time exceeded threshold during closed-loop warm-up. Check exhaust manifold leak and sensor heater supply.",
  },
};

export const DEFAULT_CONFIG = (unit_id: string): PiggybackConfig => ({
  unit_id, sleep_cfg: 300, fast_poll_s: 10, crit_v: 11.8, debounce_cnt: 3,
  cal_slope: 0.005412, cal_offset: 0.358,
});

/** Applies a simulator state to a unit's telemetry, including the v1.5.0 Read-Only OBD-II hardware fields. */
export function applySimState(u: VehicleUnit, s: SimState): VehicleUnit {
  const t = { ...u.telemetry };
  let label = u.status_label;
  let in_yard = true;
  const fuelPct = t.fuel_pct ?? 74.5;
  const distClrKm = t.dist_clr_km ?? 1420;
  const milOn = (t.dtc_cnt ?? 0) > 0;
  const obdOfflineReset = {
    speed_kmh: 0,
    iat_c: 0,
    map_kpa: 0,
    load_pct: 0,
    tps_pct: 0,
    ign_deg: 0,
    maf_gs: 0,
    run_time_s: 0,
    fuel_pct: fuelPct,
    fuel_rate_lh: 0,
    o2_v: 0,
    stft_pct: 0,
    mil_on: milOn,
    ecu_v: 0,
    dist_clr_km: distClrKm,
  };

  switch (s) {
    case "STANDBY":
      Object.assign(t, { v_bat: 12.60, engine_on: false, crit_alert: false, rpm: 0, temp_c: 0, rssi: -44, adc_raw_mv: 2262, rtc_temp_c: 31.2, shunt_sleep_ua: 410, ...obdOfflineReset });
      label = "Standby (Deep Sleep)";
      break;
    case "WARMUP":
      Object.assign(t, {
        v_bat: 14.20,
        engine_on: true,
        crit_alert: false,
        rpm: 850,
        temp_c: 82,
        rssi: -40,
        adc_raw_mv: 2558,
        rtc_temp_c: 36.8,
        shunt_sleep_ua: 0,
        speed_kmh: 0,
        iat_c: 34,
        map_kpa: 35,
        load_pct: 21.8,
        tps_pct: 14.2,
        ign_deg: 12.0,
        maf_gs: 3.28,
        run_time_s: 180,
        fuel_pct: fuelPct,
        fuel_rate_lh: 1.09,
        o2_v: 0.62,
        stft_pct: 0.8,
        mil_on: milOn,
        ecu_v: 14.15,
        dist_clr_km: distClrKm,
      });
      label = "Engine Warm-up Active";
      break;
    case "CRITICAL":
      Object.assign(t, { v_bat: 11.60, engine_on: false, crit_alert: true, rpm: 0, temp_c: 0, rssi: -48, adc_raw_mv: 2077, rtc_temp_c: 30.5, shunt_sleep_ua: 480, ...obdOfflineReset });
      label = "Critical Battery Drain";
      break;
    case "DEPARTED":
      Object.assign(t, { v_bat: 12.50, engine_on: false, crit_alert: false, rpm: 0, temp_c: 0, rssi: -127, adc_raw_mv: 2244, rtc_temp_c: 34.0, shunt_sleep_ua: 410, ...obdOfflineReset });
      label = "Out of Yard (Test Drive)";
      in_yard = false;
      break;
  }
  return { ...u, state: s, status_label: label, in_yard, telemetry: t, buffer_used: s === "DEPARTED" ? Math.max(u.buffer_used, 17) : u.buffer_used };
}
