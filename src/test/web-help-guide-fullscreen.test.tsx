import type { ComponentType, MouseEvent, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { requestAppFullscreen, useFullscreen } from "@/hooks/useFullscreen";
import {
  LandingWelcomeModal,
  WELCOME_PERSIST_KEY,
  WELCOME_SESSION_KEY,
} from "@/components/LandingWelcomeModal";
import { TopNav } from "@/components/hmi/TopNav";
import { WEB_GUIDE_COMPLETED_KEY } from "@/data/webGuideSteps";
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

function NavBridgeHarness() {
  const { activeModule } = useTelemetry();
  return (
    <>
      <div data-testid="nav-module-state" data-module={activeModule} />
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

    // Unmounting route component while fullscreen remains active keeps is-fullscreen class
    activeRender.unmount();
    expect(document.documentElement.classList.contains("is-fullscreen")).toBe(true);
  });
});

describe("Landing Welcome Modal & CTA Auto-Fullscreen", () => {
  it("opens once per session, honors localStorage opt-out, hides fullscreen on unsupported browsers, and triggers fullscreen on Buka Dashboard", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
    const reqSpy = mockFullscreenApi({ enabled: true });

    const { unmount } = render(<LandingWelcomeModal />);
    expect(await screen.findByText(/Selamat Datang di Web ORION Telemetry/i)).toBeInTheDocument();
    expect(screen.getByText("Tahap Pengembangan")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Aktifkan Layar Penuh/i }));
    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(WELCOME_SESSION_KEY)).toBe("1");
    await waitFor(() => {
      expect(screen.queryByText(/Selamat Datang di Web ORION Telemetry/i)).not.toBeInTheDocument();
    });
    unmount();

    // Same session does not reopen modal
    const sameSession = render(<LandingWelcomeModal />);
    expect(screen.queryByText(/Selamat Datang di Web ORION Telemetry/i)).not.toBeInTheDocument();
    sameSession.unmount();

    // New session: opt-out forever checkbox writes localStorage
    window.sessionStorage.clear();
    const persistRender = render(<LandingWelcomeModal />);
    expect(await screen.findByText(/Selamat Datang di Web ORION Telemetry/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Jangan tampilkan lagi di perangkat ini/i));
    fireEvent.click(screen.getByRole("button", { name: /Lanjut Biasa/i }));
    expect(window.localStorage.getItem(WELCOME_PERSIST_KEY)).toBe("1");
    persistRender.unmount();

    // Clearing sessionStorage alone respects localStorage opt-out
    window.sessionStorage.clear();
    const afterOptOut = render(<LandingWelcomeModal />);
    expect(screen.queryByText(/Selamat Datang di Web ORION Telemetry/i)).not.toBeInTheDocument();
    afterOptOut.unmount();

    // Unsupported fullscreen browser hides fullscreen prompt CTA
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockFullscreenApi({ enabled: false });
    const unsupportedRender = render(<LandingWelcomeModal />);
    expect(await screen.findByRole("button", { name: /Mengerti, Lanjutkan/i })).toBeInTheDocument();
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

describe("Web Help Center & 8-Step Interactive Web Guide", () => {
  it("opens Help via button/?/Ctrl+K, switches modules cleanly, and steps through all 8 interactive guide stages", async () => {
    render(
      <MotionConfig reducedMotion="always">
        <LazyMotion features={domAnimation}>
          <TelemetryProvider>
            <NavBridgeHarness />
          </TelemetryProvider>
        </LazyMotion>
      </MotionConfig>,
    );

    // 1. Open WebHelpModal via TopNav Bantuan button
    fireEvent.click(screen.getByRole("button", { name: /Buka bantuan penggunaan web/i }));
    expect(await screen.findByText(/Bantuan Penggunaan Web ORION/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Mode & Warna/i }));
    expect(screen.getByText(/Sumber Data di Bilah Atas/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Pintasan/i }));
    expect(screen.getByText(/Ctrl \+ K \/ Cmd \+ K/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Menu Dashboard/i }));
    const openButtons = screen.getAllByRole("button", { name: /^Buka$/i });
    fireEvent.click(openButtons[1]!); // Menu 02 Armada & PDI
    expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "02");
    await waitFor(() => {
      expect(screen.queryByText(/Bantuan Penggunaan Web ORION/i)).not.toBeInTheDocument();
    });

    // 2. Reopen via '?' keyboard shortcut outside inputs
    fireEvent.keyDown(window, { key: "?" });
    expect(await screen.findByText(/Bantuan Penggunaan Web ORION/i)).toBeInTheDocument();

    // 3. Launch 8-step interactive guide from Help modal
    fireEvent.click(
      screen.getByRole("button", { name: /Mulai Panduan Interaktif \(8 Langkah\)/i }),
    );
    expect(await screen.findByText(/Panduan Web · Langkah 1 dari 8/i)).toBeInTheDocument();
    expect(screen.getByText(/Sumber Data & Mode Tampilan/i)).toBeInTheDocument();

    // Step 2: nav-tools
    fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
    expect(screen.getByText(/Panduan Web · Langkah 2 dari 8/i)).toBeInTheDocument();

    // Step 3 -> Step 8 auto-switch modules 01 -> 06
    const expectedModules = ["01", "02", "03", "04", "05", "06"];
    for (let i = 0; i < expectedModules.length; i++) {
      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      expect(screen.getByText(`Panduan Web · Langkah ${i + 3} dari 8`)).toBeInTheDocument();
      expect(screen.getByTestId("nav-module-state")).toHaveAttribute(
        "data-module",
        expectedModules[i]!,
      );
    }

    // Back one step returns to Menu 05, then forward to Finish
    fireEvent.click(screen.getByRole("button", { name: /Sebelumnya/i }));
    expect(screen.getByText(/Panduan Web · Langkah 7 dari 8/i)).toBeInTheDocument();
    expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "05");

    fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Selesai$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Panduan penggunaan web ORION/i }),
      ).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(WEB_GUIDE_COMPLETED_KEY)).toBe("1");

    // 4. Launch guide from CommandPaletteModal (Ctrl+K)
    fireEvent.click(screen.getByTitle(/Buka Pencarian Cepat/i));
    const guidePaletteBtn = await screen.findByText(/Mulai Panduan Interaktif/i);
    fireEvent.click(guidePaletteBtn);
    expect(await screen.findByText(/Panduan Web · Langkah 1 dari 8/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Panduan penggunaan web ORION/i }),
      ).not.toBeInTheDocument();
    });
  }, 15000);
});
