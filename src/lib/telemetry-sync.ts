import type { TelemetryPayload, VehicleUnit } from "@/data/mockTelemetry";

const NUM_KEYS = [
  "seq", "boot", "ts_epoch", "v_bat", "rpm", "temp_c", "dtc_cnt", "rssi",
  "sleep_cfg", "active_ms", "daily_mah", "rtc_temp_c", "adc_raw_mv", "shunt_sleep_ua",
  "speed_kmh", "iat_c", "map_kpa", "load_pct", "tps_pct", "ign_deg", "maf_gs", "run_time_s",
  "fuel_pct", "fuel_rate_lh", "o2_v", "stft_pct", "ecu_v", "dist_clr_km", "zone_exit_epoch",
] as const;
const BOOL_KEYS = ["engine_on", "crit_alert", "can_ok", "mil_on"] as const;
const STR_KEYS = ["dtc", "net_zone", "sync_ssid"] as const;

type PayloadPatch = Partial<TelemetryPayload>;

/** Converts Firmware v1.4.1 string sleep intervals (e.g. "6 Hours") into seconds. */
export function parseSleepCfgValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(10, Math.round(raw));
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const hrMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h|jam)/i);
  if (hrMatch) return Math.max(60, Math.round(parseFloat(hrMatch[1]!) * 3600));
  const minMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:min|mnt|m)/i);
  if (minMatch) return Math.max(10, Math.round(parseFloat(minMatch[1]!) * 60));
  const secMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:sec|s|detik)/i);
  if (secMatch) return Math.max(5, Math.round(parseFloat(secMatch[1]!)));
  if (/^\d+$/.test(s)) return Math.max(10, parseInt(s, 10));
  return null;
}

