import { describe, expect, it } from "vitest";
import {
  PCB_BLUEPRINT_META,
  PCB_ELECTRICAL_GATES,
  PCB_PHYSICAL_GATES,
  PCB_V2_COMPONENTS,
  PCB_V2_HEADER_PINS,
  PCB_V2_NETS,
} from "@/data/hardwareBlueprint";
import { WIRING } from "@/data/mockTelemetry";

describe("PCB ORION v2.0 Step 2.1 (S-D-G / Rev 3) Blueprint SSOT", () => {
  it("matches verified topology metrics, empty corners, and divider ratio", () => {
    expect(PCB_BLUEPRINT_META.revisionCode).toBe("PCB-v2.0-Step2.1-Rev3");
    expect(PCB_BLUEPRINT_META.grid.cols).toBe(24);
    expect(PCB_BLUEPRINT_META.grid.rows).toBe(18);
    expect(PCB_BLUEPRINT_META.grid.emptyCorners).toEqual(["c1r1", "c24r1", "c1r18", "c24r18"]);

    expect(PCB_BLUEPRINT_META.verification.totalNets).toBe(22);
    expect(PCB_BLUEPRINT_META.verification.totalSegments).toBe(237);
    expect(PCB_BLUEPRINT_META.verification.sharedHoleConflicts).toBe(0);
    expect(PCB_BLUEPRINT_META.verification.bottomCrossings).toBe(0);
    expect(PCB_BLUEPRINT_META.verification.topJumpers).toBe(1);

    const { r1Ohm, r2Ohm, theoreticalRatio } = PCB_BLUEPRINT_META.divider;
    const computedRatio = (r1Ohm + r2Ohm) / r2Ohm;
    expect(computedRatio).toBeCloseTo(theoreticalRatio, 4);
  });

  it("tracks all 22 unique components, 22 nets, and 12 active pins in 1x14 header c23", () => {
    expect(PCB_V2_COMPONENTS).toHaveLength(22);
    expect(new Set(PCB_V2_COMPONENTS.map((c) => c.ref)).size).toBe(22);

    expect(PCB_V2_NETS).toHaveLength(22);
    expect(new Set(PCB_V2_NETS.map((n) => n.id)).size).toBe(22);

    expect(PCB_V2_HEADER_PINS).toHaveLength(14);
    const activePins = PCB_V2_HEADER_PINS.filter((slot) => slot.active);
    const pulledPins = PCB_V2_HEADER_PINS.filter((slot) => !slot.active);
    expect(activePins).toHaveLength(12);
    expect(pulledPins.map((s) => s.hole)).toEqual(["c23r7", "c23r9"]);

    const hComponent = PCB_V2_COMPONENTS.find((c) => c.ref === "H");
    expect(hComponent?.pins).toHaveLength(12);
  });

  it("defines complete conditional gates G1-G5 and E1-E7 and aligned WIRING rows", () => {
    expect(PCB_PHYSICAL_GATES.map((g) => g.id)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    expect(PCB_ELECTRICAL_GATES.map((g) => g.id)).toEqual([
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "E6",
      "E7",
    ]);

    expect(WIRING).toHaveLength(8);
    expect(WIRING.find((w) => w.id === "W-01")?.path).toContain("P6KE18A");
    expect(WIRING.find((w) => w.id === "W-04")?.path).toContain("AO3401A S-D-G");
    expect(WIRING.find((w) => w.id === "W-05")?.path).toContain("R1 100k");
    expect(WIRING.find((w) => w.id === "W-05")?.path).toContain("R2 27k 1/8W");
  });
});
