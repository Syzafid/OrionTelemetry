import { describe, expect, it } from "vitest";
import { buildTelemetryCsv, computeBatteryPrediction } from "@/lib/battery-analytics";
import { buildFormattedExcelPrettier } from "@/lib/excel-export";
import { DEFAULT_CONFIG, UNITS } from "@/data/mockTelemetry";

describe("computeBatteryPrediction (OLS Time-to-Critical & Drain Rate)", () => {
  it("computes accurate drain rate and TTC from real hourly epoch timestamps", () => {
    const baseTs = 1793690000;
    const history = [
      { t: "04:00", v: 12.30, ts: baseTs },
      { t: "05:00", v: 12.27, ts: baseTs + 3600 },
      { t: "06:00", v: 12.24, ts: baseTs + 7200 },
      { t: "07:00", v: 12.21, ts: baseTs + 10800 },
      { t: "08:00", v: 12.18, ts: baseTs + 14400 },
    ];

    const res = computeBatteryPrediction(history, 12.18, 11.80, false);
    expect(res.slopeVPerHour).toBeCloseTo(-0.03, 5);
    expect(res.slopeMvPerHour).toBe(-30);
    expect(res.ttcHours).toBe(12.7);
    expect(res.statusText).toBe("Est. Critical in 12.7h (-30 mV/h)");
    expect(res.tone).toBe("amber");
  });

  it("normalizes step intervals when timestamps are missing or span < 60 seconds (fast 1.5s stream)", () => {
    const fastTs = 1793690000;
    const history = [
      { t: "09:00", v: 12.50, ts: fastTs },
      { t: "09:01", v: 12.48, ts: fastTs + 2 },
      { t: "09:02", v: 12.46, ts: fastTs + 4 },
      { t: "09:03", v: 12.44, ts: fastTs + 6 },
    ];

    const res = computeBatteryPrediction(history, 12.44, 11.80, false);
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
    const res = computeBatteryPrediction(history, 11.65, 11.80, false);
    expect(res.ttcHours).toBe(0);
    expect(res.statusText).toBe("Critical Now (0.0h)");
    expect(res.tone).toBe("crimson");
  });

  it("returns null TTC and charging status when engine is on or voltage is rising", () => {
    const history = [
      { t: "01:00", v: 12.40 },
      { t: "02:00", v: 12.72 },
      { t: "03:00", v: 13.04 },
    ];
    const res = computeBatteryPrediction(history, 13.04, 11.80, false);
    expect(res.ttcHours).toBeNull();
    expect(res.slopeMvPerHour).toBe(320);
    expect(res.statusText).toBe("Charging (+320 mV/h)");
    expect(res.tone).toBe("cyan");
  });

  it("returns Stable (> 72h Safe) when voltage drift is flat", () => {
    const history = [
      { t: "01:00", v: 12.60 },
      { t: "02:00", v: 12.60 },
      { t: "03:00", v: 12.60 },
    ];
    const res = computeBatteryPrediction(history, 12.60, 11.80, false);
    expect(res.ttcHours).toBeNull();
    expect(res.slopeMvPerHour).toBe(0);
    expect(res.statusText).toBe("Stable (> 72h Safe)");
    expect(res.tone).toBe("emerald");
  });

  it("builds valid 20-column CSV for simulator export", () => {
    const csv = buildTelemetryCsv(UNITS, {}, "MITSUBISHI-STOCK-01");
    const rows = csv.trim().split("\r\n");
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0]).toBe(
      "id,unit_id,seq,boot,ts_epoch,created_at,v_bat,adc_raw_mv,rtc_temp_c,shunt_sleep_ua,engine_on,crit_alert,rpm,temp_c,dtc_cnt,dtc,rssi,sleep_cfg,active_ms,daily_mah",
    );
    expect(rows[1]).toContain("MITSUBISHI-STOCK-01");
  });

  it("builds formatted Excel workbook with executive summary, conditional formatting, and log headers", () => {
    const configs = Object.fromEntries(UNITS.map((u) => [u.unit_id, DEFAULT_CONFIG(u.unit_id)]));
    const xls = buildFormattedExcelPrettier(UNITS, configs, {}, "ALL");
    expect(xls).toContain("ORION — ONBOARD REPORTING FOR INVENTORY &amp; OPERATIONAL NOTIFICATIONS");
    expect(xls).toContain("STOCK YARD INVENTORY TELEMETRY &amp; BATTERY HEALTH AUDIT REPORT");
    expect(xls).toContain("#8E1218");
    expect(xls).toContain("#F2EFE9");
    expect(xls).toContain("1. Executive Fleet Health &amp; PDI Summary");
    expect(xls).toContain("2. Chronological Telemetry Logs (Wake-Cycle History)");
    expect(xls).toContain("#DCFCE7");
    expect(xls).toContain("#FEF3C7");
    expect(xls).toContain("#FEE2E2");
    expect(xls).toContain("PDI PASSED");
    expect(xls).toContain("PDI HOLD / ACTION REQUIRED");
  });
});
