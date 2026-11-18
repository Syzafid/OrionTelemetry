import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  AlertTriangle,
  ArrowUpDown,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Flame,
  Layers,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Thermometer,
  Timer,
  TrendingDown,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useTelemetry } from "@/context/TelemetryContext";
import {
  ALT_VERIFY_V,
  getUnitConnectionState,
  voltageHistory,
  type TicketStatus,
  type VehicleUnit,
} from "@/data/mockTelemetry";
import { OrionLogo } from "./OrionLogo";
import { UnitQrCode, buildUnitDeepLinkUrl } from "./UnitQrCode";
import { Led, Stat, unitTone, fmtV } from "./primitives";
import {
  buildTelemetryCsv,
  computeBatteryPrediction,
  type PredictionTone,
} from "@/lib/battery-analytics";
import { buildFormattedExcelPrettier } from "@/lib/excel-export";
import {
  computeFleetStatusCounts,
  filterAndSortFleetUnits,
  type FleetSortMode,
  type FleetStatusFilter,
} from "@/lib/fleet-filter";
import { formatDurationCompact, formatSleepInterval } from "@/lib/vehicle-topology";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { DURATION, EASE_EXIT, EASE_STANDARD, SPRING_LAYOUT } from "@/lib/motion-tokens";
import { CriticalFlash, ResolveCheck, useChartIntroOnly, useCriticalEdges } from "./motion-bits";

const HEX = { emerald: "#10B981", crimson: "#E60012", amber: "#F59E0B", dim: "#6B7684" };
const WARMUP_TARGET_SEC = 600; // 10 minutes SOP alternator charge
const CARDS_PER_DECK = 3;

const PREDICTION_BADGE_STYLE: Record<PredictionTone, string> = {
  emerald: "border-emerald/40 bg-emerald/10 text-emerald",
  amber: "border-amber/40 bg-amber/10 text-amber",
  crimson: "border-crimson/50 bg-crimson/15 text-crimson",
};

