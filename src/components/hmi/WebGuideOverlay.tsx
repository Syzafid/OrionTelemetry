import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTelemetry } from "@/context/TelemetryContext";
import {
  GUIDE_SUBTAB_EVENT,
  WEB_GUIDE_TRACKS,
  getGuideTrack,
  markGuideTrackCompleted,
  type GuideTrackId,
} from "@/data/webGuideSteps";
import { cn } from "@/lib/utils";

export interface WebGuideOverlayProps {
  open: boolean;
  initialTrack?: GuideTrackId;
  onClose: () => void;
}

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

type SizePreset = "normal" | "slim" | "mini";
type ScrimMode = "focus" | "clear";
type DockPosition = "auto" | "bottom-left" | "bottom-right" | "top-right" | "top-left";
type MobileEdge = "bottom" | "top";

const GUIDE_SIZE_SESSION_KEY = "orion_guide_size_v1";
const GUIDE_SCRIM_SESSION_KEY = "orion_guide_scrim_v1";

const DOCK_CYCLE: DockPosition[] = ["auto", "bottom-left", "bottom-right", "top-right", "top-left"];
const DOCK_LABELS: Record<DockPosition, string> = {
  auto: "Auto",
  "bottom-left": "Kiri Bawah",
  "bottom-right": "Kanan Bawah",
  "top-right": "Kanan Atas",
  "top-left": "Kiri Atas",
};

const PRESET_WIDTHS: Record<SizePreset, number> = {
  normal: 360,
  slim: 292,
  mini: 288,
};

const PRESET_EST_HEIGHTS: Record<SizePreset, number> = {
  normal: 300,
  slim: 196,
  mini: 54,
};

// Keeps clear of FullscreenToggle at fixed right-3 top-2.5 (height ~54px)
const TOP_SAFE_MARGIN = 60;
const EDGE_MARGIN = 12;
const MIN_CARD_WIDTH = 260;
const MAX_CARD_WIDTH = 520;
const MIN_CARD_MAX_HEIGHT = 180;

const FALLBACK_TARGET_MAP: Record<string, string> = {
  "m02-quickjump": '[data-guide-target="m02-filter-bar"]',
  "m02-card-ticket": '[data-guide-target="m02-cards"]',
};

function readSessionSize(): SizePreset {
  if (typeof window === "undefined") return "normal";
  try {
    const raw = window.sessionStorage.getItem(GUIDE_SIZE_SESSION_KEY);
    if (raw === "normal" || raw === "slim" || raw === "mini") return raw;
    return "normal";
  } catch {
    return "normal";
  }
}

function readSessionScrim(): ScrimMode {
  if (typeof window === "undefined") return "focus";
  try {
    const raw = window.sessionStorage.getItem(GUIDE_SCRIM_SESSION_KEY);
    if (raw === "focus" || raw === "clear") return raw;
    return "focus";
  } catch {
    return "focus";
  }
}

function writeSessionPref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage unavailability in sandboxed browsers
  }
}

function clampCardPosition(
  x: number,
  y: number,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  const maxLeft = Math.max(8, vw - cardW - 8);
  const left = Math.round(Math.min(maxLeft, Math.max(8, x)));
  const overlapsFullscreenBtn = left + cardW > vw - 68;
  const minTop = overlapsFullscreenBtn ? TOP_SAFE_MARGIN : 8;
  const maxTop = Math.max(minTop, vh - cardH - 8);
  const top = Math.round(Math.min(maxTop, Math.max(minTop, y)));
  return { left, top };
}

function computeOverlapArea(a: BoxRect, b: BoxRect): number {
  const xOverlap = Math.max(
    0,
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top),
  );
  return xOverlap * yOverlap;
}

