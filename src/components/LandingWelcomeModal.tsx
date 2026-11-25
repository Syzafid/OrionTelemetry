import { useCallback, useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { OrionLogo } from "@/components/hmi/OrionLogo";
import { Led } from "@/components/hmi/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFullscreen } from "@/hooks/useFullscreen";

export const WELCOME_SESSION_KEY = "orion_welcome_dismissed_session";
export const WELCOME_PERSIST_KEY = "orion_welcome_dismissed_forever";

/**
 * Welcome dialog displayed once per session on the landing page to inform visitors
 * about the active development stage, default simulation mode, and optional fullscreen view.
 */
export function LandingWelcomeModal() {
  const { isFullscreen, isSupported, enter } = useFullscreen();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isWideViewport, setIsWideViewport] = useState(false);

  useEffect(() => {
    try {
      const dismissedForever = window.localStorage.getItem(WELCOME_PERSIST_KEY) === "1";
      const dismissedSession = window.sessionStorage.getItem(WELCOME_SESSION_KEY) === "1";
      if (!dismissedForever && !dismissedSession) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }

    const syncWidth = () => setIsWideViewport(window.innerWidth >= 768);
    syncWidth();
    window.addEventListener("resize", syncWidth);
    return () => window.removeEventListener("resize", syncWidth);
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
      if (dontShowAgain) {
        window.localStorage.setItem(WELCOME_PERSIST_KEY, "1");
      }
    } catch {
      // Ignore storage access errors in restricted browsing modes
    }
    setOpen(false);
  }, [dontShowAgain]);

  const handleEnterFullscreen = useCallback(() => {
    void enter();
    dismiss();
  }, [enter, dismiss]);

  const canOfferFullscreen = isSupported && isWideViewport && !isFullscreen;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl rounded-[2px] border-border bg-card p-5 sm:p-6 text-foreground shadow-none">
        {/* Identity & development stage header aligned with ORION instrument panels */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3.5 pr-11">
          <div className="flex items-center gap-2.5">
            <OrionLogo variant="icon" className="h-7 w-7 shrink-0" />
            <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
              ORION TELEMETRY
            </span>
          </div>
          <span className="num text-[11px] font-medium uppercase tracking-wider text-amber">
            Tahap Pengembangan · Web
          </span>
        </div>

        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="font-display text-lg sm:text-xl font-semibold tracking-tight text-foreground">
            Dashboard Web Sedang dalam Pengembangan
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            Sebagian fitur dan tampilan antarmuka masih disempurnakan sebelum pemakaian operasional
            penuh.
          </DialogDescription>
        </DialogHeader>

        {/* Two-column comparison: default Simulation vs optional Live API */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-[2px] border border-border bg-secondary/60 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Led tone="dim" />
                <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                  Mode Simulasi
                </span>
              </div>
              <span className="num text-[11px] text-muted-foreground">12 Unit Contoh</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Langsung aktif saat dashboard dibuka untuk mencoba peta komponen, antrean pemanasan,
              grafik, dan ekspor Excel.
            </p>
          </div>

          <div className="rounded-[2px] border border-border bg-secondary/60 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Led tone="emerald" />
                <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                  Mode Live API
                </span>
              </div>
              <span className="num text-[11px] text-emerald">Polling 3 dtk</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Bisa diaktifkan dari bilah atas dashboard saat perangkat ESP32 dan server MySQL lokal
              tersambung.
            </p>
          </div>
        </div>

        {canOfferFullscreen && (
          <div className="flex items-start gap-2.5 rounded-[2px] border border-border bg-background/70 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Maximize2
              size={15}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-foreground"
              aria-hidden="true"
            />
            <span>
              Mode layar penuh memberi ruang lebih lega untuk peta kelistrikan, grafik, dan tabel
              armada.
            </span>
          </div>
        )}

        <label
          htmlFor="welcome-dont-show"
          className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs text-muted-foreground select-none hover:text-foreground"
        >
          <Checkbox
            id="welcome-dont-show"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <span>Jangan tampilkan lagi di perangkat ini</span>
        </label>

        <DialogFooter className="gap-2 border-t border-border pt-3 sm:gap-2">
          {canOfferFullscreen ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={dismiss}
                className="min-h-[44px] rounded-[2px] border-border bg-background text-foreground hover:bg-secondary cursor-pointer"
              >
                Tutup &amp; Lihat Beranda
              </Button>
              <Button
                type="button"
                onClick={handleEnterFullscreen}
                className="min-h-[44px] gap-2 rounded-[2px] bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
              >
                <Maximize2 size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Aktifkan Layar Penuh</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={dismiss}
              className="min-h-[44px] rounded-[2px] bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
            >
              Lanjut ke Beranda
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
