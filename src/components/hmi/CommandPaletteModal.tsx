import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  FileSpreadsheet,
  HardDriveUpload,
  Layers,
  LayoutGrid,
  Search,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useTelemetry, type ModuleId } from "@/context/TelemetryContext";
import { buildFormattedExcelPrettier } from "@/lib/excel-export";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { Led, fmtV, unitTone, type Tone } from "./primitives";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { DURATION, EASE_EXIT, EASE_STANDARD } from "@/lib/motion-tokens";

export interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  alarmArmed: boolean;
  onToggleAlarm: () => void;
}

interface PaletteItem {
  id: string;
  group: "UNITS" | "ACTIONS";
  title: string;
  subtitle: string;
  badge?: string;
  tone?: Tone;
  onSelect: () => void;
}

const MODULE_META: { id: ModuleId; name: string; shortcut: string }[] = [
  { id: "01", name: "Digital Twin 3D", shortcut: "Alt+1" },
  { id: "02", name: "Armada & PDI Stock Yard", shortcut: "Alt+2" },
  { id: "03", name: "Antrean Pemanasan Mesin", shortcut: "Alt+3" },
  { id: "04", name: "Engine & OBD-II Diagnostics", shortcut: "Alt+4" },
  { id: "05", name: "Presensi & Log Pergerakan", shortcut: "Alt+5" },
  { id: "06", name: "Konfigurasi Node & Kalibrasi", shortcut: "Alt+6" },
];

