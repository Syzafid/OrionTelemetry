import type {
  MovementEvent,
  MovementPair,
  OperationalTag,
  VehicleUnit,
} from "@/data/mockTelemetry";

export interface MassDisconnectEvaluation {
  active: boolean;
  awayCount: number;
  inYardCount: number;
  techHotspotCount: number;
  burstCount: number;
  totalUnits: number;
  thresholdCount: number;
  reasonText: string;
}

/**
 * Evaluates AP Outage / Mass Disconnect Guard accurately without false alarms on 1-unit fleets:
 * - In `LIVE_API` mode, strictly respects backend `mass_disconnect_guard` (`>= 2` units & `>= 66%` offline).
 * - In `SIMULATOR` mode, activates only when `totalUnits >= 2` and `awayCount >= ceil(totalUnits * 0.66)`.
 */
export function evaluateMassDisconnectGuard(
  units: VehicleUnit[],
  isLiveApi: boolean,
  backendGuard: boolean,
): MassDisconnectEvaluation {
  const totalUnits = units.length;
  const awayCount = units.filter((u) => !u.in_yard).length;
  const inYardCount = totalUnits - awayCount;
  const techHotspotCount = units.filter(
    (u) => !u.in_yard && (u.net_zone === "TECH_HOTSPOT" || u.telemetry.net_zone === "TECH_HOTSPOT"),
  ).length;
  const burstCount = units.filter((u) => u.buffer_used > 0).length;
  const thresholdCount = Math.max(2, Math.ceil(totalUnits * 0.66));

  const localGuard = totalUnits >= 2 && awayCount >= thresholdCount;
  const active = isLiveApi ? backendGuard : localGuard;

  let reasonText: string;
  if (active) {
    reasonText = `Gangguan AP massal terdeteksi (${awayCount}/${totalUnits} unit terputus serentak; status keluar yard ditahan)`;
  } else if (totalUnits < 2) {
    reasonText = `Mode node tunggal (${awayCount}/${totalUnits} di luar yard). Proteksi outage aktif otomatis mulai min. 2 unit.`;
  } else {
    reasonText = `Pemantauan normal (${awayCount}/${totalUnits} di luar yard, ambang proteksi >= ${thresholdCount} unit)`;
  }

  return {
    active,
    awayCount,
    inYardCount,
    techHotspotCount,
    burstCount,
    totalUnits,
    thresholdCount,
    reasonText,
  };
}

/** Formats elapsed outside duration cleanly into compact Indonesian notation. */
export function formatTripDuration(
  durationSec: number | null | undefined,
  awayMin?: number | null,
  clockAdjusted?: boolean,
): string {
  let sec: number | null = null;
  if (typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec >= 0) {
    sec = Math.round(durationSec);
  } else if (typeof awayMin === "number" && Number.isFinite(awayMin) && awayMin >= 0) {
    sec = Math.round(awayMin * 60);
  }

  if (sec === null) return "--";

  let formatted: string;
  if (sec < 60) {
    formatted = `${sec}d`;
  } else if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    formatted = s > 0 ? `${m}m ${s}d` : `${m}m`;
  } else if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    formatted = m > 0 ? `${h}j ${m}m` : `${h}j`;
  } else {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    formatted = h > 0 ? `${d}h ${h}j` : `${d}h`;
  }

  return clockAdjusted ? `~${formatted}` : formatted;
}

export interface NormalizedTripRow {
  id: string;
  pairedId: string | null;
  unit_id: string;
  exitTime: string;
  returnTime: string | null;
  isStillAway: boolean;
  durationLabel: string;
  clockAdjusted: boolean;
  zoneRoute: string;
  debounceText: string;
  tag: OperationalTag | null;
}

/** Formats honest debounce ratio matching firmware hysteresis (`3/3 keluar` vs `2/2 masuk`). */
export function resolveRawDebounceLabel(ev: MovementEvent): string {
  if (ev.event_type === "ENTER_YARD") {
    return `${ev.debounce_hits}/2 masuk`;
  }
  return `${ev.debounce_hits}/3 keluar`;
}

