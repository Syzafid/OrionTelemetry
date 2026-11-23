import { describe, it, expect } from "vitest";
import { computeBatteryPrediction } from "../lib/battery-analytics";
import {
  INITIAL_TICKETS,
  applyTicketTransition,
  EXPANDED_YARD_UNITS,
  voltageHistory,
} from "../data/mockTelemetry";
import { buildUnitDeepLinkUrl, generateDeterministicQrMatrix } from "../components/hmi/UnitQrCode";
import { parseDeepLinkParams } from "../context/TelemetryContext";

describe("Enterprise Upgrade #1: Battery Thermal Compensation & Arrhenius Penalty", () => {
  const sampleHistory = [
    { t: "00:00", v: 12.4 },
    { t: "04:00", v: 12.35 },
    { t: "08:00", v: 12.3 },
    { t: "12:00", v: 12.25 },
    { t: "16:00", v: 12.2 },
    { t: "20:00", v: 12.15 },
  ];

  it("returns neutral thermal compensation at 25°C reference temperature", () => {
    const pred25 = computeBatteryPrediction(sampleHistory, 12.15, 11.8, false, 25);
    expect(pred25.compensatedV25).toBe(12.15);
    expect(pred25.tempCompensatedSocPct).toBe(50);
    expect(pred25.thermalFactor).toBe(1.0);
    expect(pred25.ttcHours).not.toBeNull();
  });

  it("applies -0.018 V/°C OCV correction and Arrhenius self-discharge penalty when rtcTempC > 30°C", () => {
    const pred25 = computeBatteryPrediction(sampleHistory, 12.15, 11.8, false, 25);
    const pred35 = computeBatteryPrediction(sampleHistory, 12.15, 11.8, false, 35);

    // At 35°C (+10°C above 25°C): compensatedV25 = 12.15 + 0.018 * (25 - 35) = 12.15 - 0.18 = 11.97V
    expect(pred35.compensatedV25).toBe(11.97);
    expect(pred35.tempCompensatedSocPct).toBeLessThan(pred25.tempCompensatedSocPct);

    // Arrhenius Q10 = 2.0 at 35°C -> thermalFactor = 2^((35-25)/10) = 2.0
    expect(pred35.thermalFactor).toBe(2.0);
    expect(pred35.ttcHours).not.toBeNull();
    expect(pred25.ttcHours).not.toBeNull();
    // TTC at 35°C is halved compared to 25°C
    expect(pred35.ttcHours!).toBeCloseTo(pred25.ttcHours! / 2, 0);
  });

  it("handles all 12 expanded yard units with their real rtc_temp_c readings", () => {
    expect(EXPANDED_YARD_UNITS).toHaveLength(12);
    for (const u of EXPANDED_YARD_UNITS) {
      const hist = voltageHistory(u.telemetry.v_bat, u.state === "WARMUP");
      const pred = computeBatteryPrediction(
        hist,
        u.telemetry.v_bat,
        11.8,
        u.telemetry.engine_on,
        u.telemetry.rtc_temp_c,
      );
      expect(pred.tempCompensatedSocPct).toBeGreaterThanOrEqual(0);
      expect(pred.tempCompensatedSocPct).toBeLessThanOrEqual(100);
      expect(pred.thermalFactor).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("Enterprise Upgrade #2: QR Code Matrix & URL Deep-Linking", () => {
  it("builds valid deep-link URLs with encoded unit_id and module", () => {
    const url = buildUnitDeepLinkUrl("MITSUBISHI-STOCK-08", "fleet", "https://orion.example.com");
    expect(url).toBe("https://orion.example.com/dashboard?unit=MITSUBISHI-STOCK-08&module=fleet");
  });

  it("generates a deterministic 21x21 QR matrix with 3 standard 7x7 finder patterns", () => {
    const url = buildUnitDeepLinkUrl("MITSUBISHI-STOCK-03", "fleet", "http://localhost:8080");
    const matrixA = generateDeterministicQrMatrix(url);
    const matrixB = generateDeterministicQrMatrix(url);

    expect(matrixA).toHaveLength(21);
    expect(matrixA[0]).toHaveLength(21);
    expect(matrixA).toEqual(matrixB);

    // Verify top-left finder outer corner & center bit are dark (true)
    expect(matrixA[0]?.[0]).toBe(true);
    expect(matrixA[3]?.[3]).toBe(true);
    // Verify top-right finder outer corner & center bit are dark
    expect(matrixA[0]?.[20]).toBe(true);
    expect(matrixA[3]?.[17]).toBe(true);
    // Verify bottom-left finder outer corner & center bit are dark
    expect(matrixA[20]?.[0]).toBe(true);
    expect(matrixA[17]?.[3]).toBe(true);
  });

  it("parses deep-link query parameters and detects when fleetScale 12 is needed", () => {
    const parsed08 = parseDeepLinkParams("?unit=MITSUBISHI-STOCK-08&module=fleet");
    expect(parsed08.unitId).toBe("MITSUBISHI-STOCK-08");
    expect(parsed08.moduleId).toBe("02");
    expect(parsed08.requires12Scale).toBe(true);

    const parsed02 = parseDeepLinkParams("?unit=MITSUBISHI-STOCK-02&module=diagnostics");
    expect(parsed02.unitId).toBe("MITSUBISHI-STOCK-02");
    expect(parsed02.moduleId).toBe("04");

    const parsedWarm = parseDeepLinkParams("?unit=MITSUBISHI-STOCK-01&module=warmup");
    expect(parsedWarm.moduleId).toBe("03");
    expect(parsed02.requires12Scale).toBe(false);

    const parsedDynamic = parseDeepLinkParams("?unit=MITSUBISHI-STOCK-15&module=fleet");
    expect(parsedDynamic.unitId).toBe("MITSUBISHI-STOCK-15");
    expect(parsedDynamic.moduleId).toBe("02");
    expect(parsedDynamic.requires12Scale).toBe(false);

    const parsedOrion = parseDeepLinkParams("?unit=ORION-NODE-04&module=config");
    expect(parsedOrion.unitId).toBe("ORION-NODE-04");
    expect(parsedOrion.moduleId).toBe("06");
    expect(parsedOrion.requires12Scale).toBe(false);

    const invalid = parseDeepLinkParams("?unit=UNKNOWN-99&module=invalid");
    expect(invalid.unitId).toBeNull();
    expect(invalid.moduleId).toBeNull();
    expect(invalid.requires12Scale).toBe(false);
  });
});

describe("Enterprise Upgrade #3: Shift Handover & Maintenance Ticket State Machine", () => {
  it("transitions an existing ticket from OPEN -> IN_PROGRESS -> RESOLVED", () => {
    const initial = INITIAL_TICKETS;
    const stock04Unit = EXPANDED_YARD_UNITS.find((u) => u.unit_id === "MITSUBISHI-STOCK-04")!;
    const stock04Open = initial.find((t) => t.unit_id === "MITSUBISHI-STOCK-04");
    expect(stock04Open?.status).toBe("OPEN");

    const claimed = applyTicketTransition(
      initial,
      stock04Unit,
      "IN_PROGRESS",
      "B. Santoso (Shift B)",
      "Portable charger connected at Bay A-02",
    );
    const stock04InProg = claimed.find((t) => t.unit_id === "MITSUBISHI-STOCK-04");
    expect(stock04InProg?.status).toBe("IN_PROGRESS");
    expect(stock04InProg?.assigned_to).toBe("B. Santoso (Shift B)");
    expect(stock04InProg?.handover_note).toBe("Portable charger connected at Bay A-02");

    const resolved = applyTicketTransition(
      claimed,
      stock04Unit,
      "RESOLVED",
      "B. Santoso (Shift B)",
      "Alternator warm-up completed, resting voltage 12.62V",
    );
    const stock04Resolved = resolved.find((t) => t.unit_id === "MITSUBISHI-STOCK-04");
    expect(stock04Resolved?.status).toBe("RESOLVED");
    expect(stock04Resolved?.handover_note).toContain("12.62V");
  });

  it("creates a new ticket when transitioning a unit without an existing ticket", () => {
    const stock07Unit = EXPANDED_YARD_UNITS.find((u) => u.unit_id === "MITSUBISHI-STOCK-07")!;
    const updated = applyTicketTransition(
      INITIAL_TICKETS,
      stock07Unit,
      "IN_PROGRESS",
      "H. Wijaya (PDI)",
      "Preventive top-up charge initiated",
    );
    const created = updated.find((t) => t.unit_id === "MITSUBISHI-STOCK-07");
    expect(created).toBeDefined();
    expect(created?.status).toBe("IN_PROGRESS");
    expect(created?.bay).toBe("B-03");
    expect(created?.assigned_to).toBe("H. Wijaya (PDI)");
  });
});
