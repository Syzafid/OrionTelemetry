import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Command, Layers, Radio, Settings2, Volume2, VolumeX } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getUnitConnectionState } from "@/data/mockTelemetry";
import { useTelemetry, type ModuleId } from "@/context/TelemetryContext";
import {
  loadCommandPaletteModal,
  prefetchCommandPalette,
  prefetchHmiModule,
} from "@/lib/hmi-module-loaders";
import { OrionLogo } from "./OrionLogo";
import { Led } from "./primitives";
import { cn } from "@/lib/utils";
import * as m from "motion/react-m";
import { DURATION, EASE_STANDARD } from "@/lib/motion-tokens";

const CommandPaletteModal = lazy(loadCommandPaletteModal);

const MODULES: { id: ModuleId; label: string }[] = [
  { id: "01", label: "Topologi & Transduser" },
  { id: "02", label: "Armada & PDI" },
  { id: "03", label: "Antrean Pemanasan" },
  { id: "04", label: "OBD-II Diagnostik" },
  { id: "05", label: "Presensi & Log" },
  { id: "06", label: "Konfigurasi Node" },
];

/**
 * Pure Web Audio API dual-tone industrial instrument chime (880 Hz -> 660 Hz, 120ms each, gain = 0.08).
 * Zero external audio assets required; safe in SSR and headless test environments.
 */
function playIndustrialAlarmChime(mode: "CONFIRM" | "CRITICAL"): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const scheduleTone = (freq: number, startOffset: number, durationSec: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + startOffset);

      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.08, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + durationSec);
    };

    if (mode === "CONFIRM") {
      scheduleTone(660, 0, 0.09);
      scheduleTone(880, 0.1, 0.09);
    } else {
      scheduleTone(880, 0, 0.12);
      scheduleTone(660, 0.14, 0.12);
    }

    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 500);
  } catch {
    // Ignore audio context blocks in restricted environments
  }
}

