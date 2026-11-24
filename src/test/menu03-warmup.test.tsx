import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { WarmupQueueModule } from "@/components/hmi/WarmupQueueModule";
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

function WarmupTestHarness({ showLiveToggle = false }: { showLiveToggle?: boolean }) {
  const { setDataSource, activeModule, selectedId } = useTelemetry();
  return (
    <>
      <div data-testid="telemetry-bridge" data-module={activeModule} data-selected={selectedId} />
      {showLiveToggle && (
        <button type="button" onClick={() => setDataSource("LIVE_API")}>
          Switch Live Test
        </button>
      )}
      <WarmupQueueModule />
    </>
  );
}

function renderWarmup(showLiveToggle = false) {
  return render(
    <MotionConfig reducedMotion="always">
      <LazyMotion features={domAnimation}>
        <TelemetryProvider>
          <WarmupTestHarness showLiveToggle={showLiveToggle} />
        </TelemetryProvider>
      </LazyMotion>
    </MotionConfig>,
  );
}

describe("Menu 03 WarmupQueueModule (UI, Telemetry Honesty & Workflow)", () => {
  it("renders KPI bar with 13.50V threshold, 12 unit pills, priority queue, and allows selecting queued units", () => {
    renderWarmup();

    expect(
      screen.getByText(/Deteksi Otomatis Tegangan Alternator (?:≥|>=) 13\.50V/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Pilih Unit (12):")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /Konsol Pemantauan: Bay A-01/i }),
    ).toBeInTheDocument();

    const queueRegion = screen.getByRole("region", {
      name: /Daftar Prioritas Pemanasan Armada/i,
    });
    const chooseBtns = within(queueRegion).getAllByRole("button", { name: /Pilih/i });
    expect(chooseBtns.length).toBeGreaterThan(0);
    fireEvent.click(chooseBtns[0]!);

    expect(
      screen.queryByRole("region", { name: /Konsol Pemantauan: Bay A-01/i }),
    ).not.toBeInTheDocument();
  });

  it("dispatches warmup staff memo and disables button to prevent duplicate submissions", () => {
    renderWarmup();

    const dispatchBtn = screen.getByRole("button", { name: /Catat Jadwal Pemanasan/i });
    expect(dispatchBtn).not.toBeDisabled();
    fireEvent.click(dispatchBtn);

    const disabledBtn = screen.getByRole("button", { name: /Jadwal Tercatat/i });
    expect(disabledBtn).toBeDisabled();
  });

  it("syncs stopwatch to OBD-II run_time_s (03:00 for 180s) on WARMUP and logs session when turned OFF", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_795_000_000_000);
    try {
      renderWarmup();

      fireEvent.click(screen.getByRole("button", { name: /Simulasikan Kontak Nyala \(ON\)/i }));

      expect(screen.getByText("03:00")).toBeInTheDocument();
      expect(screen.getByText(/Alternator OK \(14\.20V\)/i)).toBeInTheDocument();
      expect(screen.getByText("30%")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Simulasikan Matikan Kunci \(OFF\)/i }));

      const logPanel = screen.getByRole("region", {
        name: /Riwayat Sesi & Penugasan Pemanasan Mesin/i,
      });
      expect(within(logPanel).getByText("03:00")).toBeInTheDocument();
      expect(within(logPanel).getByText("14.20V")).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("eliminates simulator dummy logs in LIVE_API mode and renders real audit dispatch logs cleanly", async () => {
    const liveUnit = UNITS[0]!;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        units: [
          {
            ...liveUnit,
            online_status: "OFFLINE",
            connection_badge: "OFFLINE / DEEP SLEEP",
            last_seen: "2026-11-18 14:20:00",
            last_seen_sec: 300,
            telemetry: {
              ...liveUnit.telemetry,
              v_bat: 12.18,
              run_time_s: 0,
            },
          },
        ],
        history: {
          "MITSUBISHI-STOCK-01": [{ t: "14:20", v: 12.18, ts: 1763450400 }],
        },
        tickets: [],
        audit_logs: [
          {
            id: 77,
            unit_id: "MITSUBISHI-STOCK-01",
            event_type: "WARMUP_DISPATCH",
            severity: "WARN",
            message: "Operator dispatched staff for 10-min engine alternator warm-up",
            created_at: "2026-11-18 14:18:00",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    renderWarmup(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch Live Test" }));

    await waitFor(() => {
      expect(screen.getByText("Pilih Unit (1):")).toBeInTheDocument();
    });

    const logPanel = screen.getByRole("region", {
      name: /Riwayat Sesi & Penugasan Pemanasan Mesin/i,
    });
    expect(within(logPanel).queryByText("XFORCE")).not.toBeInTheDocument();
    expect(within(logPanel).getByText("14:18 WIB")).toBeInTheDocument();
    expect(within(logPanel).getByText("Terjadwal")).toBeInTheDocument();
  });
});
