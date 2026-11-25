import type { ComponentType, MouseEvent, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry, type ModuleId } from "@/context/TelemetryContext";
import { requestAppFullscreen, useFullscreen } from "@/hooks/useFullscreen";
import {
  LandingWelcomeModal,
  WELCOME_PERSIST_KEY,
  WELCOME_SESSION_KEY,
} from "@/components/LandingWelcomeModal";
import { TopNav } from "@/components/hmi/TopNav";
import {
  GUIDE_SUBTAB_EVENT,
  WEB_GUIDE_COMPLETED_KEY,
  WEB_GUIDE_COMPLETED_TRACKS_KEY,
} from "@/data/webGuideSteps";
import { Route as LandingRoute } from "@/routes/index";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      onClick,
      ...rest
    }: {
      to: string;
      children: ReactNode;
      onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
      [key: string]: unknown;
    }) => (
      <a
        href={to}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e);
        }}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let originalResizeObserver: typeof globalThis.ResizeObserver | undefined;
let originalFullscreenEnabledDesc: PropertyDescriptor | undefined;
let originalFullscreenElementDesc: PropertyDescriptor | undefined;
let originalRequestFullscreen: typeof HTMLElement.prototype.requestFullscreen | undefined;
let originalInnerWidth: number;

function mockFullscreenApi(opts: {
  enabled: boolean;
  reject?: boolean;
  activeElement?: Element | null;
}) {
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    get: () => opts.enabled,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => opts.activeElement ?? null,
  });
  const spy = vi.fn().mockImplementation(() => {
    if (opts.reject) {
      return Promise.reject(new Error("Fullscreen denied"));
    }
    return Promise.resolve();
  });
  document.documentElement.requestFullscreen =
    spy as unknown as typeof document.documentElement.requestFullscreen;
  return spy;
}

function FullscreenProbe() {
  const { isFullscreen, isSupported, enter, exit } = useFullscreen();
  return (
    <div>
      <span data-testid="fs-supported">{String(isSupported)}</span>
      <span data-testid="fs-active">{String(isFullscreen)}</span>
      <button type="button" onClick={() => void enter()}>
        Enter FS
      </button>
      <button type="button" onClick={() => void exit()}>
        Exit FS
      </button>
    </div>
  );
}

function NavBridgeHarness({ initialModule = "01" }: { initialModule?: ModuleId }) {
  const { activeModule, setActiveModule } = useTelemetry();
  return (
    <>
      <div data-testid="nav-module-state" data-module={activeModule} />
      <button type="button" onClick={() => setActiveModule(initialModule)}>
        Set Initial Module
      </button>
      <TopNav />
    </>
  );
}

beforeAll(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  originalFullscreenEnabledDesc = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
  originalFullscreenElementDesc = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
  originalRequestFullscreen = document.documentElement.requestFullscreen;
  originalInnerWidth = window.innerWidth;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.classList.remove("is-fullscreen");
  document.body?.classList.remove("is-fullscreen");
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: originalInnerWidth,
  });
  if (originalFullscreenEnabledDesc) {
    Object.defineProperty(document, "fullscreenEnabled", originalFullscreenEnabledDesc);
  } else {
    delete (document as unknown as Record<string, unknown>)["fullscreenEnabled"];
  }
  if (originalFullscreenElementDesc) {
    Object.defineProperty(document, "fullscreenElement", originalFullscreenElementDesc);
  } else {
    delete (document as unknown as Record<string, unknown>)["fullscreenElement"];
  }
  if (originalRequestFullscreen) {
    document.documentElement.requestFullscreen = originalRequestFullscreen;
  }
});

