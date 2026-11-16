import type { VehicleUnit } from "@/data/mockTelemetry";
import { voltageHistory } from "@/data/mockTelemetry";

export type PredictionTone = "emerald" | "amber" | "crimson";

export interface BatteryHistoryPoint {
  t: string;
  v: number;
  ts?: number;
}

export interface BatteryPrediction {
  slopeVPerHour: number;
  slopeMvPerHour: number;
  ttcHours: number | null;
  statusText: string;
  tone: PredictionTone;
  /** Temperature-compensated voltage normalized to 25°C (-0.018 V/°C 6-cell lead-acid coefficient) */
  compensatedV25: number;
  /** Temperature-compensated State of Charge (0..100%) mapped from 11.60V..12.70V at 25°C */
  tempCompensatedSocPct: number;
  /** Arrhenius thermal acceleration factor: 2^((T - 25)/10) when T > 25°C, else 1.0 */
  thermalFactor: number;
}

/**
 * Computes Ordinary Least Squares (OLS) linear regression on battery voltage history
 * to estimate drain rate (V/h & mV/h), Time-to-Critical (TTC in hours),
 * 25°C temperature-compensated voltage/SOC, and Arrhenius thermal acceleration factor.
 *
 * When real epoch timestamps (`ts`) are missing or span less than 60 seconds
 * (e.g. rapid 1.5s live stream bursts or deterministic simulator curves),
 * each sample interval is normalized to 1 simulated hour to guarantee finite,
 * division-by-zero-free predictions.
 */
export function computeBatteryPrediction(
  history: Array<BatteryHistoryPoint>,
  currentV: number,
  critV: number = 11.80,
  engineOn: boolean = false,
  rtcTempC: number = 25,
): BatteryPrediction {
  const safeCurrentV = Number.isFinite(currentV) ? currentV : critV;
  const safeCritV = Number.isFinite(critV) ? critV : 11.80;
  const safeRtcTempC =
    typeof rtcTempC === "number" && Number.isFinite(rtcTempC) ? rtcTempC : 25;

  // 6-cell Lead-Acid temperature compensation to 25°C reference (-3 mV/°C/cell = -0.018 V/°C)
  const compensatedV25 = Number((safeCurrentV + 0.018 * (25 - safeRtcTempC)).toFixed(2));

  // Temperature-compensated SOC percentage (11.60V = 0%, 12.70V = 100%, or 100% when charging)
  const tempCompensatedSocPct =
    engineOn || safeCurrentV >= 13.5
      ? 100
      : Math.round(
        Math.max(0, Math.min(100, ((compensatedV25 - 11.60) / (12.70 - 11.60)) * 100)),
      );

  // Arrhenius thermal self-discharge acceleration factor (Q10 = 2 above 25°C)
  const thermalFactor =
    safeRtcTempC > 25
      ? Number(Math.pow(2, Math.max(0, safeRtcTempC - 25) / 10).toFixed(2))
      : 1.0;

  const valid = Array.isArray(history)
    ? history.filter((p) => p && typeof p.v === "number" && Number.isFinite(p.v))
    : [];

  let slopeVPerHour = 0;

  if (valid.length >= 2) {
    const allHaveTs = valid.every(
      (p) => typeof p.ts === "number" && Number.isFinite(p.ts) && p.ts > 0,
    );
    const firstTs = allHaveTs ? (valid[0]!.ts as number) : 0;
    const lastTs = allHaveTs ? (valid[valid.length - 1]!.ts as number) : 0;
    const spanSec = lastTs - firstTs;
    const useRealTimestamps = allHaveTs && spanSec >= 60;

    const n = valid.length;
    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);

    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < n; i++) {
      const pt = valid[i]!;
      const x = useRealTimestamps ? ((pt.ts as number) - firstTs) / 3600 : i;
      const y = pt.v;
      xs[i] = x;
      ys[i] = y;
      sumX += x;
      sumY += y;
    }

    const mx = sumX / n;
    const my = sumY / n;

    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i]! - mx;
      const dy = ys[i]! - my;
      sxy += dx * dy;
      sxx += dx * dx;
    }

    if (sxx > 1e-12) {
      const rawSlope = sxy / sxx;
      slopeVPerHour = Number.isFinite(rawSlope) ? rawSlope : 0;
    }
  }

  const slopeMvPerHour = Math.round(slopeVPerHour * 1000) || 0;

  // 1. Immediate critical threshold check
  if (safeCurrentV <= safeCritV) {
    return {
      slopeVPerHour,
      slopeMvPerHour,
      ttcHours: 0,
      statusText: "Critical Now (0.0h)",
      tone: "crimson",
      compensatedV25,
      tempCompensatedSocPct,
      thermalFactor,
    };
  }

  // 2. Engine running or positive charging slope
  if (engineOn || slopeVPerHour > 0.002) {
    const displayMv = slopeMvPerHour > 0 ? `+${slopeMvPerHour} mV/h` : "Alternator Active";
    return {
      slopeVPerHour,
      slopeMvPerHour,
      ttcHours: null,
      statusText: `Charging (${displayMv})`,
      tone: "emerald",
      compensatedV25,
      tempCompensatedSocPct,
      thermalFactor,
    };
  }

  // 3. Measurable discharge slope (< -2 mV/h)
  if (slopeVPerHour < -0.002) {
    const baseRawTtc = (safeCurrentV - safeCritV) / Math.abs(slopeVPerHour);
    const adjustedRawTtc =
      safeRtcTempC > 30 && thermalFactor > 1 ? baseRawTtc / thermalFactor : baseRawTtc;
    const ttcHours = Number.isFinite(adjustedRawTtc)
      ? Number(Math.max(0.1, adjustedRawTtc).toFixed(1))
      : null;

    if (ttcHours !== null) {
      const tone: PredictionTone =
        ttcHours <= 12 ? "crimson" : ttcHours <= 36 ? "amber" : "emerald";
      return {
        slopeVPerHour,
        slopeMvPerHour,
        ttcHours,
        statusText: `Est. Critical in ${ttcHours.toFixed(1)}h (${slopeMvPerHour} mV/h)`,
        tone,
        compensatedV25,
        tempCompensatedSocPct,
        thermalFactor,
      };
    }
  }

  // 4. Stable / negligible drift
  return {
    slopeVPerHour,
    slopeMvPerHour,
    ttcHours: null,
    statusText: "Stable (> 72h Safe)",
    tone: "emerald",
    compensatedV25,
    tempCompensatedSocPct,
    thermalFactor,
  };
}