/** Resolves whether a raw transition event is genuinely active away or already closed/historical. */
export function resolveRawEventStatus(ev: MovementEvent): { isStillAway: boolean; label: string } {
  if (ev.event_type === "ENTER_YARD") {
    return { isStillAway: false, label: ev.departed };
  }
  const resolvedReturn = ev.returned ?? ev.paired_return_time ?? null;
  if (resolvedReturn !== null && resolvedReturn !== "") {
    return { isStillAway: false, label: resolvedReturn };
  }
  if (ev.masih_di_luar === false) {
    return { isStillAway: false, label: "Selesai (Tutup)" };
  }
  return { isStillAway: true, label: "Di Luar Yard" };
}

/**
 * Unifies raw EXIT_YARD / ENTER_YARD records and backend `movement_pairs` into crisp per-trip rows.
 */
export function buildMovementTripRows(
  movement: MovementEvent[],
  movementPairs: MovementPair[],
  isLiveApi: boolean,
): NormalizedTripRow[] {
  const rawById = new Map(movement.map((m) => [m.id, m]));

  if (isLiveApi && movementPairs.length > 0) {
    return movementPairs.map((pair) => {
      const rawExit = rawById.get(pair.exit_id);
      const rawEnter = pair.enter_id ? rawById.get(pair.enter_id) : undefined;
      const fromZ = pair.from_zone ?? rawExit?.from_zone ?? "YARD";
      const toZ = pair.to_zone ?? rawExit?.to_zone ?? "OFFLINE";
      const retFromZ = pair.return_from_zone ?? rawEnter?.from_zone ?? toZ;
      const zoneRoute = pair.masih_di_luar
        ? `${fromZ} -> ${toZ}`
        : retFromZ !== toZ
          ? `${fromZ} -> ${toZ}/${retFromZ} -> YARD`
          : `${fromZ} -> ${toZ} -> YARD`;

      const hits = pair.debounce_hits ?? rawExit?.debounce_hits ?? 3;
      const tag = rawEnter?.tag ?? rawExit?.tag ?? pair.tag ?? null;
      const clockAdjusted = Boolean(pair.clock_adjusted);

      return {
        id: pair.exit_id,
        pairedId: pair.enter_id && pair.enter_id !== pair.exit_id ? pair.enter_id : null,
        unit_id: pair.unit_id,
        exitTime: pair.exit_time,
        returnTime: pair.enter_time,
        isStillAway: Boolean(pair.masih_di_luar),
        durationLabel: formatTripDuration(pair.durasi_di_luar_sec, null, clockAdjusted),
        clockAdjusted,
        zoneRoute,
        debounceText: `${hits}/3 keluar`,
        tag,
      };
    });
  }

  return movement
    .filter((ev) => !isLiveApi || ev.event_type !== "ENTER_YARD")
    .map((ev) => {
      const rawStatus = resolveRawEventStatus(ev);
      const fromZ = ev.from_zone ?? "YARD";
      const toZ = ev.to_zone ?? "OFFLINE";
      const zoneRoute = rawStatus.isStillAway ? `${fromZ} -> ${toZ}` : `${fromZ} -> ${toZ} -> YARD`;
      const clockAdjusted = Boolean(ev.clock_adjusted);

      return {
        id: ev.id,
        pairedId: null,
        unit_id: ev.unit_id,
        exitTime: ev.departed,
        returnTime: rawStatus.isStillAway ? null : rawStatus.label,
        isStillAway: rawStatus.isStillAway,
        durationLabel: formatTripDuration(ev.durasi_di_luar_sec, ev.away_min, clockAdjusted),
        clockAdjusted,
        zoneRoute,
        debounceText: resolveRawDebounceLabel(ev),
        tag: ev.tag,
      };
    });
}
