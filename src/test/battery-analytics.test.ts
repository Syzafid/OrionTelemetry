import { describe, expect, it } from "vitest";
import { buildTelemetryCsv, CSV_COLUMNS, computeBatteryPrediction } from "@/lib/battery-analytics";
import { buildFormattedExcelPrettier } from "@/lib/excel-export";
import { AUDIT_LOGS, DEFAULT_CONFIG, INITIAL_TICKETS, UNITS } from "@/data/mockTelemetry";

describe("computeBatteryPrediction (OLS Time-to-Critical & Drain Rate)", () => {
  it("computes accurate drain rate and TTC from real hourly epoch timestamps", () => {
    const baseTs = 1793690000;
    const history = [
      { t: "04:00", v: 12.3, ts: baseTs },
      { t: "05:00", v: 12.27, ts: baseTs + 3600 },
      { t: "06:00", v: 12.24, ts: baseTs + 7200 },
      { t: "07:00", v: 12.21, ts: baseTs + 10800 },
      { t: "08:00", v: 12.18, ts: baseTs + 14400 },
    ];

    const res = computeBatteryPrediction(history, 12.18, 11.8, false);
    expect(res.slopeVPerHour).toBeCloseTo(-0.03, 5);
    expect(res.slopeMvPerHour).toBe(-30);
    expect(res.ttcHours).toBe(12.7);
    expect(res.statusText).toBe("Est. Critical in 12.7h (-30 mV/h)");
    expect(res.tone).toBe("amber");
  });

  it("normalizes step intervals when timestamps are missing or span < 60 seconds (fast 1.5s stream)", () => {
    const fastTs = 1793690000;
    const history = [
      { t: "09:00", v: 12.5, ts: fastTs },
      { t: "09:01", v: 12.48, ts: fastTs + 2 },
      { t: "09:02", v: 12.46, ts: fastTs + 4 },
      { t: "09:03", v: 12.44, ts: fastTs + 6 },
    ];

    const res = computeBatteryPrediction(history, 12.44, 11.8, false);
    expect(Number.isFinite(res.slopeVPerHour)).toBe(true);
    expect(res.slopeMvPerHour).toBe(-20);
    expect(res.ttcHours).toBe(32);
    expect(res.statusText).toBe("Est. Critical in 32.0h (-20 mV/h)");
  });

  it("returns 0 TTC and crimson tone when current voltage is at or below critical threshold", () => {
    const history = [
      { t: "01:00", v: 11.85 },
      { t: "02:00", v: 11.75 },
      { t: "03:00", v: 11.65 },
    ];
    const res = computeBatteryPrediction(history, 11.65, 11.8, false);
    expect(res.ttcHours).toBe(0);
    expect(res.statusText).toBe("Critical Now (0.0h)");
    expect(res.tone).toBe("crimson");
  });

  it("returns null TTC and charging status when engine is on or voltage is rising", () => {
    const history = [
      { t: "01:00", v: 12.4 },
      { t: "02:00", v: 12.72 },
      { t: "03:00", v: 13.04 },
    ];
    const res = computeBatteryPrediction(history, 13.04, 11.8, false);
    expect(res.ttcHours).toBeNull();
    expect(res.slopeMvPerHour).toBe(320);
    expect(res.statusText).toBe("Charging (+320 mV/h)");
    expect(res.tone).toBe("emerald");
  });

  it("returns Stable (> 72h Safe) when voltage drift is flat", () => {
    const history = [
      { t: "01:00", v: 12.6 },
      { t: "02:00", v: 12.6 },
      { t: "03:00", v: 12.6 },
    ];
    const res = computeBatteryPrediction(history, 12.6, 11.8, false);
    expect(res.ttcHours).toBeNull();
    expect(res.slopeMvPerHour).toBe(0);
    expect(res.statusText).toBe("Stable (> 72h Safe)");
    expect(res.tone).toBe("emerald");
  });

  it("builds valid 39-column CSV for simulator export", () => {
    const csv = buildTelemetryCsv(UNITS, {}, "MITSUBISHI-STOCK-01");
    const rows = csv.trim().split("\r\n");
    expect(CSV_COLUMNS).toHaveLength(39);
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0]).toBe(
      "id,unit_id,seq,boot,ts_epoch,created_at,v_bat,adc_raw_mv,rtc_temp_c,shunt_sleep_ua,engine_on,crit_alert,rpm,temp_c,dtc_cnt,dtc,rssi,sleep_cfg,buffer_used,can_ok,net_zone,sync_ssid,active_ms,daily_mah,speed_kmh,iat_c,map_kpa,load_pct,tps_pct,ign_deg,maf_gs,run_time_s,fuel_pct,fuel_rate_lh,o2_v,stft_pct,mil_on,ecu_v,dist_clr_km",
    );
    expect(rows[1]).toContain("MITSUBISHI-STOCK-01");
  });

  it("exports only real rows without synthetic voltageHistory when isLiveApi is true", () => {
    const csvEmptyHist = buildTelemetryCsv([UNITS[0]!], {}, "MITSUBISHI-STOCK-01", {
      isLiveApi: true,
    });
    const singleRows = csvEmptyHist.trim().split("\r\n");
    expect(singleRows).toHaveLength(2);
    expect(singleRows[1]).toContain("MITSUBISHI-STOCK-01");

    const csvTwoPts = buildTelemetryCsv(
      [UNITS[0]!],
      {
        "MITSUBISHI-STOCK-01": [
          { t: "10:00", v: 12.45, ts: 1763370000 },
          { t: "10:05", v: 12.44, ts: 1763370300 },
        ],
      },
      "MITSUBISHI-STOCK-01",
      { isLiveApi: true },
    );
    const twoRows = csvTwoPts.trim().split("\r\n");
    expect(twoRows).toHaveLength(3);
    // Latest row uses real unit ADC reading; older cached history row omits uncached ADC instead of faking
    expect(twoRows[1]!.split(",")[7]).toBe(String(UNITS[0]!.telemetry.adc_raw_mv));
    expect(twoRows[2]!.split(",")[7]).toBe("");
  });

  it("builds 3-sheet SpreadsheetML Excel workbook with AutoFilter, FreezePanes, and real tickets/audit", () => {
    const configs = Object.fromEntries(UNITS.map((u) => [u.unit_id, DEFAULT_CONFIG(u.unit_id)]));
    const xls = buildFormattedExcelPrettier(UNITS, configs, {}, "ALL", {
      isLiveApi: false,
      tickets: INITIAL_TICKETS,
      auditLogs: AUDIT_LOGS,
    });
    expect(xls).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xls).toContain('ss:Name="1_Ringkasan_PDI_Armada"');
    expect(xls).toContain('ss:Name="2_Log_Telemetri_OBD"');
    expect(xls).toContain('ss:Name="3_Tiket_dan_Audit_Log"');
    expect(xls).toContain('<AutoFilter x:Range="R4C1:R7C16"');
    expect(xls).toContain('C41" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>');
    expect(xls).toContain('<AutoFilter x:Range="R4C1:R');
    expect(xls).toContain('C9" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>');
    expect(xls).toContain("<FreezePanes/>");
    // Anti-slop industrial header #0F172A replaces double bright crimson banner
    expect(xls).toContain("#0F172A");
    expect(xls).not.toContain("#8E1218");
    expect(xls).not.toContain("#E0393E");
    expect(xls).toContain("#DCFCE7");
    expect(xls).toContain("#FEF3C7");
    expect(xls).toContain("#FEE2E2");
    expect(xls).toContain("PDI PASSED");
    expect(xls).toContain("PDI HOLD / ACTION REQUIRED");
    expect(xls).toContain(INITIAL_TICKETS[0]!.ticket_code);
    expect(xls).toContain(AUDIT_LOGS[0]!.event_type);

    // Live API mode without history produces exactly 1 real row on Sheet 2 (Row 5)
    const liveUnit = UNITS[0]!;
    const liveXls = buildFormattedExcelPrettier([liveUnit], configs, {}, liveUnit.unit_id, {
      isLiveApi: true,
      tickets: [],
      auditLogs: [],
    });
    expect(liveXls).toContain('<AutoFilter x:Range="R4C1:R5C16"');
    expect(liveXls).toContain('<AutoFilter x:Range="R4C1:R5C41"');
    expect(liveXls).toContain("BELUM ADA TIKET / LOG AUDIT TERCATAT DI DATABASE");
  });
});
