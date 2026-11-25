import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, Maximize2, Minimize2, Move, X } from "lucide-react";
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

type DockPosition = "auto" | "bottom-left" | "bottom-right" | "top-right";

const DOCK_CYCLE: DockPosition[] = ["auto", "bottom-left", "bottom-right", "top-right"];

const FALLBACK_TARGET_MAP: Record<string, string> = {
  "m02-quickjump": '[data-guide-target="m02-filter-bar"]',
  "m02-card-ticket": '[data-guide-target="m02-cards"]',
};

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
 * Live-interactive, non-blocking guided tour for the ORION web dashboard.
 * Uses a pointer-events-none 4-strip scrim at z-[42] and a floating control card at z-[45]
 * (below app dialogs/popovers at z-50) so users can freely click, type, and scroll inside highlighted panels.
 */
export function WebGuideOverlay({ open, initialTrack = "01", onClose }: WebGuideOverlayProps) {
  const { activeModule, setActiveModule } = useTelemetry();
  const [trackId, setTrackId] = useState<GuideTrackId>(initialTrack);
  const [stepIndex, setStepIndex] = useState(0);
  const [compact, setCompact] = useState(false);
  const [dockPosition, setDockPosition] = useState<DockPosition>("auto");
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const scrolledKeyRef = useRef<string>("");

  const track = getGuideTrack(trackId);
  const steps = track.steps;
  const totalSteps = steps.length;
  const currentStep = steps[stepIndex] ?? steps[0]!;
  const isLastStep = stepIndex >= totalSteps - 1;
  const nextTrack = track.nextTrackId ? getGuideTrack(track.nextTrackId) : null;

  // Sync initial track and reset state when overlay opens
  useEffect(() => {
    if (open) {
      setTrackId(initialTrack);
      setStepIndex(0);
      setCompact(false);
      setDockPosition("auto");
      scrolledKeyRef.current = "";
    }
  }, [open, initialTrack]);

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
  }, []);

  const advanceToNextTrack = useCallback(() => {
    if (!nextTrack) return;
    markGuideTrackCompleted(track.id);
    switchTrack(nextTrack.id);
  }, [track.id, nextTrack, switchTrack]);

  const goNext = useCallback(() => {
    if (isLastStep) {
      completeCurrentTrack();
    } else {
      setStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
    }
  }, [isLastStep, completeCurrentTrack, totalSteps]);

  const goPrev = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const cycleDockPosition = useCallback(() => {
    setDockPosition((prev) => {
      const idx = DOCK_CYCLE.indexOf(prev);
      return DOCK_CYCLE[(idx + 1) % DOCK_CYCLE.length] ?? "auto";
    });
  }, []);

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
  const cardWidth = compact
    ? Math.min(620, viewport.width - 24)
    : Math.min(440, viewport.width - 24);
  let cardStyle: React.CSSProperties;

  if (compact || !isDesktop) {
    cardStyle = {
      left: "50%",
      bottom: "12px",
      transform: "translateX(-50%)",
      width: `${cardWidth}px`,
    };
  } else if (dockPosition === "bottom-left") {
    cardStyle = { left: "16px", bottom: "16px", width: `${cardWidth}px` };
  } else if (dockPosition === "bottom-right") {
    cardStyle = { right: "16px", bottom: "16px", width: `${cardWidth}px` };
  } else if (dockPosition === "top-right") {
    cardStyle = { right: "16px", top: "68px", width: `${cardWidth}px` };
  } else if (targetRect) {
    const spaceBelow = viewport.height - (targetRect.top + targetRect.height);
    const spaceAbove = targetRect.top;
    const spaceRight = viewport.width - (targetRect.left + targetRect.width);
    const spaceLeft = targetRect.left;
    const clampLeft = Math.min(
      Math.max(16, targetRect.left),
      Math.max(16, viewport.width - cardWidth - 16),
    );
    const clampTop = Math.min(Math.max(68, targetRect.top), Math.max(68, viewport.height - 360));

    if (spaceBelow >= 340) {
      cardStyle = {
        top: `${targetRect.top + targetRect.height + 12}px`,
        left: `${clampLeft}px`,
        width: `${cardWidth}px`,
      };
    } else if (spaceAbove >= 340) {
      cardStyle = {
        bottom: `${viewport.height - targetRect.top + 12}px`,
        left: `${clampLeft}px`,
        width: `${cardWidth}px`,
      };
    } else if (spaceRight >= cardWidth + 24) {
      cardStyle = {
        top: `${clampTop}px`,
        left: `${targetRect.left + targetRect.width + 12}px`,
        width: `${cardWidth}px`,
      };
    } else if (spaceLeft >= cardWidth + 24) {
      cardStyle = {
        top: `${clampTop}px`,
        right: `${viewport.width - targetRect.left + 12}px`,
        width: `${cardWidth}px`,
      };
    } else {
      cardStyle = {
        right: "16px",
        bottom: "16px",
        width: `${cardWidth}px`,
      };
    }
  } else {
    cardStyle = {
      right: "16px",
      bottom: "16px",
      width: `${cardWidth}px`,
    };
  }

  const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <>
      {/* Non-blocking 4-strip scrim + crisp highlight border at z-[42] (below z-50 app modals) */}
      {targetRect && (
        <div
          data-testid="guide-scrim-layer"
          aria-hidden="true"
          className="fixed inset-0 z-[42] pointer-events-none"
        >
          {/* Top strip */}
          <div
            className="fixed left-0 right-0 top-0 bg-black/52 pointer-events-none"
            style={{ height: `${targetRect.top}px` }}
          />
          {/* Bottom strip */}
          <div
            className="fixed left-0 right-0 bottom-0 bg-black/52 pointer-events-none"
            style={{ top: `${targetRect.top + targetRect.height}px` }}
          />
          {/* Left strip */}
          <div
            className="fixed left-0 bg-black/52 pointer-events-none"
            style={{
              top: `${targetRect.top}px`,
              width: `${targetRect.left}px`,
              height: `${targetRect.height}px`,
            }}
          />
          {/* Right strip */}
          <div
            className="fixed right-0 bg-black/52 pointer-events-none"
            style={{
              top: `${targetRect.top}px`,
              left: `${targetRect.left + targetRect.width}px`,
              height: `${targetRect.height}px`,
            }}
          />
          {/* Crisp cutout highlight outline */}
          <div
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

      {/* Non-modal interactive Guide Card at z-[45] (above workspace/TopNav, below z-50 app modals) */}
      <div
        role="region"
        aria-label="Panduan penggunaan web ORION"
        style={cardStyle}
        className="fixed z-[45] pointer-events-auto rounded-[2px] border border-foreground/75 bg-card p-3.5 sm:p-4 text-foreground"
      >
        {compact ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="num text-[11px] font-semibold uppercase tracking-wider text-emerald">
                {track.shortLabel} · {stepIndex + 1}/{totalSteps}
              </div>
              <div className="truncate font-display text-sm font-semibold text-foreground">
                {currentStep.title}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                onClick={goPrev}
                disabled={stepIndex === 0}
                aria-label="Langkah sebelumnya"
                className="min-h-[44px] min-w-[44px] rounded-[2px] border-border bg-background px-2 text-foreground hover:bg-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={15} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={goNext}
                aria-label={isLastStep ? "Selesai" : "Langkah berikutnya"}
                className="min-h-[44px] min-w-[44px] rounded-[2px] border-border bg-background px-2 text-foreground hover:bg-secondary cursor-pointer"
              >
                <ChevronRight size={15} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCompact(false)}
                className="min-h-[44px] gap-1.5 rounded-[2px] border-border bg-secondary/60 px-2.5 text-xs text-foreground hover:bg-secondary cursor-pointer"
              >
                <Maximize2 size={13} aria-hidden="true" />
                <span>Perluas</span>
              </Button>
              <button
                type="button"
                onClick={dismissOverlay}
                aria-label="Tutup panduan"
                className="grid min-h-[44px] min-w-[44px] cursor-pointer place-items-center rounded-[2px] border border-border bg-background text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 num text-[11px] font-semibold uppercase tracking-wider text-emerald">
                <Compass size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {track.shortLabel} · Langkah {stepIndex + 1} dari {totalSteps}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isDesktop && (
                  <button
                    type="button"
                    onClick={cycleDockPosition}
                    aria-label="Pindah posisi kartu panduan"
                    title="Pindah sudut posisi kartu"
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-2 num text-[11px] text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Move size={12} aria-hidden="true" />
                    <span>Pindah</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCompact(true)}
                  aria-label="Ringkas kartu panduan"
                  title="Lipat menjadi bar ringkas agar panel kerja lebih luas"
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-2 num text-[11px] text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Minimize2 size={12} aria-hidden="true" />
                  <span>Ringkas</span>
                </button>
                <button
                  type="button"
                  onClick={dismissOverlay}
                  aria-label="Tutup panduan"
                  className="grid min-h-[44px] min-w-[44px] cursor-pointer place-items-center rounded-[2px] border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Per-Menu Track Switcher */}
            <div
              role="group"
              aria-label="Pilih paket panduan menu"
              className="mt-2 flex items-center gap-1 overflow-x-auto card-scroll pb-1"
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
                      "min-h-[44px] shrink-0 cursor-pointer rounded-[2px] border px-2.5 py-1 num text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

            {/* Progress Bar */}
            <div
              aria-hidden="true"
              className="mt-2 h-1 w-full overflow-hidden rounded-[2px] bg-secondary"
            >
              <div
                className="h-full bg-foreground transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <h3 className="mt-3 font-display text-base font-semibold tracking-tight text-foreground">
              {currentStep.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {currentStep.description}
            </p>

            {currentStep.tryAction && (
              <div className="mt-2.5 rounded-[2px] border border-emerald/45 bg-emerald/10 px-3 py-2 text-xs leading-relaxed text-foreground">
                <span className="num font-semibold text-emerald mr-1.5">Coba langsung:</span>
                <span>{currentStep.tryAction}</span>
              </div>
            )}

            <div className="mt-2 rounded-[2px] border border-border bg-secondary/45 px-3 py-2 text-xs leading-relaxed text-foreground">
              <span className="num font-semibold text-amber mr-1.5">Tips:</span>
              <span className="text-muted-foreground">{currentStep.tip}</span>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={dismissOverlay}
                className="min-h-[44px] rounded-[2px] px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Tutup
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goPrev}
                  disabled={stepIndex === 0}
                  className="min-h-[44px] gap-1 rounded-[2px] border-border bg-background px-3 text-xs text-foreground hover:bg-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                  <span>Sebelumnya</span>
                </Button>
                {isLastStep && nextTrack ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={completeCurrentTrack}
                      className="min-h-[44px] rounded-[2px] border-border bg-background px-3 text-xs text-foreground hover:bg-secondary cursor-pointer"
                    >
                      Selesai
                    </Button>
                    <Button
                      type="button"
                      onClick={advanceToNextTrack}
                      className="min-h-[44px] gap-1 rounded-[2px] bg-foreground px-3.5 text-xs font-medium text-background hover:bg-foreground/90 cursor-pointer"
                    >
                      <span>Lanjut: {nextTrack.shortLabel}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={goNext}
                    className="min-h-[44px] gap-1 rounded-[2px] bg-foreground px-3.5 text-xs font-medium text-background hover:bg-foreground/90 cursor-pointer"
                  >
                    <span>{isLastStep ? "Selesai" : "Lanjut"}</span>
                    {!isLastStep && <ChevronRight size={14} aria-hidden="true" />}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
