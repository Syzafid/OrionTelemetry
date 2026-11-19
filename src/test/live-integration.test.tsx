import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { CommandPaletteModal } from "@/components/hmi/CommandPaletteModal";
import { ComponentNodeInspector } from "@/components/hmi/ComponentNodeInspector";
import { ShowroomModule } from "@/components/hmi/ShowroomModule";
import { DEFAULT_CONFIG, UNITS, type VehicleUnit } from "@/data/mockTelemetry";

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

function LiveSwitchProbe() {
  const { dataSource, setDataSource, tickets, auditLogs, movement } = useTelemetry();
  return (
    <div>
      <button type="button" onClick={() => setDataSource("LIVE_API")}>
        Mode Live
      </button>
      <button type="button" onClick={() => setDataSource("SIMULATOR")}>
        Mode Sim
      </button>
      <div
        data-testid="sync-probe"
        data-source={dataSource}
        data-tickets={JSON.stringify(tickets.map((t) => t.ticket_code))}
        data-audit={JSON.stringify(auditLogs.map((a) => a.event_type))}
        data-movement={movement.length}
      />
      <CommandPaletteModal
        open={true}
        onClose={() => {}}
        alarmArmed={false}
        onToggleAlarm={() => {}}
      />
    </div>
  );
}

function ShowroomLiveHarness() {
  const { setDataSource } = useTelemetry();
  return (
    <>
      <button type="button" onClick={() => setDataSource("LIVE_API")}>
        Switch Live
      </button>
      <ShowroomModule active={true} />
    </>
  );
}