export function CommandPaletteModal({
  open,
  onClose,
  alarmArmed,
  onToggleAlarm,
}: CommandPaletteModalProps) {
  const {
    allUnits,
    units,
    selected,
    selectUnit,
    setActiveModule,
    fleetScale,
    setFleetScale,
    configs,
    history,
    simulateBurstSync,
  } = useTelemetry();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActiveIndex(0);
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => clearTimeout(t);
  }, [open]);

  const handleExportAllExcel = () => {
    const excelHtml = buildFormattedExcelPrettier(units, configs, history, "ALL");
    const blob = new Blob([excelHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `ORION_TELEMETRY_REPORT_ALL_${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    const unitItems: PaletteItem[] = allUnits
      .filter((u) => matchesFleetSearch(u, q))
      .map((u) => {
        const crit = configs[u.unit_id]?.crit_v ?? 11.80;
        const tone = unitTone(u, crit);
        return {
          id: `unit-${u.unit_id}`,
          group: "UNITS",
          title: `Bay ${u.bay}: ${u.model} ${u.trim}`,
          subtitle: `${u.unit_id} | VIN ${u.vin} | ${u.status_label}`,
          badge: `${fmtV(u.telemetry.v_bat)}V${u.telemetry.dtc_cnt > 0 ? ` [${u.telemetry.dtc}]` : ""}`,
          tone,
          onSelect: () => {
            selectUnit(u.unit_id);
            setActiveModule("02");
            onClose();
          },
        };
      });

    const rawActions: PaletteItem[] = [
      ...MODULE_META.map((m) => ({
        id: `mod-${m.id}`,
        group: "ACTIONS" as const,
        title: `Switch to Module ${m.id}: ${m.name}`,
        subtitle: "Control Room Navigation",
        badge: m.shortcut,
        tone: "dim" as const,
        onSelect: () => {
          setActiveModule(m.id);
          onClose();
        },
      })),
      {
        id: "act-scale",
        group: "ACTIONS",
        title: `Toggle Fleet Scale (${fleetScale === 3 ? "Switch to 12 Units Yard" : "Switch to 3 Core Units"})`,
        subtitle: `Currently showing ${fleetScale} units`,
        badge: `${fleetScale} -> ${fleetScale === 3 ? 12 : 3}`,
        tone: "dim",
        onSelect: () => {
          setFleetScale(fleetScale === 3 ? 12 : 3);
          onClose();
        },
      },
      {
        id: "act-excel",
        group: "ACTIONS",
        title: "Export Formatted Excel Report (.xls)",
        subtitle: "Download executive summary & conditional formatting spreadsheet",
        badge: "XLS",
        tone: "emerald",
        onSelect: () => {
          handleExportAllExcel();
          onClose();
        },
      },
      {
        id: "act-alarm",
        group: "ACTIONS",
        title: alarmArmed
          ? "Mute Industrial Web Audio Alarm"
          : "Arm Industrial Web Audio Alarm (880Hz/660Hz)",
        subtitle: `Audio chime currently ${alarmArmed ? "ARMED" : "MUTED"}`,
        badge: alarmArmed ? "MUTE" : "ARM",
        tone: alarmArmed ? "amber" : "crimson",
        onSelect: () => {
          onToggleAlarm();
          onClose();
        },
      },
      {
        id: "act-burst",
        group: "ACTIONS",
        title: `Trigger Burst Sync Simulation (${selected.bay})`,
        subtitle: "Simulate 28 offline records (20 RTC SRAM + 8 LittleFS) & open Presence Log",
        badge: "+28 RECS",
        tone: "amber",
        onSelect: () => {
          simulateBurstSync(selected.unit_id);
          setActiveModule("05");
          onClose();
        },
      },
    ];

    const actionItems = q
      ? rawActions.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.subtitle.toLowerCase().includes(q) ||
            (a.badge && a.badge.toLowerCase().includes(q)),
        )
      : rawActions;

    return [...unitItems, ...actionItems];
  }, [
    query,
    allUnits,
    configs,
    selectUnit,
    setActiveModule,
    onClose,
    fleetScale,
    setFleetScale,
    alarmArmed,
    onToggleAlarm,
    selected,
    simulateBurstSync,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const safeIndex = Math.min(activeIndex, Math.max(0, items.length - 1));
  const unitResults = items.filter((i) => i.group === "UNITS");
  const actionResults = items.filter((i) => i.group === "ACTIONS");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length > 0) {
        setActiveIndex((prev) => (prev + 1) % items.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length > 0) {
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = items[safeIndex];
      if (target) {
        target.onSelect();
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
    <m.div
      key="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-3 pt-14 sm:p-6 sm:pt-20 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="ORION Global Command Palette"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
      exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <m.div
        className="panel flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden border border-border bg-card shadow-2xl"
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
        exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
      >
        {/* Search Input Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3.5 py-2.5">
          <Search size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type Bay (A-02), Model (Triton), VIN, DTC (P0133), or Control Action..."
            aria-label="Search units and control room commands"
            className="min-h-[44px] flex-1 bg-transparent num text-xs sm:text-sm text-foreground outline-none placeholder:text-dim"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear command query"
              className="inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[2px] border border-border bg-background/60 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            ESC
          </button>
        </div>

        {/* Results Body */}
        <div className="card-scroll flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {items.length === 0 ? (
            <div className="py-8 text-center num text-xs text-muted-foreground">
              Tidak ditemukan unit atau perintah untuk &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <>
              {unitResults.length > 0 && (
                <div>
                  <div className="label-hmi mb-1.5 px-2 text-[10px] text-muted-foreground">
                    Stock Yard Fleet Directory ({unitResults.length} Matched)
                  </div>
                  <div className="space-y-1">
                    {unitResults.map((item) => {
                      const globalIdx = items.indexOf(item);
                      const isFocused = globalIdx === safeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onSelect}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          className={cn(
                            "relative flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-[2px] border px-3 py-2 text-left transition-colors",
                            isFocused
                              ? "border-transparent text-foreground"
                              : "border-transparent bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
                          )}
                        >
                          {isFocused && <FocusHighlight />}
                          <div className="relative min-w-0">
                            <div className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                              <Led tone={item.tone ?? "emerald"} pulse={item.tone === "crimson"} />
                              <span className="truncate">{item.title}</span>
                            </div>
                            <div className="num mt-0.5 text-[10px] text-muted-foreground truncate">
                              {item.subtitle}
                            </div>
                          </div>
                          {item.badge && (
                            <span
                              className={cn(
                                "relative num shrink-0 rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold",
                                item.tone === "crimson"
                                  ? "border-crimson/50 bg-crimson/15 text-crimson"
                                  : item.tone === "amber"
                                    ? "border-amber/50 bg-amber/15 text-amber"
                                    : "border-emerald/40 bg-emerald/10 text-emerald",
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {actionResults.length > 0 && (
                <div>
                  <div className="label-hmi mb-1.5 px-2 text-[10px] text-muted-foreground">
                    Control Room Quick Actions ({actionResults.length})
                  </div>
                  <div className="space-y-1">
                    {actionResults.map((item) => {
                      const globalIdx = items.indexOf(item);
                      const isFocused = globalIdx === safeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onSelect}
                          onMouseEnter={() => setActiveIndex(globalIdx)}
                          className={cn(
                            "relative flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-[2px] border px-3 py-2 text-left transition-colors",
                            isFocused
                              ? "border-transparent text-foreground"
                              : "border-transparent bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
                          )}
                        >
                          {isFocused && <FocusHighlight />}
                          <div className="relative flex min-w-0 items-center gap-2.5">
                            {item.id.startsWith("mod-") ? (
                              <LayoutGrid size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                            ) : item.id === "act-scale" ? (
                              <Layers size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                            ) : item.id === "act-excel" ? (
                              <FileSpreadsheet size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                            ) : item.id === "act-alarm" ? (
                              alarmArmed ? (
                                <VolumeX size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                              ) : (
                                <Volume2 size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                              )
                            ) : (
                              <HardDriveUpload size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            <div className="min-w-0">
                              <div className="num text-xs font-semibold text-foreground truncate">
                                {item.title}
                              </div>
                              <div className="num text-[10px] text-muted-foreground truncate">
                                {item.subtitle}
                              </div>
                            </div>
                          </div>
                          {item.badge && (
                            <span className="relative num shrink-0 rounded-[2px] border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Shortcuts Legend */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-background/70 px-3.5 py-2 num text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Command size={11} className="text-muted-foreground" aria-hidden="true" />
              <span>Navigate: Up/Down</span>
            </span>
            <span>Select: Enter</span>
            <span>Close: Esc</span>
          </div>
          <div>Shortcuts: Alt+1 .. Alt+5 (Switch Module)</div>
        </div>
      </m.div>
    </m.div>
      )}
    </AnimatePresence>
  );
}

/** Focus highlight that slides between items as the operator moves with ArrowUp/ArrowDown. */
function FocusHighlight() {
  return (
    <m.span
      layoutId="palette-focus-highlight"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[2px] border border-foreground/50 bg-foreground/10"
      transition={{ duration: DURATION.instant, ease: EASE_STANDARD }}
    />
  );
}
