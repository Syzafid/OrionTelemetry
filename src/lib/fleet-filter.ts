import type { PiggybackConfig, VehicleUnit } from "@/data/mockTelemetry";
import { voltageHistory } from "@/data/mockTelemetry";
import { computeBatteryPrediction, type BatteryHistoryPoint } from "@/lib/battery-analytics";

export type FleetStatusFilter = "ALL" | "CRITICAL" | "WARNING" | "HEALTHY";
export type FleetSortMode = "PRIORITY" | "LOWEST_V" | "SHORTEST_TTC" | "BAY";

export interface FleetFilterCounts {
  ALL: number;
  CRITICAL: number;
  WARNING: number;
  HEALTHY: number;
}

export function classifyUnitHealthCategory(
  u: VehicleUnit,
  critV: number = 11.80,
): Exclude<FleetStatusFilter, "ALL"> {
  const t = u.telemetry;
  if (t.crit_alert || t.v_bat < critV || t.dtc_cnt > 0 || u.state === "CRITICAL") {
    return "CRITICAL";
  }
  if (!t.engine_on && t.v_bat < 12.30) {
    return "WARNING";
  }
  return "HEALTHY";
}

export function computeFleetStatusCounts(
  units: VehicleUnit[],
  configs: Record<string, PiggybackConfig>,
): FleetFilterCounts {
  const counts: FleetFilterCounts = {
    ALL: units.length,
    CRITICAL: 0,
    WARNING: 0,
    HEALTHY: 0,
  };
  for (const u of units) {
    const crit = configs[u.unit_id]?.crit_v ?? 11.80;
    const cat = classifyUnitHealthCategory(u, crit);
    counts[cat]++;
  }
  return counts;
}

export function matchesFleetSearch(u: VehicleUnit, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const t = u.telemetry;
  return (
    u.bay.toLowerCase().includes(q) ||
    u.model.toLowerCase().includes(q) ||
    u.trim.toLowerCase().includes(q) ||
    u.vin.toLowerCase().includes(q) ||
    u.unit_id.toLowerCase().includes(q) ||
    u.status_label.toLowerCase().includes(q) ||
    u.color.toLowerCase().includes(q) ||
    t.dtc.toLowerCase().includes(q)
  );
}

function getTriagePriorityRank(u: VehicleUnit, critV: number): number {
  const t = u.telemetry;
  if (t.crit_alert || t.v_bat < critV || t.dtc_cnt > 0 || u.state === "CRITICAL") return 0; // Critical
  if (!t.engine_on && t.v_bat < 12.30) return 1; // Low Warning
  if (t.engine_on || u.state === "WARMUP") return 2; // Active Warm-Up
  if (u.in_yard) return 3; // Healthy Standby in yard
  return 4; // Departed / Out of Yard
}

export function filterAndSortFleetUnits(
  units: VehicleUnit[],
  configs: Record<string, PiggybackConfig>,
  historyMap: Record<string, Array<BatteryHistoryPoint>>,
  options: {
    searchQuery?: string;
    statusFilter?: FleetStatusFilter;
    sortBy?: FleetSortMode;
  },
): VehicleUnit[] {
  const searchQuery = options.searchQuery ?? "";
  const statusFilter = options.statusFilter ?? "ALL";
  const sortBy = options.sortBy ?? "PRIORITY";

  const filtered = units.filter((u) => {
    if (!matchesFleetSearch(u, searchQuery)) return false;
    if (statusFilter === "ALL") return true;
    const crit = configs[u.unit_id]?.crit_v ?? 11.80;
    return classifyUnitHealthCategory(u, crit) === statusFilter;
  });

  const ttcCache = new Map<string, number>();
  if (sortBy === "SHORTEST_TTC") {
    for (const u of filtered) {
      const crit = configs[u.unit_id]?.crit_v ?? 11.80;
      const hist =
        historyMap[u.unit_id] && historyMap[u.unit_id]!.length >= 2
          ? historyMap[u.unit_id]!
          : voltageHistory(u.telemetry.v_bat, u.telemetry.engine_on);
      const pred = computeBatteryPrediction(
        hist,
        u.telemetry.v_bat,
        crit,
        u.telemetry.engine_on,
        u.telemetry.rtc_temp_c,
      );
      const effectiveTtc =
        pred.ttcHours !== null
          ? pred.ttcHours
          : u.telemetry.engine_on
            ? 99999
            : 9999;
      ttcCache.set(u.unit_id, effectiveTtc);
    }
  }

  return filtered.slice().sort((a, b) => {
    const critA = configs[a.unit_id]?.crit_v ?? 11.80;
    const critB = configs[b.unit_id]?.crit_v ?? 11.80;

    switch (sortBy) {
      case "LOWEST_V":
        return a.telemetry.v_bat - b.telemetry.v_bat || a.bay.localeCompare(b.bay);
      case "SHORTEST_TTC": {
        const ttcA = ttcCache.get(a.unit_id) ?? 9999;
        const ttcB = ttcCache.get(b.unit_id) ?? 9999;
        if (ttcA !== ttcB) return ttcA - ttcB;
        return a.telemetry.v_bat - b.telemetry.v_bat;
      }
      case "BAY":
        return a.bay.localeCompare(b.bay);
      case "PRIORITY":
      default: {
        const rankA = getTriagePriorityRank(a, critA);
        const rankB = getTriagePriorityRank(b, critB);
        if (rankA !== rankB) return rankA - rankB;
        return a.telemetry.v_bat - b.telemetry.v_bat;
      }
    }
  });
}

/**
 * Guarantees that `selectedId` always resolves to an active unit in `visibleUnits`.
 * When switching `fleetScale` from 12 down to 3, if `selectedId` was `MITSUBISHI-STOCK-04..12`,
 * it safely falls back to `"MITSUBISHI-STOCK-01"` (or `visibleUnits[0].unit_id`).
 */
export function resolveSafeSelectedUnitId(
  visibleUnits: VehicleUnit[],
  currentSelectedId: string,
): string {
  if (visibleUnits.some((u) => u.unit_id === currentSelectedId)) {
    return currentSelectedId;
  }
  return visibleUnits[0]?.unit_id ?? "MITSUBISHI-STOCK-01";
}

