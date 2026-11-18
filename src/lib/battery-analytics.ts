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
  critV: number = 11.8,
  engineOn: boolean = false,
  rtcTempC: number = 25,
): BatteryPrediction {
  const safeCurrentV = Number.isFinite(currentV) ? currentV : critV;
  const safeCritV = Number.isFinite(critV) ? critV : 11.8;
  const safeRtcTempC = typeof rtcTempC === "number" && Number.isFinite(rtcTempC) ? rtcTempC : 25;

  // 6-cell Lead-Acid temperature compensation to 25°C reference (-3 mV/°C/cell = -0.018 V/°C)
  const compensatedV25 = Number((safeCurrentV + 0.018 * (25 - safeRtcTempC)).toFixed(2));

  // Temperature-compensated SOC percentage (11.60V = 0%, 12.70V = 100%, or 100% when charging)
  const tempCompensatedSocPct =
    engineOn || safeCurrentV >= 13.5
      ? 100
      : Math.round(Math.max(0, Math.min(100, ((compensatedV25 - 11.6) / (12.7 - 11.6)) * 100)));

  // Arrhenius thermal self-discharge acceleration factor (Q10 = 2 above 25°C)
  const thermalFactor =
    safeRtcTempC > 25 ? Number(Math.pow(2, Math.max(0, safeRtcTempC - 25) / 10).toFixed(2)) : 1.0;

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
  "buffer_used",
  "can_ok",
  "net_zone",
  "sync_ssid",
  "active_ms",
  "daily_mah",
  "speed_kmh",
  "iat_c",
  "map_kpa",
  "load_pct",
  "tps_pct",
  "ign_deg",
  "maf_gs",
  "run_time_s",
  "fuel_pct",
  "fuel_rate_lh",
  "o2_v",
  "stft_pct",
  "mil_on",
  "ecu_v",
  "dist_clr_km",
] as const;

export interface ExportTargetResolution {
  filteredUnits: VehicleUnit[];
  isAll: boolean;
  filterLabel: string;
}

export function parseExportTargetUnits(
  units: VehicleUnit[],
  targetUnitId?: string,
): ExportTargetResolution {
  const raw = (targetUnitId ?? "").trim();
  if (!raw || raw.toUpperCase() === "ALL") {
    return {
      filteredUnits: units,
      isAll: true,
      filterLabel: "SELURUH ARMADA",
    };
  }

  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toUpperCase() !== "ALL");

  if (ids.length === 0) {
    return {
      filteredUnits: units,
      isAll: true,
      filterLabel: "SELURUH ARMADA",
    };
  }

  const idSet = new Set(ids);
  const filteredUnits = units.filter((u) => idSet.has(u.unit_id));
  const filterLabel = ids.length === 1 ? ids[0]! : `${ids.length} UNIT (${ids.join(", ")})`;

  return {
    filteredUnits,
    isAll: false,
    filterLabel,
  };
}

export function resolveUnitLastSeenEpoch(unit: VehicleUnit, fallbackNowSec: number): number {
  const rawEpoch = unit.telemetry.ts_epoch;
  if (typeof rawEpoch === "number" && Number.isFinite(rawEpoch) && rawEpoch > 0) {
    return Math.floor(rawEpoch);
  }
  if (unit.last_seen) {
    const isoWib = unit.last_seen.trim().replace(" ", "T") + "+07:00";
    const parsedMs = Date.parse(isoWib);
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return Math.floor(parsedMs / 1000);
    }
  }
  return fallbackNowSec;
}

export function resolveExportHistoryPoints(
  unit: VehicleUnit,
  historyMap: Record<string, Array<BatteryHistoryPoint>>,
  isLiveApi: boolean,
  fallbackNowSec: number,
): Array<BatteryHistoryPoint> {
  const existing = historyMap[unit.unit_id];
  if (isLiveApi) {
    if (existing && existing.length > 0) {
      return existing;
    }
    const ts = resolveUnitLastSeenEpoch(unit, fallbackNowSec);
    const label = unit.last_seen ? unit.last_seen.slice(11, 19) : "LIVE";
    return [{ t: label, v: unit.telemetry.v_bat, ts }];
  }

  if (existing && existing.length >= 1) {
    return existing;
  }
  return voltageHistory(unit.telemetry.v_bat, unit.telemetry.engine_on);
}

