import { useId, useRef } from "react";
import { useAnime } from "@/hooks/useAnime";
import { cn } from "@/lib/utils";

export type OrionLogoVariant =
  | "horizontal"
  | "wordmark"
  | "stacked"
  | "icon"
  | "emblem"
  | "mono-dark"
  | "mono-light";

export interface OrionLogoProps {
  variant?: OrionLogoVariant;
  theme?: "dark" | "light";
  /**
   * "img" loads the official static SVG asset from `/logo/orion_*.svg`.
   * "svg" renders the exact mathematical vector geometry inline (useful for transparent header lockups).
   */
  mode?: "img" | "svg";
  /** Runs a once-per-session SVG reveal choreography via anime.js. */
  animateDraw?: boolean;
  className?: string;
  alt?: string;
}

const ASSET_MAP: Record<Exclude<OrionLogoVariant, "emblem">, { dark: string; light: string }> = {
  horizontal: {
    dark: "/logo/orion_horizontal_dark.svg",
    light: "/logo/orion_horizontal_light.svg",
  },
  wordmark: {
    dark: "/logo/orion_wordmark_O4_dark.svg",
    light: "/logo/orion_wordmark_O4_light.svg",
  },
  stacked: {
    dark: "/logo/orion_stacked_dark.svg",
    light: "/logo/orion_stacked_light.svg",
  },
  icon: {
    dark: "/logo/orion_icon_dark.svg",
    light: "/logo/orion_icon_light.svg",
  },
  "mono-dark": {
    dark: "/logo/orion_mono_ondark.svg",
    light: "/logo/orion_mono_ondark.svg",
  },
  "mono-light": {
    dark: "/logo/orion_mono_onwhite.svg",
    light: "/logo/orion_mono_onwhite.svg",
  },
};

/**
 * Official ORION Brand Identity Component
 * ("Onboard Reporting for Inventory & Operational Notifications")
 *
 * Strictly flat 2D vector geometry per ORION brand guidelines:
 * - Open Omicron ring (top-right aperture) + Betelgeuse star dot
 * - 3-blade fractured Delta triangle core
 * - 3 Orion Belt stars along the lower bar
 * - Crimson gradient (#E0393E -> #8E1218)
 * - Zero 3D, bevel, neon, or drop-shadow glow effects
 */
const LOGO_DRAWN_SESSION_KEY = "orion_logo_drawn_v1";

export function OrionLogo({
  variant = "icon",
  theme = "dark",
  mode = "img",
  animateDraw = false,
  className,
  alt = "ORION: Onboard Reporting for Inventory & Operational Notifications",
}: OrionLogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradId = `orion-grad-${uid}`;
  const maskId = `orion-mask-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);

  useAnime(
    svgRef,
    (anime, el) => {
      try {
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(LOGO_DRAWN_SESSION_KEY) === "1") {
          return;
        }
        sessionStorage.setItem(LOGO_DRAWN_SESSION_KEY, "1");
      } catch {
        // ignore storage restrictions
      }
      const core = el.querySelector("[data-orion-core='1']");
      const star = el.querySelector("[data-orion-star='1']");
      const anims = [];
      if (core) {
        anims.push(
          anime.animate(core, {
            opacity: [0, 1],
            scale: [0.88, 1],
            duration: 620,
            ease: "outQuad",
          }),
        );
      }
      if (star) {
        anims.push(
          anime.animate(star, {
            opacity: [0, 1],
            scale: [0.3, 1],
            delay: 260,
            duration: 420,
            ease: "outQuad",
          }),
        );
      }
      return anims;
    },
    [animateDraw],
    { enabled: animateDraw },
  );

  if (variant !== "emblem" && mode === "img" && !animateDraw) {
    const src = ASSET_MAP[variant][theme];
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn("select-none object-contain", className)}
      />
    );
  }

  const isMonoDark = variant === "mono-dark";
  const isMonoLight = variant === "mono-light";
  const fillVal = isMonoDark ? "#FFFFFF" : isMonoLight ? "#000000" : `url(#${gradId})`;
  const bgFill =
    theme === "light" || isMonoLight
      ? "#F2EFE9"
      : isMonoDark
        ? "#1E1E1E"
        : "#0E1116";
  const strokeColor = theme === "light" || isMonoLight ? "#14171F" : "#E8E4DC";

  // Exact inline vector fallback / transparent emblem lockup matching `/logo/orion_icon_dark.svg`
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 240"
      role="img"
      aria-label={alt}
      className={cn("select-none shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1="-110" x2="0" y2="110">
          <stop offset="0" stopColor="#E0393E" />
          <stop offset="1" stopColor="#8E1218" />
        </linearGradient>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-130" y="-130" width="260" height="260">
          <rect x="-130" y="-130" width="260" height="260" fill="#000" />
          <path
            d="M-112 -4 A112 108 0 1 0 112 -4 A112 108 0 1 0 -112 -4 Z M-98 -4 A98 102.5 0 1 0 98 -4 A98 102.5 0 1 0 -98 -4 Z"
            fill="#fff"
            fillRule="evenodd"
          />
          <path d="M0.00 -4.00 L156.49 -70.42 L120.21 -124.21 L66.42 -160.49 Z" fill="#000" />
          <path
            d="M0.00 -70.00 L-72.00 56.00 L72.00 56.00 Z M-0.00 -49.84 L-51.91 41.00 L51.91 41.00 Z"
            fill="#fff"
            fillRule="evenodd"
          />
          <path d="M-3.39 -32.82 L-33.95 20.65 L-18.39 18.61 L-5.22 -4.42 Z" fill="#fff" />
          <path d="M-35.64 35.50 L25.46 35.50 L15.88 23.00 L-10.45 23.00 Z" fill="#fff" />
          <path d="M39.04 29.56 L8.49 -23.91 L2.51 -9.18 L15.67 13.86 Z" fill="#fff" />
          <circle cx="-16" cy="48.50" r="4.6" fill="#000" />
          <circle cx="0" cy="48.50" r="4.6" fill="#000" />
          <circle cx="16" cy="48.50" r="4.6" fill="#000" />
        </mask>
      </defs>
      {variant !== "emblem" && (
        <rect
          width="240"
          height="240"
          rx="54"
          fill={bgFill}
          stroke={strokeColor}
          strokeOpacity="0.14"
        />
      )}
      <g transform={variant === "emblem" ? "translate(120 124) scale(0.92)" : "translate(120 126) scale(0.8)"}>
        <rect
          data-orion-core="1"
          x="-130"
          y="-130"
          width="260"
          height="260"
          fill={fillVal}
          mask={`url(#${maskId})`}
        />
        <circle data-orion-star="1" cx="72.76" cy="-76.93" r="11.5" fill={fillVal} />
      </g>
    </svg>
  );
}

