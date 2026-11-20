import { describe, expect, it } from "vitest";
import { applyRemoteUpdate } from "@/lib/telemetry-sync";
import { UNITS, getUnitConnectionState } from "@/data/mockTelemetry";

const clone = () => UNITS.map((u) => ({ ...u, telemetry: { ...u.telemetry } }));
const TARGET = "MITSUBISHI-STOCK-02";

describe("applyRemoteUpdate (live API merge)", () => {
  it("merges a flat payload into the matching unit", () => {
    const units = applyRemoteUpdate(
      clone(),
      { unit_id: TARGET, v_bat: 11.95, rtc_temp_c: 33.1 },
      UNITS[0]!.unit_id,
    );
    const t = units.find((u) => u.unit_id === TARGET)!.telemetry;
    expect(t.v_bat).toBe(11.95);
    expect(t.rtc_temp_c).toBe(33.1);
    expect(t.boot).toBe(112);
    expect(units.find((u) => u.unit_id === UNITS[0]!.unit_id)!.telemetry.v_bat).toBe(12.6);
  });

  it("falls back to the selected unit when no unit_id is present", () => {
    const units = applyRemoteUpdate(clone(), { v_bat: 12.9 }, "MITSUBISHI-STOCK-03");
    expect(units.find((u) => u.unit_id === "MITSUBISHI-STOCK-03")!.telemetry.v_bat).toBe(12.9);
    expect(units.find((u) => u.unit_id === TARGET)!.telemetry.v_bat).toBe(12.18);
  });

  it("merges a wrapped payload object", () => {
    const units = applyRemoteUpdate(
      clone(),
      { payload: { unit_id: TARGET, adc_raw_mv: 2200 } },
      UNITS[0]!.unit_id,
    );
    expect(units.find((u) => u.unit_id === TARGET)!.telemetry.adc_raw_mv).toBe(2200);
  });

  it("accepts a units array with metadata and telemetry", () => {
    const units = applyRemoteUpdate(
      clone(),
      { units: [{ unit_id: TARGET, bay: "C-09", telemetry: { v_bat: 12.02 } }] },
      UNITS[0]!.unit_id,
    );
    const u = units.find((x) => x.unit_id === TARGET)!;
    expect(u.bay).toBe("C-09");
    expect(u.telemetry.v_bat).toBe(12.02);
    expect(u.telemetry.boot).toBe(112);
  });

  it("drops malformed field types instead of corrupting state", () => {
    const before = clone();
    const units = applyRemoteUpdate(
      before,
      {
        unit_id: TARGET,
        v_bat: "12.6" as unknown as number,
        engine_on: "yes" as unknown as boolean,
      },
      UNITS[0]!.unit_id,
    );
    expect(units).toEqual(before);
  });

  it("ignores unknown unit_id and returns the same array reference", () => {
    const before = clone();
    expect(applyRemoteUpdate(before, { unit_id: "NOPE", v_bat: 10 }, UNITS[0]!.unit_id)).toBe(
      before,
    );
  });

  it("returns the same reference for garbage input", () => {
    const before = clone();
    expect(applyRemoteUpdate(before, null, UNITS[0]!.unit_id)).toBe(before);
    expect(applyRemoteUpdate(before, [], UNITS[0]!.unit_id)).toBe(before);
    expect(applyRemoteUpdate(before, "x", UNITS[0]!.unit_id)).toBe(before);
  });

  it("merges and sanitizes two-tier buffer_used (up to 5000)", () => {
    const units1 = applyRemoteUpdate(
      clone(),
      { units: [{ unit_id: TARGET, buffer_used: 2020 }] },
      UNITS[0]!.unit_id,
    );
    expect(units1.find((u) => u.unit_id === TARGET)!.buffer_used).toBe(2020);

    const units2 = applyRemoteUpdate(
      clone(),
      { unit_id: TARGET, buffer_used: 9999 },
      UNITS[0]!.unit_id,
    );
    expect(units2.find((u) => u.unit_id === TARGET)!.buffer_used).toBe(5000);
  });

  it("merges Firmware v1.4.1 can_ok boolean, seq/ts_epoch, and parses string sleep_cfg durations", () => {
    const units = applyRemoteUpdate(
      clone(),
      {
        unit_id: "MITSUBISHI-STOCK-01",
        seq: 901,
        ts_epoch: 1767234097,
        v_bat: 11.91,
        adc_raw_mv: 2188,
        rtc_temp_c: 31.25,
        shunt_sleep_ua: 410,
        can_ok: false,
        sleep_cfg: "6 Hours",
      },
      UNITS[0]!.unit_id,
    );
    const t = units.find((u) => u.unit_id === "MITSUBISHI-STOCK-01")!.telemetry;
    expect(t.seq).toBe(901);
    expect(t.ts_epoch).toBe(1767234097);
    expect(t.v_bat).toBe(11.91);
    expect(t.adc_raw_mv).toBe(2188);
    expect(t.rtc_temp_c).toBe(31.25);
    expect(t.shunt_sleep_ua).toBe(410);
    expect(t.can_ok).toBe(false);
    expect(t.sleep_cfg).toBe(21600);
  });

  it("computes LIVE / ONLINE when last_seen_sec <= 6 and OFFLINE / DEEP SLEEP when > 6", () => {
    const base = clone()[0]!;
    const liveUnit = { ...base, in_yard: true, last_seen_sec: 4, online_status: "ONLINE" as const };
    const boundaryLiveUnit = {
      ...base,
      in_yard: true,
      last_seen_sec: 6,
      online_status: "ONLINE" as const,
    };
    const offlineAtSevenUnit = {
      ...base,
      in_yard: true,
      last_seen_sec: 7,
      online_status: "OFFLINE" as const,
    };
    const staleUnit = {
      ...base,
      in_yard: true,
      last_seen_sec: 18,
      online_status: "OFFLINE" as const,
    };

    expect(getUnitConnectionState(liveUnit)).toEqual({
      isOnline: true,
      badgeText: "LIVE / ONLINE",
      lastSeenSec: 4,
    });
    expect(getUnitConnectionState(boundaryLiveUnit)).toEqual({
      isOnline: true,
      badgeText: "LIVE / ONLINE",
      lastSeenSec: 6,
    });
    expect(getUnitConnectionState(offlineAtSevenUnit)).toEqual({
      isOnline: false,
      badgeText: "OFFLINE / DEEP SLEEP",
      lastSeenSec: 7,
    });
    expect(getUnitConnectionState(staleUnit)).toEqual({
      isOnline: false,
      badgeText: "OFFLINE / DEEP SLEEP",
      lastSeenSec: 18,
    });

    // TECH_HOTSPOT outside yard: should be ONLINE if recently seen, and OFFLINE / OUT OF YARD when stale
    const techLiveUnit = {
      ...base,
      in_yard: false,
      net_zone: "TECH_HOTSPOT",
      last_seen_sec: 4,
      online_status: "ONLINE" as const,
    };
    const techStaleUnit = {
      ...base,
      in_yard: false,
      net_zone: "TECH_HOTSPOT",
      last_seen_sec: 12,
      online_status: "OFFLINE" as const,
    };
    expect(getUnitConnectionState(techLiveUnit)).toEqual({
      isOnline: true,
      badgeText: "LIVE / TECH HOTSPOT",
      lastSeenSec: 4,
    });
    expect(getUnitConnectionState(techStaleUnit)).toEqual({
      isOnline: false,
      badgeText: "OFFLINE / OUT OF YARD",
      lastSeenSec: 12,
    });
  });

  it("strictly follows backend online_status and connection_badge in LIVE mode (Task 2.1 C)", () => {
    const base = clone()[0]!;
    // Kasus 1: Backend menetapkan OFFLINE saat last_seen_sec lokal kecil (misal 2 detik)
    const backendOfflineUnit = {
      ...base,
      in_yard: true,
      last_seen_sec: 2,
      online_status: "OFFLINE" as const,
      connection_badge: "OFFLINE / DEEP SLEEP",
    };
    // Pada mode live (isLiveApi = true), status dan badge WAJIB mengikuti backend
    expect(getUnitConnectionState(backendOfflineUnit, true)).toEqual({
      isOnline: false,
      badgeText: "OFFLINE / DEEP SLEEP",
      lastSeenSec: 2,
    });
    // Pada mode simulator (isLiveApi = false), logika lokal tetap bekerja
    expect(getUnitConnectionState(backendOfflineUnit, false)).toEqual({
      isOnline: true,
      badgeText: "LIVE / ONLINE",
      lastSeenSec: 2,
    });

    // Kasus 2: Backend mengirim LIVE / TECH HOTSPOT untuk unit di luar gudang
    const backendHotspotUnit = {
      ...base,
      in_yard: false,
      net_zone: "TECH_HOTSPOT",
      last_seen_sec: 5,
      online_status: "ONLINE" as const,
      connection_badge: "LIVE / TECH HOTSPOT",
    };
    expect(getUnitConnectionState(backendHotspotUnit, true)).toEqual({
      isOnline: true,
      badgeText: "LIVE / TECH HOTSPOT",
      lastSeenSec: 5,
    });
  });

  it("preserves structural sharing and exact array/unit references when remote payloads contain identical values", () => {
    const before = clone();
    const unchangedListPayload = {
      units: before.map((u) => ({
        unit_id: u.unit_id,
        bay: u.bay,
        buffer_used: u.buffer_used,
        telemetry: { v_bat: u.telemetry.v_bat, boot: u.telemetry.boot },
      })),
    };
    const resUnchanged = applyRemoteUpdate(before, unchangedListPayload, UNITS[0]!.unit_id);
    expect(resUnchanged).toBe(before);

    const resUnchangedFlat = applyRemoteUpdate(
      before,
      { unit_id: TARGET, v_bat: before[1]!.telemetry.v_bat },
      UNITS[0]!.unit_id,
    );
    expect(resUnchangedFlat).toBe(before);

    const singleChangedPayload = {
      units: before.map((u) => ({
        unit_id: u.unit_id,
        bay: u.bay,
        buffer_used: u.buffer_used,
        telemetry: {
          v_bat: u.unit_id === TARGET ? u.telemetry.v_bat - 0.15 : u.telemetry.v_bat,
        },
      })),
    };
    const resPartial = applyRemoteUpdate(before, singleChangedPayload, UNITS[0]!.unit_id);
    expect(resPartial).not.toBe(before);
    expect(resPartial[0]).toBe(before[0]);
    expect(resPartial[1]).not.toBe(before[1]);
    expect(resPartial[2]).toBe(before[2]);
    expect(resPartial[1]!.telemetry.v_bat).toBeCloseTo(before[1]!.telemetry.v_bat - 0.15, 2);
  });

  it("merges all 15 v1.5.0 Read-Only OBD-II fields with strict typing and structural sharing", () => {
    const before = clone();
    const obdPayload = {
      unit_id: TARGET,
      engine_on: true,
      rpm: 1450,
      temp_c: 86,
      speed_kmh: 28,
      iat_c: 34,
      map_kpa: 68,
      load_pct: 37.5,
      tps_pct: 24.5,
      ign_deg: 16.5,
      maf_gs: 11.45,
      run_time_s: 185,
      fuel_pct: 74.5,
      fuel_rate_lh: 3.79,
      o2_v: 0.72,
      stft_pct: 2.3,
      mil_on: true,
      ecu_v: 14.08,
      dist_clr_km: 1420,
    };

    const next = applyRemoteUpdate(before, obdPayload, UNITS[0]!.unit_id);
    expect(next).not.toBe(before);
    const t = next.find((u) => u.unit_id === TARGET)!.telemetry;
    expect(t.speed_kmh).toBe(28);
    expect(t.iat_c).toBe(34);
    expect(t.map_kpa).toBe(68);
    expect(t.load_pct).toBe(37.5);
    expect(t.tps_pct).toBe(24.5);
    expect(t.ign_deg).toBe(16.5);
    expect(t.maf_gs).toBe(11.45);
    expect(t.run_time_s).toBe(185);
    expect(t.fuel_pct).toBe(74.5);
    expect(t.fuel_rate_lh).toBe(3.79);
    expect(t.o2_v).toBe(0.72);
    expect(t.stft_pct).toBe(2.3);
    expect(t.mil_on).toBe(true);
    expect(t.ecu_v).toBe(14.08);
    expect(t.dist_clr_km).toBe(1420);

    // Repeating identical OBD-II values keeps exact references
    expect(applyRemoteUpdate(next, obdPayload, UNITS[0]!.unit_id)).toBe(next);
  });

  it("merges net_zone, sync_ssid, and zone_exit_epoch with strict typing and structural sharing", () => {
    const before = clone();
    const zonePayload = {
      unit_id: TARGET,
      net_zone: "TECH_HOTSPOT",
      sync_ssid: "POCOF5",
      zone_exit_epoch: 1731828000,
      in_yard: false,
      online_status: "ONLINE" as const,
      last_seen_sec: 2,
    };

    const next = applyRemoteUpdate(before, zonePayload, UNITS[0]!.unit_id);
    expect(next).not.toBe(before);
    const u = next.find((x) => x.unit_id === TARGET)!;
    expect(u.in_yard).toBe(false);
    expect(u.net_zone).toBe("TECH_HOTSPOT");
    expect(u.sync_ssid).toBe("POCOF5");
    expect(u.telemetry.net_zone).toBe("TECH_HOTSPOT");
    expect(u.telemetry.sync_ssid).toBe("POCOF5");
    expect(u.telemetry.zone_exit_epoch).toBe(1731828000);
    expect(u.online_status).toBe("ONLINE");

    // Re-applying identical zone payload keeps exact reference
    expect(applyRemoteUpdate(next, zonePayload, UNITS[0]!.unit_id)).toBe(next);
  });

  it("upserts a newly discovered live unit from get_data.php when metadata and telemetry are present", () => {
    const before = clone();
    const next = applyRemoteUpdate(
      before,
      {
        units: [
          {
            unit_id: "ORION-LIVE-99",
            bay: "C-08",
            model: "XFORCE",
            trim: "ULTIMATE CVT",
            vin: "MMBXF999999",
            color: "Quartz White",
            status_label: "Critical Battery Drain",
            state: "CRITICAL",
            in_yard: true,
            online_status: "OFFLINE",
            connection_badge: "OFFLINE / DEEP SLEEP",
            buffer_used: 2,
            telemetry: {
              unit_id: "ORION-LIVE-99",
              v_bat: 11.72,
              adc_raw_mv: 2152,
              boot: 9,
              seq: 102,
              sync_ssid: "POCOF6",
            },
          },
        ],
      },
      UNITS[0]!.unit_id,
    );

    expect(next).not.toBe(before);
    expect(next).toHaveLength(before.length + 1);
    const added = next.find((u) => u.unit_id === "ORION-LIVE-99");
    expect(added).toBeDefined();
    expect(added?.bay).toBe("C-08");
    expect(added?.model).toBe("XFORCE");
    expect(added?.telemetry.v_bat).toBe(11.72);
    expect(added?.telemetry.sync_ssid).toBe("POCOF6");
  });
});
