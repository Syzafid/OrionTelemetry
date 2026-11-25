import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpDown,
  BadgeCheck,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Layers,
  Printer,
  QrCode,
  RefreshCw,
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
  buildExportFilename,
  buildTelemetryCsv,
  computeBatteryPrediction,
  formatWibTimestamp,
  resolveExportEndpointUrl,
  resolveExportTimeWindow,
  type ExportFilterConfig,
  type ExportPeriodMode,
  type ExportResolutionMode,
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

const HEX = {
  emerald: "var(--emerald)",
  crimson: "var(--crimson)",
  amber: "var(--amber)",
  dim: "var(--muted-foreground)",
};
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

const MONTH_OPTIONS = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
] as const;

const EXPORT_PERIOD_OPTIONS: ReadonlyArray<{ id: ExportPeriodMode; label: string }> = [
  { id: "DAILY", label: "Per Hari" },
  { id: "7_DAYS", label: "7 Hari Terakhir" },
  { id: "MONTHLY", label: "Per Bulan" },
  { id: "YEARLY", label: "Per Tahun" },
  { id: "CUSTOM", label: "Rentang Tanggal" },
  { id: "ALL_TIME", label: "Semua Riwayat" },
];

const EXPORT_RESOLUTION_OPTIONS: ReadonlyArray<{
  id: ExportResolutionMode;
  label: string;
  hint: string;
}> = [
  { id: "RAW", label: "Data Mentah / Setiap Siklus", hint: "Ideal untuk audit harian" },
  { id: "HOURLY", label: "Ringkasan Per Jam", hint: "Rekomendasi laporan bulanan" },
  { id: "DAILY_SUMMARY", label: "Ringkasan Per Hari", hint: "Rekomendasi rekap tahunan" },
];

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
    selectedId,
    selectUnit,
    configs,
    dataSource,
    apiUrl,
    apiStatus,
    isOfflineSnapshot,
    pollNow,
    history,
    dispatchWarmup,
    auditLogs,
    tickets,
    updateTicketStatus,
    setActiveModule,
  } = useTelemetry();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FleetStatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<FleetSortMode>("PRIORITY");
  const [deckPage, setDeckPage] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const initialWibDate = formatWibTimestamp(Math.floor(Date.now() / 1000));
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"EXCEL" | "CSV">("EXCEL");
  const [exportUnitScope, setExportUnitScope] = useState<"ALL" | "FILTERED" | "CUSTOM">("ALL");
  const [exportCustomUnits, setExportCustomUnits] = useState<string[]>([]);
  const [exportPeriod, setExportPeriod] = useState<ExportPeriodMode>("DAILY");
  const [exportDate, setExportDate] = useState(initialWibDate.slice(0, 10));
  const [exportMonth, setExportMonth] = useState(initialWibDate.slice(0, 7));
  const [exportYear, setExportYear] = useState(initialWibDate.slice(0, 4));
  const [exportStartDate, setExportStartDate] = useState(initialWibDate.slice(0, 10));
  const [exportEndDate, setExportEndDate] = useState(initialWibDate.slice(0, 10));
  const [exportResolution, setExportResolution] = useState<ExportResolutionMode>("RAW");
  const [exportLimit, setExportLimit] = useState<number>(0);

  const [warmupStartTimes, setWarmupStartTimes] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const [pdiUnitId, setPdiUnitId] = useState<string | null>(null);
  const [pdiTimestamp, setPdiTimestamp] = useState<string>("");
  const [copiedUnitId, setCopiedUnitId] = useState<string | null>(null);
  const [resolvingTicketUnitId, setResolvingTicketUnitId] = useState<string | null>(null);
  const [techAction, setTechAction] = useState("Pengisian Daya Baterai (Charger 2 Jam)");
  const [techName, setTechName] = useState("");
  const [techNotes, setTechNotes] = useState("");

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
    (targetUnitId: string, filterConfig?: ExportFilterConfig) => {
      if (dataSource === "LIVE_API" && apiStatus === "CONNECTED") {
        const url = resolveExportEndpointUrl(apiUrl, "export_csv.php", targetUnitId, filterConfig);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const csvContent = buildTelemetryCsv(units, history, targetUnitId, {
        isLiveApi: dataSource === "LIVE_API",
        ...filterConfig,
      });
      if (typeof URL.createObjectURL !== "function") return;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);
      const windowInfo = resolveExportTimeWindow(filterConfig);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = buildExportFilename("ORION_TELEMETRY", targetUnitId, windowInfo, "csv");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    },
    [dataSource, apiStatus, apiUrl, units, history],
  );

  const handleExportExcel = useCallback(
    (targetUnitId: string, filterConfig?: ExportFilterConfig) => {
      if (dataSource === "LIVE_API" && apiStatus === "CONNECTED") {
        const url = resolveExportEndpointUrl(
          apiUrl,
          "export_excel.php",
          targetUnitId,
          filterConfig,
        );
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const excelXml = buildFormattedExcelPrettier(units, configs, history, targetUnitId, {
        isLiveApi: dataSource === "LIVE_API",
        tickets,
        auditLogs,
        ...filterConfig,
      });
      if (typeof URL.createObjectURL !== "function") return;
      const blob = new Blob([excelXml], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);
      const windowInfo = resolveExportTimeWindow(filterConfig);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = buildExportFilename("ORION_TELEMETRY_REPORT", targetUnitId, windowInfo, "xls");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    },
    [dataSource, apiStatus, apiUrl, units, configs, history, tickets, auditLogs],
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

  const activeExportTarget = useMemo(() => {
    if (filteredUnits.length === 0 || filteredUnits.length === units.length) {
      return "ALL";
    }
    return filteredUnits.map((u) => u.unit_id).join(",");
  }, [filteredUnits, units.length]);

  const exportUnitCount = filteredUnits.length > 0 ? filteredUnits.length : units.length;

  const openExportModal = useCallback(
    (format: "EXCEL" | "CSV", initialTargetUnitId: string) => {
      setExportFormat(format);
      if (initialTargetUnitId === "ALL") {
        setExportUnitScope("ALL");
        setExportCustomUnits(units.map((u) => u.unit_id));
      } else if (filteredUnits.length > 1 && initialTargetUnitId === activeExportTarget) {
        setExportUnitScope("FILTERED");
        setExportCustomUnits(filteredUnits.map((u) => u.unit_id));
      } else {
        setExportUnitScope("CUSTOM");
        setExportCustomUnits(
          initialTargetUnitId
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      setExportModalOpen(true);
    },
    [units, filteredUnits, activeExportTarget],
  );

  const handleExportPeriodChange = useCallback((nextPeriod: ExportPeriodMode) => {
    setExportPeriod(nextPeriod);
    if (nextPeriod === "MONTHLY") {
      setExportResolution("HOURLY");
    } else if (nextPeriod === "YEARLY") {
      setExportResolution("DAILY_SUMMARY");
    } else if (nextPeriod === "DAILY" || nextPeriod === "7_DAYS") {
      setExportResolution("RAW");
    }
  }, []);

  const configuredTargetUnitId = useMemo(() => {
    if (exportUnitScope === "ALL") return "ALL";
    if (exportUnitScope === "FILTERED") return activeExportTarget;
    return exportCustomUnits.join(",");
  }, [exportUnitScope, activeExportTarget, exportCustomUnits]);

  const configuredExportFilter = useMemo<ExportFilterConfig>(
    () => ({
      period: exportPeriod,
      date: exportDate,
      month: exportMonth,
      year: exportYear,
      startDate: exportStartDate,
      endDate: exportEndDate,
      resolution: exportResolution,
      limit: exportLimit,
    }),
    [
      exportPeriod,
      exportDate,
      exportMonth,
      exportYear,
      exportStartDate,
      exportEndDate,
      exportResolution,
      exportLimit,
    ],
  );

  const executeConfiguredExport = useCallback(() => {
    if (exportUnitScope === "CUSTOM" && exportCustomUnits.length === 0) return;
    if (exportFormat === "CSV") {
      handleExportCsv(configuredTargetUnitId, configuredExportFilter);
    } else {
      handleExportExcel(configuredTargetUnitId, configuredExportFilter);
    }
    setExportModalOpen(false);
  }, [
    exportUnitScope,
    exportCustomUnits.length,
    exportFormat,
    configuredTargetUnitId,
    configuredExportFilter,
    handleExportCsv,
    handleExportExcel,
  ]);

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
      <h1 className="sr-only">Armada &amp; Inspeksi PDI Stock Yard</h1>
      {dataSource === "LIVE_API" && (apiStatus === "FALLBACK_ERROR" || isOfflineSnapshot) && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[2px] border border-amber/60 bg-amber/10 px-3 py-2 num text-xs text-amber"
        >
          <span>Koneksi Live API terputus. Menampilkan cache snapshot terakhir.</span>
          <button
            type="button"
            onClick={pollNow}
            className="inline-flex min-h-[44px] sm:min-h-[34px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-amber/60 bg-background px-3 py-1 text-[11px] font-semibold uppercase text-amber hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw size={12} aria-hidden="true" />
            <span>Coba Muat Ulang</span>
          </button>
        </div>
      )}
      {/* Sticky Command & Filter Bar (shrink-0) */}
      <section
        aria-label="Fleet Command and Triage Filter Bar"
        data-guide-target="m02-filter-bar"
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
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-9 pr-11 py-2 num text-xs text-foreground placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Hapus kata kunci pencarian"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <span className="rounded-[2px] bg-card px-1.5 py-0.5 text-[11px] font-bold">
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
                aria-label="Urutkan unit kendaraan berdasarkan kondisi aki"
                className="min-h-[44px] cursor-pointer rounded-[2px] border border-border bg-background pl-8 pr-7 py-1.5 num text-[11px] font-medium uppercase tracking-wider text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="PRIORITY">Urut: Prioritas Aki</option>
                <option value="LOWEST_V">Urut: Voltase Terendah</option>
                <option value="SHORTEST_TTC">Urut: Sisa Waktu Tercepat</option>
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
              data-guide-target="m02-actions"
              onClick={() => openExportModal("EXCEL", activeExportTarget)}
              className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title={`Konfigurasi & Ekspor Workbook Excel 3-Sheet ber-AutoFilter (${exportUnitCount} unit sesuai filter aktif)`}
            >
              <FileSpreadsheet size={13} strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden sm:inline">Ekspor Excel ({exportUnitCount} Unit)</span>
              <span className="inline sm:hidden">Excel ({exportUnitCount})</span>
            </button>

            <button
              type="button"
              onClick={() => openExportModal("CSV", activeExportTarget)}
              className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title={`Konfigurasi & Unduh Data Mentah CSV 39 Kolom (${exportUnitCount} unit sesuai filter aktif)`}
            >
              <Download size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>Unduh CSV ({exportUnitCount})</span>
            </button>
          </div>
        </div>

        {/* Deck Pagination & Quick-Jump Bay Pills (Hidden when <= 1 unit) */}
        {filteredUnits.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-2">
            <div className="flex items-center gap-1.5 overflow-x-auto card-scroll py-0.5 max-w-full">
              <span className="label-hmi mr-1 shrink-0 text-[11px]">Pilih Cepat:</span>
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
                      "num inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isSelected
                        ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                        : isOnCurrentDeck
                          ? "border-foreground/35 bg-secondary/50 font-medium text-foreground"
                          : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                    )}
                    title={`${u.model} ${u.trim} (${fmtV(u.telemetry.v_bat)}V)`}
                  >
                    <Led tone={tn} />
                    <span>{u.bay}</span>
                    <span className="text-[11px] text-dim">{fmtV(u.telemetry.v_bat)}V</span>
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
                  <span>Sebelumnya</span>
                </button>
                <button
                  type="button"
                  disabled={safeDeckPage >= totalPages - 1}
                  onClick={() => handlePageChange(safeDeckPage + 1)}
                  className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>Berikutnya</span>
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
          data-guide-target="m02-cards"
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
            const chartMinV = data.length > 0 ? Math.min(...data.map((p) => p.v)) : t.v_bat;
            const chartMaxV = data.length > 0 ? Math.max(...data.map((p) => p.v)) : t.v_bat;
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

            const isSingleCard = filteredUnits.length === 1;
            const cardWidthClasses = isSingleCard
              ? "w-full md:max-h-none md:h-full md:min-h-0"
              : filteredUnits.length === 2
                ? "w-[88vw] sm:w-[380px] snap-center max-h-[75dvh] md:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-1rem)/2)] md:snap-start md:max-h-none md:h-full md:min-h-0"
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
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-bold text-foreground">
                        #{String(globalRank).padStart(2, "0")}
                      </span>
                      <span className="num text-xs font-semibold text-foreground">BAY {u.bay}</span>
                      <span className="num text-[11px] text-muted-foreground truncate">
                        ({u.unit_id})
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-sm font-semibold uppercase tracking-wider text-foreground truncate">
                      {u.model} <span className="font-normal text-muted-foreground">{u.trim}</span>
                    </h3>
                    <div className="num mt-0.5 text-[11px] text-muted-foreground">
                      VIN: <span className="text-foreground/90">{u.vin}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn("num text-xl font-bold leading-none", `text-${tone}`)}>
                      {fmtV(t.v_bat)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">V</span>
                    </div>
                    <div className="num mt-0.5 text-[11px] text-muted-foreground">
                      {t.adc_raw_mv} mV (ADC)
                    </div>
                    <div className="mt-1.5 flex items-center justify-end">
                      <span
                        className={cn(
                          "num inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
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

                {/* 2. INTERNAL CARD SCROLLABLE BODY (Adaptive 2-Col for Single Card, 1-Col for 2 or 3+ Cards) */}
                <div
                  className={cn(
                    "card-scroll flex-1 min-h-0 overflow-y-auto p-4",
                    isSingleCard
                      ? "space-y-3 lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-4 lg:space-y-0 lg:items-start"
                      : "space-y-3",
                  )}
                  tabIndex={0}
                >
                  {/* Group Left: Alert Banner, Stopwatch, OLS Forecast, and 24-Hour Curve */}
                  <div className="space-y-3 min-w-0">
                    {/* Visual Alarm / Warm-up Banner */}
                    {isCritical ? (
                      <div className="flex items-start gap-2 rounded-[2px] border border-crimson/50 bg-crimson/10 px-3 py-2">
                        <AlertTriangle
                          size={15}
                          className="mt-0.5 shrink-0 text-crimson"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 leading-tight">
                          <div className="num text-[11px] font-semibold uppercase tracking-wide text-crimson">
                            {t.dtc_cnt > 0
                              ? `Alarm Kritis & ECU Fault (${t.dtc})`
                              : `Alarm Voltase Kritis (< ${fmtV(crit)} V)`}
                          </div>
                          <div className="num mt-0.5 text-[11px] text-muted-foreground">
                            Risiko sulfasi sel timbal-asam. Prioritaskan pemanasan mesin alternator
                            10 menit.
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
                          <div className="num text-[11px] font-semibold uppercase tracking-wide text-emerald">
                            Pemanasan Mesin Alternator Aktif
                          </div>
                          <div className="num mt-0.5 text-[11px] text-muted-foreground">
                            Alternator ({fmtV(t.v_bat)} V) sedang memulihkan muatan baterai.
                          </div>
                        </div>
                      </div>
                    ) : isWarning ? (
                      <div className="flex items-center gap-2 rounded-[2px] border border-amber/40 bg-amber/10 px-3 py-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                        <span className="num text-[11px] text-amber">
                          Peringatan: Voltase mendekati ambang kritis ({fmtV(crit)} V). Jadwalkan
                          pemanasan.
                        </span>
                      </div>
                    ) : null}

                    {/* Active 10-Min Warm-Up Stopwatch */}
                    {t.engine_on && (
                      <div className="rounded-[2px] border border-emerald/40 bg-background/70 p-2.5">
                        <div className="flex justify-between num text-[11px] text-muted-foreground">
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
                            className={
                              isComplete ? "font-semibold text-emerald" : "text-foreground"
                            }
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
                          <div className="mt-1.5 flex items-center gap-1.5 num text-[11px] text-emerald">
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
                        <span className="label-hmi flex items-center gap-1.5 text-[11px]">
                          <TrendingDown
                            size={13}
                            strokeWidth={1.5}
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span>Laju Kuras &amp; Sisa Waktu</span>
                        </span>
                        <span
                          className={cn(
                            "num inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold",
                            PREDICTION_BADGE_STYLE[prediction.tone],
                          )}
                        >
                          {prediction.statusText}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border/60 pt-1.5 num text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 text-foreground/90">
                          <Thermometer
                            size={11}
                            strokeWidth={1.75}
                            className="text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span>
                            Komp. 25&deg;C:{" "}
                            <strong className="text-foreground">
                              {prediction.compensatedV25.toFixed(2)}V
                            </strong>{" "}
                            ({prediction.tempCompensatedSocPct}% SOC)
                          </span>
                        </span>
                        <span
                          className={cn(
                            "font-medium",
                            prediction.thermalFactor > 1.35
                              ? "text-amber"
                              : "text-muted-foreground",
                          )}
                        >
                          Beban Termal: {prediction.thermalFactor.toFixed(2)}x @{" "}
                          {t.rtc_temp_c.toFixed(1)}&deg;C
                        </span>
                      </div>
                    </div>

                    {/* Battery Voltage Trend vs Critical Threshold */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 num text-[11px]">
                        <span className="font-medium text-muted-foreground">
                          Tren Voltase Aki vs Batas {crit.toFixed(2)}V
                        </span>
                        <span className="text-muted-foreground">
                          Rentang:{" "}
                          <strong className="text-foreground">{chartMinV.toFixed(2)}V</strong>
                          {" - "}
                          <strong className="text-foreground">{chartMaxV.toFixed(2)}V</strong>
                        </span>
                      </div>
                      <div
                        className={cn(
                          "fleet-chart -mx-1 touch-pan-y",
                          isSingleCard ? "h-36 lg:h-44" : "h-32",
                        )}
                      >
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
                              tick={{
                                fill: "var(--muted-foreground)",
                                fontSize: 10,
                                fontFamily: "JetBrains Mono",
                              }}
                              interval="preserveStartEnd"
                              axisLine={{ stroke: "var(--chart-grid)" }}
                              tickLine={false}
                            />
                            <YAxis
                              domain={[11.0, 14.8]}
                              width={34}
                              tick={{
                                fill: "var(--muted-foreground)",
                                fontSize: 10,
                                fontFamily: "JetBrains Mono",
                              }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <ReferenceLine y={crit} stroke="var(--crimson)" strokeDasharray="3 3" />
                            <Tooltip
                              contentStyle={{
                                background: "var(--background)",
                                border: "1px solid var(--border)",
                                borderRadius: 2,
                                fontFamily: "JetBrains Mono",
                                fontSize: 11,
                              }}
                              formatter={(val: unknown) => [
                                `${Number(val).toFixed(2)} V`,
                                "Baterai",
                              ]}
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
                    </div>
                  </div>

                  {/* Group Right: Hardware Metrics, Diagnostic Summary + Quick Nav, and Ticket Workflow */}
                  <div className="space-y-3 min-w-0">
                    {/* Complementary Hardware Metrics (Non-duplicated from header) */}
                    <div className="grid grid-cols-3 gap-2 border-t border-border pt-2.5 lg:border-t-0 lg:pt-0">
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

                    {/* Ringkasan Diagnostik & Jaringan + Pintasan Lintas Modul */}
                    <div
                      className={cn(
                        "rounded-[2px] border p-2.5 num text-[11px] space-y-1",
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
                      <div className="pt-1.5 border-t border-border/50 flex flex-wrap items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectUnit(u.unit_id);
                            setActiveModule("01");
                          }}
                          className="num inline-flex min-h-[28px] cursor-pointer items-center rounded-[2px] border border-border bg-secondary/50 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          Topologi &amp; Probe (01)
                        </button>
                        {(t.dtc_cnt > 0 || t.can_ok === false) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectUnit(u.unit_id);
                              setActiveModule("04");
                            }}
                            className="num inline-flex min-h-[28px] cursor-pointer items-center rounded-[2px] border border-crimson/60 bg-crimson/15 px-2 py-0.5 text-[11px] font-semibold text-crimson transition-colors hover:bg-crimson/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            Diagnostik DTC (04)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Shift Handover & Maintenance Ticket Workflow (Shown for units with active ticket or Critical/Warning state) */}
                    {(unitTicket || isCritical || isWarning) && (
                      <div className="rounded-[2px] border border-border bg-background/70 p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="label-hmi flex items-center gap-1.5 text-[11px] text-foreground">
                            <Wrench
                              size={12}
                              strokeWidth={1.75}
                              className="text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span>
                              {unitTicket
                                ? `Tiket ${unitTicket.ticket_code}`
                                : "Triage Pemeliharaan"}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "num inline-flex items-center gap-1 overflow-hidden rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-200",
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
                        <div className="num text-[11px] leading-relaxed text-muted-foreground">
                          <div>
                            PIC:{" "}
                            <span className="font-medium text-foreground">
                              {unitTicket?.assigned_to ?? "Belum Diisi"}
                            </span>
                          </div>
                          <div
                            className="truncate"
                            title={unitTicket?.handover_note ?? u.status_label}
                          >
                            Catatan:{" "}
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
                                  : "Tim Teknisi",
                                "Sedang diperiksa di area gudang.",
                              );
                            }}
                            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-amber/50 bg-amber/10 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber transition-colors hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
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
                            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-emerald/50 bg-emerald/10 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald transition-colors hover:bg-emerald/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ClipboardCheck size={12} strokeWidth={1.75} aria-hidden="true" />
                            <span>Tutup Tiket...</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. LOCKED CARD FOOTER (shrink-0) */}
                <footer
                  data-guide-target={idx === 0 ? "m02-card-actions" : undefined}
                  className="shrink-0 border-t border-border bg-card/95 p-3 space-y-2"
                >
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
                      <Thermometer
                        size={14}
                        strokeWidth={1.75}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        {u.status_label === "Warm-Up Dispatched"
                          ? "Jadwal Tercatat"
                          : "Catat Jadwal Pemanasan"}
                      </span>
                    </button>
                  )}

                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openExportModal("EXCEL", u.unit_id);
                      }}
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-1.5 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      title="Konfigurasi & Unduh Laporan Excel (.xls)"
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
                        openExportModal("CSV", u.unit_id);
                      }}
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-1.5 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      title="Konfigurasi & Unduh Log CSV"
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
                        "num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border px-1.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
                      <span>{isCopied ? "Tersalin" : "Tautan QR"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPdiModal(u.unit_id);
                      }}
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1 rounded-[2px] border border-border bg-secondary/40 px-1.5 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            dataSource={dataSource}
            historyData={resolveUnitHistory(pdiUnit, dataSource, history)}
            inspectedAt={pdiTimestamp}
            onClose={() => setPdiUnitId(null)}
            onExportExcel={() => {
              const uid = pdiUnit.unit_id;
              setPdiUnitId(null);
              openExportModal("EXCEL", uid);
            }}
            onExportCsv={() => {
              const uid = pdiUnit.unit_id;
              setPdiUnitId(null);
              openExportModal("CSV", uid);
            }}
          />
        )}
        {exportModalOpen && (
          <ExportConfigModal
            units={units}
            filteredCount={filteredUnits.length}
            isLiveConnected={dataSource === "LIVE_API" && apiStatus === "CONNECTED"}
            format={exportFormat}
            setFormat={setExportFormat}
            unitScope={exportUnitScope}
            setUnitScope={setExportUnitScope}
            customUnits={exportCustomUnits}
            setCustomUnits={setExportCustomUnits}
            period={exportPeriod}
            onChangePeriod={handleExportPeriodChange}
            date={exportDate}
            setDate={setExportDate}
            month={exportMonth}
            setMonth={setExportMonth}
            year={exportYear}
            setYear={setExportYear}
            startDate={exportStartDate}
            setStartDate={setExportStartDate}
            endDate={exportEndDate}
            setEndDate={setExportEndDate}
            resolution={exportResolution}
            setResolution={setExportResolution}
            limit={exportLimit}
            setLimit={setExportLimit}
            targetUnitId={configuredTargetUnitId}
            filterConfig={configuredExportFilter}
            onConfirm={executeConfiguredExport}
            onClose={() => setExportModalOpen(false)}
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
              const noteBody = techNotes.trim()
                ? `[TINDAKAN: ${techAction}] ${techNotes.trim()}`
                : `[TINDAKAN: ${techAction}]`;
              updateTicketStatus(
                resolvingTicketUnitId,
                "RESOLVED",
                techName.trim() || undefined,
                noteBody,
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
  dataSource: "SIMULATOR" | "LIVE_API";
  historyData: Array<{ t: string; v: number; ts?: number }>;
  inspectedAt: string;
  onClose: () => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
}

function PdiCertificateModal({
  unit,
  critV,
  dataSource,
  historyData,
  inspectedAt,
  onClose,
  onExportExcel,
  onExportCsv,
}: PdiModalProps) {
  const [deepLinkCopied, setDeepLinkCopied] = useState(false);
  const t = unit.telemetry;
  const conn = getUnitConnectionState(unit, dataSource === "LIVE_API");
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
      parameter: "Tegangan Baterai Terbuka (OCV & Komp. 25°C)",
      reading: `${t.v_bat.toFixed(2)} V (Komp. 25°C: ${prediction.compensatedV25.toFixed(2)} V · SOC ${prediction.tempCompensatedSocPct}%)`,
      target: ">= 12.20 V",
      passed: t.v_bat >= 12.2,
    },
    {
      parameter: "Kalibrasi Node ADC (ESP32 Pin 34)",
      reading: `${t.adc_raw_mv} mV`,
      target: "1800 - 2800 mV",
      passed: t.adc_raw_mv >= 1800 && t.adc_raw_mv <= 2800,
    },
    {
      parameter: "Arus Kuras Parasitik Deep-Sleep (INA219)",
      reading: `${t.shunt_sleep_ua} µA`,
      target: "<= 500 µA",
      passed: t.shunt_sleep_ua <= 500,
    },
    {
      parameter: "Memori Kode Kerusakan ECU OBD-II (Mode 03)",
      reading: t.dtc,
      target: "NONE / 0 DTC",
      passed: t.dtc_cnt === 0 && (t.dtc === "NONE" || !t.dtc),
    },
    {
      parameter: "Jalur Komunikasi TWAI / CAN-Bus (500 kbps)",
      reading: t.can_ok === false ? "OFFLINE / Periksa Jalur CAN" : "ONLINE (TWAI 500 kbps)",
      target: "ONLINE / OK",
      passed: t.can_ok !== false,
    },
    {
      parameter: "Suhu Kabin DS3231SN & Beban Termal Arrhenius",
      reading: `${t.rtc_temp_c.toFixed(1)} °C (Faktor ${prediction.thermalFactor.toFixed(2)}x)`,
      target: "< 60.0 °C",
      passed: t.rtc_temp_c < 60.0,
    },
  ];

  const isOverallPassed = checklist.every((item) => item.passed);

  return (
    <m.div
      className="pdi-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
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
              <div className="num text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                ORION: SISTEM TELEMETRI &amp; DIGITAL TWIN DIPO STOCK YARD
              </div>
              <h2
                id="pdi-cert-title"
                className="font-display text-base sm:text-lg font-semibold uppercase tracking-wider text-foreground mt-0.5"
              >
                SERTIFIKAT INSPEKSI PRA-KIRIM (PDI) &amp; KESEHATAN BATERAI
              </h2>
              <p className="num text-[11px] text-muted-foreground mt-0.5">
                Laporan Kesiapan Kelistrikan Stock Yard, Arus Shunt, &amp; ECU OBD-II Read-Only
              </p>
            </div>
          </div>

          {/* Right Header: Pure SVG QR Code + Close Button */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center rounded-[2px] border border-border bg-background/60 p-2 text-center">
              <UnitQrCode value={deepLinkUrl} size={96} animateBuild />
              <span className="num mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                PINDAI TAUTAN MOBILE UNIT
              </span>
              <button
                type="button"
                onClick={() => void handleCopyModalUrl()}
                className={cn(
                  "print-hidden num mt-1.5 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
                <span>{deepLinkCopied ? "URL Tersalin!" : "Salin URL Deep-Link"}</span>
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
              <div className="num text-[11px] text-foreground/85 mt-0.5">
                {isOverallPassed
                  ? "Unit memenuhi standar kelistrikan dan memori ECU untuk serah terima pelanggan."
                  : "Unit membutuhkan tindakan pengisian baterai atau pemeriksaan diagnostik sebelum serah terima."}
              </div>
            </div>
          </div>
          <div className="num text-right text-[11px]">
            <div className="text-muted-foreground">Laju Kuras &amp; Sisa Waktu</div>
            <div className="font-semibold text-foreground">{prediction.statusText}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-[2px] border border-border bg-background/50 p-3.5 sm:grid-cols-3">
          <div>
            <div className="label-hmi text-[11px]">Model &amp; Trim</div>
            <div className="num mt-0.5 text-xs font-semibold text-foreground">
              {unit.model} {unit.trim}
            </div>
          </div>
          <div>
            <div className="label-hmi text-[11px]">Nomor Rangka (VIN)</div>
            <div className="num mt-0.5 text-xs font-semibold text-foreground">{unit.vin}</div>
          </div>
          <div>
            <div className="label-hmi text-[11px]">Lokasi Bay</div>
            <div className="num mt-0.5 text-xs font-semibold text-foreground">
              Bay {unit.bay} ({unit.color})
            </div>
          </div>
          <div>
            <div className="label-hmi text-[11px]">ID Unit Telemetri</div>
            <div className="num mt-0.5 text-xs text-foreground">{unit.unit_id}</div>
          </div>
          <div>
            <div className="label-hmi text-[11px]">Waktu Inspeksi &amp; Sinkronisasi</div>
            <div className="num mt-0.5 text-xs text-foreground">{inspectedAt}</div>
            <div className="num mt-0.5 text-[11px] text-muted-foreground">
              Sinkron Terakhir: {unit.last_seen || "Live Stream"} ({conn.badgeText})
            </div>
          </div>
          <div>
            <div className="label-hmi text-[11px]">Wake Counter &amp; Jaringan</div>
            <div className="num mt-0.5 text-xs text-foreground">
              Boot #{t.boot} · {t.rssi} dBm (
              {(t.sync_ssid || unit.sync_ssid || "").trim() || unit.net_zone || "YARD"})
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full border-collapse text-left num text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
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
                        "inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase",
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

        <div className="mt-4 rounded-[2px] border border-border/80 bg-background/40 px-3.5 py-2.5 num text-[11px] leading-relaxed text-muted-foreground">
          Proyek ORION (Magang D4 TRPL TI: Sistem Pemantauan Stock Yard). Platform telemetri
          independen; bukan produk resmi dari dan tidak berafiliasi dengan Mitsubishi Motors.
        </div>

        <div className="print-hidden mt-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onExportExcel}
            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-border bg-secondary/60 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Ekspor Laporan Excel</span>
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-border bg-secondary/60 px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Download size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Unduh Log CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-foreground/50 bg-secondary px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Printer size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Cetak / Simpan PDF</span>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
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
            className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] cursor-pointer items-center justify-center rounded-[2px] border border-border text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5 num text-xs">
          <div className="rounded-[2px] border border-border bg-background/50 p-3 flex items-center justify-between">
            <div>
              <div className="label-hmi text-[11px]">Target Unit &amp; Lokasi</div>
              <div className="font-bold text-foreground mt-0.5">
                {bay} · {model}
              </div>
            </div>
            <div className="text-right">
              <div className="label-hmi text-[11px]">Unit ID</div>
              <div className="text-muted-foreground mt-0.5">{unitId}</div>
            </div>
          </div>

          <div>
            <label
              htmlFor="ticket-tech-name"
              className="label-hmi block text-[11px] text-muted-foreground mb-1"
            >
              Nama Teknisi Penanggung Jawab
            </label>
            <input
              id="ticket-tech-name"
              type="text"
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Contoh: Teknisi Shift Pagi"
            />
          </div>

          <div>
            <label
              htmlFor="ticket-tech-action"
              className="label-hmi block text-[11px] text-muted-foreground mb-1"
            >
              Tindakan Perbaikan yang Dilakukan
            </label>
            <select
              id="ticket-tech-action"
              value={techAction}
              onChange={(e) => setTechAction(e.target.value)}
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <label
              htmlFor="ticket-tech-notes"
              className="label-hmi block text-[11px] text-muted-foreground mb-1"
            >
              Catatan Handover &amp; Verifikasi Hasil
            </label>
            <textarea
              id="ticket-tech-notes"
              value={techNotes}
              onChange={(e) => setTechNotes(e.target.value)}
              rows={3}
              className="w-full rounded-[2px] border border-border bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

interface ExportConfigModalProps {
  units: VehicleUnit[];
  filteredCount: number;
  isLiveConnected: boolean;
  format: "EXCEL" | "CSV";
  setFormat: (f: "EXCEL" | "CSV") => void;
  unitScope: "ALL" | "FILTERED" | "CUSTOM";
  setUnitScope: (s: "ALL" | "FILTERED" | "CUSTOM") => void;
  customUnits: string[];
  setCustomUnits: (ids: string[]) => void;
  period: ExportPeriodMode;
  onChangePeriod: (p: ExportPeriodMode) => void;
  date: string;
  setDate: (d: string) => void;
  month: string;
  setMonth: (m: string) => void;
  year: string;
  setYear: (y: string) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  resolution: ExportResolutionMode;
  setResolution: (r: ExportResolutionMode) => void;
  limit: number;
  setLimit: (n: number) => void;
  targetUnitId: string;
  filterConfig: ExportFilterConfig;
  onConfirm: () => void;
  onClose: () => void;
}

function ExportConfigModal({
  units,
  filteredCount,
  isLiveConnected,
  format,
  setFormat,
  unitScope,
  setUnitScope,
  customUnits,
  setCustomUnits,
  period,
  onChangePeriod,
  date,
  setDate,
  month,
  setMonth,
  year,
  setYear,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  resolution,
  setResolution,
  limit,
  setLimit,
  targetUnitId,
  filterConfig,
  onConfirm,
  onClose,
}: ExportConfigModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const monthParts = month.split("-");
  const selectedMonthYear = monthParts[0] || year;
  const selectedMonthNum = monthParts[1] || "01";
  const currentYearNum = Number(year) || 2026;
  const yearOptions = Array.from(
    new Set([currentYearNum - 2, currentYearNum - 1, currentYearNum, currentYearNum + 1]),
  ).map((y) => String(y));

  const windowPreview = resolveExportTimeWindow(filterConfig);
  const filenamePreview = buildExportFilename(
    format === "EXCEL" ? "ORION_TELEMETRY_REPORT" : "ORION_TELEMETRY",
    targetUnitId || "ALL",
    windowPreview,
    format === "EXCEL" ? "xls" : "csv",
    "WIB",
  );
  const isCustomInvalid = unitScope === "CUSTOM" && customUnits.length === 0;

  const toggleUnitSelection = (uid: string) => {
    if (customUnits.includes(uid)) {
      setCustomUnits(customUnits.filter((id) => id !== uid));
    } else {
      setCustomUnits([...customUnits, uid]);
    }
  };

  return (
    <m.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-config-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
      exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <m.div
        className="panel card-scroll relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto border border-border bg-card p-4 sm:p-6 shadow-2xl"
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
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <Calendar size={18} strokeWidth={1.75} className="text-foreground shrink-0" />
            <div>
              <h2
                id="export-config-title"
                className="font-display text-sm sm:text-base font-semibold uppercase tracking-wider text-foreground"
              >
                Konfigurasi Ekspor Laporan Telemetri
              </h2>
              <p className="num text-[11px] text-muted-foreground mt-0.5">
                Pilih format berkas, unit target, periode waktu (harian/bulanan/tahunan), dan
                resolusi data.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup konfigurasi ekspor"
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[2px] border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <X size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4 num text-xs">
          {/* 1. Format File */}
          <div>
            <div className="label-hmi text-[11px] mb-1.5">1. Format Dokumen</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFormat("EXCEL")}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[2px] border px-3 py-2 text-left transition-colors",
                  format === "EXCEL"
                    ? "border-foreground/70 bg-secondary text-foreground font-semibold"
                    : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                <FileSpreadsheet size={15} className="shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-[11px]">Workbook Excel (.xls)</div>
                  <div className="text-[11px] text-muted-foreground font-normal">
                    3 Sheet, AutoFilter &amp; Header Terkunci
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormat("CSV")}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[2px] border px-3 py-2 text-left transition-colors",
                  format === "CSV"
                    ? "border-foreground/70 bg-secondary text-foreground font-semibold"
                    : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                <Download size={15} className="shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-[11px]">Data Tabel CSV (.csv)</div>
                  <div className="text-[11px] text-muted-foreground font-normal">
                    39 Kolom Penuh Standar RFC 4180
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Cakupan Unit */}
          <div>
            <div className="label-hmi text-[11px] mb-1.5">2. Cakupan Kendaraan (Unit Target)</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setUnitScope("ALL")}
                className={cn(
                  "min-h-[44px] cursor-pointer rounded-[2px] border px-3 py-2 text-[11px] transition-colors",
                  unitScope === "ALL"
                    ? "border-foreground/70 bg-secondary text-foreground font-semibold"
                    : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                Seluruh Armada ({units.length})
              </button>
              <button
                type="button"
                disabled={filteredCount === 0}
                onClick={() => setUnitScope("FILTERED")}
                className={cn(
                  "min-h-[44px] cursor-pointer rounded-[2px] border px-3 py-2 text-[11px] transition-colors disabled:opacity-45 disabled:cursor-not-allowed",
                  unitScope === "FILTERED"
                    ? "border-foreground/70 bg-secondary text-foreground font-semibold"
                    : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                Filter Layar ({filteredCount})
              </button>
              <button
                type="button"
                onClick={() => setUnitScope("CUSTOM")}
                className={cn(
                  "min-h-[44px] cursor-pointer rounded-[2px] border px-3 py-2 text-[11px] transition-colors",
                  unitScope === "CUSTOM"
                    ? "border-foreground/70 bg-secondary text-foreground font-semibold"
                    : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                )}
              >
                Pilih Unit Spesifik ({customUnits.length})
              </button>
            </div>

            {unitScope === "CUSTOM" && (
              <div className="mt-2 rounded-[2px] border border-border bg-background/60 p-2.5">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60 text-[11px]">
                  <span className="text-muted-foreground">
                    Centang unit yang ingin dimasukkan ke laporan:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomUnits(units.map((u) => u.unit_id))}
                      className="cursor-pointer underline text-foreground hover:text-emerald"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomUnits([])}
                      className="cursor-pointer underline text-muted-foreground hover:text-foreground"
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto card-scroll sm:grid-cols-2">
                  {units.map((u) => {
                    const checked = customUnits.includes(u.unit_id);
                    return (
                      <label
                        key={u.unit_id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-[2px] border px-2.5 py-1.5 text-[11px]",
                          checked
                            ? "border-foreground/50 bg-secondary/70 text-foreground"
                            : "border-border/60 bg-background/40 text-muted-foreground",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUnitSelection(u.unit_id)}
                          className="accent-foreground"
                        />
                        <span className="font-semibold">BAY {u.bay}</span>
                        <span className="truncate">{u.unit_id}</span>
                      </label>
                    );
                  })}
                </div>
                {isCustomInvalid && (
                  <div className="mt-1.5 text-[11px] text-crimson">
                    Pilih minimal 1 unit kendaraan untuk melanjutkan ekspor.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Periode Waktu Data */}
          <div>
            <div className="label-hmi text-[11px] mb-1.5">3. Periode Waktu Data (WIB)</div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {EXPORT_PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangePeriod(opt.id)}
                  className={cn(
                    "min-h-[40px] cursor-pointer rounded-[2px] border px-2.5 py-1.5 text-[11px] transition-colors",
                    period === opt.id
                      ? "border-foreground/70 bg-secondary text-foreground font-semibold"
                      : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {period === "DAILY" && (
              <div className="mt-2 rounded-[2px] border border-border bg-background/60 p-2.5 flex flex-wrap items-center gap-3">
                <label className="text-[11px] text-muted-foreground" htmlFor="export-date-input">
                  Pilih Tanggal Harian:
                </label>
                <input
                  id="export-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-h-[38px] rounded-[2px] border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                />
              </div>
            )}

            {period === "MONTHLY" && (
              <div className="mt-2 rounded-[2px] border border-border bg-background/60 p-2.5 flex flex-wrap items-center gap-2.5">
                <label className="text-[11px] text-muted-foreground" htmlFor="export-month-select">
                  Pilih Bulan &amp; Tahun:
                </label>
                <select
                  id="export-month-select"
                  aria-label="Pilih bulan laporan"
                  value={selectedMonthNum}
                  onChange={(e) => setMonth(`${selectedMonthYear}-${e.target.value}`)}
                  className="min-h-[38px] rounded-[2px] border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                >
                  {MONTH_OPTIONS.map((mOpt) => (
                    <option key={mOpt.value} value={mOpt.value}>
                      {mOpt.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Pilih tahun untuk laporan bulanan"
                  value={selectedMonthYear}
                  onChange={(e) => setMonth(`${e.target.value}-${selectedMonthNum}`)}
                  className="min-h-[38px] rounded-[2px] border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                >
                  {yearOptions.map((yOpt) => (
                    <option key={yOpt} value={yOpt}>
                      {yOpt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {period === "YEARLY" && (
              <div className="mt-2 rounded-[2px] border border-border bg-background/60 p-2.5 flex flex-wrap items-center gap-3">
                <label className="text-[11px] text-muted-foreground" htmlFor="export-year-select">
                  Pilih Tahun Laporan:
                </label>
                <select
                  id="export-year-select"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="min-h-[38px] rounded-[2px] border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                >
                  {yearOptions.map((yOpt) => (
                    <option key={yOpt} value={yOpt}>
                      {yOpt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {period === "CUSTOM" && (
              <div className="mt-2 rounded-[2px] border border-border bg-background/60 p-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label
                    className="block text-[11px] text-muted-foreground mb-1"
                    htmlFor="export-start-date"
                  >
                    Dari Tanggal
                  </label>
                  <input
                    id="export-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="min-h-[38px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  />
                </div>
                <div>
                  <label
                    className="block text-[11px] text-muted-foreground mb-1"
                    htmlFor="export-end-date"
                  >
                    Sampai Tanggal
                  </label>
                  <input
                    id="export-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="min-h-[38px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. Resolusi & Batas Baris */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                className="label-hmi block text-[11px] mb-1.5"
                htmlFor="export-resolution-select"
              >
                4. Resolusi Data (Granularitas)
              </label>
              <select
                id="export-resolution-select"
                value={resolution}
                onChange={(e) => setResolution(e.target.value as ExportResolutionMode)}
                className="min-h-[42px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
              >
                {EXPORT_RESOLUTION_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.hint})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-hmi block text-[11px] mb-1.5" htmlFor="export-limit-select">
                Batas Maksimum Baris Log
              </label>
              <select
                id="export-limit-select"
                value={String(limit)}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="min-h-[42px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
              >
                <option value="0">Semua Data dalam Periode (Otomatis Aman)</option>
                <option value="500">Maksimum 500 Baris Terbaru</option>
                <option value="2500">Maksimum 2.500 Baris Terbaru</option>
                <option value="10000">Maksimum 10.000 Baris Terbaru</option>
              </select>
            </div>
          </div>

          {/* 5. Ringkasan Output & Nama Berkas */}
          <div className="rounded-[2px] border border-border/80 bg-background/50 p-3 text-[11px] space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Periode Terpilih:</span>
              <span className="font-semibold text-foreground">
                {windowPreview.periodLabel} · {windowPreview.resolutionLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Sumber Data:</span>
              <span className={isLiveConnected ? "text-emerald font-semibold" : "text-foreground"}>
                {isLiveConnected ? "Database Live Server (MySQL)" : "Snapshot Lokal / Simulator"}
              </span>
            </div>
            <div className="pt-1 border-t border-border/60 text-muted-foreground break-all">
              Berkas: <span className="text-foreground">{filenamePreview}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[2px] border border-border bg-secondary/50 px-4 py-2 num text-xs font-medium text-foreground hover:bg-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isCustomInvalid}
            onClick={onConfirm}
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] border border-foreground/60 bg-secondary px-4 py-2 num text-xs font-semibold text-foreground hover:border-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {format === "EXCEL" ? (
              <FileSpreadsheet size={14} aria-hidden="true" />
            ) : (
              <Download size={14} aria-hidden="true" />
            )}
            <span>{format === "EXCEL" ? "Unduh Laporan Excel" : "Unduh Data CSV"}</span>
          </button>
        </div>
      </m.div>
    </m.div>
  );
}
