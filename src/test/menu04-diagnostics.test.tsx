import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { DiagnosticsModule } from "@/components/hmi/DiagnosticsModule";
import { computeGaugeGeometry, resolveWiringRows } from "@/lib/obd-diagnostics";
import { UNITS } from "@/data/mockTelemetry";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div style={{ width: 320, height: 180 }}>{children}</div>
    ),
  };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;
let originalFetch: typeof globalThis.fetch;

beforeAll(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

afterAll(() => {
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

function DiagnosticsTestHarness({ showLiveToggle = false }: { showLiveToggle?: boolean }) {
  const { setDataSource, activeModule, selectedId } = useTelemetry();
  return (
    <>
      <div data-testid="telemetry-bridge" data-module={activeModule} data-selected={selectedId} />
      {showLiveToggle && (
        <button type="button" onClick={() => setDataSource("LIVE_API")}>
          Switch Live Test
        </button>
      )}
      <DiagnosticsModule />
    </>
  );
}

function renderDiagnostics(showLiveToggle = false) {
  return render(
    <MotionConfig reducedMotion="always">
      <LazyMotion features={domAnimation}>
        <TelemetryProvider>
          <DiagnosticsTestHarness showLiveToggle={showLiveToggle} />
        </TelemetryProvider>
      </LazyMotion>
    </MotionConfig>,
  );
}

describe("Menu 04 DiagnosticsModule (OBD-II Honesty, Accessibility & Pure Helpers)", () => {
  it("clamps needle geometry cleanly when value exceeds max and accurately classifies wiring rows", () => {
    const atMax = computeGaugeGeometry(5000, 5000, 4200);
    const overMax = computeGaugeGeometry(9500, 5000, 4200);
    expect(overMax.needleEnd[0]).toBeCloseTo(atMax.needleEnd[0], 4);
    expect(overMax.needleEnd[1]).toBeCloseTo(atMax.needleEnd[1], 4);

    const standbyUnit = {
      ...UNITS[0]!,
      telemetry: {
        ...UNITS[0]!.telemetry,
        v_bat: 11.82,
        adc_raw_mv: 2170,
        engine_on: false,
        crit_alert: false,
        can_ok: true,
      },
    };
    const rows = resolveWiringRows(standbyUnit, 11.85);
    const w01 = rows.find((r) => r.id === "W-01");
    const w02 = rows.find((r) => r.id === "W-02");
    const w03 = rows.find((r) => r.id === "W-03");
    const w04 = rows.find((r) => r.id === "W-04");

    expect(w01?.liveStatus).toBe("WARN");
    expect(w02?.sourceKind).toBe("REFERENSI");
    expect(w03?.sourceKind).toBe("REFERENSI");
    expect(w04?.liveReading).toMatch(/Pulsa 40ms/i);
  });

  it("supports accessible tablist ARIA roles and keyboard navigation across all 3 tabs", () => {
    renderDiagnostics();

    const tablist = screen.getByRole("tablist", { name: /Kategori Diagnostik OBD-II/i });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: /02\. Emisi, BBM & DTC/i })).toBeInTheDocument();

    fireEvent.keyDown(tabs[1]!, { key: "ArrowRight" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tabpanel", { name: /03\. Kelistrikan & Pinout CAN/i }),
    ).toBeInTheDocument();

    fireEvent.keyDown(tabs[2]!, { key: "ArrowLeft" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  });

  it("handles interactive Simulator workflow (Engine ON, Mode 03 DTC inspection, Search & Cross-Module)", () => {
    renderDiagnostics();

    expect(screen.getByText(/Mesin Standby \(0 RPM\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Simulasikan Mesin ON/i }));
    expect(screen.getByText("03m 00d")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Putaran \(Diesel\): 850 RPM/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Simulasi DTC P0133/i }));
    fireEvent.click(screen.getByRole("tab", { name: /02\. Emisi, BBM & DTC \[P0133\]/i }));

    expect(
      screen.getByText(/O2 SENSOR CIRCUIT SLOW RESPONSE \(BANK 1 SENSOR 1\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Langkah Inspeksi SOP Teknisi/i)).toBeInTheDocument();
    expect(screen.getAllByText(/MIL ON \(PERINGATAN\)/i)).toHaveLength(1);

    const searchInput = screen.getByLabelText(/Cari unit diagnostik OBD-II/i);
    fireEvent.change(searchInput, { target: { value: "TIDAKADA" } });
    expect(screen.getByText(/Tidak ada unit cocok/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reset Filter/i }));
    expect(screen.getByRole("button", { name: /A-01 \(PAJERO SPORT\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Buka Tiket Armada \(02\)/i }));
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute("data-module", "02");
  }, 15000);

  it("enforces strict LIVE_API honesty when standby/offline (no fake warmup curve, Mode 07 honesty, CAN Off masking, crit_v threshold)", async () => {
    const historyPts = Array.from({ length: 24 }, (_, idx) => ({
      t: `17:${String(idx).padStart(2, "0")}:00`,
      v: 11.82,
      ts: 1794997000 + idx * 5,
      rpm: 0,
      temp_c: 0,
      engine_on: false,
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        units: [
          {
            ...UNITS[0]!,
            status_label: "Standby (Deep Sleep)",
            state: "STANDBY",
            in_yard: true,
            net_zone: "YARD",
            sync_ssid: "POCOF6",
            online_status: "OFFLINE",
            last_seen_sec: 3600,
            last_seen: "2026-11-18 17:18:41",
            connection_badge: "OFFLINE / DEEP SLEEP",
            buffer_used: 0,
            telemetry: {
              ...UNITS[0]!.telemetry,
              v_bat: 11.82,
              adc_raw_mv: 2170,
              rtc_temp_c: 26.0,
              engine_on: false,
              crit_alert: false,
              rpm: 0,
              temp_c: 0,
              fuel_pct: 74.5,
              dist_clr_km: 1420,
              net_zone: "YARD",
              sync_ssid: "POCOF6",
              ts_epoch: 1794997118,
            },
          },
        ],
        configs: {
          "MITSUBISHI-STOCK-01": {
            unit_id: "MITSUBISHI-STOCK-01",
            sleep_cfg: 21600,
            fast_poll_s: 10,
            crit_v: 11.85,
            debounce_cnt: 3,
            cal_slope: 0.005412,
            cal_offset: 0.069,
            pending_ack: false,
          },
        },
        history: { "MITSUBISHI-STOCK-01": historyPts },
        movement: [],
        audit_logs: [],
        tickets: [],
      }),
    }) as unknown as typeof fetch;

    renderDiagnostics(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch Live Test" }));

    await waitFor(() => {
      expect(screen.getByText(/2026-11-18 17:18:41/i)).toBeInTheDocument();
    });

    // Sandbox test controls & fake warmup curve must not appear in LIVE_API
    expect(screen.queryByRole("button", { name: /Simulasikan Mesin ON/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Simulasi DTC P0133/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Mesin Standby \(0 RPM\) pada 24 Rekaman Terakhir/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/OFFLINE \/ DEEP SLEEP/i).length).toBeGreaterThan(0);

    // Tab 02: Honest Fuel masking (not 74.5% / 50.7L) & honest Mode 07 (not 0 PENDING FAULT)
    fireEvent.click(screen.getByRole("tab", { name: /02\. Emisi, BBM & DTC/i }));
    expect(screen.getAllByText(/STANDBY \(CAN Off\)/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/50\.7 Liter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 PENDING FAULT/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Belum Dipoling \(FW v1\.6\.0\)/i)).toBeInTheDocument();

    // Tab 03: Honest Dist Clr masking (not 1.420 km) & real DB crit_v=11.85 flagging 11.82V
    fireEvent.click(screen.getByRole("tab", { name: /03\. Kelistrikan & Pinout CAN/i }));
    expect(screen.queryByText(/1\.420/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Batas 11\.85V/i).length).toBeGreaterThan(0);
    const batReadout = screen.getByText("11.82");
    expect(batReadout).toHaveClass("text-crimson");
  }, 15000);

  it("plots real LIVE_API engine history and uses exact OEM Xforce 42L fuel tank capacity when engine is ON", async () => {
    const activePts = [
      { t: "10:00:00", v: 14.05, ts: 1794997000, rpm: 1150, temp_c: 72, engine_on: true },
      { t: "10:00:05", v: 14.18, ts: 1794997005, rpm: 920, temp_c: 85, engine_on: true },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        units: [
          {
            ...UNITS[1]!,
            unit_id: "MITSUBISHI-XFORCE-01",
            bay: "A-04",
            model: "XFORCE",
            status_label: "Engine Warm-up Active",
            state: "WARMUP",
            in_yard: true,
            online_status: "ONLINE",
            connection_badge: "LIVE / ONLINE",
            telemetry: {
              ...UNITS[1]!.telemetry,
              unit_id: "MITSUBISHI-XFORCE-01",
              v_bat: 14.18,
              engine_on: true,
              rpm: 920,
              temp_c: 85,
              fuel_pct: 50.0,
              ecu_v: 14.1,
              run_time_s: 245,
            },
          },
        ],
        configs: {},
        history: { "MITSUBISHI-XFORCE-01": activePts },
        movement: [],
        audit_logs: [],
        tickets: [],
      }),
    }) as unknown as typeof fetch;

    renderDiagnostics(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch Live Test" }));

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /Putaran \(Bensin\): 920 RPM/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/Mesin Standby \(0 RPM\)/i)).not.toBeInTheDocument();
    expect(screen.getByText("04m 05d")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /02\. Emisi, BBM & DTC/i }));
    expect(screen.getByText(/Kapasitas OEM 42L \(Bensin\)/i)).toBeInTheDocument();
    expect(screen.getByText(/21\.0 Liter/i)).toBeInTheDocument();
  }, 15000);
});