export function formatWibTimestamp(tsEpoch: number): string {
  return new Date((tsEpoch + 7 * 3600) * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export interface TelemetryCsvOptions {
  isLiveApi?: boolean;
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const str = val === null || val === undefined ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 39-column CSV string matching `export_csv.php` columns from local state.
 * In `isLiveApi` mode, never fabricates synthetic `voltageHistory()` rows.
 */
export function buildTelemetryCsv(
  units: VehicleUnit[],
  historyMap: Record<string, Array<BatteryHistoryPoint>>,
  targetUnitId: string = "ALL",
  options?: TelemetryCsvOptions,
): string {
  const isLiveApi = Boolean(options?.isLiveApi);
  const { filteredUnits } = parseExportTargetUnits(units, targetUnitId);

  const lines: string[] = [CSV_COLUMNS.join(",")];
  const nowSec = Math.floor(Date.now() / 1000);
  let rowId = 1;

  for (const u of filteredUnits) {
    const t = u.telemetry;
    const hist = resolveExportHistoryPoints(u, historyMap, isLiveApi, nowSec);
    const points = hist.slice().reverse();
    const baseEpoch = resolveUnitLastSeenEpoch(u, nowSec);

    points.forEach((pt, idx) => {
      const tsEpoch =
        typeof pt.ts === "number" && pt.ts > 0 ? pt.ts : Math.max(0, baseEpoch - idx * 3600);
      const wibCreated =
        idx === 0 && isLiveApi && u.last_seen ? u.last_seen : formatWibTimestamp(tsEpoch);
      const baseSeq = typeof t.seq === "number" && t.seq > 0 ? t.seq : t.boot;
      const seq = Math.max(1, baseSeq - idx);
      const vBat = idx === 0 ? t.v_bat : pt.v;
      const adcMv: number | string =
        idx === 0 ? t.adc_raw_mv : isLiveApi ? "" : Math.round((vBat - 0.069) / 0.005412);
      const netZone = (t.net_zone || u.net_zone || (u.in_yard ? "YARD" : "OFFLINE")).trim();
      const syncSsid = (t.sync_ssid || u.sync_ssid || "").trim();

      const row = [
        rowId++,
        u.unit_id,
        seq,
        t.boot,
        tsEpoch,
        wibCreated,
        vBat.toFixed(2),
        adcMv,
        t.rtc_temp_c.toFixed(1),
        t.shunt_sleep_ua,
        t.engine_on && idx === 0 ? 1 : 0,
        vBat < 11.8 || (idx === 0 && t.crit_alert) ? 1 : 0,
        t.engine_on && idx === 0 ? t.rpm : 0,
        t.engine_on && idx === 0 ? t.temp_c : 0,
        t.dtc_cnt,
        t.dtc,
        t.rssi,
        t.sleep_cfg,
        u.buffer_used,
        t.can_ok === false ? 0 : 1,
        netZone,
        syncSsid,
        t.active_ms,
        t.daily_mah.toFixed(2),
        t.speed_kmh ?? 0,
        t.iat_c ?? 0,
        t.map_kpa ?? 0,
        (t.load_pct ?? 0).toFixed(1),
        (t.tps_pct ?? 0).toFixed(1),
        (t.ign_deg ?? 0).toFixed(1),
        (t.maf_gs ?? 0).toFixed(2),
        t.run_time_s ?? 0,
        (t.fuel_pct ?? 0).toFixed(1),
        (t.fuel_rate_lh ?? 0).toFixed(2),
        (t.o2_v ?? 0).toFixed(2),
        (t.stft_pct ?? 0).toFixed(1),
        t.mil_on ? 1 : 0,
        (t.ecu_v ?? 0).toFixed(2),
        t.dist_clr_km ?? 0,
      ];
      lines.push(row.map(escapeCsvCell).join(","));
    });
  }

  return lines.join("\r\n");
}
