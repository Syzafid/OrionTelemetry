import { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { useAnime } from "@/hooks/useAnime";
import { DURATION_MS } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

/**
 * One-shot attention flash for a card that just entered an abnormal state.
 * Edge-triggered by `flashKey` (increments on each new alarm), never loops (ISA-101).
 */
export function CriticalFlash({ flashKey }: { flashKey: number }) {
  if (flashKey <= 0) return null;
  return (
    <m.span
      key={flashKey}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 border-2 border-crimson"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0.15, 1, 0] }}
      transition={{ duration: 0.6, times: [0, 0.2, 0.5, 0.7, 1], ease: "linear" }}
    />
  );
}

/**
 * Tracks units that newly enter a critical state between renders.
 * Returns a map unit_id -> flash counter. The first observation never flashes,
 * so opening the module does not set off every existing alarm at once.
 */
export function useCriticalEdges(critical: Record<string, boolean>): Record<string, number> {
  const prevRef = useRef<Record<string, boolean> | null>(null);
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const signature = Object.keys(critical)
    .sort()
    .map((k) => `${k}:${critical[k] ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { ...critical };
    if (!prev) return;
    const rising = Object.keys(critical).filter((id) => critical[id] && prev[id] === false);
    if (rising.length === 0) return;
    setFlashes((cur) => {
      const next = { ...cur };
      for (const id of rising) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return flashes;
}

/**
 * Check mark drawn with anime.js when a maintenance ticket becomes RESOLVED.
 * `animateIn` is true only for a transition that happened in this session;
 * already-resolved tickets render the final mark without motion.
 */
export function ResolveCheck({ animateIn, className }: { animateIn: boolean; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useAnime(
    ref,
    (anime, el) => {
      const paths = el.querySelectorAll("path");
      const drawables = anime.svg.createDrawable(paths);
      return anime.animate(drawables, {
        draw: ["0 0", "0 1"],
        duration: 450,
        delay: anime.stagger(150),
        ease: "outQuad",
      });
    },
    [animateIn],
    { enabled: animateIn },
  );

  return (
    <svg
      ref={ref}
      viewBox="0 0 16 16"
      width={14}
      height={14}
      aria-hidden="true"
      className={cn("shrink-0 text-emerald", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13Z" />
      <path d="M5 8.2l2 2l4-4.4" />
    </svg>
  );
}

/**
 * Recharts animates on every data change, which looks like jitter when the
 * live API polls every few seconds. Allow the intro animation only, then settle.
 */
export function useChartIntroOnly(settleMs = DURATION_MS.ceremony + 500): boolean {
  const [active, setActive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setActive(false), settleMs);
    return () => clearTimeout(t);
  }, [settleMs]);
  return active;
}
