import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";

const originalFetch = globalThis.fetch;
const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function VisibilityPollingHarness() {
  const { setDataSource, apiStatus, dataSource } = useTelemetry();
  return (
    <div>
      <button type="button" onClick={() => setDataSource("LIVE_API")}>
        Aktifkan Live API
      </button>
      <span data-testid="live-state">{`${dataSource}:${apiStatus}`}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
  if (originalVisibilityDescriptor) {
    Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
  } else {
    setDocumentVisibility("visible");
  }
});

describe("TelemetryContext visibility-aware polling", () => {
  it("pauses 3s polling while document is hidden and immediately polls again on visible", async () => {
    vi.useFakeTimers();
    setDocumentVisibility("visible");

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          status: "OK",
          units: [
            {
              unit_id: "MITSUBISHI-STOCK-01",
              v_bat: 12.64,
              state: "STANDBY",
              online_status: "ONLINE",
              last_seen_sec: 1,
            },
          ],
        }),
      } as unknown as Response),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <TelemetryProvider>
        <VisibilityPollingHarness />
      </TelemetryProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Aktifkan Live API"));
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("live-state").textContent).toBe("LIVE_API:CONNECTED");

    // Simulate background tab: 9s across 3 polling intervals must trigger zero additional fetches
    setDocumentVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Returning to foreground tab immediately triggers a fresh poll
    setDocumentVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
