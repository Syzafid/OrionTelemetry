import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { PresenceModule } from "@/components/hmi/PresenceModule";
import {
  evaluateMassDisconnectGuard,
  formatTripDuration,
  resolveRawDebounceLabel,
  resolveRawEventStatus,
} from "@/lib/presence-analytics";
import { EXPANDED_YARD_UNITS, UNITS, type MovementEvent } from "@/data/mockTelemetry";

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

function PresenceTestHarness({ showLiveToggle = false }: { showLiveToggle?: boolean }) {
  const { setDataSource, activeModule, selectedId } = useTelemetry();
  return (
    <>
      <div data-testid="telemetry-bridge" data-module={activeModule} data-selected={selectedId} />
      {showLiveToggle && (
        <button type="button" onClick={() => setDataSource("LIVE_API")}>
          Switch Live Test
        </button>
      )}
      <PresenceModule />
    </>
  );
}

function renderPresence(showLiveToggle = false) {
  return render(
    <MotionConfig reducedMotion="always">
      <LazyMotion features={domAnimation}>
        <TelemetryProvider>
          <PresenceTestHarness showLiveToggle={showLiveToggle} />
        </TelemetryProvider>
      </LazyMotion>
    </MotionConfig>,
  );
}

describe("Menu 05 Presence Analytics (Pure Logic)", () => {
  it("prevents false Mass Disconnect alarm on 1-unit fleets and triggers at >= 66% on >= 2 units", () => {
    const singleAwayUnit = [{ ...UNITS[0]!, in_yard: false }];
    const singleEval = evaluateMassDisconnectGuard(singleAwayUnit, false, false);
    expect(singleEval.active).toBe(false);
    expect(singleEval.totalUnits).toBe(1);
    expect(singleEval.awayCount).toBe(1);
    expect(singleEval.reasonText).toContain("Mode node tunggal");

    const sixFleet = EXPANDED_YARD_UNITS.slice(0, 6);
    const sixFleetThreeAway = sixFleet.map((u, idx) => ({ ...u, in_yard: idx >= 3 }));
    const underThreshold = evaluateMassDisconnectGuard(sixFleetThreeAway, false, false);
    expect(underThreshold.thresholdCount).toBe(4);
    expect(underThreshold.active).toBe(false);

    const sixFleetFourAway = sixFleet.map((u, idx) => ({ ...u, in_yard: idx >= 4 }));
    const overThreshold = evaluateMassDisconnectGuard(sixFleetFourAway, false, false);
    expect(overThreshold.active).toBe(true);
    expect(overThreshold.reasonText).toContain("4/6 unit terputus serentak");

    const liveRespectsBackend = evaluateMassDisconnectGuard(sixFleetFourAway, true, false);
    expect(liveRespectsBackend.active).toBe(false);

    const liveTrue = evaluateMassDisconnectGuard(sixFleetThreeAway, true, true);
    expect(liveTrue.active).toBe(true);
  });

  it("formats trip duration cleanly including seconds, clock-adjusted prefix, and null fallback", () => {
    expect(formatTripDuration(49)).toBe("49d");
    expect(formatTripDuration(2213)).toBe("36m 53d");
    expect(formatTripDuration(2213, null, true)).toBe("~36m 53d");
    expect(formatTripDuration(5400)).toBe("1j 30m");
    expect(formatTripDuration(90000)).toBe("1h 1j");
    expect(formatTripDuration(null, 51)).toBe("51m");
    expect(formatTripDuration(null, null)).toBe("--");
  });

  it("resolves firmware hysteresis labels and raw event closure status honestly", () => {
    const enterEv: MovementEvent = {
      id: "MV-ENTER-1",
      unit_id: "MITSUBISHI-STOCK-01",
      departed: "2026-11-18 16:40:00",
      returned: "2026-11-18 16:40:00",
      away_min: 0,
      debounce_hits: 2,
      tag: null,
      event_type: "ENTER_YARD",
    };
    expect(resolveRawDebounceLabel(enterEv)).toBe("2/2 masuk");
    expect(resolveRawEventStatus(enterEv)).toEqual({
      isStillAway: false,
      label: "2026-11-18 16:40:00",
    });

    const closedExitEv: MovementEvent = {
      id: "MV-EXIT-1",
      unit_id: "MITSUBISHI-STOCK-01",
      departed: "2026-11-18 16:00:00",
      returned: null,
      away_min: 36,
      debounce_hits: 3,
      tag: null,
      event_type: "EXIT_YARD",
      masih_di_luar: false,
    };
    expect(resolveRawDebounceLabel(closedExitEv)).toBe("3/3 keluar");
    expect(resolveRawEventStatus(closedExitEv)).toEqual({
      isStillAway: false,
      label: "Selesai (Tutup)",
    });

    const openExitEv: MovementEvent = {
      ...closedExitEv,
      id: "MV-EXIT-2",
      masih_di_luar: true,
    };
    expect(resolveRawEventStatus(openExitEv)).toEqual({
      isStillAway: true,
      label: "Di Luar Yard",
    });
  });
});

