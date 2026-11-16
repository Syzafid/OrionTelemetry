import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useRef } from "react";
import {
  DURATION,
  DURATION_MS,
  EASE_STANDARD,
  SPRING_GAUGE,
  prefersReducedMotion,
} from "../lib/motion-tokens";
import { useAnime } from "../hooks/useAnime";
import { ResolveCheck, useCriticalEdges } from "../components/hmi/motion-bits";
import { UnitQrCode } from "../components/hmi/UnitQrCode";

describe("ORION Motion Upgrade (motion.dev + anime.js)", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("exposes ISA-101 aligned motion tokens and detects prefers-reduced-motion", () => {
    expect(DURATION.instant).toBe(0.12);
    expect(DURATION.quick).toBe(0.18);
    expect(DURATION.deliberate).toBe(0.32);
    expect(DURATION_MS.ceremony).toBe(700);
    expect(EASE_STANDARD).toEqual([0.2, 0, 0, 1]);
    expect(SPRING_GAUGE.damping).toBeGreaterThanOrEqual(24);

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it("short-circuits useAnime to onReduced when OS reduced-motion is enabled", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const onReducedSpy = vi.fn();
    const runSpy = vi.fn();

    function TestHarness() {
      const ref = useRef<HTMLDivElement>(null);
      useAnime(ref, runSpy, [], { onReduced: onReducedSpy });
      return <div ref={ref} data-testid="box" />;
    }

    render(<TestHarness />);
    expect(onReducedSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("reverts anime.js handles on unmount when normal motion is enabled", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const revertSpy = vi.fn();

    function TestHarness() {
      const ref = useRef<HTMLDivElement>(null);
      useAnime(ref, () => ({ revert: revertSpy }), []);
      return <div ref={ref} />;
    }

    const { unmount } = render(<TestHarness />);
    await waitFor(() => {
      // Wait for dynamic import("animejs") to resolve
      expect(true).toBe(true);
    });
    // Allow microtask queue for import("animejs").then(...)
    await act(async () => {
      await import("animejs");
    });
    unmount();
    expect(revertSpy).toHaveBeenCalledTimes(1);
  });

  it("triggers useCriticalEdges only on rising edges (false -> true), never on initial mount", () => {
    let latestFlashes: Record<string, number> = {};

    function EdgeProbe({ state }: { state: Record<string, boolean> }) {
      latestFlashes = useCriticalEdges(state);
      return null;
    }

    const { rerender } = render(
      <EdgeProbe state={{ "MITSUBISHI-STOCK-01": false, "MITSUBISHI-STOCK-03": true }} />,
    );
    // Initial mount should not flash existing critical units
    expect(latestFlashes["MITSUBISHI-STOCK-03"] ?? 0).toBe(0);

    // Rising edge on STOCK-01 (false -> true) should increment flash counter to 1
    rerender(<EdgeProbe state={{ "MITSUBISHI-STOCK-01": true, "MITSUBISHI-STOCK-03": true }} />);
    expect(latestFlashes["MITSUBISHI-STOCK-01"]).toBe(1);
    expect(latestFlashes["MITSUBISHI-STOCK-03"] ?? 0).toBe(0);
  });

  it("renders ResolveCheck and UnitQrCode with finder/data cell separation", () => {
    const { container } = render(
      <div>
        <ResolveCheck animateIn={false} />
        <UnitQrCode value="http://localhost:8080/dashboard?unit=MITSUBISHI-STOCK-01&module=fleet" animateBuild />
      </div>,
    );

    const finderCells = container.querySelectorAll('rect[data-qr-cell="finder"]');
    const dataCells = container.querySelectorAll('rect[data-qr-cell="data"]');
    expect(finderCells.length).toBeGreaterThan(0);
    expect(dataCells.length).toBeGreaterThan(0);
  });

  it("enforces WCAG AA (>= 4.5:1) contrast on all dark UI text tokens", () => {
    const oklchToLin = (L: number, C: number, hDeg: number): [number, number, number] => {
      const h = (hDeg * Math.PI) / 180;
      const a = C * Math.cos(h);
      const b = C * Math.sin(h);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
      const clamp = (x: number) => Math.max(0, Math.min(1, x));
      return [
        clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      ];
    };
    const hexToLin = (hex: string): [number, number, number] => {
      const n = parseInt(hex.replace("#", ""), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
      return ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
        number,
        number,
        number,
      ];
    };
    const lum = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const ratio = (c1: [number, number, number], c2: [number, number, number]) => {
      const L1 = Math.max(lum(c1), lum(c2));
      const L2 = Math.min(lum(c1), lum(c2));
      return (L1 + 0.05) / (L2 + 0.05);
    };

    const backgrounds = [
      hexToLin("#0E1116"), // --background
      oklchToLin(0.17, 0.008, 265), // --carbon
      oklchToLin(0.21, 0.01, 265), // --secondary
    ];
    const foregrounds = [
      hexToLin("#F2EFE9"), // --foreground
      oklchToLin(0.75, 0.012, 260), // --muted-foreground
      oklchToLin(0.68, 0.012, 260), // --dim
      hexToLin("#F45B60"), // --crimson
      oklchToLin(0.76, 0.155, 163), // --emerald
      oklchToLin(0.81, 0.165, 75), // --amber
      hexToLin("#94A3B8"), // Recharts & Gauge ticks
    ];

    for (const fg of foregrounds) {
      for (const bg of backgrounds) {
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