function computeAutoPosition(
  targetRect: HighlightRect | null,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  if (!targetRect) {
    return clampCardPosition(vw - cardW - 16, vh - cardH - 16, cardW, cardH, vw, vh);
  }

  const gap = 12;
  const candidates = [
    // Around highlighted area
    clampCardPosition(
      targetRect.left,
      targetRect.top + targetRect.height + gap,
      cardW,
      cardH,
      vw,
      vh,
    ),
    clampCardPosition(
      targetRect.left + targetRect.width - cardW,
      targetRect.top + targetRect.height + gap,
      cardW,
      cardH,
      vw,
      vh,
    ),
    clampCardPosition(targetRect.left, targetRect.top - cardH - gap, cardW, cardH, vw, vh),
    clampCardPosition(
      targetRect.left + targetRect.width - cardW,
      targetRect.top - cardH - gap,
      cardW,
      cardH,
      vw,
      vh,
    ),
    clampCardPosition(
      targetRect.left + targetRect.width + gap,
      targetRect.top,
      cardW,
      cardH,
      vw,
      vh,
    ),
    clampCardPosition(
      targetRect.left + targetRect.width + gap,
      targetRect.top + targetRect.height - cardH,
      cardW,
      cardH,
      vw,
      vh,
    ),
    clampCardPosition(targetRect.left - cardW - gap, targetRect.top, cardW, cardH, vw, vh),
    clampCardPosition(
      targetRect.left - cardW - gap,
      targetRect.top + targetRect.height - cardH,
      cardW,
      cardH,
      vw,
      vh,
    ),
    // 4 safe viewport corners
    clampCardPosition(vw - cardW - 16, vh - cardH - 16, cardW, cardH, vw, vh),
    clampCardPosition(16, vh - cardH - 16, cardW, cardH, vw, vh),
    clampCardPosition(vw - cardW - 16, TOP_SAFE_MARGIN, cardW, cardH, vw, vh),
    clampCardPosition(16, TOP_SAFE_MARGIN, cardW, cardH, vw, vh),
  ];

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  let best = candidates[0]!;
  let bestOverlap = Number.POSITIVE_INFINITY;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const pos of candidates) {
    const box: BoxRect = { left: pos.left, top: pos.top, width: cardW, height: cardH };
    const overlap = computeOverlapArea(box, targetRect);
    const centerX = pos.left + cardW / 2;
    const centerY = pos.top + cardH / 2;
    const dist = Math.hypot(centerX - targetCenterX, centerY - targetCenterY);

    if (overlap < bestOverlap - 1 || (Math.abs(overlap - bestOverlap) <= 1 && dist < bestDist)) {
      best = pos;
      bestOverlap = overlap;
      bestDist = dist;
    }
  }

  return best;
}

function computeDockedPosition(
  dock: Exclude<DockPosition, "auto">,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  switch (dock) {
    case "bottom-left":
      return clampCardPosition(16, vh - cardH - 16, cardW, cardH, vw, vh);
    case "bottom-right":
      return clampCardPosition(vw - cardW - 16, vh - cardH - 16, cardW, cardH, vw, vh);
    case "top-right":
      return clampCardPosition(vw - cardW - 16, TOP_SAFE_MARGIN, cardW, cardH, vw, vh);
    case "top-left":
      return clampCardPosition(16, TOP_SAFE_MARGIN, cardW, cardH, vw, vh);
  }
}

function computeMobilePosition(
  edge: MobileEdge,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  const centeredX = (vw - cardW) / 2;
  const y = edge === "top" ? TOP_SAFE_MARGIN : vh - cardH - EDGE_MARGIN;
  return clampCardPosition(centeredX, y, cardW, cardH, vw, vh);
}

function findVisibleTarget(selector: string, moduleId?: string): Element | null {
  if (typeof document === "undefined") return null;

  const tryMatches = (sel: string): Element | null => {
    const matches = Array.from(document.querySelectorAll(sel));
    for (const el of matches) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return null;
  };

  const direct = tryMatches(selector);
  if (direct) return direct;

  // Check optional secondary selector when e.g. 1-unit deck hides quick-jump or no warning ticket exists
  for (const [key, fallbackSel] of Object.entries(FALLBACK_TARGET_MAP)) {
    if (selector.includes(key)) {
      const alt = tryMatches(fallbackSel);
      if (alt) return alt;
    }
  }

  if (moduleId) {
    const fallbackMod = tryMatches(`[data-guide-target="module-${moduleId}"]`);
    if (fallbackMod) return fallbackMod;
    const fallbackTabs = tryMatches('[data-guide-target="module-tabs"]');
    if (fallbackTabs) return fallbackTabs;
  }

  return null;
}

