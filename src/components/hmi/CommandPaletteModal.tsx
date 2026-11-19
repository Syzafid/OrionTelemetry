import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { resolveExportEndpointUrl } from "@/lib/battery-analytics";
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
  { id: "01", name: "Topologi Kelistrikan & Transduser", shortcut: "Alt+1" },
  { id: "02", name: "Armada & PDI Stock Yard", shortcut: "Alt+2" },
  { id: "03", name: "Antrean Pemanasan Mesin", shortcut: "Alt+3" },
  { id: "04", name: "Diagnostik Mesin & OBD-II", shortcut: "Alt+4" },
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
    dataSource,
    apiStatus,
    apiUrl,
    tickets,
    auditLogs,
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

  const handleExportAllExcel = useCallback(() => {
    if (dataSource === "LIVE_API" && apiStatus === "CONNECTED") {
      const url = resolveExportEndpointUrl(apiUrl, "export_excel.php", "ALL", {
        period: "ALL_TIME",
        resolution: "RAW",
        limit: 2500,
      });
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const excelXml = buildFormattedExcelPrettier(units, configs, history, "ALL", {
      isLiveApi: dataSource === "LIVE_API",
      tickets,
      auditLogs,
      period: "ALL_TIME",
      resolution: "RAW",
    });
    if (typeof URL.createObjectURL !== "function") return;
    const blob = new Blob([excelXml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `ORION_TELEMETRY_REPORT_ALL_FLEET_ALL_TIME_${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }, [dataSource, apiStatus, apiUrl, units, configs, history, tickets, auditLogs]);

  const isLiveApi = dataSource === "LIVE_API";

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const visibleUnits = isLiveApi ? units : allUnits;

    const unitItems: PaletteItem[] = visibleUnits
      .filter((u) => matchesFleetSearch(u, q))
      .map((u) => {
        const crit = configs[u.unit_id]?.crit_v ?? 11.8;
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
        title: `Buka Modul ${m.id}: ${m.name}`,
        subtitle: "Navigasi Ruang Kontrol",
        badge: m.shortcut,
        tone: "dim" as const,
        onSelect: () => {
          setActiveModule(m.id);
          onClose();
        },
      })),
      ...(!isLiveApi
        ? [
            {
              id: "act-scale",
              group: "ACTIONS" as const,
              title: `Ubah Skala Armada Sandbox (${fleetScale === 3 ? "Pindah ke 12 Unit Yard" : "Kembali ke 3 Unit Inti"})`,
              subtitle: `Menampilkan ${fleetScale} unit simulasi`,
              badge: `${fleetScale} -> ${fleetScale === 3 ? 12 : 3}`,
              tone: "dim" as const,
              onSelect: () => {
                setFleetScale(fleetScale === 3 ? 12 : 3);
                onClose();
              },
            },
          ]
        : []),
      {
        id: "act-excel",
        group: "ACTIONS",
        title: "Ekspor Laporan Excel Terformat (.xls)",
        subtitle: "Unduh ringkasan armada & log riwayat berformat tabel",
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
          ? "Bisukan Alarm Audio Industri"
          : "Aktifkan Alarm Audio Industri (880Hz/660Hz)",
        subtitle: `Status audio saat ini: ${alarmArmed ? "AKTIF" : "SENYAP"}`,
        badge: alarmArmed ? "BISUKAN" : "AKTIFKAN",
        tone: alarmArmed ? "amber" : "crimson",
        onSelect: () => {
          onToggleAlarm();
          onClose();
        },
      },
      ...(!isLiveApi
        ? [
            {
              id: "act-burst",
              group: "ACTIONS" as const,
              title: `Simulasi Burst Sync (${selected.bay})`,
              subtitle: "Simulasikan 28 rekaman offline (20 RTC SRAM + 8 LittleFS) & buka Presensi",
              badge: "+28 REK",
              tone: "amber" as const,
              onSelect: () => {
                simulateBurstSync(selected.unit_id);
                setActiveModule("05");
                onClose();
              },
            },
          ]
        : []),
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
    isLiveApi,
    query,
    units,
    allUnits,
    configs,
    selectUnit,
    setActiveModule,
    onClose,
    fleetScale,
    setFleetScale,
    handleExportAllExcel,
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
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-3 pt-14 sm:p-6 sm:pt-20"
          role="dialog"
          aria-modal="true"
          aria-label="Palet Perintah Global ORION"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
          exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          onKeyDown={handleKeyDown}
        >
          <m.div
            className="panel flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden border border-border bg-card shadow-xl"
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: DURATION.quick, ease: EASE_STANDARD },
            }}
            exit={{
              opacity: 0,
              scale: 0.98,
              y: -4,
              transition: { duration: DURATION.instant, ease: EASE_EXIT },
            }}
          >
            {/* Search Input Header */}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
              <Search
                size={16}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari Bay (A-02), Model (Triton), VIN, DTC (P0133), atau Aksi Kontrol..."
                aria-label="Cari unit kendaraan dan perintah ruang kontrol"
                className="min-h-[44px] flex-1 bg-transparent num text-xs sm:text-sm text-foreground focus:outline-none placeholder:text-dim"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Bersihkan kata kunci pencarian"
                  className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[2px] border border-border bg-background/60 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                      <div className="label-hmi mb-1.5 px-2 text-[11px] text-muted-foreground">
                        Direktori Armada Stock Yard ({unitResults.length} Cocok)
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
                                "relative flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-[2px] border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isFocused
                                  ? "border-transparent text-foreground"
                                  : "border-transparent bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
                              )}
                            >
                              {isFocused && <FocusHighlight />}
                              <div className="relative min-w-0">
                                <div className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                                  <Led tone={item.tone ?? "emerald"} />
                                  <span className="truncate">{item.title}</span>
                                </div>
                                <div className="num mt-0.5 text-[11px] text-muted-foreground truncate">
                                  {item.subtitle}
                                </div>
                              </div>
                              {item.badge && (
                                <span
                                  className={cn(
                                    "relative num shrink-0 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold",
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
                      <div className="label-hmi mb-1.5 px-2 text-[11px] text-muted-foreground">
                        Aksi Cepat Ruang Kontrol ({actionResults.length})
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
                                "relative flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-[2px] border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isFocused
                                  ? "border-transparent text-foreground"
                                  : "border-transparent bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
                              )}
                            >
                              {isFocused && <FocusHighlight />}
                              <div className="relative flex min-w-0 items-center gap-2.5">
                                {item.id.startsWith("mod-") ? (
                                  <LayoutGrid
                                    size={14}
                                    className="shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                ) : item.id === "act-scale" ? (
                                  <Layers
                                    size={14}
                                    className="shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                ) : item.id === "act-excel" ? (
                                  <FileSpreadsheet
                                    size={14}
                                    className="shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                ) : item.id === "act-alarm" ? (
                                  alarmArmed ? (
                                    <VolumeX
                                      size={14}
                                      className="shrink-0 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Volume2
                                      size={14}
                                      className="shrink-0 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                  )
                                ) : (
                                  <HardDriveUpload
                                    size={14}
                                    className="shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="num text-xs font-semibold text-foreground truncate">
                                    {item.title}
                                  </div>
                                  <div className="num text-[11px] text-muted-foreground truncate">
                                    {item.subtitle}
                                  </div>
                                </div>
                              </div>
                              {item.badge && (
                                <span className="relative num shrink-0 rounded-[2px] border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
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
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-background/70 px-3.5 py-2 num text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Command size={12} className="text-muted-foreground" aria-hidden="true" />
                  <span>Navigasi: Atas/Bawah</span>
                </span>
                <span>Pilih: Enter</span>
                <span>Tutup: Esc</span>
              </div>
              <div>Pintasan: Alt+1 .. Alt+6 (Pindah Modul)</div>
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