afterAll(() => {
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

describe("Fullscreen Helpers & Cross-Route State Persistence", () => {
  it("invokes requestFullscreen when supported, handles denial cleanly, and keeps is-fullscreen across unmount", async () => {
    const reqSpy = mockFullscreenApi({ enabled: true });
    expect(await requestAppFullscreen()).toBe(true);
    expect(reqSpy).toHaveBeenCalledTimes(1);

    mockFullscreenApi({ enabled: true, reject: true });
    expect(await requestAppFullscreen()).toBe(false);

    mockFullscreenApi({ enabled: false });
    const firstRender = render(<FullscreenProbe />);
    expect(screen.getByTestId("fs-supported")).toHaveTextContent("false");
    firstRender.unmount();

    mockFullscreenApi({ enabled: true, activeElement: document.documentElement });
    const activeRender = render(<FullscreenProbe />);
    expect(screen.getByTestId("fs-supported")).toHaveTextContent("true");
    expect(screen.getByTestId("fs-active")).toHaveTextContent("true");
    expect(document.documentElement.classList.contains("is-fullscreen")).toBe(true);

    activeRender.unmount();
    expect(document.documentElement.classList.contains("is-fullscreen")).toBe(true);
  });
});

describe("Landing Welcome Modal & CTA Auto-Fullscreen", () => {
  it("renders redesigned welcome dialog once per session, honors localStorage opt-out, handles unsupported fullscreen, and triggers fullscreen on Buka Dashboard", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
    const reqSpy = mockFullscreenApi({ enabled: true });

    const { unmount } = render(<LandingWelcomeModal />);
    expect(await screen.findByText(/Dashboard Web Sedang dalam Pengembangan/i)).toBeInTheDocument();
    expect(screen.getByText("ORION TELEMETRY")).toBeInTheDocument();
    expect(screen.getByText("Mode Simulasi")).toBeInTheDocument();
    expect(screen.getByText("Mode Live API")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Aktifkan Layar Penuh/i }));
    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(WELCOME_SESSION_KEY)).toBe("1");
    await waitFor(() => {
      expect(
        screen.queryByText(/Dashboard Web Sedang dalam Pengembangan/i),
      ).not.toBeInTheDocument();
    });
    unmount();

    // Same session does not reopen modal
    const sameSession = render(<LandingWelcomeModal />);
    expect(screen.queryByText(/Dashboard Web Sedang dalam Pengembangan/i)).not.toBeInTheDocument();
    sameSession.unmount();

    // New session: opt-out forever checkbox writes localStorage
    window.sessionStorage.clear();
    const persistRender = render(<LandingWelcomeModal />);
    expect(await screen.findByText(/Dashboard Web Sedang dalam Pengembangan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Jangan tampilkan lagi di perangkat ini/i));
    fireEvent.click(screen.getByRole("button", { name: /Tutup & Lihat Beranda/i }));
    expect(window.localStorage.getItem(WELCOME_PERSIST_KEY)).toBe("1");
    persistRender.unmount();

    // Clearing sessionStorage alone respects localStorage opt-out
    window.sessionStorage.clear();
    const afterOptOut = render(<LandingWelcomeModal />);
    expect(screen.queryByText(/Dashboard Web Sedang dalam Pengembangan/i)).not.toBeInTheDocument();
    afterOptOut.unmount();

    // Unsupported fullscreen browser hides fullscreen CTA and renders single continue button
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockFullscreenApi({ enabled: false });
    const unsupportedRender = render(<LandingWelcomeModal />);
    expect(await screen.findByRole("button", { name: /Lanjut ke Beranda/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aktifkan Layar Penuh/i })).not.toBeInTheDocument();
    unsupportedRender.unmount();

    // Clicking Buka Dashboard CTA on actual Landing page requests fullscreen
    const ctaSpy = mockFullscreenApi({ enabled: true });
    window.sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
    const LandingComponent = LandingRoute.options.component as ComponentType;
    render(<LandingComponent />);
    const dashboardLinks = screen.getAllByRole("link", { name: /Buka Dashboard/i });
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(dashboardLinks[0]!);
    expect(ctaSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Context-Aware Web Help & 7-Track Per-Menu Interactive Guide", () => {
  it("opens Help directly on active module, runs 4-step per-menu guide with sub-tab sync, track switcher, and CommandPalette launch", async () => {
    const subTabEvents: Array<{ moduleId?: string; subTab?: string }> = [];
    const subTabListener = (e: Event) => {
      subTabEvents.push((e as CustomEvent<{ moduleId?: string; subTab?: string }>).detail);
    };
    window.addEventListener(GUIDE_SUBTAB_EVENT, subTabListener);

    try {
      render(
        <MotionConfig reducedMotion="always">
          <LazyMotion features={domAnimation}>
            <TelemetryProvider>
              <NavBridgeHarness initialModule="03" />
            </TelemetryProvider>
          </LazyMotion>
        </MotionConfig>,
      );

      // Move to Menu 03 before pressing Bantuan
      fireEvent.click(screen.getByRole("button", { name: "Set Initial Module" }));
      expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "03");

      // 1. Open Help via Bantuan button: lands directly on Menu 03 active tab
      fireEvent.click(screen.getByRole("button", { name: /Buka bantuan penggunaan web/i }));
      expect(await screen.findByText(/Bantuan Penggunaan Web ORION/i)).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Menu 03/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByText(/Konsol Timer 10 Menit & Status Alternator/i)).toBeInTheDocument();

      // Check Mode & Warna and Pintasan tabs
      fireEvent.click(screen.getByRole("tab", { name: /Mode & Warna/i }));
      expect(screen.getByText(/Sumber Data di Bilah Atas/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: /Pintasan/i }));
      expect(screen.getByText(/Ctrl \+ K \/ Cmd \+ K/i)).toBeInTheDocument();

      // 2. Pick Menu 06 4-step guide from Semua Menu tab
      fireEvent.click(screen.getByRole("tab", { name: /Semua Menu/i }));
      const guideButtons = screen.getAllByRole("button", { name: /^Panduan \(4\)$/i });
      expect(guideButtons).toHaveLength(7);
      fireEvent.click(guideButtons[6]!); // 0 = overview, 6 = Menu 06

      expect(await screen.findByText(/Menu 06 · Langkah 1 dari 4/i)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "06");
      });

      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      expect(screen.getByText(/Menu 06 · Langkah 2 dari 4/i)).toBeInTheDocument();
      expect(screen.getByText(/Sub-Tab 01: Pendaftaran, Pasang & Lepas Node/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      expect(screen.getByText(/Menu 06 · Langkah 3 dari 4/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Sub-Tab 02: Batas Tegangan, Tidur & Kalibrasi/i),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      expect(screen.getByText(/Menu 06 · Langkah 4 dari 4/i)).toBeInTheDocument();
      expect(screen.getByText(/Sub-Tab 03: Tiket Penanganan & Log Aktivitas/i)).toBeInTheDocument();

      // Verify custom sub-tab events emitted for Menu 06
      expect(subTabEvents.some((ev) => ev.moduleId === "06" && ev.subTab === "CALIBRATION")).toBe(
        true,
      );
      expect(subTabEvents.some((ev) => ev.moduleId === "06" && ev.subTab === "TICKETS")).toBe(true);

      // Step back and forward, then Finish Menu 06
      fireEvent.click(screen.getByRole("button", { name: /Sebelumnya/i }));
      expect(screen.getByText(/Menu 06 · Langkah 3 dari 4/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Selesai$/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: /Panduan penggunaan web ORION/i }),
        ).not.toBeInTheDocument();
      });
      expect(window.localStorage.getItem(WEB_GUIDE_COMPLETED_KEY)).toBe("1");
      expect(
        JSON.parse(window.localStorage.getItem(WEB_GUIDE_COMPLETED_TRACKS_KEY) ?? "[]"),
      ).toContain("06");

      // 3. Reopen via '?' key: Menu 06 now shows Selesai badge inside Semua Menu; launch Navigasi guide
      fireEvent.keyDown(window, { key: "?" });
      expect(await screen.findByText(/Bantuan Penggunaan Web ORION/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Panduan Navigasi Bilah Atas/i }));

      expect(await screen.findByText(/Navigasi · Langkah 1 dari 4/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      expect(screen.getByText(/Navigasi · Langkah 4 dari 4/i)).toBeInTheDocument();

      // Step 4 offers continuation straight into Menu 01
      fireEvent.click(screen.getByRole("button", { name: /Lanjut: Menu 01/i }));
      expect(screen.getByText(/Menu 01 · Langkah 1 dari 4/i)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "01");
      });

      // Switch directly to Menu 02 via inline track switcher and close via Escape
      fireEvent.click(screen.getByRole("button", { name: "02" }));
      expect(screen.getByText(/Menu 02 · Langkah 1 dari 4/i)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "02");
      });

      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: /Panduan penggunaan web ORION/i }),
        ).not.toBeInTheDocument();
      });

      // 4. Launch active-menu guide from CommandPaletteModal (Ctrl+K) while on Menu 02
      fireEvent.click(screen.getByTitle(/Buka Pencarian Cepat/i));
      const paletteGuideBtn = await screen.findByText(/Panduan Menu Aktif \(4 Langkah\)/i);
      fireEvent.click(paletteGuideBtn);
      expect(await screen.findByText(/Menu 02 · Langkah 1 dari 4/i)).toBeInTheDocument();
    } finally {
      window.removeEventListener(GUIDE_SUBTAB_EVENT, subTabListener);
    }
  }, 15000);
});