function isEditableFocused(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Live-interactive, draggable, resizable guided tour for the ORION web dashboard.
 * Uses a pointer-events-none 4-strip scrim at z-[42] (with optional dark-free mode)
 * and a floating compact/movable card at z-[45] so users can interact with every control freely.
 */
export function WebGuideOverlay({ open, initialTrack = "01", onClose }: WebGuideOverlayProps) {
  const { activeModule, setActiveModule } = useTelemetry();
  const [trackId, setTrackId] = useState<GuideTrackId>(initialTrack);
  const [stepIndex, setStepIndex] = useState(0);
  const [sizePreset, setSizePreset] = useState<SizePreset>(() => readSessionSize());
  const [lastExpandedPreset, setLastExpandedPreset] = useState<"normal" | "slim">(() =>
    readSessionSize() === "slim" ? "slim" : "normal",
  );
  const [scrimMode, setScrimMode] = useState<ScrimMode>(() => readSessionScrim());
  const [dockPosition, setDockPosition] = useState<DockPosition>("auto");
  const [mobileEdge, setMobileEdge] = useState<MobileEdge>("bottom");
  const [customPos, setCustomPos] = useState<Point | null>(null);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [customMaxHeight, setCustomMaxHeight] = useState<number | null>(null);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [cardSize, setCardSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [viewport, setViewport] = useState(() =>
    typeof window !== "undefined"
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1280, height: 800 },
  );

  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrolledKeyRef = useRef<string>("");
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const resolvedPosRef = useRef<{ left: number; top: number }>({ left: 16, top: 68 });
  const effectiveDimsRef = useRef<{ width: number; height: number; maxHeight: number }>({
    width: PRESET_WIDTHS.normal,
    height: PRESET_EST_HEIGHTS.normal,
    maxHeight: 440,
  });

  const track = getGuideTrack(trackId);
  const steps = track.steps;
  const totalSteps = steps.length;
  const currentStep = steps[stepIndex] ?? steps[0]!;
  const isLastStep = stepIndex >= totalSteps - 1;
  const nextTrack = track.nextTrackId ? getGuideTrack(track.nextTrackId) : null;

  // Reset position overrides when overlay opens while preserving session size/scrim choice
  useEffect(() => {
    if (!open) return;
    const savedSize = readSessionSize();
    const savedScrim = readSessionScrim();
    setTrackId(initialTrack);
    setStepIndex(0);
    setSizePreset(savedSize);
    if (savedSize !== "mini") {
      setLastExpandedPreset(savedSize);
    }
    setScrimMode(savedScrim);
    setDockPosition("auto");
    setMobileEdge("bottom");
    setCustomPos(null);
    setCustomWidth(null);
    setCustomMaxHeight(null);
    setTrackMenuOpen(false);
    scrolledKeyRef.current = "";
    if (typeof window !== "undefined") {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
  }, [open, initialTrack]);

  // Cleanup active pointer listeners on unmount or close
  useEffect(() => {
    if (!open) {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    }
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    };
  }, [open]);

  // Measure actual rendered card size with ResizeObserver for accurate anti-overlap placement
  useEffect(() => {
    if (!open || typeof ResizeObserver === "undefined") return undefined;
    const node = cardRef.current;
    if (!node) return undefined;

    const updateMeasured = () => {
      const nextW = Math.round(node.offsetWidth);
      const nextH = Math.round(node.offsetHeight);
      if (nextW <= 0 && nextH <= 0) return;
      setCardSize((prev) => {
        if (Math.abs(prev.width - nextW) <= 1 && Math.abs(prev.height - nextH) <= 1) {
          return prev;
        }
        return { width: nextW, height: nextH };
      });
    };

    updateMeasured();
    const obs = new ResizeObserver(updateMeasured);
    obs.observe(node);
    return () => obs.disconnect();
  }, [open, sizePreset, stepIndex, trackId, trackMenuOpen, customWidth, customMaxHeight]);

  // Switch active dashboard module when step belongs to a module (`01`..`06`)
  useEffect(() => {
    if (!open || !currentStep.moduleId) return;
    setActiveModule(currentStep.moduleId);
  }, [open, currentStep.moduleId, setActiveModule]);

  // Align internal module sub-tabs (Menu 01 inspector, Menu 04 & Menu 06 sub-tabs)
  useEffect(() => {
    if (!open || typeof window === "undefined" || !currentStep.moduleId || !currentStep.subTab) {
      return undefined;
    }
    const dispatchSubTab = () => {
      window.dispatchEvent(
        new CustomEvent(GUIDE_SUBTAB_EVENT, {
          detail: { moduleId: currentStep.moduleId, subTab: currentStep.subTab },
        }),
      );
    };
    dispatchSubTab();
    const timerId = window.setTimeout(dispatchSubTab, 90);
    return () => window.clearTimeout(timerId);
  }, [open, currentStep.moduleId, currentStep.subTab, activeModule]);

  // Track viewport size, target ResizeObserver + scroll position cleanly with rAF throttling
  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") {
      setTargetRect(null);
      return undefined;
    }

    const stepKey = `${trackId}:${currentStep.id}`;
    let rafHandle: number | null = null;
    let resizeObs: ResizeObserver | null = null;
    let observedEl: Element | null = null;

    const measureNow = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewport({ width: vw, height: vh });

      const el = findVisibleTarget(currentStep.targetSelector, currentStep.moduleId);
      if (!el) {
        setTargetRect(null);
        return;
      }

      if (typeof ResizeObserver !== "undefined" && observedEl !== el) {
        resizeObs?.disconnect();
        resizeObs = new ResizeObserver(() => scheduleMeasure());
        resizeObs.observe(el);
        observedEl = el;
      }

      const raw = el.getBoundingClientRect();
      if (scrolledKeyRef.current !== stepKey) {
        scrolledKeyRef.current = stepKey;
        const outsideViewport =
          raw.top < 72 || raw.bottom > vh - 72 || raw.left < 0 || raw.right > vw;
        if (outsideViewport && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
      }

      // Clamp highlight spotlight cleanly within viewport so 4-strip scrim never inverts dimensions
      const pad = 4;
      const left = Math.max(4, Math.min(vw - 8, raw.left - pad));
      const top = Math.max(4, Math.min(vh - 8, raw.top - pad));
      const right = Math.max(left, Math.min(vw - 4, raw.right + pad));
      const bottom = Math.max(top, Math.min(vh - 4, raw.bottom + pad));
      const width = right - left;
      const height = bottom - top;

      if (width < 12 || height < 12) {
        setTargetRect(null);
        return;
      }

      setTargetRect({ top, left, width, height });
    };

    const scheduleMeasure = () => {
      if (rafHandle !== null) return;
      rafHandle = window.requestAnimationFrame(() => {
        rafHandle = null;
        measureNow();
      });
    };

    measureNow();
    const t1 = window.setTimeout(measureNow, 100);
    const t2 = window.setTimeout(measureNow, 280);

    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);

    return () => {
      if (rafHandle !== null) window.cancelAnimationFrame(rafHandle);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      resizeObs?.disconnect();
    };
  }, [
    open,
    trackId,
    currentStep.id,
    currentStep.targetSelector,
    currentStep.moduleId,
    activeModule,
  ]);

  const applySizePreset = useCallback((next: SizePreset) => {
    setSizePreset(next);
    if (next !== "mini") {
      setLastExpandedPreset(next);
      setCustomWidth(null);
    }
    writeSessionPref(GUIDE_SIZE_SESSION_KEY, next);
  }, []);

  const toggleNormalSlim = useCallback(() => {
    applySizePreset(sizePreset === "slim" ? "normal" : "slim");
  }, [applySizePreset, sizePreset]);

  const enterMiniMode = useCallback(() => {
    setTrackMenuOpen(false);
    applySizePreset("mini");
  }, [applySizePreset]);

  const exitMiniMode = useCallback(() => {
    applySizePreset(lastExpandedPreset);
  }, [applySizePreset, lastExpandedPreset]);

  const toggleScrimMode = useCallback(() => {
    setScrimMode((prev) => {
      const next: ScrimMode = prev === "focus" ? "clear" : "focus";
      writeSessionPref(GUIDE_SCRIM_SESSION_KEY, next);
      return next;
    });
  }, []);

  const dismissOverlay = useCallback(() => {
    onClose();
  }, [onClose]);

  const completeCurrentTrack = useCallback(() => {
    markGuideTrackCompleted(track.id);
    onClose();
  }, [track.id, onClose]);

  const switchTrack = useCallback((nextId: GuideTrackId) => {
    scrolledKeyRef.current = "";
    setTrackId(nextId);
    setStepIndex(0);
    setTrackMenuOpen(false);
  }, []);

  const advanceToNextTrack = useCallback(() => {
    if (!nextTrack) return;
    markGuideTrackCompleted(track.id);
    switchTrack(nextTrack.id);
  }, [track.id, nextTrack, switchTrack]);

  const goNext = useCallback(() => {
    setTrackMenuOpen(false);
    if (isLastStep) {
      completeCurrentTrack();
    } else {
      setStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
    }
  }, [isLastStep, completeCurrentTrack, totalSteps]);

  const goPrev = useCallback(() => {
    setTrackMenuOpen(false);
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const cycleDockPosition = useCallback(() => {
    if (customPos) {
      setCustomPos(null);
      setDockPosition("auto");
      return;
    }
    setDockPosition((prev) => {
      const idx = DOCK_CYCLE.indexOf(prev);
      return DOCK_CYCLE[(idx + 1) % DOCK_CYCLE.length] ?? "auto";
    });
  }, [customPos]);

  const toggleMobileEdge = useCallback(() => {
    setCustomPos(null);
    setMobileEdge((prev) => (prev === "bottom" ? "top" : "bottom"));
  }, []);

  const resetGeometry = useCallback(() => {
    setCustomPos(null);
    setDockPosition("auto");
    setMobileEdge("bottom");
    setCustomWidth(null);
    setCustomMaxHeight(null);
  }, []);

  // Drag handle for free repositioning anywhere inside viewport
  const handleDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest("button, a, input, select, textarea")) return;
    if (typeof window === "undefined") return;

    e.preventDefault();
    dragCleanupRef.current?.();

    const startX = e.clientX;
    const startY = e.clientY;
    const originLeft = resolvedPosRef.current.left;
    const originTop = resolvedPosRef.current.top;
    let moved = false;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore capture error if pointer already released
    }

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      setIsDragging(true);
      const dims = effectiveDimsRef.current;
      const clamped = clampCardPosition(
        originLeft + dx,
        originTop + dy,
        dims.width,
        dims.height,
        window.innerWidth,
        window.innerHeight,
      );
      setCustomPos({ x: clamped.left, y: clamped.top });
    };

    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      setIsDragging(false);
      dragCleanupRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    dragCleanupRef.current = stop;
  }, []);

  const handleDragDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest("button, a, input, select, textarea")) return;
    setCustomPos(null);
    setDockPosition("auto");
  }, []);

  // Corner grip for free width + max-height resize
  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (typeof window === "undefined") return;

      e.preventDefault();
      e.stopPropagation();
      resizeCleanupRef.current?.();

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = effectiveDimsRef.current.width;
      const startH = customMaxHeight ?? effectiveDimsRef.current.maxHeight;

      setIsResizing(true);
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore capture error
      }

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const maxW = Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, vw - 16));
        const maxH = Math.max(MIN_CARD_MAX_HEIGHT, Math.round(vh * 0.78));
        const nextW = Math.round(Math.min(maxW, Math.max(MIN_CARD_WIDTH, startW + dx)));
        const nextH = Math.round(Math.min(maxH, Math.max(MIN_CARD_MAX_HEIGHT, startH + dy)));
        setCustomWidth(nextW);
        setCustomMaxHeight(nextH);
      };

      const stop = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        setIsResizing(false);
        resizeCleanupRef.current = null;
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
      resizeCleanupRef.current = stop;
    },
    [customMaxHeight],
  );

  // Safe keyboard navigation: ignore arrows in editable fields and Escape when a modal is on top
  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      const hasModalDialogOnTop = Boolean(
        document.querySelector('[role="dialog"][aria-modal="true"]'),
      );
      if (e.key === "Escape") {
        if (hasModalDialogOnTop) return;
        e.preventDefault();
        dismissOverlay();
        return;
      }
      if (hasModalDialogOnTop || isEditableFocused(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismissOverlay, goNext, goPrev]);

  if (!open) return null;

  const isDesktop = viewport.width >= 768;
  const maxAllowedWidth = Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, viewport.width - 16));
  const rawWidth =
    sizePreset === "mini" ? PRESET_WIDTHS.mini : (customWidth ?? PRESET_WIDTHS[sizePreset]);
  const effectiveWidth = Math.max(
    Math.min(MIN_CARD_WIDTH, viewport.width - 16),
    Math.min(rawWidth, maxAllowedWidth, viewport.width - 16),
  );

  const maxAllowedHeight = Math.max(MIN_CARD_MAX_HEIGHT, Math.round(viewport.height * 0.78));
  const effectiveMaxHeight =
    sizePreset === "mini"
      ? undefined
      : Math.min(
          Math.max(MIN_CARD_MAX_HEIGHT, customMaxHeight ?? (isDesktop ? 440 : 380)),
          maxAllowedHeight,
        );

  const estHeight =
    sizePreset === "mini"
      ? cardSize.height > 0 && cardSize.height <= 96
        ? cardSize.height
        : PRESET_EST_HEIGHTS.mini
      : Math.min(
          cardSize.height > 0 ? cardSize.height : PRESET_EST_HEIGHTS[sizePreset],
          effectiveMaxHeight ?? maxAllowedHeight,
        );

  let resolvedPos: { left: number; top: number };
  if (customPos) {
    resolvedPos = clampCardPosition(
      customPos.x,
      customPos.y,
      effectiveWidth,
      estHeight,
      viewport.width,
      viewport.height,
    );
  } else if (!isDesktop) {
    resolvedPos = computeMobilePosition(
      mobileEdge,
      effectiveWidth,
      estHeight,
      viewport.width,
      viewport.height,
    );
  } else if (dockPosition !== "auto") {
    resolvedPos = computeDockedPosition(
      dockPosition,
      effectiveWidth,
      estHeight,
      viewport.width,
      viewport.height,
    );
  } else {
    resolvedPos = computeAutoPosition(
      targetRect,
      effectiveWidth,
      estHeight,
      viewport.width,
      viewport.height,
    );
  }

  resolvedPosRef.current = resolvedPos;
  effectiveDimsRef.current = {
    width: effectiveWidth,
    height: estHeight,
    maxHeight: effectiveMaxHeight ?? PRESET_EST_HEIGHTS.mini,
  };

  const dockMode = customPos ? "custom" : isDesktop ? dockPosition : mobileEdge;
  const hasCustomGeometry = Boolean(customPos || customWidth !== null || customMaxHeight !== null);
  const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const dimStripTone = sizePreset === "mini" ? "bg-black/16" : "bg-black/28";

  const cardStyle: React.CSSProperties = {
    left: `${resolvedPos.left}px`,
    top: `${resolvedPos.top}px`,
    width: `${effectiveWidth}px`,
    ...(effectiveMaxHeight !== undefined ? { maxHeight: `${effectiveMaxHeight}px` } : {}),
  };

  return (
    <>
      {/* Non-blocking highlight scrim at z-[42] (below z-50 app modals) */}
      {targetRect && (
        <div
          data-testid="guide-scrim-layer"
          aria-hidden="true"
          className="fixed inset-0 z-[42] pointer-events-none"
        >
          {scrimMode === "focus" && (
            <>
              <div
                data-testid="guide-scrim-dim"
                className={cn("fixed left-0 right-0 top-0 pointer-events-none", dimStripTone)}
                style={{ height: `${targetRect.top}px` }}
              />
              <div
                data-testid="guide-scrim-dim"
                className={cn("fixed left-0 right-0 bottom-0 pointer-events-none", dimStripTone)}
                style={{ top: `${targetRect.top + targetRect.height}px` }}
              />
              <div
                data-testid="guide-scrim-dim"
                className={cn("fixed left-0 pointer-events-none", dimStripTone)}
                style={{
                  top: `${targetRect.top}px`,
                  width: `${targetRect.left}px`,
                  height: `${targetRect.height}px`,
                }}
              />
              <div
                data-testid="guide-scrim-dim"
                className={cn("fixed right-0 pointer-events-none", dimStripTone)}
                style={{
                  top: `${targetRect.top}px`,
                  left: `${targetRect.left + targetRect.width}px`,
                  height: `${targetRect.height}px`,
                }}
              />
            </>
          )}
          <div
            data-testid="guide-highlight-frame"
            className="fixed rounded-[2px] border-2 border-foreground transition-all duration-150 pointer-events-none"
            style={{
              top: `${targetRect.top}px`,
              left: `${targetRect.left}px`,
              width: `${targetRect.width}px`,
              height: `${targetRect.height}px`,
            }}
          />
        </div>
      )}

      {/* Non-modal, draggable & resizable floating Guide Card at z-[45] */}
      <div
        ref={cardRef}
        role="region"
        aria-label="Panduan penggunaan web ORION"
        data-size-preset={sizePreset}
        data-dock-mode={dockMode}
        style={cardStyle}
        className={cn(
          "fixed z-[45] pointer-events-auto flex flex-col rounded-[2px] border border-foreground/75 bg-card text-foreground",
          (isDragging || isResizing) && "select-none",
        )}
      >
        {sizePreset === "mini" ? (
          <div
            data-testid="guide-drag-handle"
            onPointerDown={handleDragStart}
            onDoubleClick={handleDragDoubleClick}
            title="Seret untuk memindahkan bar panduan (klik ganda untuk posisi otomatis)"
            className={cn(
              "flex items-center justify-between gap-2 px-2.5 py-1.5 touch-none select-none",
              isDragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <GripHorizontal
                size={14}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="num text-[10px] font-semibold uppercase tracking-wider text-emerald">
                  {track.shortLabel} · {stepIndex + 1}/{totalSteps}
                </div>
                <div className="truncate font-display text-xs font-semibold text-foreground">
                  {currentStep.title}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                onClick={goPrev}
                disabled={stepIndex === 0}
                aria-label="Langkah sebelumnya"
                className="min-h-[44px] min-w-[44px] md:min-h-[30px] md:min-w-[30px] md:h-[30px] rounded-[2px] border-border bg-background px-1.5 text-foreground hover:bg-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={goNext}
                aria-label={isLastStep ? "Selesai" : "Langkah berikutnya"}
                className="min-h-[44px] min-w-[44px] md:min-h-[30px] md:min-w-[30px] md:h-[30px] rounded-[2px] border-border bg-background px-1.5 text-foreground hover:bg-secondary cursor-pointer"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={exitMiniMode}
                aria-label="Perluas kartu panduan"
                title="Kembalikan ke tampilan kartu"
                className="min-h-[44px] md:min-h-[30px] md:h-[30px] gap-1 rounded-[2px] border-border bg-secondary/60 px-2 num text-[11px] text-foreground hover:bg-secondary cursor-pointer"
              >
                <Maximize2 size={12} aria-hidden="true" />
                <span className="hidden sm:inline">Perluas</span>
              </Button>
              <button
                type="button"
                onClick={dismissOverlay}
                aria-label="Tutup panduan"
                className="grid min-h-[44px] min-w-[44px] md:min-h-[30px] md:min-w-[30px] cursor-pointer place-items-center rounded-[2px] border border-border bg-background text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Top Drag Bar + Track Picker + Quick Layout Controls */}
            <div
              data-testid="guide-drag-handle"
              onPointerDown={handleDragStart}
              onDoubleClick={handleDragDoubleClick}
              title="Seret bar ini untuk memindahkan posisi kartu (klik ganda untuk Auto)"
              className={cn(
                "flex flex-wrap items-center justify-between gap-1 border-b border-border bg-secondary/45 px-2.5 py-1.5 touch-none select-none",
                isDragging ? "cursor-grabbing" : "cursor-grab",
              )}
            >
              <div className="flex min-w-0 items-center gap-1">
                <GripHorizontal
                  size={14}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => setTrackMenuOpen((prev) => !prev)}
                  aria-expanded={trackMenuOpen}
                  aria-controls="guide-track-switcher"
                  aria-label="Pilih menu panduan"
                  className="inline-flex min-h-[44px] md:min-h-[30px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-background/80 px-2 num text-[11px] font-semibold uppercase tracking-wider text-emerald transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">
                    {sizePreset === "slim" && track.id === "overview" ? "Nav" : track.shortLabel} ·{" "}
                    {stepIndex + 1}/{totalSteps}
                  </span>
                  <ChevronDown
                    size={12}
                    aria-hidden="true"
                    className={cn("shrink-0 transition-transform", trackMenuOpen && "rotate-180")}
                  />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleScrimMode}
                  aria-pressed={scrimMode === "clear"}
                  aria-label={
                    scrimMode === "focus"
                      ? "Mode layar bebas tanpa lapisan gelap"
                      : "Aktifkan lapisan sorotan gelap"
                  }
                  title={
                    scrimMode === "focus"
                      ? "Matikan lapisan gelap agar layar terlihat bebas penuh"
                      : "Aktifkan lapisan sorotan tipis"
                  }
                  className={cn(
                    "inline-flex min-h-[44px] min-w-[44px] md:min-h-[30px] md:min-w-[30px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border px-1.5 num text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    scrimMode === "clear"
                      ? "border-emerald/60 bg-emerald/15 text-emerald"
                      : "border-border bg-background/70 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                  )}
                >
                  {scrimMode === "focus" ? (
                    <EyeOff size={12} aria-hidden="true" />
                  ) : (
                    <Eye size={12} aria-hidden="true" />
                  )}
                  {sizePreset === "normal" && (
                    <span className="hidden sm:inline">
                      {scrimMode === "clear" ? "Bebas" : "Fokus"}
                    </span>
                  )}
                </button>

                {isDesktop ? (
                  <button
                    type="button"
                    onClick={cycleDockPosition}
                    aria-label="Pindah posisi kartu panduan"
                    title={
                      customPos
                        ? "Kembalikan ke posisi otomatis"
                        : `Posisi: ${DOCK_LABELS[dockPosition]} (klik untuk pindah sudut)`
                    }
                    className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[30px] md:min-w-[30px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-border bg-background/70 px-1.5 num text-[11px] text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Move size={12} aria-hidden="true" />
                    {sizePreset === "normal" && (
                      <span>{customPos ? "Auto" : DOCK_LABELS[dockPosition]}</span>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={toggleMobileEdge}
                    aria-label={
                      mobileEdge === "bottom"
                        ? "Pindah posisi kartu panduan ke atas"
                        : "Pindah posisi kartu panduan ke bawah"
                    }
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-background/70 px-2 num text-[11px] text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {mobileEdge === "bottom" ? (
                      <>
                        <ArrowUp size={12} aria-hidden="true" />
                        <span>Atas</span>
                      </>
                    ) : (
                      <>
                        <ArrowDown size={12} aria-hidden="true" />
                        <span>Bawah</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleNormalSlim}
                  aria-label={
                    sizePreset === "slim" ? "Perbesar kartu panduan" : "Perkecil kartu panduan"
                  }
                  title={
                    sizePreset === "slim"
                      ? "Kembali ke ukuran normal"
                      : "Perkecil kartu agar hemat ruang"
                  }
                  className="inline-flex min-h-[44px] md:min-h-[30px] cursor-pointer items-center justify-center rounded-[2px] border border-border bg-background/70 px-2 num text-[11px] text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{sizePreset === "slim" ? "Normal" : "Kecil"}</span>
                </button>

                <button
                  type="button"
                  onClick={enterMiniMode}
                  aria-label="Ringkas kartu panduan"
                  title="Lipat menjadi bar mini"
                  className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[30px] md:min-w-[30px] cursor-pointer items-center justify-center rounded-[2px] border border-border bg-background/70 px-1.5 text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Minimize2 size={12} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={dismissOverlay}
                  aria-label="Tutup panduan"
                  className="grid min-h-[44px] min-w-[44px] md:min-h-[30px] md:min-w-[30px] cursor-pointer place-items-center rounded-[2px] border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Collapsible Track Picker (frees vertical room when closed) */}
            {trackMenuOpen && (
              <div
                id="guide-track-switcher"
                role="group"
                aria-label="Pilih paket panduan menu"
                className="flex items-center gap-1 overflow-x-auto card-scroll border-b border-border bg-secondary/25 px-2.5 py-1.5"
              >
                {WEB_GUIDE_TRACKS.map((item) => {
                  const active = item.id === track.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => switchTrack(item.id)}
                      className={cn(
                        "min-h-[44px] md:min-h-[30px] shrink-0 cursor-pointer rounded-[2px] border px-2 py-0.5 num text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-foreground bg-foreground text-background font-semibold"
                          : "border-border bg-secondary/50 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                      )}
                    >
                      {item.id === "overview" ? "Navigasi" : item.id}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Progress Bar */}
            <div aria-hidden="true" className="h-0.5 w-full shrink-0 bg-secondary">
              <div
                className="h-full bg-foreground transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Scrollable Body */}
            <div
              className={cn(
                "flex-1 min-h-0 overflow-y-auto card-scroll",
                sizePreset === "slim" ? "px-2.5 py-2" : "px-3 py-2.5",
              )}
            >
              <h3
                className={cn(
                  "font-display font-semibold tracking-tight text-foreground",
                  sizePreset === "slim" ? "text-[13px] leading-snug" : "text-[14px] leading-snug",
                )}
              >
                {currentStep.title}
              </h3>
              <p
                className={cn(
                  "mt-1 leading-relaxed text-muted-foreground",
                  sizePreset === "slim" ? "text-[11px]" : "text-xs",
                )}
              >
                {currentStep.description}
              </p>

              {currentStep.tryAction && (
                <div
                  className={cn(
                    "mt-2 rounded-[2px] border border-emerald/45 bg-emerald/10 text-foreground",
                    sizePreset === "slim"
                      ? "px-2 py-1.5 text-[11px] leading-snug"
                      : "px-2.5 py-1.5 text-[11px] leading-relaxed",
                  )}
                >
                  <span className="num font-semibold text-emerald mr-1">Coba:</span>
                  <span>{currentStep.tryAction}</span>
                </div>
              )}

              {sizePreset === "normal" && (
                <div className="mt-2 rounded-[2px] border border-border bg-secondary/45 px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground">
                  <span className="num font-semibold text-amber mr-1">Tips:</span>
                  <span className="text-muted-foreground">{currentStep.tip}</span>
                </div>
              )}
            </div>

            {/* Footer (pr-6 keeps clear of bottom-right resize grip) */}
            <div className="relative flex shrink-0 items-center justify-between gap-1.5 border-t border-border px-2.5 py-2 pr-6">
              {hasCustomGeometry ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetGeometry}
                  aria-label="Reset posisi dan ukuran panduan"
                  className="min-h-[44px] md:min-h-[32px] md:h-8 gap-1 rounded-[2px] px-2 num text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>Reset</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={dismissOverlay}
                  className="min-h-[44px] md:min-h-[32px] md:h-8 rounded-[2px] px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Tutup
                </Button>
              )}

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goPrev}
                  disabled={stepIndex === 0}
                  aria-label="Sebelumnya"
                  className="min-h-[44px] min-w-[44px] md:min-h-[32px] md:h-8 gap-1 rounded-[2px] border-border bg-background px-2 text-xs text-foreground hover:bg-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={13} aria-hidden="true" />
                  {sizePreset === "normal" && <span>Sebelumnya</span>}
                </Button>
                {isLastStep && nextTrack ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={completeCurrentTrack}
                      className="min-h-[44px] md:min-h-[32px] md:h-8 rounded-[2px] border-border bg-background px-2.5 text-xs text-foreground hover:bg-secondary cursor-pointer"
                    >
                      Selesai
                    </Button>
                    <Button
                      type="button"
                      onClick={advanceToNextTrack}
                      className="min-h-[44px] md:min-h-[32px] md:h-8 gap-1 rounded-[2px] bg-foreground px-2.5 text-xs font-medium text-background hover:bg-foreground/90 cursor-pointer"
                    >
                      <span>
                        {sizePreset === "slim"
                          ? nextTrack.shortLabel
                          : `Lanjut: ${nextTrack.shortLabel}`}
                      </span>
                      <ChevronRight size={13} aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={goNext}
                    className="min-h-[44px] md:min-h-[32px] md:h-8 gap-1 rounded-[2px] bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/90 cursor-pointer"
                  >
                    <span>{isLastStep ? "Selesai" : "Lanjut"}</span>
                    {!isLastStep && <ChevronRight size={13} aria-hidden="true" />}
                  </Button>
                )}
              </div>

              {/* Bottom-Right Free Resize Handle */}
              <div
                data-testid="guide-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Ubah ukuran kartu panduan"
                title="Seret sudut ini untuk memperkecil atau memperbesar ukuran kartu"
                onPointerDown={handleResizeStart}
                className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end p-1 text-muted-foreground/75 transition-colors hover:text-foreground"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                  className="pointer-events-none"
                >
                  <path d="M9 3L3 9M9 6.5L6.5 9" stroke="currentColor" strokeWidth="1.25" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