export function TopNav() {
  const {
    activeModule,
    setActiveModule,
    dataSource,
    setDataSource,
    apiUrl,
    setApiUrl,
    apiStatus,
    lastSyncTime,
    lastSyncedAt,
    isOfflineSnapshot,
    pollNow,
    units,
    configs,
  } = useTelemetry();

  const [alarmArmed, setAlarmArmed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandMounted, setCommandMounted] = useState(false);
  const lastChimeRef = useRef<number>(0);

  const hasCriticalCondition = units.some((u) => {
    const critV = configs[u.unit_id]?.crit_v ?? 11.8;
    return u.telemetry.crit_alert || u.telemetry.v_bat < critV || u.telemetry.dtc_cnt > 0;
  });

  const toggleAlarm = useCallback(() => {
    setAlarmArmed((prev) => {
      const next = !prev;
      if (next) {
        playIndustrialAlarmChime(hasCriticalCondition ? "CRITICAL" : "CONFIRM");
        lastChimeRef.current = Date.now();
      }
      return next;
    });
  }, [hasCriticalCondition]);

  useEffect(() => {
    if (!alarmArmed || !hasCriticalCondition) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastChimeRef.current >= 5500) {
        playIndustrialAlarmChime("CRITICAL");
        lastChimeRef.current = now;
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [alarmArmed, hasCriticalCondition]);

  // Global keyboard shortcuts: Ctrl+K / Cmd+K (Command Palette) & Alt+1..Alt+5 (Switch Module)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandMounted(true);
        setCommandOpen((prev) => !prev);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName;
          if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT" ||
            target.isContentEditable
          ) {
            return;
          }
        }
        const keyMap: Record<string, ModuleId> = {
          "1": "01",
          "2": "02",
          "3": "03",
          "4": "04",
          "5": "05",
          "6": "06",
        };
        const mod = keyMap[e.key];
        if (mod) {
          e.preventDefault();
          setActiveModule(mod);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveModule]);

  const live = dataSource === "LIVE_API";
  const statusTone = !live ? "dim" : apiStatus === "CONNECTED" ? "emerald" : "amber";
  const statusClass = !live
    ? "text-muted-foreground"
    : apiStatus === "CONNECTED"
      ? "text-emerald"
      : "text-amber";

  const inYardUnits = units.filter((u) => u.in_yard);
  const activeOnlineUnits = units.filter((u) => getUnitConnectionState(u, live).isOnline);
  const onlineCount = activeOnlineUnits.length;
  const totalCount = units.length;
  const rssiSource = inYardUnits.length > 0 ? inYardUnits : units;
  const avgRssi =
    rssiSource.length > 0
      ? Math.round(
          rssiSource.reduce((acc, u) => acc + (u.telemetry?.rssi ?? -90), 0) / rssiSource.length,
        )
      : null;

  const apTone: "emerald" | "amber" | "crimson" =
    inYardUnits.length === 0 && onlineCount === 0
      ? "crimson"
      : onlineCount < totalCount
        ? "amber"
        : "emerald";
  const apToneClass =
    apTone === "crimson" ? "text-crimson" : apTone === "amber" ? "text-amber" : "text-emerald";

  const apLabel =
    onlineCount === 0
      ? inYardUnits.length > 0
        ? `Yard AP (0/${totalCount} Live · ${inYardUnits.length} Deep Sleep, ${avgRssi} dBm)`
        : `Yard AP (0/${totalCount} Online)`
      : `Yard AP (${onlineCount}/${totalCount} Online, Avg ${avgRssi} dBm)`;

  const apLabelMobile =
    onlineCount === 0 && inYardUnits.length > 0
      ? `AP 0/${totalCount} (Sleep)`
      : `AP ${onlineCount}/${totalCount}`;

  return (
    <>
      <header className="hmi-nav sticky top-0 z-40 shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2 md:px-5">
          <Link
            to="/"
            className="flex min-h-[44px] items-center gap-2.5 sm:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="ORION: Kembali ke beranda"
          >
            <OrionLogo variant="icon" animateDraw className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" />
            <div className="leading-tight">
              <div className="font-display text-sm sm:text-base font-semibold uppercase tracking-[0.14em] text-foreground">
                ORION
              </div>
              <div className="label-hmi hidden 2xl:block text-[11px] tracking-[0.06em] text-muted-foreground">
                Sistem Monitoring Baterai &amp; Telemetri Stock Yard
              </div>
              <div className="label-hmi block 2xl:hidden text-[11px] text-muted-foreground">
                Telemetri Stock Yard
              </div>
            </div>
          </Link>

          <div className="mr-10 flex flex-wrap items-center gap-1.5 sm:mr-11 sm:gap-2 md:mr-12">
            {/* Global Command Palette Trigger (Ctrl+K) */}
            <button
              type="button"
              onClick={() => {
                setCommandMounted(true);
                setCommandOpen(true);
              }}
              onMouseEnter={prefetchCommandPalette}
              onFocus={prefetchCommandPalette}
              title="Buka Palet Perintah Global (Ctrl+K / Cmd+K)"
              className="flex min-h-[44px] cursor-pointer items-center gap-1.5 panel px-2.5 py-1.5 num text-[11px] uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
            >
              <Command
                size={13}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="hidden md:inline">Perintah (Ctrl+K)</span>
              <span className="inline md:hidden">Ctrl+K</span>
            </button>

            <div className="flex min-h-[44px] items-center gap-1.5 panel px-2.5 py-1.5 sm:gap-2 sm:px-3">
              <Radio
                size={13}
                strokeWidth={1.5}
                className={cn("shrink-0", apToneClass)}
                aria-hidden="true"
              />
              <span className="num text-[11px] text-foreground hidden xl:inline">{apLabel}</span>
              <span className="num text-[11px] text-foreground inline xl:hidden">
                {apLabelMobile}
              </span>
              <Led tone={apTone} />
            </div>

            {/* Global Fleet Presence Summary Indicator */}
            <div
              className="flex min-h-[44px] items-center gap-1.5 panel px-2.5 py-1.5 num text-[11px] uppercase tracking-wider text-muted-foreground sm:px-3"
              title={`Unit di area yard: ${inYardUnits.length} dari ${totalCount} unit terdaftar`}
            >
              <Layers
                size={13}
                strokeWidth={1.75}
                className="shrink-0 text-foreground"
                aria-hidden="true"
              />
              <span>
                {inYardUnits.length}/{totalCount} di Yard
              </span>
            </div>

            <button
              type="button"
              onClick={toggleAlarm}
              aria-pressed={alarmArmed}
              title={
                alarmArmed
                  ? "Alarm Audio Aktif (Klik untuk Bisukan)"
                  : "Aktifkan Peringatan Suara Kritis (880Hz/660Hz)"
              }
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-1.5 panel px-2.5 py-1.5 num text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
                alarmArmed
                  ? hasCriticalCondition
                    ? "border-crimson/60 bg-crimson/15 text-crimson font-semibold"
                    : "border-emerald/50 bg-emerald/10 text-emerald font-medium"
                  : "text-muted-foreground hover:border-muted-foreground hover:text-foreground",
              )}
            >
              {alarmArmed ? (
                <Volume2 size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              ) : (
                <VolumeX size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                Alarm Suara ({alarmArmed ? "Aktif" : "Senyap"})
              </span>
              <span className="inline sm:hidden">{alarmArmed ? "Aktif" : "Senyap"}</span>
              {alarmArmed && hasCriticalCondition && <Led tone="crimson" />}
            </button>

            <button
              type="button"
              onClick={() => setDataSource(live ? "SIMULATOR" : "LIVE_API")}
              title={live ? "Kembali ke simulator sandbox" : "Polling live API setiap 3 detik"}
              className="flex min-h-[44px] cursor-pointer items-center gap-1.5 panel px-2.5 py-1.5 num text-[11px] uppercase tracking-wider transition-colors hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
            >
              <Led tone={statusTone} />
              <m.span
                key={
                  live
                    ? apiStatus === "CONNECTING"
                      ? "connecting"
                      : isOfflineSnapshot
                        ? "offline"
                        : "live"
                    : "sim"
                }
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.quick, ease: EASE_STANDARD }}
              >
                {live
                  ? apiStatus === "CONNECTING"
                    ? "MENGHUBUNGKAN..."
                    : isOfflineSnapshot
                      ? "OFFLINE CACHE"
                      : "LIVE API"
                  : "SIM SANDBOX"}
              </m.span>
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Pengaturan endpoint Live API"
                  className="grid min-h-[44px] min-w-[44px] cursor-pointer place-items-center panel text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Settings2 size={15} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 rounded-[2px] border-border bg-card p-4">
                <label htmlFor="orion-api-endpoint" className="label-hmi mb-2 block">
                  Endpoint ORION Live API
                </label>
                <input
                  id="orion-api-endpoint"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  spellCheck={false}
                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-2 num text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-3 space-y-1.5 num text-[11px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">MODE</span>
                    <span>{live ? "LIVE_API" : "SIMULATOR"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">STATUS</span>
                    <span className={statusClass}>
                      {isOfflineSnapshot ? "CACHE OFFLINE" : apiStatus}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">SINKRONISASI</span>
                    <span>{lastSyncTime ?? "--"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">CACHE SNAPSHOT</span>
                    <span className="text-[11px] text-foreground">
                      {lastSyncedAt ?? "Belum ada"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!live}
                  onClick={pollNow}
                  className="mt-3 min-h-[44px] w-full cursor-pointer rounded-[2px] border border-border py-2 num text-[11px] uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  UJI KONEKSI API
                </button>
                <p className="mt-2 num text-[11px] leading-relaxed text-muted-foreground">
                  {live
                    ? "Polling otomatis setiap 3 detik saat tab aktif (batas tunggu 2,5 detik). Saat gagal, snapshot lokal terakhir tetap dipertahankan."
                    : "Aktifkan mode Live API untuk melakukan polling endpoint MySQL setiap 3 detik."}
                </p>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="relative border-t border-border">
          <nav className="flex overflow-x-auto border-border">
            {MODULES.map((mod) => {
              const on = mod.id === activeModule;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveModule(mod.id)}
                  onMouseEnter={() => prefetchHmiModule(mod.id)}
                  onFocus={() => prefetchHmiModule(mod.id)}
                  className={cn(
                    "relative flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 border-r border-border px-3.5 py-2.5 font-display text-[12px] font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4 sm:py-3 md:px-5",
                    on
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
                  )}
                >
                  <span className={cn("num font-semibold", on ? "text-foreground" : "text-dim")}>
                    {mod.id}
                  </span>
                  <span>{mod.label}</span>
                  {on && (
                    <m.span
                      layoutId="module-tab-indicator"
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground"
                      transition={{ duration: DURATION.deliberate, ease: EASE_STANDARD }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background via-background/70 to-transparent md:hidden" />
        </div>
      </header>

      {commandMounted && (
        <Suspense fallback={null}>
          <CommandPaletteModal
            open={commandOpen}
            onClose={() => setCommandOpen(false)}
            alarmArmed={alarmArmed}
            onToggleAlarm={toggleAlarm}
          />
        </Suspense>
      )}
    </>
  );
}
