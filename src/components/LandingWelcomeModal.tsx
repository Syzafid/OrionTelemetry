import { useCallback, useEffect, useState } from "react";
import { Info, Maximize2 } from "lucide-react";
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-[2px] border-border bg-card p-6 text-foreground">
        <DialogHeader className="space-y-2.5 text-left">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-[2px] border border-amber/45 bg-amber/12 px-2.5 py-1 num text-[11px] font-medium uppercase tracking-wider text-amber">
            <Info size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>Tahap Pengembangan</span>
          </div>
          <DialogTitle className="font-display text-lg sm:text-xl font-semibold tracking-tight text-foreground">
            Selamat Datang di Web ORION Telemetry
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            Aplikasi web ini masih berada dalam tahap pengembangan dan penyempurnaan antarmuka.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 rounded-[2px] border border-border/80 bg-secondary/45 p-3.5 text-[13px] leading-relaxed text-foreground">
          <p>
            Halaman dashboard secara bawaan membuka{" "}
            <strong className="font-medium">Mode Simulasi</strong> dengan 12 unit contoh agar
            seluruh fitur dapat langsung dicoba.
          </p>
          <p className="text-muted-foreground">
            <strong className="font-medium text-foreground">Mode Live API</strong> tersedia di bilah
            atas dashboard apabila perangkat dan server MySQL terhubung.
          </p>
          {canOfferFullscreen && (
            <p className="text-muted-foreground">
              Untuk tampilan grafik dan panel kerja yang lebih lega, Anda dapat mengaktifkan mode
              layar penuh.
            </p>
          )}
        </div>

        <label
          htmlFor="welcome-dont-show"
          className="flex min-h-[36px] cursor-pointer items-center gap-2.5 text-xs text-muted-foreground select-none hover:text-foreground"
        >
          <Checkbox
            id="welcome-dont-show"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <span>Jangan tampilkan lagi di perangkat ini</span>
        </label>

        <DialogFooter className="gap-2 sm:gap-2">
          {canOfferFullscreen ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={dismiss}
                className="min-h-[44px] rounded-[2px] border-border bg-background text-foreground hover:bg-secondary cursor-pointer"
              >
                Lanjut Biasa
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
              Mengerti, Lanjutkan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