export const CSV_COLUMNS = [
  "id",
  "unit_id",
  "seq",
  "boot",
  "ts_epoch",
  "created_at",
  "v_bat",
  "adc_raw_mv",
  "rtc_temp_c",
  "shunt_sleep_ua",
  "engine_on",
  "crit_alert",
  "rpm",
  "temp_c",
  "dtc_cnt",
  "dtc",
  "rssi",
  "sleep_cfg",
  "active_ms",
  "daily_mah",
] as const;

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const str = val === null || val === undefined ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 CSV string matching `export_csv.php` columns from local state
 * when operating in SIMULATOR mode or when offline fallback is needed.
 */
export function buildTelemetryCsv(
  units: VehicleUnit[],
  historyMap: Record<string, Array<BatteryHistoryPoint>>,
  targetUnitId?: string,
): string {
  const filteredUnits =
    !targetUnitId || targetUnitId.toUpperCase() === "ALL"
      ? units
      : units.filter((u) => u.unit_id === targetUnitId);

  const lines: string[] = [CSV_COLUMNS.join(",")];
  const nowSec = Math.floor(Date.now() / 1000);
  let rowId = 1;

  for (const u of filteredUnits) {
    const t = u.telemetry;
    const hist =
      historyMap[u.unit_id] && historyMap[u.unit_id]!.length >= 2
        ? historyMap[u.unit_id]!
        : voltageHistory(t.v_bat, t.engine_on);

    const points = hist.slice().reverse();
    points.forEach((pt, idx) => {
      const tsEpoch =
        typeof pt.ts === "number" && pt.ts > 0 ? pt.ts : nowSec - idx * 3600;
      const isoCreated = new Date(tsEpoch * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
      const seq = Math.max(1, t.boot - idx);
      const vBat = idx === 0 ? t.v_bat : pt.v;
      const adcMv =
        idx === 0 ? t.adc_raw_mv : Math.round((vBat - 0.358) / 0.005412);
      const row = [
        rowId++,
        u.unit_id,
        seq,
        seq,
        tsEpoch,
        isoCreated,
        vBat.toFixed(2),
        adcMv,
        t.rtc_temp_c.toFixed(1),
        t.shunt_sleep_ua,
        t.engine_on ? 1 : 0,
        vBat < 11.8 ? 1 : t.crit_alert ? 1 : 0,
        t.rpm,
        t.temp_c,
        t.dtc_cnt,
        t.dtc,
        t.rssi,
        t.sleep_cfg,
        t.active_ms,
        t.daily_mah.toFixed(2),
      ];
      lines.push(row.map(escapeCsvCell).join(","));
    });
  }

  return lines.join("\r\n");
}
