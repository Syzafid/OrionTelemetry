import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Minimize2, Maximize2 } from "lucide-react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { DURATION, EASE_EXIT, EASE_STANDARD } from "@/lib/motion-tokens";
import {
  loadConfigModule,
  loadDiagnosticsModule,
  loadFleetModule,
  loadPresenceModule,
  loadWarmupQueueModule,
} from "@/lib/hmi-module-loaders";
import { TelemetryProvider, useTelemetry } from "@/context/TelemetryContext";
import { TopNav } from "@/components/hmi/TopNav";
import { ShowroomModule } from "@/components/hmi/ShowroomModule";
import { useFullscreen } from "@/hooks/useFullscreen";
import { Button } from "@/components/ui/button";

const FleetModule = lazy(loadFleetModule);
const WarmupQueueModule = lazy(loadWarmupQueueModule);
const DiagnosticsModule = lazy(loadDiagnosticsModule);
const PresenceModule = lazy(loadPresenceModule);
const ConfigModule = lazy(loadConfigModule);

function ModuleLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="panel flex flex-1 min-h-[320px] items-center justify-center p-6"
    >
      <span className="num text-xs text-muted-foreground tracking-wider">Memuat modul HMI...</span>
    </div>
  );
}

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
      {
        property: "og:description",
        content:
          "ORION Fleet Telemetry HMI: electrical topology & transducer inspector, warm-up queue, diagnostics and remote node config.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Workspace() {
  const { activeModule, dataSource, apiStatus } = useTelemetry();
  return (
    <main className="workspace flex flex-1 min-h-0 flex-col lg:overflow-hidden p-3 sm:p-4 md:p-5">
      {dataSource === "LIVE_API" && apiStatus === "CONNECTING" && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 flex shrink-0 items-center justify-between gap-2 rounded-[2px] border border-amber/50 bg-amber/10 px-3 py-2 num text-xs text-amber"
        >
          <span>Menghubungkan ke ORION Live API (MySQL)... Memuat telemetri unit aktif.</span>
        </div>
      )}
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
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: DURATION.quick, ease: EASE_STANDARD },
            }}
            exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
          >
            {activeModule === "02" ||
            activeModule === "03" ||
            activeModule === "04" ||
            activeModule === "05" ||
            activeModule === "06" ? (
              <Suspense fallback={<ModuleLoadingFallback />}>
                {activeModule === "02" && <FleetModule />}
                {activeModule === "03" && <WarmupQueueModule />}
                {activeModule === "04" && <DiagnosticsModule />}
                {activeModule === "05" && <PresenceModule />}
                {activeModule === "06" && <ConfigModule />}
              </Suspense>
            ) : null}
          </m.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function FullscreenToggle() {
  const { isFullscreen, enter, exit } = useFullscreen();

  return (
    <Button
      variant="ghost"
      size="icon"
      id="fullscreen-toggle"
      type="button"
      onClick={isFullscreen ? exit : enter}
      title={isFullscreen ? "Keluar layar penuh" : "Masuk layar penuh"}
      aria-label={isFullscreen ? "Keluar layar penuh" : "Masuk layar penuh"}
      className="fixed right-3 top-2.5 z-[9999] flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[2px]
                 border border-border bg-carbon text-muted-foreground
                 transition-colors duration-200 hover:border-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isFullscreen ? (
        <Minimize2 size={16} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Maximize2 size={16} strokeWidth={1.5} aria-hidden="true" />
      )}
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
