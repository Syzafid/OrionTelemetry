import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
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

function findVisibleTarget(selector: string, moduleId?: string): Element | null {
  if (typeof document === "undefined") return null;

  const matches = Array.from(document.querySelectorAll(selector));
  for (const el of matches) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }

  if (moduleId) {
    const fallbackMod = document.querySelector(`[data-guide-target="module-${moduleId}"]`);
    if (fallbackMod) {
      const r = fallbackMod.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return fallbackMod;
    }
    const fallbackTabs = document.querySelector('[data-guide-target="module-tabs"]');
    if (fallbackTabs) {
      const r = fallbackTabs.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return fallbackTabs;
    }
  }

  return null;
}

/**
 * Interactive per-menu web guide overlay (`Navigasi` + `Menu 01`..`06`, 4 steps per track).
 * Automatically switches modules and sub-tabs while highlighting the exact target region.
 */
export function WebGuideOverlay({ open, initialTrack = "01", onClose }: WebGuideOverlayProps) {
  const { activeModule, setActiveModule } = useTelemetry();
  const [trackId, setTrackId] = useState<GuideTrackId>(initialTrack);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  const scrolledKeyRef = useRef<string>("");

  const track = getGuideTrack(trackId);
  const steps = track.steps;
  const totalSteps = steps.length;
  const currentStep = steps[stepIndex] ?? steps[0]!;
  const isLastStep = stepIndex >= totalSteps - 1;
  const nextTrack = track.nextTrackId ? getGuideTrack(track.nextTrackId) : null;

  // Sync initial track and reset step index when overlay opens
  useEffect(() => {
    if (open) {
      setTrackId(initialTrack);
      setStepIndex(0);
      scrolledKeyRef.current = "";
    }
  }, [open, initialTrack]);

  // Switch active dashboard module when step targets a module (`01`..`06`)
  useEffect(() => {
    if (!open || !currentStep.moduleId) return;
    setActiveModule(currentStep.moduleId);
  }, [open, currentStep.moduleId, setActiveModule]);

  // Dispatch custom event to align internal module sub-tabs (Menu 04 & Menu 06)
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

  // Track viewport size, auto-scroll offscreen targets once, and measure bounding rect
  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") {
      setTargetRect(null);
      return undefined;
    }

    const stepKey = `${trackId}:${currentStep.id}`;

    const measureTarget = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });

      const el = findVisibleTarget(currentStep.targetSelector, currentStep.moduleId);
      if (!el) {
        setTargetRect(null);
        return;
      }

      const rect = el.getBoundingClientRect();
      if (scrolledKeyRef.current !== stepKey) {
        scrolledKeyRef.current = stepKey;
        const outsideViewport =
          rect.top < 72 ||
          rect.bottom > window.innerHeight - 72 ||
          rect.left < 0 ||
          rect.right > window.innerWidth;
        if (outsideViewport && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
      }

      const pad = 4;
      setTargetRect({
        top: Math.max(4, rect.top - pad),
        left: Math.max(4, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      });
    };

    measureTarget();
    const rafId = window.requestAnimationFrame(measureTarget);
    const t1 = window.setTimeout(measureTarget, 100);
    const t2 = window.setTimeout(measureTarget, 280);

    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
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

  // Keyboard navigation while tour overlay is open
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissOverlay();
      } else if (e.key === "ArrowRight") {
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
  const cardWidth = Math.min(460, viewport.width - 24);
  let cardStyle: React.CSSProperties;

  if (!isDesktop || !targetRect) {
    cardStyle = {
      left: "50%",
      bottom: "12px",
      transform: "translateX(-50%)",
      width: `${cardWidth}px`,
    };
  } else if (
    targetRect.height < viewport.height * 0.45 &&
    targetRect.top + targetRect.height + 340 < viewport.height
  ) {
    const clampedLeft = Math.min(
      Math.max(16, targetRect.left),
      Math.max(16, viewport.width - cardWidth - 16),
    );
    cardStyle = {
      top: `${targetRect.top + targetRect.height + 12}px`,
      left: `${clampedLeft}px`,
      width: `${cardWidth}px`,
    };
  } else if (targetRect.height < viewport.height * 0.45 && targetRect.top > 350) {
    const clampedLeft = Math.min(
      Math.max(16, targetRect.left),
      Math.max(16, viewport.width - cardWidth - 16),
    );
    cardStyle = {
      bottom: `${viewport.height - targetRect.top + 12}px`,
      left: `${clampedLeft}px`,
      width: `${cardWidth}px`,
    };
  } else {
    cardStyle = {
      right: "20px",
      bottom: "20px",
      width: `${cardWidth}px`,
    };
  }

  const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="fixed inset-0 z-[9990] pointer-events-auto">
      {/* Backdrop & spotlight cutout */}
      {targetRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-[2px] border-2 border-foreground transition-all duration-150"
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
            boxShadow: "0 0 0 9999px rgba(8, 10, 14, 0.72)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-black/72" />
      )}

      {/* Interactive Guide Dialog Card (flat bordered ORION surface, no heavy drop shadow) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Panduan penggunaan web ORION"
        style={cardStyle}
        className="fixed z-[9995] rounded-[2px] border border-foreground/70 bg-card p-4 sm:p-5 text-foreground"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 num text-[11px] font-semibold uppercase tracking-wider text-emerald">
            <Compass size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>
              {track.shortLabel} · Langkah {stepIndex + 1} dari {totalSteps}
            </span>
          </div>
          <button
            type="button"
            onClick={dismissOverlay}
            aria-label="Tutup panduan"
            className="grid min-h-[44px] min-w-[44px] -mr-2 -mt-2 cursor-pointer place-items-center rounded-[2px] border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={15} aria-hidden="true" />
          </button>
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

        <div className="mt-3 rounded-[2px] border border-border bg-secondary/45 px-3 py-2 text-xs leading-relaxed text-foreground">
          <span className="num font-semibold text-amber mr-1.5">Tips:</span>
          <span className="text-muted-foreground">{currentStep.tip}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
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
      </div>
    </div>
  );
}
