import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  EXPANDED_YARD_UNITS,
  UNITS,
  voltageHistory,
  type PiggybackConfig,
} from "@/data/mockTelemetry";
import { computeBatteryPrediction, type BatteryHistoryPoint } from "@/lib/battery-analytics";
import {
  classifyUnitHealthCategory,
  computeFleetStatusCounts,
  filterAndSortFleetUnits,
  matchesFleetSearch,
  resolveSafeSelectedUnitId,
} from "@/lib/fleet-filter";

function buildDefaultConfigs(): Record<string, PiggybackConfig> {
  return Object.fromEntries(EXPANDED_YARD_UNITS.map((u) => [u.unit_id, DEFAULT_CONFIG(u.unit_id)]));
}

function buildDefaultHistoryMap(): Record<string, Array<BatteryHistoryPoint>> {
  return Object.fromEntries(
    EXPANDED_YARD_UNITS.map((u) => [
      u.unit_id,
      voltageHistory(u.telemetry.v_bat, u.telemetry.engine_on),
    ]),
  );
}

describe("Fleet Scalability (12-Unit Yard & Triage Filter/Sort)", () => {
  it("provides 12 realistic Mitsubishi units with valid 24-point voltage history and finite OLS predictions", () => {
    expect(UNITS).toHaveLength(3);
    expect(EXPANDED_YARD_UNITS).toHaveLength(12);

    const ids = EXPANDED_YARD_UNITS.map((u) => u.unit_id);
    expect(ids[0]).toBe("MITSUBISHI-STOCK-01");
    expect(ids[11]).toBe("MITSUBISHI-STOCK-12");

    for (const unit of EXPANDED_YARD_UNITS) {
      const hist = voltageHistory(unit.telemetry.v_bat, unit.telemetry.engine_on);
      expect(hist.length).toBeGreaterThanOrEqual(24);
      const cfg = DEFAULT_CONFIG(unit.unit_id);
      const pred = computeBatteryPrediction(
        hist,
        unit.telemetry.v_bat,
        cfg.crit_v,
        unit.telemetry.engine_on,
      );
      expect(Number.isNaN(pred.slopeVPerHour)).toBe(false);
      expect(Number.isFinite(pred.slopeVPerHour)).toBe(true);
      expect(Number.isNaN(pred.slopeMvPerHour)).toBe(false);
      expect(Number.isFinite(pred.slopeMvPerHour)).toBe(true);
      expect(pred.statusText.length).toBeGreaterThan(0);

      if (pred.ttcHours !== null) {
        expect(Number.isFinite(pred.ttcHours)).toBe(true);
        expect(pred.ttcHours).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("classifies unit health categories and computes accurate status counts across 12 units", () => {
    const configs = buildDefaultConfigs();
    const counts = computeFleetStatusCounts(EXPANDED_YARD_UNITS, configs);
    expect(counts.ALL).toBe(12);
    expect(counts.CRITICAL + counts.WARNING + counts.HEALTHY).toBe(12);
    expect(counts.CRITICAL).toBeGreaterThanOrEqual(3); // STOCK-03, STOCK-05, STOCK-09
    expect(counts.WARNING).toBeGreaterThanOrEqual(2); // STOCK-02, STOCK-06, STOCK-11
    expect(counts.HEALTHY).toBeGreaterThanOrEqual(5);

    const stock03 = EXPANDED_YARD_UNITS.find((u) => u.unit_id === "MITSUBISHI-STOCK-03")!;
    const stock02 = EXPANDED_YARD_UNITS.find((u) => u.unit_id === "MITSUBISHI-STOCK-02")!;
    const stock01 = EXPANDED_YARD_UNITS.find((u) => u.unit_id === "MITSUBISHI-STOCK-01")!;

    expect(classifyUnitHealthCategory(stock03)).toBe("CRITICAL");
    expect(classifyUnitHealthCategory(stock02)).toBe("WARNING");
    expect(classifyUnitHealthCategory(stock01)).toBe("HEALTHY");
  });

  it("filters units by multi-attribute search (Bay, Model, VIN, Unit ID, and DTC)", () => {
    const configs = buildDefaultConfigs();
    const historyMap = buildDefaultHistoryMap();

    // Search by Bay
    const bayB02 = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "B-02",
      statusFilter: "ALL",
      sortBy: "BAY",
    });
    expect(bayB02).toHaveLength(1);
    expect(bayB02[0]!.unit_id).toBe("MITSUBISHI-STOCK-03");

    // Search by Model
    const tritons = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "TRITON",
      statusFilter: "ALL",
      sortBy: "BAY",
    });
    expect(tritons.length).toBeGreaterThanOrEqual(2);
    expect(tritons.every((u) => u.model.includes("TRITON"))).toBe(true);

    // Search by DTC code
    const dtcP0133 = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "P0133",
      statusFilter: "ALL",
      sortBy: "PRIORITY",
    });
    expect(dtcP0133).toHaveLength(1);
    expect(dtcP0133[0]!.unit_id).toBe("MITSUBISHI-STOCK-04");

    // Combined Search + Status Filter
    const warningPajero = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "PAJERO",
      statusFilter: "WARNING",
      sortBy: "PRIORITY",
    });
    expect(warningPajero).toHaveLength(1);
    expect(warningPajero[0]!.unit_id).toBe("MITSUBISHI-STOCK-11");
  });

  it("sorts units accurately across PRIORITY, LOWEST_V, SHORTEST_TTC, and BAY modes", () => {
    const configs = buildDefaultConfigs();
    const historyMap = buildDefaultHistoryMap();

    const byLowestV = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "",
      statusFilter: "ALL",
      sortBy: "LOWEST_V",
    });
    for (let i = 1; i < byLowestV.length; i++) {
      expect(byLowestV[i]!.telemetry.v_bat).toBeGreaterThanOrEqual(
        byLowestV[i - 1]!.telemetry.v_bat,
      );
    }

    const byPriority = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "",
      statusFilter: "ALL",
      sortBy: "PRIORITY",
    });
    // First items must be CRITICAL, last items HEALTHY
    expect(classifyUnitHealthCategory(byPriority[0]!)).toBe("CRITICAL");
    expect(classifyUnitHealthCategory(byPriority[byPriority.length - 1]!)).toBe("HEALTHY");

    const byShortestTtc = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "",
      statusFilter: "ALL",
      sortBy: "SHORTEST_TTC",
    });
    // Critical units with 0.0h TTC should come first
    const firstUnit = byShortestTtc[0]!;
    const firstCrit = configs[firstUnit.unit_id]?.crit_v ?? 11.8;
    expect(firstUnit.telemetry.v_bat).toBeLessThanOrEqual(firstCrit);

    const byBay = filterAndSortFleetUnits(EXPANDED_YARD_UNITS, configs, historyMap, {
      searchQuery: "",
      statusFilter: "ALL",
      sortBy: "BAY",
    });
    expect(byBay[0]!.bay).toBe("A-01");
    expect(byBay[byBay.length - 1]!.bay).toBe("C-04");
  });

  it("safely resets selectedUnitId when switching fleetScale from 12 down to 3", () => {
    // If selected unit is STOCK-09 (only in 12-unit scale), switching to UNITS (3 units) resets to STOCK-01
    const resetId = resolveSafeSelectedUnitId(UNITS, "MITSUBISHI-STOCK-09");
    expect(resetId).toBe("MITSUBISHI-STOCK-01");

    // If selected unit is STOCK-02 (exists in 3-unit scale), it is preserved
    const preservedId = resolveSafeSelectedUnitId(UNITS, "MITSUBISHI-STOCK-02");
    expect(preservedId).toBe("MITSUBISHI-STOCK-02");

    // Matches helper handles empty query
    expect(matchesFleetSearch(UNITS[0]!, "   ")).toBe(true);
  });
});
