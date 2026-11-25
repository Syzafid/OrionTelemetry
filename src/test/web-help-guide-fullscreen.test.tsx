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
  WEB_GUIDE_STEPS,
  WEB_GUIDE_TRACKS,
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
let originalPointerEvent: typeof globalThis.PointerEvent | undefined;
let originalFullscreenEnabledDesc: PropertyDescriptor | undefined;
let originalFullscreenElementDesc: PropertyDescriptor | undefined;
let originalRequestFullscreen: typeof HTMLElement.prototype.requestFullscreen | undefined;
let originalInnerWidth: number;
let originalInnerHeight: number;
let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;

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

function NavBridgeHarness({
  initialModule = "01",
  onProbeClick,
}: {
  initialModule?: ModuleId;
  onProbeClick?: () => void;
}) {
  const { activeModule, setActiveModule } = useTelemetry();
  return (
    <>
      <div data-testid="nav-module-state" data-module={activeModule} />
      <button type="button" onClick={() => setActiveModule(initialModule)}>
        Set Initial Module
      </button>
      <input aria-label="Kolom ketik contoh" />
      <button type="button" onClick={onProbeClick}>
        Tombol Uji Interaksi
      </button>
      <TopNav />
    </>
  );
}

beforeAll(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  originalPointerEvent = globalThis.PointerEvent;
  if (typeof globalThis.PointerEvent === "undefined") {
    class PointerEventStub extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(
        type: string,
        params: PointerEventInit & { pointerId?: number; pointerType?: string } = {},
      ) {
        super(type, params);
        this.pointerId = params.pointerId ?? 1;
        this.pointerType = params.pointerType ?? "mouse";
      }
    }
    globalThis.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
  }
  originalFullscreenEnabledDesc = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
  originalFullscreenElementDesc = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
  originalRequestFullscreen = document.documentElement.requestFullscreen;
  originalInnerWidth = window.innerWidth;
  originalInnerHeight = window.innerHeight;
  originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.classList.remove("is-fullscreen");
  document.body?.classList.remove("is-fullscreen");
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: originalInnerWidth,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: originalInnerHeight,
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
  if (originalPointerEvent) {
    globalThis.PointerEvent = originalPointerEvent;
  } else {
    delete (globalThis as unknown as Record<string, unknown>)["PointerEvent"];
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

    const sameSession = render(<LandingWelcomeModal />);
    expect(screen.queryByText(/Dashboard Web Sedang dalam Pengembangan/i)).not.toBeInTheDocument();
    sameSession.unmount();

    window.sessionStorage.clear();
    const persistRender = render(<LandingWelcomeModal />);
    expect(await screen.findByText(/Dashboard Web Sedang dalam Pengembangan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Jangan tampilkan lagi di perangkat ini/i));
    fireEvent.click(screen.getByRole("button", { name: /Tutup & Lihat Beranda/i }));
    expect(window.localStorage.getItem(WELCOME_PERSIST_KEY)).toBe("1");
    persistRender.unmount();

    window.sessionStorage.clear();
    const afterOptOut = render(<LandingWelcomeModal />);
    expect(screen.queryByText(/Dashboard Web Sedang dalam Pengembangan/i)).not.toBeInTheDocument();
    afterOptOut.unmount();

    window.localStorage.clear();
    window.sessionStorage.clear();
    mockFullscreenApi({ enabled: false });
    const unsupportedRender = render(<LandingWelcomeModal />);
    expect(await screen.findByRole("button", { name: /Lanjut ke Beranda/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aktifkan Layar Penuh/i })).not.toBeInTheDocument();
    unsupportedRender.unmount();

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

describe("Context-Aware Web Help & 7-Track 42-Step Live-Interactive Guide", () => {
  it("opens Help on active module, keeps page interactive, supports drag/resize/presets/scrim toggle, and navigates 42 detailed steps", async () => {
    expect(WEB_GUIDE_TRACKS).toHaveLength(7);
    expect(WEB_GUIDE_STEPS).toHaveLength(42);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

    // Give elements visible bounds in jsdom so the 4-strip pointer-events-none scrim mounts
    Element.prototype.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 80,
        right: 480,
        bottom: 220,
        width: 400,
        height: 120,
        x: 80,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    const onProbeClick = vi.fn();
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
              <NavBridgeHarness initialModule="03" onProbeClick={onProbeClick} />
            </TelemetryProvider>
          </LazyMotion>
        </MotionConfig>,
      );

      // Move to Menu 03 before opening Help -> opens directly on Menu 03 (5 steps)
      fireEvent.click(screen.getByRole("button", { name: "Set Initial Module" }));
      expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "03");

      fireEvent.click(screen.getByRole("button", { name: /Buka bantuan penggunaan web/i }));
      expect(await screen.findByText(/Bantuan Penggunaan Web ORION/i)).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Menu 03/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        screen.getByRole("button", { name: /Panduan Sorotan Menu 03 \(5 Langkah\)/i }),
      ).toBeInTheDocument();

      // Switch to Semua Menu tab: lists all 7 tracks with dynamic step counts
      fireEvent.click(screen.getByRole("tab", { name: /Semua Menu/i }));
      expect(screen.getAllByRole("button", { name: /^Panduan \(\d+\)$/i })).toHaveLength(7);
      const sevenStepButtons = screen.getAllByRole("button", { name: /^Panduan \(7\)$/i });
      expect(sevenStepButtons).toHaveLength(2); // Menu 04 & Menu 06
      fireEvent.click(sevenStepButtons[1]!); // Launch Menu 06 (7 steps)

      // Guide card uses non-modal region semantics at z-[45], starts compact at 360px
      const guideRegion = await screen.findByRole("region", {
        name: /Panduan penggunaan web ORION/i,
      });
      expect(guideRegion).toHaveClass("z-[45]");
      expect(guideRegion).not.toHaveAttribute("aria-modal");
      expect(guideRegion).toHaveAttribute("data-size-preset", "normal");
      expect(parseInt(guideRegion.style.width, 10)).toBeLessThanOrEqual(360);
      expect(screen.getByText(/Menu 06 · 1\/7/i)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "06");
      });

      const scrimLayer = screen.getByTestId("guide-scrim-layer");
      expect(scrimLayer).toHaveClass("pointer-events-none", "z-[42]");
      expect(screen.getAllByTestId("guide-scrim-dim")).toHaveLength(4);
      expect(screen.getByTestId("guide-highlight-frame")).toBeInTheDocument();

      // Page behind guide stays clickable & interactive while guide is open
      fireEvent.click(screen.getByRole("button", { name: "Tombol Uji Interaksi" }));
      expect(onProbeClick).toHaveBeenCalledTimes(1);

      // Typing/pressing ArrowRight inside an input must NOT advance the guide step
      const exampleInput = screen.getByLabelText("Kolom ketik contoh");
      fireEvent.keyDown(exampleInput, { key: "ArrowRight" });
      expect(screen.getByText(/Menu 06 · 1\/7/i)).toBeInTheDocument();

      // Scrim toggle: Bebas removes dark strips while preserving highlight frame
      fireEvent.click(
        screen.getByRole("button", { name: /Mode layar bebas tanpa lapisan gelap/i }),
      );
      expect(screen.queryAllByTestId("guide-scrim-dim")).toHaveLength(0);
      expect(screen.getByTestId("guide-highlight-frame")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Aktifkan lapisan sorotan gelap/i }));
      expect(screen.getAllByTestId("guide-scrim-dim")).toHaveLength(4);

      // Size presets: Normal (360) -> Kecil/slim (292) -> Mini (288, not 620) -> Perluas -> Normal
      fireEvent.click(screen.getByRole("button", { name: /Perkecil kartu panduan/i }));
      expect(guideRegion).toHaveAttribute("data-size-preset", "slim");
      expect(parseInt(guideRegion.style.width, 10)).toBe(292);

      fireEvent.click(screen.getByRole("button", { name: /Ringkas kartu panduan/i }));
      expect(guideRegion).toHaveAttribute("data-size-preset", "mini");
      expect(parseInt(guideRegion.style.width, 10)).toBeLessThanOrEqual(300);
      expect(screen.getByText(/Menu 06 · 1\/7/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Perluas kartu panduan/i }));
      expect(guideRegion).toHaveAttribute("data-size-preset", "slim");
      fireEvent.click(screen.getByRole("button", { name: /Perbesar kartu panduan/i }));
      expect(guideRegion).toHaveAttribute("data-size-preset", "normal");

      // Free drag-to-move updates position and persists across step navigation
      const dragHandle = screen.getByTestId("guide-drag-handle");
      const beforeDragLeft = guideRegion.style.left;
      const beforeDragTop = guideRegion.style.top;
      fireEvent.pointerDown(dragHandle, {
        clientX: 200,
        clientY: 200,
        button: 0,
        pointerType: "mouse",
        pointerId: 1,
      });
      fireEvent.pointerMove(window, { clientX: 310, clientY: 270, pointerId: 1 });
      fireEvent.pointerUp(window, { clientX: 310, clientY: 270, pointerId: 1 });
      expect(guideRegion).toHaveAttribute("data-dock-mode", "custom");
      expect(
        guideRegion.style.left !== beforeDragLeft || guideRegion.style.top !== beforeDragTop,
      ).toBe(true);

      // Advance to step 2 -> custom dragged position persists
      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      expect(screen.getByText("Menu 06 · 2/7")).toBeInTheDocument();
      expect(guideRegion).toHaveAttribute("data-dock-mode", "custom");

      // Free drag-to-resize changes width within [260px, 520px]
      const widthBeforeResize = parseInt(guideRegion.style.width, 10);
      const resizeHandle = screen.getByTestId("guide-resize-handle");
      fireEvent.pointerDown(resizeHandle, {
        clientX: 400,
        clientY: 400,
        button: 0,
        pointerType: "mouse",
        pointerId: 2,
      });
      fireEvent.pointerMove(window, { clientX: 495, clientY: 460, pointerId: 2 });
      fireEvent.pointerUp(window, { clientX: 495, clientY: 460, pointerId: 2 });
      const widthAfterResize = parseInt(guideRegion.style.width, 10);
      expect(widthAfterResize).toBeGreaterThan(widthBeforeResize);
      expect(widthAfterResize).toBeLessThanOrEqual(520);

      // Reset returns to Auto + default 360px width; Pindah cycles corner presets cleanly
      fireEvent.click(screen.getByRole("button", { name: /Reset posisi dan ukuran panduan/i }));
      expect(guideRegion).toHaveAttribute("data-dock-mode", "auto");
      expect(parseInt(guideRegion.style.width, 10)).toBe(360);
      fireEvent.click(screen.getByRole("button", { name: /Pindah posisi kartu panduan/i }));
      expect(guideRegion).toHaveAttribute("data-dock-mode", "bottom-left");

      // Step through remaining steps 3..7 of Menu 06
      for (let step = 3; step <= 7; step++) {
        fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
        expect(screen.getByText(`Menu 06 · ${step}/7`)).toBeInTheDocument();
      }

      expect(subTabEvents.some((ev) => ev.moduleId === "06" && ev.subTab === "ONBOARDING")).toBe(
        true,
      );
      expect(subTabEvents.some((ev) => ev.moduleId === "06" && ev.subTab === "CALIBRATION")).toBe(
        true,
      );
      expect(subTabEvents.some((ev) => ev.moduleId === "06" && ev.subTab === "TICKETS")).toBe(true);

      // Step back then Finish Menu 06
      fireEvent.click(screen.getByRole("button", { name: /Sebelumnya/i }));
      expect(screen.getByText(/Menu 06 · 6\/7/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Selesai$/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole("region", { name: /Panduan penggunaan web ORION/i }),
        ).not.toBeInTheDocument();
      });
      expect(window.localStorage.getItem(WEB_GUIDE_COMPLETED_KEY)).toBe("1");
      expect(
        JSON.parse(window.localStorage.getItem(WEB_GUIDE_COMPLETED_TRACKS_KEY) ?? "[]"),
      ).toContain("06");

      // Reopen via '?' -> launch Navigasi (5 steps) -> step 5 continues into Menu 01 (6 steps)
      fireEvent.keyDown(window, { key: "?" });
      expect(await screen.findByText(/Bantuan Penggunaan Web ORION/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Panduan Navigasi Bilah Atas/i }));

      expect(await screen.findByText(/Navigasi · 1\/5/i)).toBeInTheDocument();
      for (let s = 2; s <= 5; s++) {
        fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      }
      expect(screen.getByText(/Navigasi · 5\/5/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Lanjut: Menu 01/i }));
      expect(screen.getByText(/Menu 01 · 1\/6/i)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "01");
      });

      // Verify Menu 01 inspector sub-tab auto-switch (steps 4 & 5)
      for (let s = 2; s <= 5; s++) {
        fireEvent.click(screen.getByRole("button", { name: /^Lanjut$/i }));
      }
      expect(subTabEvents.some((ev) => ev.moduleId === "01" && ev.subTab === "matrix")).toBe(true);
      expect(subTabEvents.some((ev) => ev.moduleId === "01" && ev.subTab === "transducer")).toBe(
        true,
      );

      // Switch directly to Menu 02 (6 steps) via collapsible track switcher and close with Escape
      fireEvent.click(screen.getByRole("button", { name: /Pilih menu panduan/i }));
      expect(screen.getByRole("group", { name: /Pilih paket panduan menu/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "02" }));
      expect(
        screen.queryByRole("group", { name: /Pilih paket panduan menu/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Menu 02 · 1\/6/i)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("nav-module-state")).toHaveAttribute("data-module", "02");
      });

      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(
          screen.queryByRole("region", { name: /Panduan penggunaan web ORION/i }),
        ).not.toBeInTheDocument();
      });

      // Open CommandPaletteModal (Ctrl+K) while on Menu 02 -> displays dynamic 6 Langkah
      fireEvent.click(screen.getByTitle(/Buka Pencarian Cepat/i));
      const paletteGuideBtn = await screen.findByText(/Panduan Menu Aktif \(6 Langkah\)/i);
      fireEvent.click(paletteGuideBtn);
      expect(await screen.findByText(/Menu 02 · 1\/6/i)).toBeInTheDocument();
    } finally {
      window.removeEventListener(GUIDE_SUBTAB_EVENT, subTabListener);
    }
  }, 20000);

  it("lets mobile users flip guide card between bottom and top edges and stay compact", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 375,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 667,
    });

    Element.prototype.getBoundingClientRect = () =>
      ({
        top: 260,
        left: 16,
        right: 359,
        bottom: 420,
        width: 343,
        height: 160,
        x: 16,
        y: 260,
        toJSON: () => ({}),
      }) as DOMRect;

    render(
      <MotionConfig reducedMotion="always">
        <LazyMotion features={domAnimation}>
          <TelemetryProvider>
            <NavBridgeHarness initialModule="01" />
          </TelemetryProvider>
        </LazyMotion>
      </MotionConfig>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Buka bantuan penggunaan web/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Panduan Sorotan Menu 01/i }));

    const guideRegion = await screen.findByRole("region", {
      name: /Panduan penggunaan web ORION/i,
    });
    expect(guideRegion).toHaveAttribute("data-dock-mode", "bottom");
    expect(parseInt(guideRegion.style.width, 10)).toBeLessThanOrEqual(359);

    fireEvent.click(screen.getByRole("button", { name: /Pindah posisi kartu panduan ke atas/i }));
    expect(guideRegion).toHaveAttribute("data-dock-mode", "top");
    expect(parseInt(guideRegion.style.top, 10)).toBeGreaterThanOrEqual(60);
    expect(
      screen.getByRole("button", { name: /Pindah posisi kartu panduan ke bawah/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ringkas kartu panduan/i }));
    expect(guideRegion).toHaveAttribute("data-size-preset", "mini");
    expect(parseInt(guideRegion.style.width, 10)).toBeLessThanOrEqual(300);
  });
});
