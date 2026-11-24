import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTelemetry } from "@/context/TelemetryContext";
import { WEB_GUIDE_COMPLETED_KEY, WEB_GUIDE_STEPS } from "@/data/webGuideSteps";

export interface WebGuideOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Interactive 8-step guided tour for the ORION web dashboard.
 * Automatically switches active modules (`01`..`06`) while highlighting each workspace area.
 */
export function WebGuideOverlay({ open, onClose }: WebGuideOverlayProps) {
  const { activeModule, setActiveModule } = useTelemetry();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<HighlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });

  const totalSteps = WEB_GUIDE_STEPS.length;
  const currentStep = WEB_GUIDE_STEPS[stepIndex] ?? WEB_GUIDE_STEPS[0]!;
  const isLastStep = stepIndex >= totalSteps - 1;

  // Reset to first step whenever tour is opened
  useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  // Switch active dashboard module when a step belongs to a specific menu (01..06)
  useEffect(() => {
    if (!open) return;
    if (currentStep.moduleId && activeModule !== currentStep.moduleId) {
      setActiveModule(currentStep.moduleId);
    }
  }, [open, currentStep.moduleId, activeModule, setActiveModule]);

  // Track viewport size and target bounding rect cleanly across module transitions
  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") {
      setTargetRect(null);
      return undefined;
    }

    const measureTarget = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });

      const el =
        document.querySelector(currentStep.targetSelector) ??
        (currentStep.moduleId ? document.querySelector('[data-guide-target="module-tabs"]') : null);

      if (!el) {
        setTargetRect(null);
        return;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setTargetRect(null);
        return;
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
    const t1 = window.setTimeout(measureTarget, 90);
    const t2 = window.setTimeout(measureTarget, 260);

    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [open, currentStep.targetSelector, currentStep.moduleId, activeModule, stepIndex]);

  const finishTour = useCallback(() => {
    try {
      window.localStorage.setItem(WEB_GUIDE_COMPLETED_KEY, "1");
    } catch {
      // Ignore storage access restriction
    }
    onClose();
  }, [onClose]);

  const goNext = useCallback(() => {
    if (isLastStep) {
      finishTour();
    } else {
      setStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
    }
  }, [isLastStep, finishTour, totalSteps]);

  const goPrev = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Keyboard navigation while tour overlay is open
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finishTour();
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
  }, [open, finishTour, goNext, goPrev]);

  if (!open) return null;

  const isDesktop = viewport.width >= 768;
  const cardWidth = Math.min(430, viewport.width - 32);
  let cardStyle: React.CSSProperties;

  if (!isDesktop || !targetRect) {
    cardStyle = {
      left: "50%",
      bottom: "16px",
      transform: "translateX(-50%)",
      width: `${cardWidth}px`,
    };
  } else if (
    targetRect.height < viewport.height * 0.45 &&
    targetRect.top + targetRect.height + 290 < viewport.height
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
  } else if (targetRect.height < viewport.height * 0.45 && targetRect.top > 300) {
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
          className="pointer-events-none fixed rounded-[3px] border-2 border-foreground transition-all duration-150"
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

      {/* Interactive Guide Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Panduan penggunaan web ORION"
        style={cardStyle}
        className="fixed z-[9995] rounded-[2px] border border-border bg-card p-5 text-foreground shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 num text-[11px] font-semibold uppercase tracking-wider text-emerald">
            <Compass size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Panduan Web · Langkah {stepIndex + 1} dari {totalSteps}
            </span>
          </div>
          <button
            type="button"
            onClick={finishTour}
            aria-label="Tutup panduan"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-[2px] border border-border/80 bg-secondary/50 text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Progress Bar */}
        <div
          aria-hidden="true"
          className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full bg-foreground transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <h3 className="mt-3.5 font-display text-base font-semibold tracking-tight text-foreground">
          {currentStep.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {currentStep.description}
        </p>

        <div className="mt-3 rounded-[2px] border border-border/80 bg-secondary/45 px-3 py-2 text-xs leading-relaxed text-foreground">
          <span className="num font-semibold text-amber mr-1.5">Tips:</span>
          <span className="text-muted-foreground">{currentStep.tip}</span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/80 pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={finishTour}
            className="min-h-[40px] rounded-[2px] px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Lewati
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={goPrev}
              disabled={stepIndex === 0}
              className="min-h-[40px] gap-1 rounded-[2px] border-border bg-background px-3 text-xs text-foreground hover:bg-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              <span>Sebelumnya</span>
            </Button>
            <Button
              type="button"
              onClick={goNext}
              className="min-h-[40px] gap-1 rounded-[2px] bg-foreground px-3.5 text-xs font-medium text-background hover:bg-foreground/90 cursor-pointer"
            >
              <span>{isLastStep ? "Selesai" : "Lanjut"}</span>
              {!isLastStep && <ChevronRight size={14} aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
