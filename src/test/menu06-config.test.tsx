import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { ConfigModule } from "@/components/hmi/ConfigModule";
import { olsCalibration } from "@/lib/calibration";
import {
  PCB_ADC_PRESETS,
  buildWirePiggybackAck,
  filterAuditLogs,
  formatSleepCfgLabel,
  validateNvsConfigDraft,
  validateOlsCalibrationFit,
} from "@/lib/config-validation";
import { AUDIT_LOGS, DEFAULT_CONFIG, UNITS } from "@/data/mockTelemetry";

let originalFetch: typeof globalThis.fetch;

beforeAll(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function ConfigTestHarness({ showLiveToggle = false }: { showLiveToggle?: boolean }) {
  const { setDataSource, activeModule, selectedId } = useTelemetry();
  return (
    <>
      <div data-testid="telemetry-bridge" data-module={activeModule} data-selected={selectedId} />
      {showLiveToggle && (
        <button type="button" onClick={() => setDataSource("LIVE_API")}>
          Switch Live Test
        </button>
      )}
      <ConfigModule />
    </>
  );
}

function renderConfig(showLiveToggle = false) {
  return render(
    <MotionConfig reducedMotion="always">
      <LazyMotion features={domAnimation}>
        <TelemetryProvider>
          <ConfigTestHarness showLiveToggle={showLiveToggle} />
        </TelemetryProvider>
      </LazyMotion>
    </MotionConfig>,
  );
}

describe("Menu 06 Config Validation & Wire Contract (Pure Helpers)", () => {
  it("formats sleep_cfg labels matching db.php::formatSleepCfgLabel()", () => {
    expect(formatSleepCfgLabel(300)).toBe("5 Minutes");
    expect(formatSleepCfgLabel(1800)).toBe("30 Minutes");
    expect(formatSleepCfgLabel(3600)).toBe("1 Hour");
    expect(formatSleepCfgLabel(21600)).toBe("6 Hours");
    expect(formatSleepCfgLabel(45)).toBe("45 Seconds");
    expect(formatSleepCfgLabel(1)).toBe("10 Seconds");
  });

  it("builds honest HTTP 200 JSON Piggyback ACK matching simpan_data.php", () => {
    const idleCfg = DEFAULT_CONFIG("MITSUBISHI-STOCK-01");
    expect(idleCfg.cal_offset).toBe(0.069);
    expect(buildWirePiggybackAck(idleCfg, 1)).toEqual({
      status: "ok",
      saved: 1,
      pending_ack: false,
    });

    const stagedCfg = {
      ...idleCfg,
      crit_v: 11.75,
      sleep_cfg: 3600,
      cal_slope: 0.0047037,
      cal_offset: 0.16,
      pending_ack: true,
    };
    const wire = buildWirePiggybackAck(stagedCfg, 1);
    expect(wire).toEqual({
      status: "ok",
      saved: 1,
      pending_ack: true,
      crit_v: 11.75,
      slope_m: 0.0047037,
      offset_c: 0.16,
      sleep_cfg: "1 Hour",
    });
    expect("target" in wire).toBe(false);
    expect("fast_poll_s" in wire).toBe(false);
    expect("apply_on" in wire).toBe(false);
  });

  it("validates NVS parameters and OLS calibration limits matching firmware guardrails", () => {
    expect(
      validateNvsConfigDraft({ crit_v: 11.85, sleep_cfg: 3600, debounce_cnt: 3, fast_poll_s: 10 })
        .valid,
    ).toBe(true);
    expect(
      validateNvsConfigDraft({ crit_v: 5.0, sleep_cfg: 300, debounce_cnt: 3, fast_poll_s: 10 })
        .valid,
    ).toBe(false);
    expect(
      validateNvsConfigDraft({ crit_v: 16.0, sleep_cfg: 300, debounce_cnt: 3, fast_poll_s: 10 })
        .valid,
    ).toBe(false);
    expect(
      validateNvsConfigDraft({ crit_v: 11.8, sleep_cfg: 300, debounce_cnt: 3, fast_poll_s: 2 })
        .valid,
    ).toBe(false);

    const pcbV1Fit = olsCalibration(
      PCB_ADC_PRESETS["1"].points.map((p) => ({ dmm: Number(p.dmm), mv: Number(p.mv) })),
    );
    expect(validateOlsCalibrationFit(pcbV1Fit, 4).valid).toBe(true);

    const pcbV2Fit = olsCalibration(
      PCB_ADC_PRESETS["2"].points.map((p) => ({ dmm: Number(p.dmm), mv: Number(p.mv) })),
    );
    expect(validateOlsCalibrationFit(pcbV2Fit, 4).valid).toBe(true);
    expect(pcbV2Fit.slope).toBeCloseTo(0.00471, 4);
    expect(pcbV2Fit.offset).toBeCloseTo(0.1486, 3);

    const badFit = validateOlsCalibrationFit({ slope: 0.0002, offset: 3.1, rSquared: 0.85 }, 4);
    expect(badFit.valid).toBe(false);
    expect(badFit.errors.length).toBe(3);
  });

  it("filters audit logs accurately by query, severity, and unit scope", () => {
    const critLogs = filterAuditLogs(AUDIT_LOGS, "", "CRITICAL");
    expect(critLogs.every((l) => l.severity === "CRITICAL")).toBe(true);

    const unit01Info = filterAuditLogs(AUDIT_LOGS, "0.069", "INFO", "MITSUBISHI-STOCK-01");
    expect(unit01Info).toHaveLength(1);
    expect(unit01Info[0]?.event_type).toBe("ADC_CALIBRATION");
  });
});

describe("Menu 06 ConfigModule (ARIA Tabs, Onboarding, NVS/OLS, Tickets & Navigation)", () => {
  it("supports ARIA tablist keyboard navigation and clean empty onboarding form + Sandbox example + register/unpair/re-pair", async () => {
    renderConfig(false);

    const tab1 = screen.getByRole("tab", { name: /01\. Pendaftaran/i });
    const tab2 = screen.getByRole("tab", { name: /02\. Pengaturan & Kalibrasi Tegangan/i });
    const tab3 = screen.getByRole("tab", { name: /03\. Tiket Penanganan/i });

    expect(tab1).toHaveAttribute("aria-selected", "true");
    tab1.focus();
    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    expect(tab2).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(tab2);

    fireEvent.keyDown(tab2, { key: "End" });
    expect(tab3).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab3, { key: "Home" });
    expect(tab1).toHaveAttribute("aria-selected", "true");

    // Onboarding fields must start clean (no fabricated default VIN/MAC/model)
    const nodeIdInput = screen.getByLabelText("Unit Node ID") as HTMLInputElement;
    const vinInput = screen.getByLabelText(/Nomor Rangka/i) as HTMLInputElement;
    expect(nodeIdInput.value).toBe("");
    expect(vinInput.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Isi Contoh Data" }));
    expect(nodeIdInput.value).toBe("MITSUBISHI-STOCK-13");
    expect(vinInput.value).toBe("MMBXFUJ40SH000877");

    fireEvent.click(screen.getByRole("button", { name: /Daftarkan Unit Baru & Antrekan NVS/i }));
    await waitFor(() => {
      expect(screen.getByText(/Node MITSUBISHI-STOCK-13/i)).toBeInTheDocument();
    });

    // Directory search, empty state reset, unpair & re-pair
    const dirSearch = screen.getByLabelText("Cari node terdaftar") as HTMLInputElement;
    fireEvent.change(dirSearch, { target: { value: "TIDAK-DITEMUKAN" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Pencarian" }));
    expect(dirSearch.value).toBe("");

    const detachBtns = screen.getAllByRole("button", { name: "Lepas Node" });
    fireEvent.click(detachBtns[0]!);
    expect(screen.getByText("Terlepas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Simpan Penautan Ulang" }));
    await waitFor(() => {
      expect(screen.getByText(/berhasil ditautkan ulang/i)).toBeInTheDocument();
    });
  }, 15000);

  it("stages NVS ACK with 1 Hour sleep preset, rejects invalid crit_v, applies PCB v2.0 OLS calibration, and updates tickets + audit", async () => {
    renderConfig(false);

    fireEvent.click(screen.getByRole("tab", { name: /02\. Pengaturan & Kalibrasi Tegangan/i }));

    // Initially pending_ack is false on DEFAULT_CONFIG
    expect(screen.getByText(/Sinkron \(pending_ack: false\)/i)).toBeInTheDocument();

    // Validation blocks out-of-bounds crit_v (< 5.0V)
    const critInput = screen.getByLabelText(/Ambang Voltase Kritis \(crit_v\)/i);
    const saveNvsBtn = screen.getByRole("button", { name: /Simpan & Antrekan ACK NVS/i });
    fireEvent.change(critInput, { target: { value: "4.50" } });
    expect(saveNvsBtn).toBeDisabled();
    expect(screen.getByText(/harus berada di rentang > 5\.0V/i)).toBeInTheDocument();

    // Restore valid crit_v + pick 3600s (1 Hour) and submit draft
    fireEvent.change(critInput, { target: { value: "11.85" } });
    fireEvent.change(screen.getByLabelText(/Interval Deep Sleep \(sleep_cfg\)/i), {
      target: { value: "3600" },
    });
    expect(saveNvsBtn).not.toBeDisabled();
    fireEvent.click(saveNvsBtn);

    await waitFor(() => {
      expect(screen.getByText(/Antrean Aktif \(pending_ack: true\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/"sleep_cfg": "1 Hour"/i)).toBeInTheDocument();

    // Load PCB v2.0 preset and verify R² alert if corrupted, then restore & save OLS
    fireEvent.click(screen.getByRole("button", { name: /Muat Preset PCB v2\.0/i }));
    const saveCalBtn = screen.getByRole("button", {
      name: /Simpan Parameter Kalibrasi ke NVS Flash/i,
    });
    expect(saveCalBtn).not.toBeDisabled();

    const dmm1 = screen.getByLabelText("Titik #1 Tegangan DMM (V)") as HTMLInputElement;
    fireEvent.change(dmm1, { target: { value: "25.00" } });
    expect(saveCalBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Muat Preset PCB v2\.0/i }));
    expect(saveCalBtn).not.toBeDisabled();
    fireEvent.click(saveCalBtn);

    await waitFor(() => {
      expect(screen.getByText(/Kalibrasi ADC \(m=0\.0047/i)).toBeInTheDocument();
    });

    // Sub-Tab 03: Ticket handover & full audit message visibility + cross-nav to Menu 04 & 05
    fireEvent.click(screen.getByRole("tab", { name: /03\. Tiket Penanganan/i }));
    const assigneeInput = screen.getByLabelText("Nama Teknisi Bertugas") as HTMLInputElement;
    expect(assigneeInput.value).toBe("");

    fireEvent.change(assigneeInput, { target: { value: "Budi Santoso" } });
    fireEvent.change(screen.getByLabelText("Catatan Handover Shift"), {
      target: { value: "Siap pengisian ulang AC charger." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Klaim Dikerjakan" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Status tiket MITSUBISHI-STOCK-01 diperbarui menjadi DIKERJAKAN/i),
      ).toBeInTheDocument();
    });

    const auditTable = screen.getByRole("table");
    expect(within(auditTable).getByText(/Budi Santoso/i)).toBeInTheDocument();

    // Filter audit severity + reset
    fireEvent.change(screen.getByLabelText("Cari log audit sistem"), {
      target: { value: "PESAN-TIDAK-ADA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset Filter Audit" }));
    expect(within(screen.getByRole("table")).getByText(/Budi Santoso/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Diagnostik OBD \(04\)/i }));
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute("data-module", "04");

    fireEvent.click(screen.getByRole("button", { name: /Presensi & Debounce \(05\)/i }));
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute("data-module", "05");
  }, 15000);
});

describe("Menu 06 ConfigModule (LIVE_API Honesty & Persistence Contract)", () => {
  it("hides Sandbox fill controls, displays real pending_ack=false wire JSON, empty tickets state, BURST_SYNC messages, and posts UPDATE_CONFIG cleanly", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        if (urlStr.includes("update_config.php")) {
          return {
            ok: true,
            json: async () => ({
              status: "OK",
              action: "UPDATE_CONFIG",
              unit_id: "MITSUBISHI-STOCK-01",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            status: "OK",
            units: [
              {
                ...UNITS[0]!,
                unit_id: "MITSUBISHI-STOCK-01",
                bay: "YARD",
                online_status: "OFFLINE",
                connection_badge: "OFFLINE / DEEP SLEEP",
                last_seen: "2026-11-18 17:18:41",
              },
            ],
            configs: {
              "MITSUBISHI-STOCK-01": {
                unit_id: "MITSUBISHI-STOCK-01",
                sleep_cfg: 300,
                fast_poll_s: 10,
                crit_v: 11.85,
                debounce_cnt: 3,
                cal_slope: 0.005412,
                cal_offset: 0.069,
                pending_ack: false,
              },
            },
            history: {},
            movement: [],
            audit_logs: [
              {
                id: 189,
                unit_id: "MITSUBISHI-STOCK-01",
                event_type: "BURST_SYNC",
                severity: "INFO",
                message: "Burst sync ingested 2 offline record(s) from Two-Tier RTC/Flash buffer.",
                created_at: "2026-11-18 16:59:06",
              },
            ],
            tickets: [],
          }),
        };
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderConfig(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch Live Test" }));

    await waitFor(() => {
      expect(screen.getAllByText(/OFFLINE \/ DEEP SLEEP/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/0\.0690/i).length).toBeGreaterThan(0);

    // Sandbox button must stay hidden in LIVE_API
    expect(
      screen.queryByRole("button", { name: /^Isi Contoh Data$/i }),
    ).not.toBeInTheDocument();

    // Check Sub-Tab 02 honest wire JSON (pending_ack: false) and POST mutation
    fireEvent.click(screen.getByRole("tab", { name: /02\. Pengaturan & Kalibrasi Tegangan/i }));
    expect(screen.getByText(/Sinkron \(pending_ack: false\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/"apply_on"/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Ambang Voltase Kritis \(crit_v\)/i), {
      target: { value: "11.75" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Simpan & Antrekan ACK NVS/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([u]) => String(u).includes("update_config.php"));
      expect(postCall).toBeDefined();
      const body = JSON.parse(String((postCall![1] as RequestInit).body));
      expect(body).toMatchObject({
        action: "UPDATE_CONFIG",
        unit_id: "MITSUBISHI-STOCK-01",
        crit_v: 11.75,
        sleep_cfg: 300,
      });
    });

    // Check Sub-Tab 03 honest empty tickets state and full BURST_SYNC audit message
    fireEvent.click(screen.getByRole("tab", { name: /03\. Tiket Penanganan/i }));
    expect(screen.getByText(/Belum ada tiket pemeliharaan aktif/i)).toBeInTheDocument();
    const auditTable = screen.getByRole("table");
    expect(
      within(auditTable).getByText(/Burst sync ingested 2 offline record\(s\)/i),
    ).toBeInTheDocument();
  }, 15000);
});
