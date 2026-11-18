import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Minimize2, Maximize2 } from "lucide-react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { DURATION, EASE_EXIT, EASE_STANDARD } from "@/lib/motion-tokens";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { TopNav } from "@/components/hmi/TopNav";
import { ShowroomModule } from "@/components/hmi/ShowroomModule";
import { FleetModule } from "@/components/hmi/FleetModule";
import { WarmupQueueModule } from "@/components/hmi/WarmupQueueModule";
import { DiagnosticsModule } from "@/components/hmi/DiagnosticsModule";
import { PresenceModule } from "@/components/hmi/PresenceModule";
import { ConfigModule } from "@/components/hmi/ConfigModule";
import { useFullscreen } from "@/hooks/useFullscreen";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "ORION: Konsol Workbench Telemetri & Topologi Stock Yard" },
      {
        name: "description",
        content:
          "ORION Telemetry Workbench: Monitoring voltase baterai 12V real-time, topologi kelistrikan & transduser armada, antrean pemanasan mesin, dan diagnostik OBD-II stock yard.",
      },
      { property: "og:title", content: "ORION: Konsol Workbench Telemetri & Topologi Stock Yard" },
      { property: "og:description", content: "ORION Fleet Telemetry HMI: electrical topology & transducer inspector, warm-up queue, diagnostics and remote node config." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Workspace() {
  const { activeModule } = useTelemetry();
  return (
    <main className="workspace flex flex-1 min-h-0 flex-col lg:overflow-hidden p-3 sm:p-4 md:p-5">
      {/* Topologi Kelistrikan & Transduser stays mounted; only its opacity fades in. */}
      <m.div
        className={activeModule === "01" ? "showroom-host flex-1 min-h-0 flex flex-col" : "hidden"}
        initial={false}
        animate={{ opacity: activeModule === "01" ? 1 : 0 }}
        transition={{ duration: DURATION.quick, ease: EASE_STANDARD }}
      >
        <ShowroomModule active={activeModule === "01"} />
      </m.div>
      <AnimatePresence mode="wait" initial={false}>
        {activeModule !== "01" && (
          <m.div
            key={activeModule}
            className="module-host flex flex-1 min-h-0 flex-col lg:overflow-hidden"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
            exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
          >
            {activeModule === "02" && <FleetModule />}
            {activeModule === "03" && <WarmupQueueModule />}
            {activeModule === "04" && <DiagnosticsModule />}
            {activeModule === "05" && <PresenceModule />}
            {activeModule === "06" && <ConfigModule />}
          </m.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/**
 * Auto-fullscreen: browsers require a user gesture before entering fullscreen.
 * We attach a one-time click listener to the entire page so the first click
 * anywhere triggers fullscreen, then the listener removes itself.
 */
function useAutoFullscreen(enter: () => Promise<void>) {
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;

    function handler() {
      tried.current = true;
      enter();
      document.removeEventListener("click", handler, true);
    }

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [enter]);
}

function FullscreenToggle() {
  const { isFullscreen, enter, exit } = useFullscreen();

  useAutoFullscreen(enter);

  return (
    <Button
      variant="ghost"
      size="icon"
      id="fullscreen-toggle"
      type="button"
      onClick={isFullscreen ? exit : enter}
      title={isFullscreen ? "Keluar fullscreen" : "Masuk fullscreen"}
      aria-label={isFullscreen ? "Keluar fullscreen" : "Masuk fullscreen"}
      className="fixed right-3 top-2.5 z-[9999] flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md
                 border border-hairline bg-carbon/80 text-muted-foreground backdrop-blur-sm
                 transition-colors duration-200 hover:border-foreground/60 hover:text-foreground"
    >
      {isFullscreen ? <Minimize2 size={16} strokeWidth={1.5} /> : <Maximize2 size={16} strokeWidth={1.5} />}
    </Button>
  );
}

function Index() {
  return (
    <TelemetryProvider>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <div className="dashboard-shell flex min-h-screen flex-col bg-background lg:h-dvh lg:overflow-hidden">
            <TopNav />
            <Workspace />
            <FullscreenToggle />
          </div>
        </LazyMotion>
      </MotionConfig>
    </TelemetryProvider>
  );
}