describe("Cross-System Live API Honesty & State Isolation", () => {
  it("resets sectionHashesRef on LIVE -> SIM -> LIVE switch and restricts CommandPaletteModal to live units/actions", async () => {
    const livePayload = {
      status: "OK",
      mass_disconnect_guard: false,
      units: [
        {
          ...UNITS[0]!,
          unit_id: "MITSUBISHI-STOCK-01",
          online_status: "OFFLINE",
          connection_badge: "OFFLINE / DEEP SLEEP",
          last_seen: "2026-11-18 17:18:41",
          buffer_used: 0,
        },
      ],
      configs: { "MITSUBISHI-STOCK-01": DEFAULT_CONFIG("MITSUBISHI-STOCK-01") },
      history: {
        "MITSUBISHI-STOCK-01": [{ t: "17:18:41", v: 12.54, ts: 1794997118 }],
      },
      movement: [],
      movement_pairs: [],
      audit_logs: [
        {
          id: 189,
          unit_id: "MITSUBISHI-STOCK-01",
          event_type: "BURST_SYNC",
          severity: "INFO",
          message: "Live burst audit check",
          created_at: "2026-11-18 16:59:06",
        },
      ],
      tickets: [],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => livePayload,
    }) as unknown as typeof fetch;

    render(
      <MotionConfig reducedMotion="always">
        <LazyMotion features={domAnimation}>
          <TelemetryProvider>
            <LiveSwitchProbe />
          </TelemetryProvider>
        </LazyMotion>
      </MotionConfig>,
    );

    // 1. Switch SIMULATOR -> LIVE_API: only 1 live unit & zero dummy actions in CommandPalette
    fireEvent.click(screen.getByRole("button", { name: "Mode Live" }));

    await waitFor(() => {
      const probe = screen.getByTestId("sync-probe");
      expect(probe).toHaveAttribute("data-tickets", "[]");
      expect(probe).toHaveAttribute("data-audit", '["BURST_SYNC"]');
    });

    expect(screen.getByText(/Stock Yard Fleet Directory \(1 Matched\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/MITSUBISHI-STOCK-08/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Toggle Fleet Scale/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trigger Burst Sync Simulation/i)).not.toBeInTheDocument();

    // 2. Switch LIVE_API -> SIMULATOR -> LIVE_API again: dummy tickets/audit must be cleared, not stuck by sectionHashesRef
    fireEvent.click(screen.getByRole("button", { name: "Mode Sim" }));
    await waitFor(() => {
      const probe = screen.getByTestId("sync-probe");
      expect(probe.getAttribute("data-tickets")).toContain("TKT-0401");
      expect(screen.getByText(/Toggle Fleet Scale/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Mode Live" }));
    await waitFor(() => {
      const probe = screen.getByTestId("sync-probe");
      expect(probe).toHaveAttribute("data-tickets", "[]");
      expect(probe).toHaveAttribute("data-audit", '["BURST_SYNC"]');
      expect(probe).toHaveAttribute("data-movement", "0");
    });
  }, 15000);

  it("guards ComponentNodeInspector & ShowroomModule against synthetic sparkline and fake LIVE (0) queue when offline", async () => {
    const hotspotUnit: VehicleUnit = {
      ...UNITS[0]!,
      unit_id: "MITSUBISHI-STOCK-01",
      in_yard: false,
      net_zone: "TECH_HOTSPOT",
      sync_ssid: "POCOF5",
      online_status: "ONLINE",
      connection_badge: "LIVE / TECH HOTSPOT",
      last_seen: "2026-11-18 17:18:41",
      buffer_used: 0,
      telemetry: {
        ...UNITS[0]!.telemetry,
        v_bat: 12.54,
        adc_raw_mv: 2305,
        net_zone: "TECH_HOTSPOT",
        sync_ssid: "POCOF5",
      },
    };

    const offlineUnit: VehicleUnit = {
      ...hotspotUnit,
      in_yard: true,
      net_zone: "YARD",
      sync_ssid: "POCOF6",
      online_status: "OFFLINE",
      connection_badge: "OFFLINE / DEEP SLEEP",
    };

    // ComponentNodeInspector in LIVE_API with empty historyPoints must fall back to 1 real point (not 24-pt voltageHistory)
    render(
      <ComponentNodeInspector
        unit={offlineUnit}
        activeNode="battery"
        isLiveApi={true}
        config={DEFAULT_CONFIG(offlineUnit.unit_id)}
        historyPoints={[]}
      />,
    );
    expect(screen.getAllByText(/1 sampel \(12\.54V\.\.12\.54V\)/i).length).toBeGreaterThan(0);

    cleanup();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        units: [hotspotUnit],
        configs: { "MITSUBISHI-STOCK-01": DEFAULT_CONFIG("MITSUBISHI-STOCK-01") },
        history: {},
        movement: [],
        audit_logs: [],
        tickets: [],
      }),
    }) as unknown as typeof fetch;

    render(
      <MotionConfig reducedMotion="always">
        <LazyMotion features={domAnimation}>
          <TelemetryProvider>
            <ShowroomLiveHarness />
          </TelemetryProvider>
        </LazyMotion>
      </MotionConfig>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch Live" }));
    await waitFor(() => {
      expect(screen.getAllByText("LIVE / TECH HOTSPOT").length).toBeGreaterThanOrEqual(2);
    });

    // Re-mock as offline deep sleep & re-render cleanly to verify KOSONG (0) replaces LIVE (0)
    cleanup();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        units: [offlineUnit],
        configs: { "MITSUBISHI-STOCK-01": DEFAULT_CONFIG("MITSUBISHI-STOCK-01") },
        history: {},
        movement: [],
        audit_logs: [],
        tickets: [],
      }),
    }) as unknown as typeof fetch;

    render(
      <MotionConfig reducedMotion="always">
        <LazyMotion features={domAnimation}>
          <TelemetryProvider>
            <ShowroomLiveHarness />
          </TelemetryProvider>
        </LazyMotion>
      </MotionConfig>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch Live" }));
    await waitFor(() => {
      expect(screen.getByText("KOSONG (0)")).toBeInTheDocument();
    });
    expect(screen.queryByText("LIVE (0)")).not.toBeInTheDocument();
  }, 15000);
});