/** Keeps only well-typed telemetry fields so a malformed payload cannot corrupt unit state. */
function pickFields(src: Record<string, unknown>): PayloadPatch {
  const out: Record<string, unknown> = {};
  for (const k of NUM_KEYS) {
    const v = src[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  if (typeof src["sleep_cfg"] === "string") {
    const parsed = parseSleepCfgValue(src["sleep_cfg"]);
    if (parsed !== null) out["sleep_cfg"] = parsed;
  }
  for (const k of BOOL_KEYS) if (typeof src[k] === "boolean") out[k] = src[k];
  for (const k of STR_KEYS) if (typeof src[k] === "string") out[k] = src[k];
  return out as PayloadPatch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mergeTelemetry(base: TelemetryPayload, patch: PayloadPatch): TelemetryPayload {
  const keys = Object.keys(patch) as (keyof TelemetryPayload)[];
  if (!keys.length) return base;
  for (const k of keys) {
    if (base[k] !== patch[k]) {
      return { ...base, ...patch };
    }
  }
  return base;
}

function mergeUnit(u: VehicleUnit, patch: PayloadPatch): VehicleUnit {
  const nextTelemetry = mergeTelemetry(u.telemetry, patch);
  return nextTelemetry === u.telemetry ? u : { ...u, telemetry: nextTelemetry };
}

function mergeUnitRecord(u: VehicleUnit, rec: Record<string, unknown>): VehicleUnit {
  const telemetry = asRecord(rec["telemetry"]);
  const nextTelemetry = telemetry ? mergeTelemetry(u.telemetry, pickFields(telemetry)) : u.telemetry;

  const rawBuffer = rec["buffer_used"];
  const sanitizedBuffer =
    typeof rawBuffer === "number" && Number.isFinite(rawBuffer)
      ? Math.max(0, Math.min(5000, Math.floor(rawBuffer)))
      : u.buffer_used;

  const uRecord = u as unknown as Record<string, unknown>;
  const metaPatch: Record<string, unknown> = {};
  let hasMetaChanges = false;
  for (const k of Object.keys(rec)) {
    if (k === "telemetry" || k === "unit_id" || k === "buffer_used") continue;
    if (uRecord[k] !== rec[k]) {
      metaPatch[k] = rec[k];
      hasMetaChanges = true;
    }
  }

  if (nextTelemetry === u.telemetry && sanitizedBuffer === u.buffer_used && !hasMetaChanges) {
    return u;
  }

  return {
    ...u,
    ...metaPatch,
    buffer_used: sanitizedBuffer,
    telemetry: nextTelemetry,
  };
}

/**
 * Merges a remote JSON update from the Dipo get_data.php endpoint into unit state.
 * Accepted shapes:
 *   { units: VehicleUnit[] }
 *   { payload: Partial<TelemetryPayload> & { unit_id?: string; buffer_used?: number } }
 *   a flat Partial<TelemetryPayload> & { unit_id?: string; buffer_used?: number } (merged into the selected unit)
 * Payloads without unit_id fall back to fallbackId; unknown unit_id values are ignored.
 * Returns the original array reference (and unchanged unit references) when nothing changed.
 */
export function applyRemoteUpdate(units: VehicleUnit[], raw: unknown, fallbackId: string): VehicleUnit[] {
  const json = asRecord(raw);
  if (!json) return units;

  const list = json["units"];
  if (Array.isArray(list)) {
    let next: VehicleUnit[] | null = null;
    for (const item of list) {
      const rec = asRecord(item);
      if (!rec) continue;
      const id = rec["unit_id"];
      if (typeof id !== "string" || !id) continue;
      const source = next ?? units;
      const idx = source.findIndex((u) => u.unit_id === id);
      if (idx < 0) continue;
      const current = source[idx]!;
      const merged = mergeUnitRecord(current, rec);
      if (merged !== current) {
        if (!next) next = units.slice();
        next[idx] = merged;
      }
    }
    return next ?? units;
  }

  const patchSrc = asRecord(json["payload"]) ?? json;
  const idRaw = patchSrc["unit_id"];
  if (typeof idRaw === "string" && idRaw && !units.some((u) => u.unit_id === idRaw)) return units;
  const id = typeof idRaw === "string" && idRaw ? idRaw : fallbackId;
  const idx = units.findIndex((u) => u.unit_id === id);
  if (idx < 0) return units;

  const baseUnit = units[idx]!;
  let unitToMerge = baseUnit;
  const unitPatch: Partial<VehicleUnit> = {};
  let hasUnitPatch = false;

  const setMetaIfChanged = <K extends keyof VehicleUnit>(key: K, val: VehicleUnit[K]) => {
    if (baseUnit[key] !== val) {
      unitPatch[key] = val;
      hasUnitPatch = true;
    }
  };

  const rawBuffer = patchSrc["buffer_used"];
  if (typeof rawBuffer === "number" && Number.isFinite(rawBuffer)) {
    setMetaIfChanged("buffer_used", Math.max(0, Math.min(5000, Math.floor(rawBuffer))));
  }
  if (typeof patchSrc["state"] === "string" && ["STANDBY", "WARMUP", "CRITICAL", "DEPARTED"].includes(patchSrc["state"])) {
    setMetaIfChanged("state", patchSrc["state"] as VehicleUnit["state"]);
  }
  if (typeof patchSrc["status_label"] === "string") {
    setMetaIfChanged("status_label", patchSrc["status_label"]);
  }
  if (typeof patchSrc["in_yard"] === "boolean") {
    setMetaIfChanged("in_yard", patchSrc["in_yard"]);
  }
  if (patchSrc["online_status"] === "ONLINE" || patchSrc["online_status"] === "OFFLINE") {
    setMetaIfChanged("online_status", patchSrc["online_status"]);
  }
  if (typeof patchSrc["last_seen_sec"] === "number" && Number.isFinite(patchSrc["last_seen_sec"])) {
    setMetaIfChanged("last_seen_sec", patchSrc["last_seen_sec"]);
  }
  if (typeof patchSrc["last_seen"] === "string" || patchSrc["last_seen"] === null) {
    setMetaIfChanged("last_seen", patchSrc["last_seen"] as string | null);
  }
  if (typeof patchSrc["connection_badge"] === "string") {
    setMetaIfChanged("connection_badge", patchSrc["connection_badge"]);
  }
  if (typeof patchSrc["online_threshold_sec"] === "number" && Number.isFinite(patchSrc["online_threshold_sec"])) {
    setMetaIfChanged("online_threshold_sec", patchSrc["online_threshold_sec"]);
  }
  if (typeof patchSrc["net_zone"] === "string") {
    setMetaIfChanged("net_zone", patchSrc["net_zone"]);
  }
  if (typeof patchSrc["sync_ssid"] === "string") {
    setMetaIfChanged("sync_ssid", patchSrc["sync_ssid"]);
  }
  if (hasUnitPatch) {
    unitToMerge = { ...baseUnit, ...unitPatch };
  }

  const merged = mergeUnit(unitToMerge, pickFields(patchSrc));
  if (merged === baseUnit) return units;
  const next = units.slice();
  next[idx] = merged;
  return next;
}
