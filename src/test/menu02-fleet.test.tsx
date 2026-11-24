import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { FleetModule } from "@/components/hmi/FleetModule";
import { UNITS } from "@/data/mockTelemetry";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div style={{ width: 320, height: 128 }}>{children}</div>
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

function FleetTestHarness({ showLiveToggle = false }: { showLiveToggle?: boolean }) {
  const { setDataSource, activeModule, selectedId } = useTelemetry();
  return (
    <>
      <div data-testid="telemetry-bridge" data-module={activeModule} data-selected={selectedId} />
      {showLiveToggle && (
        <button type="button" onClick={() => setDataSource("LIVE_API")}>
          Switch Live Test
        </button>
      )}
      <FleetModule />
    </>
  );
}

function renderFleet(showLiveToggle = false) {
  return render(
    <MotionConfig reducedMotion="always">
      <LazyMotion features={domAnimation}>
        <TelemetryProvider>
          <FleetTestHarness showLiveToggle={showLiveToggle} />
        </TelemetryProvider>
      </LazyMotion>
    </MotionConfig>,
  );
}

describe("Menu 02 FleetModule (UI, Workflows & Live API Honesty)", () => {
  it("adapts card layout safely across 1-unit, 2-unit, and 3+-unit simulator states and filters/resets", () => {
    renderFleet();

    expect(screen.getByText("Armada: 12 Unit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Semua\s*12$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Kritis/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Peringatan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Normal \/ Mengisi/i })).toBeInTheDocument();

    // 12 units (3+ units simulator deck): 3-column desktop deck classes
    const initialCards = screen.getAllByRole("article");
    expect(initialCards).toHaveLength(12);
    expect(initialCards[0]!.className).toContain("lg:w-[calc((100%-2rem)/3)]");

    // 2 units ("TRITON"): 2-column 50/50 split without single-card 2-col body grid
    const searchInput = screen.getByPlaceholderText(/Cari Bay, Model, VIN, atau kode DTC/i);
    fireEvent.change(searchInput, { target: { value: "TRITON" } });
    const twoCards = screen.getAllByRole("article");
    expect(twoCards).toHaveLength(2);
    expect(twoCards[0]!.className).toContain("lg:w-[calc((100%-1rem)/2)]");
    expect(twoCards[0]!.querySelector(".lg\\:grid-cols-\\[1\\.15fr_1fr\\]")).toBeNull();
    expect(screen.getByText(/Pilih Cepat:/i)).toBeInTheDocument();
    expect(screen.getByText(/Ekspor Excel \(2 Unit\)/i)).toBeInTheDocument();

    // 1 unit ("P0133"): full width + 2-column desktop card body + hidden Pilih Cepat bar
    fireEvent.change(searchInput, { target: { value: "P0133" } });
    const articlesAfterSearch = screen.getAllByRole("article");
    expect(articlesAfterSearch).toHaveLength(1);
    expect(within(articlesAfterSearch[0]!).getByText(/BAY A-02/i)).toBeInTheDocument();
    expect(articlesAfterSearch[0]!.className).toContain("w-full");
    expect(articlesAfterSearch[0]!.className).not.toContain("lg:w-[calc((100%-2rem)/3)]");
    expect(
      articlesAfterSearch[0]!.querySelector(".lg\\:grid-cols-\\[1\\.15fr_1fr\\]"),
    ).not.toBeNull();
    expect(screen.queryByText(/Pilih Cepat:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Ekspor Excel \(1 Unit\)/i)).toBeInTheDocument();

    // Cross-module quick buttons navigate to Module 04 & Module 01 with unit selected
    fireEvent.click(
      within(articlesAfterSearch[0]!).getByRole("button", { name: /Diagnostik DTC \(04\)/i }),
    );
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute("data-module", "04");
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute(
      "data-selected",
      "MITSUBISHI-STOCK-04",
    );

    fireEvent.click(
      within(articlesAfterSearch[0]!).getByRole("button", { name: /Topologi & Probe \(01\)/i }),
    );
    expect(screen.getByTestId("telemetry-bridge")).toHaveAttribute("data-module", "01");

    fireEvent.change(searchInput, { target: { value: "TIDAK-ADA-UNIT-99" } });
    expect(screen.getByText(/Tidak Ada Unit Kendaraan yang Cocok/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset Pencarian & Filter/i }));
    expect(screen.getAllByRole("article")).toHaveLength(12);
  }, 25000);

  it("opens and closes PdiCertificateModal with 6 standardized Indonesian rows and sync evidence", async () => {
    renderFleet();

    const pdiButtons = screen.getAllByRole("button", { name: /PDI Cert/i });
    fireEvent.click(pdiButtons[0]!);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/SERTIFIKAT INSPEKSI PRA-KIRIM \(PDI\) & KESEHATAN BATERAI/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Tegangan Baterai Terbuka \(OCV & Komp\. 25°C\)/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Jalur Komunikasi TWAI \/ CAN-Bus \(500 kbps\)/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Waktu Inspeksi & Sinkronisasi/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Sinkron Terakhir:/i)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("row")).toHaveLength(7);

    fireEvent.click(within(dialog).getByRole("button", { name: /Tutup sertifikat PDI/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  }, 15000);

  it("claims and resolves a maintenance ticket through TicketResolutionModal", async () => {
    renderFleet();

    const searchInput = screen.getByPlaceholderText(/Cari Bay, Model, VIN, atau kode DTC/i);
    fireEvent.change(searchInput, { target: { value: "P0133" } });

    const card = screen.getAllByRole("article")[0]!;
    expect(within(card).getByText("OPEN")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: /Klaim Tiket/i }));
    expect(within(card).getByText("IN PROGRESS")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: /Tutup Tiket\.\.\./i }));
    const modal = screen.getByRole("dialog");
    expect(
      within(modal).getByText(/Form Penanganan & Penutupan Tiket Pemeliharaan/i),
    ).toBeInTheDocument();

    const actionSelect = within(modal).getByRole("combobox") as HTMLSelectElement;
    expect(actionSelect.value).toBe("Pengisian Daya Baterai (Charger 2 Jam)");

    fireEvent.click(within(modal).getByRole("button", { name: /Sahkan & Tutup Tiket/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(within(card).getByText("RESOLVED")).toBeInTheDocument();
  }, 15000);

  it("uses real backend empty tickets and 1-point history without fake simulation fallback in LIVE_API mode", async () => {
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
            last_seen: "2026-11-17 16:25:22",
            last_seen_sec: 1200,
            sync_ssid: "POCOF6",
            buffer_used: 0,
            telemetry: {
              ...liveUnit.telemetry,
              v_bat: 12.15,
              adc_raw_mv: 2232,
              sleep_cfg: 21600,
              sync_ssid: "POCOF6",
            },
          },
        ],
        history: {
          "MITSUBISHI-STOCK-01": [{ t: "16:25", v: 12.15, ts: 1763371522 }],
        },
        tickets: [],
        audit_logs: [],
      }),
    }) as unknown as typeof fetch;

    renderFleet(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch Live Test" }));

    await waitFor(() => {
      expect(screen.getByText("Armada: 1 Unit")).toBeInTheDocument();
    });

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(1);
    const liveCard = cards[0]!;

    // Single live card takes full width, formats 21600s sleep as "Sleep 6 Jam", shows POCOF6
    expect(liveCard.className).toContain("w-full");
    expect(within(liveCard).getByText(/Sleep 6 Jam/i)).toBeInTheDocument();
    expect(within(liveCard).getByText(/POCOF6/i)).toBeInTheDocument();
    // With 1 live sample point, OLS prediction is Stable instead of synthetic simulated drain curve
    expect(within(liveCard).getByText("Stable (> 72h Safe)")).toBeInTheDocument();
    // Simulator INITIAL_TICKETS are cleared by backend tickets: []
    expect(within(liveCard).queryByText("TKT-0404")).not.toBeInTheDocument();
  }, 15000);

  it("opens ExportConfigModal allowing unit scope, DAILY/MONTHLY/YEARLY period, resolution selection, and export confirmation", async () => {
    renderFleet();

    fireEvent.click(screen.getByRole("button", { name: /Ekspor Excel \(12 Unit\)/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Konfigurasi Ekspor Laporan Telemetri/i)).toBeInTheDocument();

    // Switch to Per Bulan -> automatically switches resolution to HOURLY & filename slug to BULANAN_
    fireEvent.click(within(dialog).getByRole("button", { name: /^Per Bulan$/i }));
    const resSelect = within(dialog).getByLabelText(
      /4\. Resolusi Data \(Granularitas\)/i,
    ) as HTMLSelectElement;
    expect(resSelect.value).toBe("HOURLY");
    expect(within(dialog).getByText(/BULANAN_/i)).toBeInTheDocument();

    // Switch to Per Tahun -> automatically switches resolution to DAILY_SUMMARY & filename slug to TAHUNAN_
    fireEvent.click(within(dialog).getByRole("button", { name: /^Per Tahun$/i }));
    expect(resSelect.value).toBe("DAILY_SUMMARY");
    expect(within(dialog).getByText(/TAHUNAN_/i)).toBeInTheDocument();

    // Switch to Pilih Unit Spesifik -> Kosongkan shows validation & disables submit button
    fireEvent.click(within(dialog).getByRole("button", { name: /Pilih Unit Spesifik/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Kosongkan/i }));
    expect(
      within(dialog).getByText(/Pilih minimal 1 unit kendaraan untuk melanjutkan ekspor/i),
    ).toBeInTheDocument();
    const submitBtn = within(dialog).getByRole("button", { name: /Unduh Laporan Excel/i });
    expect(submitBtn).toBeDisabled();

    // Re-select Seluruh Armada -> submit button enabled & triggers clean close + real filename
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      fireEvent.click(within(dialog).getByRole("button", { name: /Seluruh Armada/i }));
      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    } finally {
      anchorClickSpy.mockRestore();
    }
  }, 15000);
});
