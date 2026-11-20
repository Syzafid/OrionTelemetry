import { useMemo, useRef } from "react";
import { useAnime } from "@/hooks/useAnime";
import { cn } from "@/lib/utils";

const MATRIX_SIZE = 21;

/**
 * Builds a valid, shareable ORION deep-link URL for any vehicle unit and target module.
 */
export function buildUnitDeepLinkUrl(
  unitId: string,
  moduleName: "showroom" | "fleet" | "warmup" | "diagnostics" | "presence" | "config" = "fleet",
  origin?: string,
): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:8080");
  return `${base}/dashboard?unit=${encodeURIComponent(unitId)}&module=${encodeURIComponent(moduleName)}`;
}

/**
 * Generates a deterministic 21x21 QR-like matrix with standard ISO/IEC 18004
 * 7x7 finder patterns, 1px quiet separators, row/col 6 timing patterns, and
 * FNV-1a hashed payload bits. Zero external dependencies.
 */
export function generateDeterministicQrMatrix(value: string): boolean[][] {
  const grid: boolean[][] = Array.from({ length: MATRIX_SIZE }, () =>
    Array.from({ length: MATRIX_SIZE }, () => false),
  );
  const reserved: boolean[][] = Array.from({ length: MATRIX_SIZE }, () =>
    Array.from({ length: MATRIX_SIZE }, () => false),
  );

  const placeFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= MATRIX_SIZE || c < 0 || c >= MATRIX_SIZE) continue;
        reserved[r]![c] = true;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          const isOuterRing = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const isInnerCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          grid[r]![c] = isOuterRing || isInnerCore;
        } else {
          grid[r]![c] = false;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, MATRIX_SIZE - 7);
  placeFinder(MATRIX_SIZE - 7, 0);

  // Timing patterns at row 6 and col 6
  for (let i = 8; i < MATRIX_SIZE - 8; i++) {
    reserved[6]![i] = true;
    reserved[i]![6] = true;
    grid[6]![i] = i % 2 === 0;
    grid[i]![6] = i % 2 === 0;
  }

  // Standard dark module
  reserved[MATRIX_SIZE - 8]![8] = true;
  grid[MATRIX_SIZE - 8]![8] = true;

  // FNV-1a 32-bit hash stream seeded from input value
  let seed = 0x811c9dc5;
  const input = value || "ORION-DEFAULT";
  for (let i = 0; i < input.length; i++) {
    seed ^= input.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }

  let state = seed || 0x12345678;
  const nextBit = (r: number, c: number): boolean => {
    const charCode = input.charCodeAt((r * MATRIX_SIZE + c) % input.length);
    state ^= charCode + ((r << 5) ^ c);
    state = Math.imul(state, 0x01000193) >>> 0;
    state ^= state >>> 13;
    return ((state >>> ((r + c) % 16)) & 1) === 1;
  };

  for (let r = 0; r < MATRIX_SIZE; r++) {
    for (let c = 0; c < MATRIX_SIZE; c++) {
      if (!reserved[r]![c]) {
        grid[r]![c] = nextBit(r, c);
      }
    }
  }

  return grid;
}

export interface UnitQrCodeProps {
  value: string;
  size?: number;
  className?: string;
  /** When true, data modules stagger in from the center once via anime.js (finder patterns stay anchored). */
  animateBuild?: boolean;
}

function isFinderCell(r: number, c: number): boolean {
  const inTopLeft = r <= 6 && c <= 6;
  const inTopRight = r <= 6 && c >= MATRIX_SIZE - 7;
  const inBottomLeft = r >= MATRIX_SIZE - 7 && c <= 6;
  return inTopLeft || inTopRight || inBottomLeft;
}

export function UnitQrCode({
  value,
  size = 112,
  className,
  animateBuild = false,
}: UnitQrCodeProps) {
  const matrix = useMemo(() => generateDeterministicQrMatrix(value), [value]);
  const svgRef = useRef<SVGSVGElement>(null);

  useAnime(
    svgRef,
    (anime, el) => {
      const cells = el.querySelectorAll<SVGRectElement>('rect[data-qr-cell="data"]');
      if (cells.length === 0) return;
      return anime.animate(cells, {
        opacity: [0, 1],
        scale: [0.35, 1],
        duration: 380,
        delay: anime.stagger(6, { from: "center" }),
        ease: "outQuad",
      });
    },
    [value, animateBuild],
    {
      enabled: animateBuild,
      onReduced: (el) => {
        el.querySelectorAll<SVGRectElement>('rect[data-qr-cell="data"]').forEach((node) => {
          node.style.opacity = "1";
          node.style.transform = "none";
        });
      },
    },
  );

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 25 25"
      role="img"
      aria-label={`QR Code deep-link for ${value}`}
      className={cn("shrink-0 rounded-[2px] border border-border bg-white p-0.5", className)}
    >
      <title>{`ORION Deep-Link QR: ${value}`}</title>
      <rect x="0" y="0" width="25" height="25" fill="#FFFFFF" />
      {matrix.map((row, rIdx) =>
        row.map((cell, cIdx) =>
          cell ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              data-qr-cell={isFinderCell(rIdx, cIdx) ? "finder" : "data"}
              x={cIdx + 2}
              y={rIdx + 2}
              width="1"
              height="1"
              fill="#0E1116"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
