/**
 * Shared motion tokens for ORION HMI.
 * Motion is reserved for abnormal states and operator-action feedback (ISA-101).
 * Only transform / opacity (and SVG stroke-dashoffset) are animated.
 */

export const DURATION = {
  /** hover, list highlight, press */
  instant: 0.12,
  /** modal, toast, module switch */
  quick: 0.18,
  /** layout reflow, tab indicator */
  deliberate: 0.32,
  /** once-per-session moments: QR build, resolve check, logo draw */
  ceremony: 0.7,
} as const;

/** Durations in milliseconds for anime.js. */
export const DURATION_MS = {
  instant: 120,
  quick: 180,
  deliberate: 320,
  ceremony: 700,
} as const;

/** Standard decelerate curve, no overshoot. */
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;
/** Exit curve: accelerates out. */
export const EASE_EXIT = [0.3, 0, 1, 1] as const;

/** Critically damped spring for physical gauges (no overshoot past redline). */
export const SPRING_GAUGE = { stiffness: 170, damping: 26, mass: 1 } as const;

/** Layout spring for card reflow, tuned to settle near `deliberate`. */
export const SPRING_LAYOUT = { type: "spring", stiffness: 420, damping: 40, mass: 1 } as const;

/** Returns true when the user asked the OS to reduce motion. SSR-safe. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
