import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";

const originalFetch = globalThis.fetch;

function FunctionalAuditHarness() {
  const { setDataSource, apiStatus, configs, unpairUnit, updateConfig } = useTelemetry();
  const stock01Cfg = configs["MITSUBISHI-STOCK-01"];
  return (
    <div>
      <button type="button" onClick={() => setDataSource("LIVE_API")}>
        Aktifkan Live
      </button>
      <button type="button" onClick={() => unpairUnit("MITSUBISHI-STOCK-01")}>
        Unpair Unit
      </button>
      <button
        type="button"
        onClick={() =>
          void updateConfig("MITSUBISHI-STOCK-01", { fast_poll_s: 15, debounce_cnt: 4 })
        }
      >
        Update Fast Poll
      </button>
      <span data-testid="api-status">{apiStatus}</span>
      <span data-testid="pending-ack">{String(Boolean(stock01Cfg?.pending_ack))}</span>
      <span data-testid="fast-poll">{String(stock01Cfg?.fast_poll_s ?? "")}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

describe("Functional Audit Fixes (F-03 UNPAIR_UNIT & F-06 NVS pending_ack)", () => {
  it("persists UNPAIR_UNIT and sets pending_ack=true when fast_poll_s or debounce_cnt changes", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("update_config.php")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: "OK" }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          status: "OK",
          units: [
            {
              unit_id: "MITSUBISHI-STOCK-01",
              v_bat: 12.6,
              state: "STANDBY",
              online_status: "ONLINE",
              last_seen_sec: 1,
            },
          ],
          configs: {
            "MITSUBISHI-STOCK-01": {
              unit_id: "MITSUBISHI-STOCK-01",
              sleep_cfg: 300,
              fast_poll_s: 10,
              crit_v: 11.8,
              debounce_cnt: 3,
              cal_slope: 0.005412,
              cal_offset: 0.069,
              pending_ack: false,
            },
          },
        }),
      } as unknown as Response);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <TelemetryProvider>
        <FunctionalAuditHarness />
      </TelemetryProvider>,
    );

    fireEvent.click(screen.getByText("Aktifkan Live"));
    await waitFor(() => {
      expect(screen.getByTestId("api-status").textContent).toBe("CONNECTED");
    });

    fireEvent.click(screen.getByText("Update Fast Poll"));
    await waitFor(() => {
      expect(screen.getByTestId("fast-poll").textContent).toBe("15");
      expect(screen.getByTestId("pending-ack").textContent).toBe("true");
    });

    const updateConfigCall = fetchMock.mock.calls.find(
      ([u, init]) =>
        String(u).includes("update_config.php") &&
        typeof (init as RequestInit | undefined)?.body === "string" &&
        String((init as RequestInit).body).includes('"UPDATE_CONFIG"'),
    );
    expect(updateConfigCall).toBeTruthy();

    fireEvent.click(screen.getByText("Unpair Unit"));
    await waitFor(() => {
      const unpairCall = fetchMock.mock.calls.find(
        ([u, init]) =>
          String(u).includes("update_config.php") &&
          typeof (init as RequestInit | undefined)?.body === "string" &&
          String((init as RequestInit).body).includes('"UNPAIR_UNIT"'),
      );
      expect(unpairCall).toBeTruthy();
      expect(String((unpairCall![1] as RequestInit).body)).toContain("MITSUBISHI-STOCK-01");
    });
  });
});