const TICKET_BADGE_STYLE: Record<TicketStatus, string> = {
  OPEN: "border-crimson/50 bg-crimson/15 text-crimson",
  IN_PROGRESS: "border-amber/50 bg-amber/15 text-amber",
  RESOLVED: "border-emerald/50 bg-emerald/15 text-emerald",
};

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resolveExportEndpointUrl(
  apiUrl: string,
  scriptName: "export_csv.php" | "export_excel.php",
  unitId: string,
  limit = 500,
): string {
  let base = apiUrl;
  if (/get_(?:data|live_status)\.php/i.test(apiUrl)) {
    base = apiUrl.replace(/get_(?:data|live_status)\.php(\?.*)?$/i, scriptName);
  } else {
    try {
      const u = new URL(apiUrl);
      u.pathname = u.pathname.replace(/\/[^/]*$/, `/${scriptName}`);
      u.search = "";
      base = u.toString();
    } catch {
      base = apiUrl.replace(/\/[^/]*$/, `/${scriptName}`);
    }
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}unit_id=${encodeURIComponent(unitId)}&limit=${limit}`;
}

async function copyTextSafe(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== "undefined") {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function resolveUnitHistory(
  u: VehicleUnit,
  dataSource: "SIMULATOR" | "LIVE_API",
  historyMap: Record<string, Array<{ t: string; v: number; ts?: number }>>,
): Array<{ t: string; v: number; ts?: number }> {
  const pts = historyMap[u.unit_id];
  if (dataSource === "LIVE_API") {
    if (pts && pts.length > 0) return pts;
    const label = u.last_seen ? u.last_seen.slice(11, 16) : "LIVE";
    return [
      {
        t: label,
        v: u.telemetry.v_bat,
        ...(typeof u.telemetry.ts_epoch === "number" ? { ts: u.telemetry.ts_epoch } : {}),
      },
    ];
  }
  return pts && pts.length >= 2 ? pts : voltageHistory(u.telemetry.v_bat, u.telemetry.engine_on);
}

export function FleetModule() {
  const {
    units,
    fleetScale,
    setFleetScale,
    selectedId,
    selectUnit,
    configs,
    simulate,
    dataSource,
    apiUrl,
    apiStatus,
    history,
    dispatchWarmup,
    tickets,
    updateTicketStatus,
    setActiveModule,
  } = useTelemetry();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FleetStatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<FleetSortMode>("PRIORITY");
  const [deckPage, setDeckPage] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const [warmupStartTimes, setWarmupStartTimes] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const [pdiUnitId, setPdiUnitId] = useState<string | null>(null);
  const [pdiTimestamp, setPdiTimestamp] = useState<string>("");
  const [copiedUnitId, setCopiedUnitId] = useState<string | null>(null);
  const [resolvingTicketUnitId, setResolvingTicketUnitId] = useState<string | null>(null);
  const [techAction, setTechAction] = useState("Pengisian Daya Baterai (Charger 2 Jam)");
  const [techName, setTechName] = useState("Teknisi Shift Pagi");
  const [techNotes, setTechNotes] = useState(
    "Tegangan baterai berhasil dinaikkan ke kondisi aman (> 12.40V) dan siap verifikasi PDI.",
  );

  // Reset deck page and scroll track to start whenever filter, search, or sort changes
  useEffect(() => {
    setDeckPage(0);
    carouselRef.current?.scrollTo?.({ left: 0, behavior: "instant" });
  }, [searchQuery, statusFilter, sortBy]);

  useEffect(() => {
    const hasRunningUnit = units.some((u) => u.in_yard && u.telemetry.engine_on);
    if (!hasRunningUnit) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [units]);

  useEffect(() => {
    setWarmupStartTimes((prev) => {
      const next = { ...prev };
      let changed = false;
      const now = Date.now();
      for (const u of units) {
        if (u.telemetry.engine_on && !next[u.unit_id]) {
          const runSec =
            typeof u.telemetry.run_time_s === "number" && u.telemetry.run_time_s > 0
              ? u.telemetry.run_time_s
              : 0;
          const initialOffsetMs = Math.min(runSec * 1000, WARMUP_TARGET_SEC * 1000);
          next[u.unit_id] = now - initialOffsetMs;
          changed = true;
        } else if (!u.telemetry.engine_on && next[u.unit_id]) {
          delete next[u.unit_id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [units]);

  useEffect(() => {
    if (!pdiUnitId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPdiUnitId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pdiUnitId]);

  const handleExportCsv = useCallback(
    (targetUnitId: string) => {
      if (dataSource === "LIVE_API" && apiStatus === "CONNECTED") {
        const url = resolveExportEndpointUrl(apiUrl, "export_csv.php", targetUnitId, 500);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const csvContent = buildTelemetryCsv(units, history, targetUnitId);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      const safeId = targetUnitId.replace(/[^A-Za-z0-9_-]/g, "_");
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `ORION_TELEMETRY_${safeId}_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    },
    [dataSource, apiStatus, apiUrl, units, history],
  );

  const handleExportExcel = useCallback(
    (targetUnitId: string) => {
      if (dataSource === "LIVE_API" && apiStatus === "CONNECTED") {
        const url = resolveExportEndpointUrl(apiUrl, "export_excel.php", targetUnitId, 250);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const excelHtml = buildFormattedExcelPrettier(units, configs, history, targetUnitId);
      const blob = new Blob([excelHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      const safeId = targetUnitId.replace(/[^A-Za-z0-9_-]/g, "_");
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `ORION_TELEMETRY_REPORT_${safeId}_${stamp}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    },
    [dataSource, apiStatus, apiUrl, units, configs, history],
  );

  const handleCopyDeepLink = useCallback(async (unitId: string) => {
    const url = buildUnitDeepLinkUrl(unitId, "fleet");
    await copyTextSafe(url);
    setCopiedUnitId(unitId);
    setTimeout(() => {
      setCopiedUnitId((prev) => (prev === unitId ? null : prev));
    }, 2000);
  }, []);

  const openPdiModal = useCallback((unitId: string) => {
    setPdiTimestamp(
      new Date().toLocaleString("id-ID", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    );
    setPdiUnitId(unitId);
  }, []);

  const counts = useMemo(() => computeFleetStatusCounts(units, configs), [units, configs]);

  const filteredUnits = useMemo(
    () =>
      filterAndSortFleetUnits(units, configs, history, {
        searchQuery,
        statusFilter,
        sortBy,
      }),
    [units, configs, history, searchQuery, statusFilter, sortBy],
  );

  // Motion: edge-triggered alarm flash (unit newly critical) and intro-only chart animation.
  const criticalMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const u of units) {
      const crit = configs[u.unit_id]?.crit_v ?? 11.8;
      map[u.unit_id] = u.telemetry.crit_alert || u.telemetry.v_bat < crit;
    }
    return map;
  }, [units, configs]);
  const criticalFlashes = useCriticalEdges(criticalMap);
  const chartIntro = useChartIntroOnly();
  // Cards fade in only when they appear later (filter cleared, scale 3 -> 12), not on first paint.
  const cardsMountedRef = useRef(false);
  useEffect(() => {
    cardsMountedRef.current = true;
  }, []);
  // Tickets already RESOLVED when the module opened render a static check; new resolutions draw it.
  const initialResolvedRef = useRef<Set<string> | null>(null);
  if (initialResolvedRef.current === null) {
    initialResolvedRef.current = new Set(
      tickets.filter((tk) => tk.status === "RESOLVED").map((tk) => tk.unit_id),
    );
  }

  const totalPages = Math.max(1, Math.ceil(filteredUnits.length / CARDS_PER_DECK));
  const safeDeckPage = Math.min(deckPage, Math.max(0, totalPages - 1));

  const scrollCarouselTo = useCallback((targetIndex: number) => {
    if (!carouselRef.current) return;
    const cardEl = carouselRef.current.children[targetIndex] as HTMLElement | undefined;
    if (cardEl && typeof cardEl.offsetLeft === "number") {
      carouselRef.current.scrollTo?.({ left: cardEl.offsetLeft, behavior: "smooth" });
    }
  }, []);

  // Auto-scroll carousel and sync deckPage when selectedId or fleetScale changes (including URL deep-link entry)
  useEffect(() => {
    const idx = filteredUnits.findIndex((u) => u.unit_id === selectedId);
    if (idx < 0) return;
    const targetDeck = Math.floor(idx / CARDS_PER_DECK);
    setDeckPage((prev) => (prev !== targetDeck ? targetDeck : prev));
    const raf = requestAnimationFrame(() => {
      scrollCarouselTo(idx);
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedId, fleetScale, filteredUnits, scrollCarouselTo]);

  const handleQuickJumpUnit = useCallback(
    (unitId: string) => {
      const idx = filteredUnits.findIndex((u) => u.unit_id === unitId);
      if (idx >= 0) {
        setDeckPage(Math.floor(idx / CARDS_PER_DECK));
        scrollCarouselTo(idx);
      }
      selectUnit(unitId);
    },
    [filteredUnits, selectUnit, scrollCarouselTo],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      const clampedPage = Math.max(0, Math.min(totalPages - 1, newPage));
      setDeckPage(clampedPage);
      const targetCardIndex = clampedPage * CARDS_PER_DECK;
      scrollCarouselTo(targetCardIndex);
    },
    [totalPages, scrollCarouselTo],
  );

  const handleCarouselScroll = useCallback(() => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const scrollLeft = container.scrollLeft;
    if (scrollLeft <= 4) {
      setDeckPage(0);
      return;
    }
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return;

    let closestIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) continue;
      const dist = Math.abs(child.offsetLeft - scrollLeft);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }
    const computedDeck = Math.floor(closestIndex / CARDS_PER_DECK);
    setDeckPage((prev) => (prev !== computedDeck ? computedDeck : prev));
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setSortBy("PRIORITY");
    setDeckPage(0);
    carouselRef.current?.scrollTo?.({ left: 0, behavior: "instant" });
  }, []);

  const pdiUnit: VehicleUnit | null = pdiUnitId
    ? (units.find((u) => u.unit_id === pdiUnitId) ?? null)
    : null;

  return (
    <div className="module-fleet flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Sticky Command & Filter Bar (shrink-0) */}
      <section
        aria-label="Fleet Command and Triage Filter Bar"
        className="panel shrink-0 flex flex-col gap-2.5 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Real-time Multi-Attribute Search Input */}
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Bay, Model, VIN, atau kode DTC (mis. P0133)..."
              aria-label="Cari armada berdasarkan Bay, Model, VIN, Unit ID, atau kode DTC"
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-9 pr-8 py-2 num text-xs text-foreground outline-none placeholder:text-dim focus:border-foreground/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Hapus kata kunci pencarian"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X size={13} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Status Filter Pills (min-h-[44px]) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "ALL", label: "Semua", count: counts.ALL, tone: "dim" },
                { id: "CRITICAL", label: "Kritis", count: counts.CRITICAL, tone: "crimson" },
                { id: "WARNING", label: "Peringatan", count: counts.WARNING, tone: "amber" },
                {
                  id: "HEALTHY",
                  label: "Normal / Mengisi",
                  count: counts.HEALTHY,
                  tone: "emerald",
                },
              ] as const
            ).map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={cn(
                    "num inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    active
                      ? f.tone === "dim"
                        ? "border-foreground/60 bg-foreground/10 font-semibold text-foreground"
                        : cn("border-current bg-current/15 font-semibold", `text-${f.tone}`)
                      : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{f.label}</span>
                  <span className="rounded-[2px] bg-card px-1.5 py-0.5 text-[10px] font-bold">
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Triage Sort Selector & Global Exports */}
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative inline-flex items-center">
              <ArrowUpDown
                size={13}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-2.5 text-muted-foreground"
                aria-hidden="true"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as FleetSortMode)}
                aria-label="Urutkan unit armada berdasarkan prioritas triage"
                className="min-h-[44px] cursor-pointer rounded-[2px] border border-border bg-background pl-8 pr-7 py-1.5 num text-[11px] font-medium uppercase tracking-wider text-foreground outline-none focus:border-foreground/60"
              >
                <option value="PRIORITY">Urut: Prioritas Triage</option>
                <option value="LOWEST_V">Urut: Voltase Terendah</option>
                <option value="SHORTEST_TTC">Urut: Estimasi TTC Terdekat</option>
                <option value="BAY">Urut: Lokasi Bay (A-C)</option>
              </select>
            </label>

            <div
              className="num inline-flex min-h-[44px] items-center gap-1.5 rounded-[2px] border border-border bg-secondary/30 px-3 py-1.5 text-[11px] text-muted-foreground"
              title={`Total ${units.length} unit kendaraan terdaftar di armada yard`}
            >
              <Layers
                size={13}
                strokeWidth={1.75}
                className="shrink-0 text-foreground"
                aria-hidden="true"
              />
              <span>Armada: {units.length} Unit</span>
            </div>

            <button
              type="button"
              onClick={() => handleExportExcel("ALL")}
              className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Ekspor Laporan Eksekutif Excel berwarna untuk seluruh unit"
            >
              <FileSpreadsheet size={13} strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden sm:inline">Ekspor Laporan Excel</span>
              <span className="inline sm:hidden">Excel</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportCsv("ALL")}
              className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Ekspor data mentah CSV seluruh unit"
            >
              <Download size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>Unduh CSV</span>
            </button>
          </div>
        </div>

        {/* Deck Pagination & Quick-Jump Bay Pills (Hidden when <= 1 unit) */}
        {filteredUnits.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-2">
            <div className="flex items-center gap-1.5 overflow-x-auto card-scroll py-0.5 max-w-full">
              <span className="label-hmi mr-1 shrink-0 text-[10px]">Lompat Cepat:</span>
              {filteredUnits.map((u, idx) => {
                const crit = configs[u.unit_id]?.crit_v ?? 11.8;
                const tn = unitTone(u, crit);
                const isOnCurrentDeck =
                  idx >= safeDeckPage * CARDS_PER_DECK && idx < (safeDeckPage + 1) * CARDS_PER_DECK;
                const isSelected = u.unit_id === selectedId;
                return (
                  <button
                    key={u.unit_id}
                    type="button"
                    onClick={() => handleQuickJumpUnit(u.unit_id)}
                    className={cn(
                      "num inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isSelected
                        ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                        : isOnCurrentDeck
                          ? "border-foreground/35 bg-secondary/50 font-medium text-foreground"
                          : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                    )}
                    title={`${u.model} ${u.trim} (${fmtV(u.telemetry.v_bat)}V)`}
                  >
                    <Led tone={tn} pulse={tn === "crimson"} />
                    <span>{u.bay}</span>
                    <span className="text-[9.5px] text-dim">{fmtV(u.telemetry.v_bat)}V</span>
                  </button>
                );
              })}
            </div>

            {filteredUnits.length > CARDS_PER_DECK && (
              <div className="flex shrink-0 items-center gap-1.5 ml-auto">
                <span className="num text-[11px] text-muted-foreground mr-1">
                  Hal <strong className="text-foreground">{safeDeckPage + 1}</strong> /{" "}
                  <strong className="text-foreground">{totalPages}</strong> ({filteredUnits.length}{" "}
                  Unit)
                </span>
                <button
                  type="button"
                  disabled={safeDeckPage <= 0}
                  onClick={() => handlePageChange(safeDeckPage - 1)}
                  className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={safeDeckPage >= totalPages - 1}
                  onClick={() => handlePageChange(safeDeckPage + 1)}
                  className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Active Carousel Viewport (Horizontal Snap-Scroll with per-card internal scroll) */}
      {filteredUnits.length === 0 ? (
        <div className="panel flex flex-1 min-h-0 flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertTriangle size={28} strokeWidth={1.5} className="text-amber" aria-hidden="true" />
          <div>
            <div className="font-display text-base font-semibold uppercase tracking-wider text-foreground">
              Tidak Ada Unit Kendaraan yang Cocok
            </div>
            <p className="num mt-1 text-xs text-muted-foreground">
              Pencarian &ldquo;{searchQuery}&rdquo; pada filter {statusFilter} tidak mengembalikan
              hasil.
            </p>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="num inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[2px] border border-border bg-secondary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Reset Pencarian &amp; Filter</span>
          </button>
        </div>
      ) : (
        <m.div
          ref={carouselRef}
          layoutScroll
          onScroll={handleCarouselScroll}
          tabIndex={0}
          aria-label="Daftar kartu kesehatan baterai armada"
          className="fleet-carousel-track flex flex-nowrap gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth card-scroll flex-1 min-h-0 pb-1 [&>*]:min-w-0"
        >
          {filteredUnits.map((u, idx) => {
            const globalRank = idx + 1;
            const crit = configs[u.unit_id]?.crit_v ?? 11.8;
            const t = u.telemetry;
            const tone = unitTone(u, crit);
            const data = resolveUnitHistory(u, dataSource, history);
            const prediction = computeBatteryPrediction(
              data,
              t.v_bat,
              crit,
              t.engine_on,
              t.rtc_temp_c,
            );
            const c = HEX[tone];
            const isCritical = tone === "crimson" || t.v_bat < crit || t.dtc_cnt > 0;
            const isWarmup = t.engine_on;
            const isWarning = tone === "amber";
            const isSelected = u.unit_id === selectedId;
            const verified = t.v_bat >= ALT_VERIFY_V;
            const unitTicket = tickets.find((tk) => tk.unit_id === u.unit_id) ?? null;
            const conn = getUnitConnectionState(u, dataSource === "LIVE_API");
            const resolvedSsid = (t.sync_ssid || u.sync_ssid || "").trim();
            const zoneOrSsid = resolvedSsid || u.net_zone || (u.in_yard ? "YARD" : "OFFLINE");

            const warmupStarted = warmupStartTimes[u.unit_id];
            const rawElapsedSec =
              typeof warmupStarted === "number"
                ? Math.floor((Date.now() - warmupStarted) / 1000)
                : typeof t.run_time_s === "number" && t.run_time_s > 0
                  ? t.run_time_s
                  : 0;
            const elapsedSec = Math.min(WARMUP_TARGET_SEC, Math.max(0, rawElapsedSec));
            const progressPct = Math.min(100, Math.round((elapsedSec / WARMUP_TARGET_SEC) * 100));
            const isComplete = elapsedSec >= WARMUP_TARGET_SEC;
            const isCopied = copiedUnitId === u.unit_id;

            const cardWidthClasses =
              filteredUnits.length === 1
                ? "w-full md:max-h-none md:h-full md:min-h-0"
                : filteredUnits.length === 2
                  ? "w-[88vw] sm:w-[380px] snap-center max-h-[75dvh] md:w-[calc((100%-1rem)/2)] md:snap-start md:max-h-none md:h-full md:min-h-0"
                  : "w-[88vw] sm:w-[380px] snap-center max-h-[75dvh] md:w-[calc((100%-1rem)/2)] md:snap-start md:max-h-none md:h-full md:min-h-0 lg:w-[calc((100%-2rem)/3)] lg:snap-start lg:h-full lg:min-h-0";

            return (
              <m.article
                key={u.unit_id}
                layout="position"
                initial={cardsMountedRef.current ? { opacity: 0, scale: 0.97 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  layout: SPRING_LAYOUT,
                  default: { duration: DURATION.quick, ease: EASE_STANDARD },
                }}
                aria-label={`${u.model} ${u.trim} Bay ${u.bay}`}
                onClick={() => selectUnit(u.unit_id)}
                className={cn(
                  "panel relative flex flex-col shrink-0 overflow-hidden transition-[border-color,background-color,box-shadow] duration-200",
                  cardWidthClasses,
                  isCritical && "border-crimson/70 bg-crimson/[0.03] shadow-md shadow-crimson/10",
                  isWarmup && "border-emerald/60 bg-emerald/[0.03]",
                  isSelected && "ring-1 ring-foreground/60",
                )}
              >
                <CriticalFlash flashKey={criticalFlashes[u.unit_id] ?? 0} />
                {/* 1. LOCKED CARD HEADER (shrink-0) */}
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                        #{String(globalRank).padStart(2, "0")}
                      </span>
                      <span className="num text-xs font-semibold text-foreground">BAY {u.bay}</span>
                      <span className="num text-[10.5px] text-muted-foreground truncate">
                        ({u.unit_id})
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-sm font-semibold uppercase tracking-wider text-foreground truncate">
                      {u.model} <span className="font-normal text-muted-foreground">{u.trim}</span>
                    </h3>
                    <div className="num mt-0.5 text-[10.5px] text-muted-foreground">
                      VIN: <span className="text-foreground/90">{u.vin}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn("num text-xl font-bold leading-none", `text-${tone}`)}>
                      {fmtV(t.v_bat)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">V</span>
                    </div>
                    <div className="num mt-0.5 text-[10px] text-muted-foreground">
                      {t.adc_raw_mv} mV (ADC)
                    </div>
                    <div className="mt-1.5 flex items-center justify-end">
                      <span
                        className={cn(
                          "num inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                          conn.isOnline
                            ? "border-emerald/50 bg-emerald/15 text-emerald"
                            : "border-border bg-secondary/80 text-muted-foreground",
                        )}
                      >
                        <Led tone={conn.isOnline ? "emerald" : "dim"} />
                        {conn.badgeText}
                      </span>
                    </div>
                  </div>
                </header>

                {/* 2. INTERNAL CARD SCROLLABLE BODY (flex-1 min-h-0 overflow-y-auto card-scroll) */}
                <div
                  className="card-scroll flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
                  tabIndex={0}
                >
                  {/* Visual Alarm / Warm-up Banner */}
                  {isCritical ? (
                    <div className="flex items-start gap-2 rounded-[2px] border border-crimson/50 bg-crimson/10 px-3 py-2">
                      <AlertTriangle
                        size={15}
                        className="mt-0.5 shrink-0 text-crimson"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 leading-tight">
                        <div className="num text-[10.5px] font-semibold uppercase tracking-wide text-crimson">
                          {t.dtc_cnt > 0
                            ? `Alarm Kritis & ECU Fault (${t.dtc})`
                            : `Alarm Voltase Kritis (< ${fmtV(crit)} V)`}
                        </div>
                        <div className="num mt-0.5 text-[9.5px] text-muted-foreground">
                          Risiko sulfasi sel timbal-asam. Prioritaskan pemanasan mesin alternator 10
                          menit.
                        </div>
                      </div>
                    </div>
                  ) : isWarmup ? (
                    <div className="flex items-start gap-2 rounded-[2px] border border-emerald/50 bg-emerald/10 px-3 py-2">
                      <BadgeCheck
                        size={15}
                        className="mt-0.5 shrink-0 text-emerald"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 leading-tight">
                        <div className="num text-[10.5px] font-semibold uppercase tracking-wide text-emerald">
                          Pemanasan Mesin Alternator Aktif
                        </div>
                        <div className="num mt-0.5 text-[9.5px] text-muted-foreground">
                          Alternator ({fmtV(t.v_bat)} V) sedang memulihkan muatan baterai.
                        </div>
                      </div>
                    </div>
                  ) : isWarning ? (
                    <div className="flex items-center gap-2 rounded-[2px] border border-amber/40 bg-amber/10 px-3 py-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                      <span className="num text-[10px] text-amber">
                        Peringatan: Voltase mendekati ambang kritis ({fmtV(crit)} V). Jadwalkan
                        pemanasan.
                      </span>
                    </div>
                  ) : null}

                  {/* Active 10-Min Warm-Up Stopwatch inside Scrollable Card Body */}
                  {t.engine_on && (
                    <div className="rounded-[2px] border border-emerald/40 bg-background/70 p-2.5">
                      <div className="flex justify-between num text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1 text-foreground">
                          <Timer
                            size={12}
                            strokeWidth={1.5}
                            className="text-emerald"
                            aria-hidden="true"
                          />
                          <span>Sesi Pemanasan {formatMmSs(elapsedSec)} / 10:00</span>
                        </span>
                        <span
                          className={isComplete ? "font-semibold text-emerald" : "text-foreground"}
                        >
                          {isComplete ? "100% Selesai" : `${progressPct}%`}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-[1px] bg-muted">
                        <div
                          className="h-full bg-emerald transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      {verified && (
                        <div className="mt-1.5 flex items-center gap-1.5 num text-[10px] text-emerald">
                          <BadgeCheck size={12} strokeWidth={1.5} aria-hidden="true" />
                          <span>
                            Pengisian alternator terverifikasi ({fmtV(t.v_bat)} V &ge;{" "}
                            {ALT_VERIFY_V.toFixed(2)} V)
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OLS Battery Forecast + DS3231SN Thermal Compensation & Arrhenius Penalty */}
                  <div className="rounded-[2px] border border-border bg-background/60 px-3 py-2 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="label-hmi flex items-center gap-1.5 text-[10px]">
                        <TrendingDown
                          size={13}
                          strokeWidth={1.5}
                          className="text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span>Drain Rate &amp; TTC</span>
                      </span>
                      <span
                        className={cn(
                          "num inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[10.5px] font-semibold",
                          PREDICTION_BADGE_STYLE[prediction.tone],
                        )}
                      >
                        {prediction.statusText}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border/60 pt-1.5 num text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1 text-foreground/90">
                        <Thermometer
                          size={11}
                          strokeWidth={1.75}
                          className="text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span>
                          25&deg;C Comp:{" "}
                          <strong className="text-foreground">
                            {prediction.compensatedV25.toFixed(2)}V
                          </strong>{" "}
                          ({prediction.tempCompensatedSocPct}% SOC)
                        </span>
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          prediction.thermalFactor > 1.35 ? "text-amber" : "text-muted-foreground",
                        )}
                      >
                        Thermal Load: {prediction.thermalFactor.toFixed(2)}x @{" "}
                        {t.rtc_temp_c.toFixed(1)}&deg;C
                      </span>
                    </div>
                  </div>

                  {/* Shift Handover & Maintenance Ticket Workflow (Shown for units with active ticket or Critical/Warning state) */}
                  {(unitTicket || isCritical || isWarning) && (
                    <div className="rounded-[2px] border border-border bg-background/70 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="label-hmi flex items-center gap-1.5 text-[10px] text-foreground">
                          <Wrench
                            size={12}
                            strokeWidth={1.75}
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span>
                            {unitTicket ? `Ticket ${unitTicket.ticket_code}` : "Maintenance Triage"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "num inline-flex items-center gap-1 overflow-hidden rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider transition-colors duration-200",
                            TICKET_BADGE_STYLE[unitTicket?.status ?? "OPEN"],
                          )}
                        >
                          {unitTicket?.status === "RESOLVED" && (
                            <ResolveCheck
                              animateIn={!initialResolvedRef.current?.has(u.unit_id)}
                              className="h-3 w-3"
                            />
                          )}
                          <m.span
                            key={unitTicket?.status ?? "OPEN"}
                            initial={cardsMountedRef.current ? { opacity: 0, y: -4 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: DURATION.quick, ease: EASE_STANDARD }}
                          >
                            {(unitTicket?.status ?? "OPEN").replace("_", " ")}
                          </m.span>
                        </span>
                      </div>
                      <div className="num text-[10px] leading-relaxed text-muted-foreground">
                        <div>
                          PIC:{" "}
                          <span className="font-medium text-foreground">
                            {unitTicket?.assigned_to ?? "Unassigned"}
                          </span>
                        </div>
                        <div
                          className="truncate"
                          title={unitTicket?.handover_note ?? u.status_label}
                        >
                          Note:{" "}
                          <span className="text-foreground/85">
                            {unitTicket?.handover_note ?? u.status_label}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={unitTicket?.status === "IN_PROGRESS"}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTicketStatus(
                              u.unit_id,
                              "IN_PROGRESS",
                              unitTicket?.assigned_to && unitTicket.assigned_to !== "Unassigned"
                                ? unitTicket.assigned_to
                                : "Teknisi Shift Aktif",
                              "Tiket diklaim teknisi; sedang dilakukan pemeriksaan di stock yard.",
                            );
                          }}
                          className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-amber/50 bg-amber/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber transition-colors hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Wrench size={12} strokeWidth={1.75} aria-hidden="true" />
                          <span>Klaim Tiket</span>
                        </button>
                        <button
                          type="button"
                          disabled={unitTicket?.status === "RESOLVED"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setResolvingTicketUnitId(u.unit_id);
                          }}
                          className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-emerald/50 bg-emerald/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald transition-colors hover:bg-emerald/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ClipboardCheck size={12} strokeWidth={1.75} aria-hidden="true" />
                          <span>Tutup Tiket...</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 24-Hour Voltage Discharge / Charge Curve */}
                  <div className="fleet-chart h-32 -mx-1 touch-pan-y">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`g-${u.unit_id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={c} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={c} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="t"
                          tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono" }}
                          interval="preserveStartEnd"
                          axisLine={{ stroke: "#282E3B" }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#0F1116",
                            border: "1px solid #1E222B",
                            borderRadius: 2,
                            fontFamily: "JetBrains Mono",
                            fontSize: 11,
                          }}
                          formatter={(val: unknown) => [`${Number(val).toFixed(2)} V`, "Baterai"]}
                          labelFormatter={(lbl) => `Pukul: ${lbl}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke={c}
                          strokeWidth={1.5}
                          fill={`url(#g-${u.unit_id})`}
                          isAnimationActive={chartIntro}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Complementary Hardware Metrics (Non-duplicated from header) */}
                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-2.5">
                    <Stat
                      label="Arus Tidur"
                      value={t.engine_on ? "BYPASS" : t.shunt_sleep_ua}
                      unit={t.engine_on ? "" : "µA"}
                      tone={!t.engine_on && t.shunt_sleep_ua > 450 ? "amber" : "dim"}
                    />
                    <Stat
                      label="Durasi Bangun"
                      value={t.active_ms.toLocaleString("id-ID")}
                      unit="ms"
                    />
                    <Stat
                      label="Beban Harian"
                      value={t.daily_mah.toFixed(2)}
                      unit="mAh"
                      tone={t.daily_mah > 65 ? "amber" : "dim"}
                    />
                  </div>

                  {/* Ringkasan Diagnostik & Jaringan (Compact Single-Pass Hardware Breakdown) */}
                  <div
                    className={cn(
                      "rounded-[2px] border p-2.5 num text-[10px] space-y-1",
                      isCritical
                        ? "border-crimson/35 bg-background/85"
                        : "border-border bg-background/45",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>Status Unit:</span>
                      <span className={cn("font-semibold truncate", `text-${tone}`)}>
                        {u.status_label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>CAN Bus &amp; Memori DTC:</span>
                      <span
                        className={cn(
                          "font-semibold",
                          t.can_ok === false || t.dtc_cnt > 0 ? "text-crimson" : "text-emerald",
                        )}
                      >
                        {t.can_ok === false ? "CAN FAULT" : "CAN OK"} ·{" "}
                        {t.dtc_cnt > 0 ? `${t.dtc} (${t.dtc_cnt} DTC)` : "0 DTC (Normal)"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>Jaringan &amp; Buffer:</span>
                      <span className="font-medium text-foreground">
                        {zoneOrSsid} ({t.rssi} dBm) · {u.buffer_used} slot
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>Siklus Tidur &amp; Sync:</span>
                      <span className="font-medium text-foreground">
                        Sleep {formatSleepInterval(t.sleep_cfg)} ·{" "}
                        {u.last_seen ??
                          (conn.lastSeenSec !== null
                            ? formatDurationCompact(conn.lastSeenSec)
                            : "Real-time")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. LOCKED CARD FOOTER (shrink-0) */}
                <footer className="shrink-0 border-t border-border bg-card/95 p-3 space-y-2">
                  {!t.engine_on && u.in_yard && t.v_bat < 12.4 && (
                    <button
                      type="button"
                      disabled={u.status_label === "Warm-Up Dispatched"}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectUnit(u.unit_id);
                        dispatchWarmup(u.unit_id);
                      }}
                      className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-amber/60 bg-amber/10 py-2 num text-[11px] font-semibold uppercase tracking-wider text-amber transition-colors hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Flame size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                      <span>
                        {u.status_label === "Warm-Up Dispatched"
                          ? "Staf Telah Ditugaskan"
                          : "Tugaskan Pemanasan (Memo)"}
                      </span>
                    </button>
                  )}

                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportExcel(u.unit_id);
                      }}
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-1.5 py-2 text-[10px] font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      title="Unduh Laporan Excel Terformat (.xls)"
                    >
                      <FileSpreadsheet
                        size={13}
                        strokeWidth={1.75}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <span>Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportCsv(u.unit_id);
                      }}
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-1.5 py-2 text-[10px] font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      title="Unduh Log Mentah CSV"
                    >
                      <Download
                        size={13}
                        strokeWidth={1.75}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <span>CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyDeepLink(u.unit_id);
                      }}
                      className={cn(
                        "num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border px-1.5 py-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        isCopied
                          ? "border-foreground/60 bg-secondary text-foreground font-semibold"
                          : "border-border bg-secondary/40 text-foreground hover:border-foreground/60 hover:bg-secondary",
                      )}
                      title={`Salin URL Deep-Link untuk ${u.unit_id}`}
                    >
                      {isCopied ? (
                        <Check size={13} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      ) : (
                        <QrCode
                          size={13}
                          strokeWidth={1.75}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span>{isCopied ? "Copied" : "QR Link"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPdiModal(u.unit_id);
                      }}
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-1.5 py-2 text-[10px] font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <FileCheck2
                        size={13}
                        strokeWidth={1.75}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <span>PDI Cert</span>
                    </button>
                  </div>
                </footer>
              </m.article>
            );
          })}
        </m.div>
      )}

      <AnimatePresence>
        {pdiUnit && (
          <PdiCertificateModal
            key={pdiUnit.unit_id}
            unit={pdiUnit}
            critV={configs[pdiUnit.unit_id]?.crit_v ?? 11.8}
            historyData={resolveUnitHistory(pdiUnit, dataSource, history)}
            inspectedAt={pdiTimestamp}
            onClose={() => setPdiUnitId(null)}
            onExportExcel={() => handleExportExcel(pdiUnit.unit_id)}
            onExportCsv={() => handleExportCsv(pdiUnit.unit_id)}
          />
        )}
        {resolvingTicketUnitId && (
          <TicketResolutionModal
            unitId={resolvingTicketUnitId}
            bay={units.find((u) => u.unit_id === resolvingTicketUnitId)?.bay ?? ""}
            model={units.find((u) => u.unit_id === resolvingTicketUnitId)?.model ?? ""}
            techAction={techAction}
            setTechAction={setTechAction}
            techName={techName}
            setTechName={setTechName}
            techNotes={techNotes}
            setTechNotes={setTechNotes}
            onConfirm={() => {
              updateTicketStatus(
                resolvingTicketUnitId,
                "RESOLVED",
                techName,
                `[TINDAKAN: ${techAction}] ${techNotes}`,
              );
              setResolvingTicketUnitId(null);
            }}
            onClose={() => setResolvingTicketUnitId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface PdiModalProps {
  unit: VehicleUnit;
  critV: number;
  historyData: Array<{ t: string; v: number; ts?: number }>;
  inspectedAt: string;
  onClose: () => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
}

function PdiCertificateModal({
  unit,
  critV,
  historyData,
  inspectedAt,
  onClose,
  onExportExcel,
  onExportCsv,
}: PdiModalProps) {
  const [deepLinkCopied, setDeepLinkCopied] = useState(false);
  const t = unit.telemetry;
  const prediction = computeBatteryPrediction(
    historyData,
    t.v_bat,
    critV,
    t.engine_on,
    t.rtc_temp_c,
  );
  const deepLinkUrl = buildUnitDeepLinkUrl(unit.unit_id, "fleet");

  const handleCopyModalUrl = async () => {
    await copyTextSafe(deepLinkUrl);
    setDeepLinkCopied(true);
    setTimeout(() => setDeepLinkCopied(false), 2000);
  };

  const checklist = [
    {
      parameter: "Battery Open-Circuit Voltage",
      reading: `${t.v_bat.toFixed(2)} V (25°C Comp: ${prediction.compensatedV25.toFixed(2)} V)`,
      target: ">= 12.20 V",
      passed: t.v_bat >= 12.2,
    },
    {
      parameter: "ADC Node Calibration (Pin 34)",
      reading: `${t.adc_raw_mv} mV`,
      target: "1800 - 2800 mV",
      passed: t.adc_raw_mv >= 1800 && t.adc_raw_mv <= 2800,
    },
    {
      parameter: "Parasitic Deep-Sleep Current",
      reading: `${t.shunt_sleep_ua} µA`,
      target: "<= 500 µA",
      passed: t.shunt_sleep_ua <= 500,
    },
    {
      parameter: "OBD-II ECU Fault Memory (Mode 03)",
      reading: t.dtc,
      target: "NONE / 0 DTC",
      passed: t.dtc_cnt === 0 && (t.dtc === "NONE" || !t.dtc),
    },
    {
      parameter: "TWAI / CAN-bus Communication Link",
      reading: t.can_ok === false ? "OFFLINE / Periksa Jalur CAN" : "ONLINE (TWAI 500 kbps)",
      target: "ONLINE / OK",
      passed: t.can_ok !== false,
    },
    {
      parameter: "DS3231SN Thermal & Arrhenius Load",
      reading: `${t.rtc_temp_c.toFixed(1)} °C (${prediction.thermalFactor.toFixed(2)}x Factor)`,
      target: "< 60.0 °C",
      passed: t.rtc_temp_c < 60.0,
    },
  ];

  const isOverallPassed = checklist.every((item) => item.passed);

  return (
    <m.div
      className="pdi-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdi-cert-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
      exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <m.div
        className="pdi-certificate-sheet panel card-scroll relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto border border-border bg-card p-4 sm:p-6 shadow-2xl"
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
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex flex-1 min-w-[240px] flex-wrap items-center gap-3.5">
            <OrionLogo
              variant="icon"
              theme="dark"
              className="screen-only-logo h-12 w-12 shrink-0 rounded-[8px]"
            />
            <OrionLogo
              variant="mono-light"
              className="print-only-logo h-12 w-12 shrink-0 rounded-[8px]"
            />
            <div className="min-w-0 flex-1">
              <div className="num text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                ORION: SISTEM TELEMETRI &amp; DIGITAL TWIN DIPO STOCK YARD
              </div>
              <h2
                id="pdi-cert-title"
                className="font-display text-base sm:text-lg font-semibold uppercase tracking-wider text-foreground mt-0.5"
              >
                PRE-DELIVERY INSPECTION (PDI) &amp; BATTERY HEALTH CERTIFICATE
              </h2>
              <p className="num text-[11px] text-muted-foreground mt-0.5">
                Stock Yard Electrical, Quiescent Shunt &amp; OBD-II ECU Readiness Report
              </p>
            </div>
          </div>

          {/* Right Header: Pure SVG QR Code + Close Button */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center rounded-[2px] border border-border bg-background/60 p-2 text-center">
              <UnitQrCode value={deepLinkUrl} size={96} animateBuild />
              <span className="num mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                SCAN FOR MOBILE DEEP-LINK
              </span>
              <button
                type="button"
                onClick={() => void handleCopyModalUrl()}
                className={cn(
                  "print-hidden num mt-1.5 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  deepLinkCopied
                    ? "border-foreground/60 bg-secondary text-foreground"
                    : "border-border bg-secondary/50 text-foreground hover:border-foreground/60 hover:bg-secondary",
                )}
              >
                {deepLinkCopied ? (
                  <Check size={12} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Copy size={12} strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>{deepLinkCopied ? "URL Copied!" : "Copy Deep-Link URL"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup sertifikat PDI"
              className="print-hidden inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[2px] border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[2px] border px-4 py-3",
            isOverallPassed
              ? "border-emerald/50 bg-emerald/10 text-emerald"
              : "border-crimson/60 bg-crimson/10 text-crimson",
          )}
        >
          <div className="flex items-center gap-2.5">
            {isOverallPassed ? (
              <CheckCircle2 size={20} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle size={20} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            )}
            <div>
              <div className="num text-xs font-bold uppercase tracking-wider">
                {isOverallPassed ? "PDI PASSED" : "PDI HOLD / ACTION REQUIRED"}
              </div>
              <div className="num text-[10.5px] text-foreground/85 mt-0.5">
                {isOverallPassed
                  ? "Unit memenuhi standar kelistrikan dan memori ECU untuk serah terima pelanggan."
                  : "Unit membutuhkan tindakan pengisian baterai atau pemeriksaan diagnostik sebelum serah terima."}
              </div>
            </div>
          </div>
          <div className="num text-right text-[10.5px]">
            <div className="text-muted-foreground">Drain Rate &amp; TTC</div>
            <div className="font-semibold text-foreground">{prediction.statusText}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-[2px] border border-border bg-background/50 p-3.5 sm:grid-cols-3">
          <div>
            <div className="label-hmi text-[10px]">Model &amp; Trim</div>
            <div className="num mt-0.5 text-xs font-semibold text-foreground">
              {unit.model} {unit.trim}
            </div>
          </div>
          <div>
            <div className="label-hmi text-[10px]">Nomor Rangka (VIN)</div>
            <div className="num mt-0.5 text-xs font-semibold text-foreground">{unit.vin}</div>
          </div>
          <div>
            <div className="label-hmi text-[10px]">Bay Location</div>
            <div className="num mt-0.5 text-xs font-semibold text-foreground">
              Bay {unit.bay} ({unit.color})
            </div>
          </div>
          <div>
            <div className="label-hmi text-[10px]">Unit Telemetry ID</div>
            <div className="num mt-0.5 text-xs text-foreground">{unit.unit_id}</div>
          </div>
          <div>
            <div className="label-hmi text-[10px]">Waktu Inspeksi</div>
            <div className="num mt-0.5 text-xs text-foreground">{inspectedAt}</div>
          </div>
          <div>
            <div className="label-hmi text-[10px]">Wake Counter &amp; Jaringan</div>
            <div className="num mt-0.5 text-xs text-foreground">
              Boot #{t.boot} · {t.rssi} dBm (
              {(t.sync_ssid || unit.sync_ssid || "").trim() || unit.net_zone || "YARD"})
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full border-collapse text-left num text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 px-3 font-medium">Parameter Teknis</th>
                <th className="py-2.5 px-3 font-medium">Hasil Ukur</th>
                <th className="py-2.5 px-3 font-medium">Standar Target</th>
                <th className="py-2.5 px-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {checklist.map((item) => (
                <tr key={item.parameter} className="hover:bg-secondary/20">
                  <td className="py-2.5 px-3 font-sans font-medium text-foreground">
                    {item.parameter}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-foreground">{item.reading}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{item.target}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold uppercase",
                        item.passed
                          ? "border-emerald/40 bg-emerald/10 text-emerald"
                          : "border-crimson/50 bg-crimson/15 text-crimson",
                      )}
                    >
                      {item.passed ? (
                        <CheckCircle2 size={11} strokeWidth={2} aria-hidden="true" />
                      ) : (
                        <XCircle size={11} strokeWidth={2} aria-hidden="true" />
                      )}
                      {item.passed ? "PASS" : "FAIL"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-[2px] border border-border/80 bg-background/40 px-3.5 py-2.5 num text-[10px] leading-relaxed text-muted-foreground">
          ORION Project (D4 TRPL IT Internship: Stock Yard Monitoring System). Independent telemetry
          platform; not an official product of or affiliated with Mitsubishi Motors.
        </div>

        <div className="print-hidden mt-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onExportExcel}
            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-border bg-secondary/60 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Export Excel Report</span>
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-border bg-secondary/60 px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Download size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Download Unit CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-foreground/50 bg-secondary px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Printer size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </m.div>
    </m.div>
  );
}

interface TicketModalProps {
  unitId: string;
  bay: string;
  model: string;
  techAction: string;
  setTechAction: (v: string) => void;
  techName: string;
  setTechName: (v: string) => void;
  techNotes: string;
  setTechNotes: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

function TicketResolutionModal({
  unitId,
  bay,
  model,
  techAction,
  setTechAction,
  techName,
  setTechName,
  techNotes,
  setTechNotes,
  onConfirm,
  onClose,
}: TicketModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <m.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-resolve-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
      exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <m.div
        className="panel relative w-full max-w-lg border border-border bg-card p-4 sm:p-6 shadow-2xl"
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
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-emerald" />
            <h2
              id="ticket-resolve-title"
              className="font-display text-sm font-semibold text-foreground uppercase tracking-wider"
            >
              Form Penanganan &amp; Penutupan Tiket Pemeliharaan
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup formulir"
            className="inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-[2px] border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3.5 num text-xs">
          <div className="rounded-[2px] border border-border bg-background/50 p-3 flex items-center justify-between">
            <div>
              <div className="label-hmi text-[10px]">Target Unit &amp; Lokasi</div>
              <div className="font-bold text-foreground mt-0.5">
                {bay} · {model}
              </div>
            </div>
            <div className="text-right">
              <div className="label-hmi text-[10px]">Unit ID</div>
              <div className="text-muted-foreground mt-0.5">{unitId}</div>
            </div>
          </div>

          <div>
            <label className="label-hmi block text-[10px] text-muted-foreground mb-1">
              Nama Teknisi Penanggung Jawab
            </label>
            <input
              type="text"
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              className="w-full rounded-[2px] border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Contoh: Teknisi Shift Pagi"
            />
          </div>

          <div>
            <label className="label-hmi block text-[10px] text-muted-foreground mb-1">
              Tindakan Perbaikan yang Dilakukan
            </label>
            <select
              value={techAction}
              onChange={(e) => setTechAction(e.target.value)}
              className="w-full rounded-[2px] border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="Pengisian Daya Baterai (Charger 2 Jam)">
                Pengisian Daya Baterai (Charger 2 Jam)
              </option>
              <option value="Jumper Starter &amp; Pemanasan 10 Menit">
                Jumper Starter &amp; Pemanasan 10 Menit
              </option>
              <option value="Penggantian Unit Baterai Baru (GS Astra 55D23L)">
                Penggantian Unit Baterai Baru (GS Astra 55D23L)
              </option>
              <option value="Pembersihan Sulfasi &amp; Pengencangan Terminal">
                Pembersihan Sulfasi &amp; Pengencangan Terminal
              </option>
            </select>
          </div>

          <div>
            <label className="label-hmi block text-[10px] text-muted-foreground mb-1">
              Catatan Handover &amp; Verifikasi Hasil
            </label>
            <textarea
              value={techNotes}
              onChange={(e) => setTechNotes(e.target.value)}
              rows={3}
              className="w-full rounded-[2px] border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Deskripsi hasil penanganan..."
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-[2px] border border-border bg-secondary/50 px-4 py-2 num text-xs font-medium text-foreground hover:bg-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border border-emerald/60 bg-emerald/15 px-4 py-2 num text-xs font-semibold text-emerald hover:bg-emerald/25"
          >
            <ClipboardCheck size={14} />
            <span>Sahkan &amp; Tutup Tiket</span>
          </button>
        </div>
      </m.div>
    </m.div>
  );
}
