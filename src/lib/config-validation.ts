import type { AuditLogEntry, AuditSeverity, PiggybackConfig } from "@/data/mockTelemetry";
import type { CalResult } from "@/lib/calibration";

export type PcbVersionKey = "1" | "2";

export interface CalibrationPointInput {
  dmm: string;
  mv: string;
}

export interface PcbAdcPreset {
  version: PcbVersionKey;
  label: string;
  dividerSpec: string;
  slope: number;
  offset: number;
  points: CalibrationPointInput[];
}

export const PCB_ADC_PRESETS: Record<PcbVersionKey, PcbAdcPreset> = {
  "1": {
    version: "1",
    label: "PCB v1.0 (R1 300k / R2 68k)",
    dividerSpec: "ESP32 + DS3231SN + WCMCU-230",
    slope: 0.0054118,
    offset: 0.069,
    points: [
      { dmm: "11.00", mv: "2020" },
      { dmm: "12.00", mv: "2205" },
      { dmm: "13.00", mv: "2389" },
      { dmm: "14.40", mv: "2648" },
    ],
  },
  "2": {
    version: "2",
    label: "PCB v2.0 (R1 100k / R2 27k)",
    dividerSpec: "Integrated SMD + LittleFS",
    slope: 0.0047037,
    offset: 0.16,
    points: [
      { dmm: "11.00", mv: "2305" },
      { dmm: "12.00", mv: "2517" },
      { dmm: "13.00", mv: "2730" },
      { dmm: "14.40", mv: "3027" },
    ],
  },
};

export interface SleepCfgOption {
  value: number;
  label: string;
}

export const SLEEP_CFG_OPTIONS: SleepCfgOption[] = [
  { value: 300, label: "300s (5 Menit)" },
  { value: 600, label: "600s (10 Menit)" },
  { value: 1800, label: "1800s (30 Menit)" },
  { value: 3600, label: "3600s (1 Jam)" },
  { value: 21600, label: "21600s (6 Jam)" },
];

/**
 * Formats integer sleep duration into the firmware string contract (`db.php::formatSleepCfgLabel`).
 */
export function formatSleepCfgLabel(seconds: number): string {
  const safeSec = Math.max(10, Math.round(seconds));
  if (safeSec >= 3600 && safeSec % 3600 === 0) {
    const hrs = Math.floor(safeSec / 3600);
    return `${hrs} ${hrs === 1 ? "Hour" : "Hours"}`;
  }
  if (safeSec >= 60 && safeSec % 60 === 0) {
    const mins = Math.floor(safeSec / 60);
    return `${mins} ${mins === 1 ? "Minute" : "Minutes"}`;
  }
  return `${safeSec} ${safeSec === 1 ? "Second" : "Seconds"}`;
}

/**
 * Builds the exact HTTP 200 JSON Piggyback ACK body returned by `simpan_data.php`.
 * When `pending_ack` is false, omits NVS override fields cleanly.
 */
export function buildWirePiggybackAck(
  cfg: PiggybackConfig,
  savedCount = 1,
): Record<string, string | number | boolean> {
  if (!cfg.pending_ack) {
    return {
      status: "ok",
      saved: savedCount,
      pending_ack: false,
    };
  }

  return {
    status: "ok",
    saved: savedCount,
    pending_ack: true,
    crit_v: Number(cfg.crit_v.toFixed(2)),
    slope_m: Number(cfg.cal_slope.toFixed(7)),
    offset_c: Number(cfg.cal_offset.toFixed(4)),
    sleep_cfg: formatSleepCfgLabel(cfg.sleep_cfg),
  };
}

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
}

export interface NvsConfigDraftInput {
  crit_v: number;
  sleep_cfg: number;
  debounce_cnt: number;
  fast_poll_s: number;
}

/** Validates user NVS & server config values against `sketch_oct16aa.ino::applyPiggybackAck()`. */
export function validateNvsConfigDraft(input: NvsConfigDraftInput): ValidationOutcome {
  const errors: string[] = [];

  if (!Number.isFinite(input.crit_v) || input.crit_v <= 5.0 || input.crit_v >= 16.0) {
    errors.push("Ambang voltase kritis (crit_v) harus berada di rentang > 5.0V s.d. < 16.0V.");
  }
  if (!Number.isFinite(input.sleep_cfg) || input.sleep_cfg < 10 || input.sleep_cfg > 86400) {
    errors.push("Interval Deep Sleep (sleep_cfg) harus berada antara 10s hingga 86400s.");
  }
  if (!Number.isFinite(input.debounce_cnt) || input.debounce_cnt < 1 || input.debounce_cnt > 10) {
    errors.push("Hitungan debounce server harus berada antara 1x hingga 10x.");
  }
  if (!Number.isFinite(input.fast_poll_s) || input.fast_poll_s < 5 || input.fast_poll_s > 300) {
    errors.push("Interval Fast Poll saat mesin ON harus berada antara 5s hingga 300s.");
  }

  return { valid: errors.length === 0, errors };
}

/** Validates SOP C.1 4-point OLS regression coefficients against ESP32 NVS guardrails. */
export function validateOlsCalibrationFit(
  fit: CalResult,
  validPointCount: number,
): ValidationOutcome {
  const errors: string[] = [];

  if (validPointCount < 2) {
    errors.push(
      "Minimal 2 titik DMM (V) dan ADC Raw (mV) yang valid diperlukan untuk regresi OLS.",
    );
  }
  if (!Number.isFinite(fit.slope) || fit.slope <= 0.001 || fit.slope >= 0.02) {
    errors.push(
      `Koefisien slope_m (${fit.slope.toFixed(7)}) berada di luar batas aman firmware (> 0.001 dan < 0.02).`,
    );
  }
  if (!Number.isFinite(fit.offset) || fit.offset <= -2.0 || fit.offset >= 2.0) {
    errors.push(
      `Offset koreksi (${fit.offset.toFixed(4)}V) berada di luar batas aman firmware (> -2.0V dan < +2.0V).`,
    );
  }
  if (!Number.isFinite(fit.rSquared) || fit.rSquared < 0.99) {
    errors.push(
      `Koefisien determinasi R2 (${fit.rSquared.toFixed(4)}) terlalu rendah (< 0.9900); periksa pengukuran DMM.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/** Filters audit logs cleanly by text query, severity badge, and optional unit scope. */
export function filterAuditLogs(
  logs: AuditLogEntry[],
  query: string,
  severity: AuditSeverity | "ALL",
  unitId?: string,
): AuditLogEntry[] {
  const q = query.trim().toLowerCase();
  return logs.filter((log) => {
    if (unitId && log.unit_id !== unitId) return false;
    if (severity !== "ALL" && log.severity !== severity) return false;
    if (!q) return true;
    const haystack =
      `${log.unit_id} ${log.event_type} ${log.message} ${log.created_at}`.toLowerCase();
    return haystack.includes(q);
  });
}