describe("Menu 05 PresenceModule (SIMULATOR Workflows, Queue & Navigation)", () => {
  it("renders Indonesian presence workspace without fake 0x3FF0 hex masks and supports filter + empty-state reset", () => {
    renderPresence(false);

    expect(screen.getByText(/Proteksi Putus Wi-Fi Massal/i)).toBeInTheDocument();
    expect(screen.queryByText(/0x3FF0/i)).not.toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();

    const semuaBtn = screen.getByRole("button", { name: /^Semua\s+\d+$/i });
    const inYardBtn = screen.getByRole("button", { name: /^Di Dalam Yard\b/i });
    const outYardBtn = screen.getByRole("button", { name: /^Di Luar Yard\b/i });
    expect(semuaBtn).toHaveAttribute("aria-pressed", "true");
    expect(inYardBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(outYardBtn);
    expect(outYardBtn).toHaveAttribute("aria-pressed", "true");
    expect(semuaBtn).toHaveAttribute("aria-pressed", "false");

    const searchInput = screen.getByLabelText("Cari unit presensi dan log pergerakan");
    fireEvent.change(searchInput, { target: { value: "UNIT-TIDAK-ADA-999" } });

    expect(screen.getAllByRole("button", { name: "Reset Filter" }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Reset Filter" })[0]!);
    expect((searchInput as HTMLInputElement).value).toBe("");
    expect(semuaBtn).toHaveAttribute("aria-pressed", "true");
  }, 15000);

  it("simulates 28-slot LittleFS spillover and resets queue via Konfirmasi / Reset Antrean", () => {
    renderPresence(false);

    const spilloverBtn = screen.getByRole("button", { name: "Simulasi 28 Data Offline" });
    fireEvent.click(spilloverBtn);

    expect(screen.getByText(/\+8 rekaman di LittleFS/i)).toBeInTheDocument();
    expect(screen.getByText(/28 rekaman tertahan/i)).toBeInTheDocument();

    const flushBtn = screen.getByRole("button", { name: /Konfirmasi \/ Reset Antrean/i });
    fireEvent.click(flushBtn);

    expect(screen.queryByText(/\+8 rekaman di LittleFS/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/28 rekaman tertahan/i)).not.toBeInTheDocument();
    expect(screen.getByText(/0\/20 terisi/i)).toBeInTheDocument();
    expect(screen.getByText(/^Antrean Kosong \(/i)).toBeInTheDocument();
  }, 15000);

  it("tags operational events, switches Paired vs Raw 4-Zone views and unit scope, and navigates to Menu 01/06", () => {
    renderPresence(false);

    const table = screen.getByRole("table");
    const detailingBtns = within(table).getAllByRole("button", { name: "Detailing" });
    fireEvent.click(detailingBtns[0]!);

    const firstRow = within(table).getAllByRole("row")[1]!;
    expect(within(firstRow).getByRole("button", { name: "Detailing" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const rawToggle = screen.getByRole("button", { name: "Transisi 4-Zona" });
    fireEvent.click(rawToggle);
    expect(rawToggle).toHaveAttribute("aria-pressed", "true");

    const scopeBtn = screen.getByRole("button", { name: /Unit [A-Z0-9-]+/i });
    fireEvent.click(scopeBtn);
    expect(scopeBtn).toHaveAttribute("aria-pressed", "true");

    const pairedToggle = screen.getByRole("button", { name: "Sesi Keluar-Masuk" });
    fireEvent.click(pairedToggle);
    expect(pairedToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Topologi & RF \(01\)/i }));
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute("data-module", "01");

    fireEvent.click(screen.getByRole("button", { name: /Config Debounce \(06\)/i }));
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute("data-module", "06");
  }, 15000);
});

describe("Menu 05 PresenceModule (LIVE_API Honesty & Pre-NTP Clock Pairing)", () => {
  it("honestly reflects single offline away node, OFFLINE / DEEP SLEEP queue, clock_adjusted duration, 2/2 masuk raw mode, and BURST_SYNC audit trail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        mass_disconnect_guard: false,
        units: [
          {
            ...UNITS[0]!,
            unit_id: "MITSUBISHI-STOCK-01",
            bay: "YARD",
            model: "XPANDER-ULT",
            status_label: "OFFLINE",
            state: "OFFLINE",
            in_yard: false,
            online_status: "OFFLINE",
            connection_badge: "OFFLINE / DEEP SLEEP",
            last_seen: "2026-11-18 17:18:41",
            sync_ssid: "POCOF6",
            net_zone: "OFFLINE",
            buffer_used: 0,
            telemetry: {
              ...UNITS[0]!.telemetry,
              unit_id: "MITSUBISHI-STOCK-01",
              sync_ssid: "POCOF6",
              net_zone: "OFFLINE",
              buffer_used: 0,
            },
          },
        ],
        configs: {},
        history: {},
        movement: [
          {
            id: "MV-783825-29-8771-IN",
            unit_id: "MITSUBISHI-STOCK-01",
            event_type: "ENTER_YARD",
            from_zone: "OFFLINE",
            to_zone: "YARD",
            departed: "2026-11-18 17:04:08",
            returned: "2026-11-18 17:04:08",
            away_min: 0,
            debounce_hits: 2,
            tag: null,
          },
          {
            id: "MV-783825-25-8612-OUT",
            unit_id: "MITSUBISHI-STOCK-01",
            event_type: "EXIT_YARD",
            from_zone: "YARD",
            to_zone: "OFFLINE",
            departed: "2026-01-06 00:00:48",
            returned: "2026-11-18 17:04:08",
            paired_return_time: "2026-11-18 17:04:08",
            away_min: 37,
            durasi_di_luar_sec: 2213,
            masih_di_luar: false,
            clock_adjusted: true,
            debounce_hits: 3,
            tag: "Test Drive",
          },
        ],
        movement_pairs: [
          {
            exit_id: "MV-783825-25-8612-OUT",
            exit_epoch: 1767657648,
            enter_id: "MV-783825-29-8771-IN",
            enter_epoch: 1794992648,
            unit_id: "MITSUBISHI-STOCK-01",
            exit_time: "2026-01-06 00:00:48",
            enter_time: "2026-11-18 17:04:08",
            durasi_di_luar_sec: 2213,
            masih_di_luar: false,
            clock_adjusted: true,
            from_zone: "YARD",
            to_zone: "OFFLINE",
            return_from_zone: "OFFLINE",
            debounce_hits: 3,
            tag: "Test Drive",
          },
        ],
        audit_logs: [
          {
            id: 189,
            unit_id: "MITSUBISHI-STOCK-01",
            event_type: "BURST_SYNC",
            severity: "INFO",
            message: "Flushed 18 buffered frames via POCOF6",
            created_at: "2026-11-18 17:04:09",
          },
        ],
        tickets: [],
      }),
    }) as unknown as typeof fetch;

    renderPresence(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch Live Test" }));

    await waitFor(() => {
      expect(screen.getByText(/Mode node tunggal \(1\/1 di luar yard\)/i)).toBeInTheDocument();
    });

    // Must not falsely raise Proteksi Aktif for 1 node, nor show Sandbox test controls in LIVE_API
    expect(screen.queryByText(/Proteksi Aktif \(Keberangkatan Ditahan\)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Simulasi 28 Data Offline/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Simulasikan Keluar Yard/i }),
    ).not.toBeInTheDocument();

    // Queue panel honestly shows OFFLINE / DEEP SLEEP rather than ONLINE streaming
    expect(screen.getByText(/Antrean Kosong \(OFFLINE \/ DEEP SLEEP\)/i)).toBeInTheDocument();

    // Paired movement table shows clock-adjusted duration (~36m 53d)
    const table = screen.getByRole("table");
    expect(within(table).getByText("~36m 53d")).toBeInTheDocument();

    // Real BURST_SYNC audit trail card displays server event
    expect(screen.getByText(/Riwayat Burst Sync Terkirim \(Audit Server\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Flushed 18 buffered frames via POCOF6/i)).toBeInTheDocument();

    // Raw transition mode displays 2/2 masuk for ENTER_YARD
    fireEvent.click(screen.getByRole("button", { name: "Transisi 4-Zona" }));
    expect(within(screen.getByRole("table")).getByText("2/2 masuk")).toBeInTheDocument();
  }, 15000);
});
