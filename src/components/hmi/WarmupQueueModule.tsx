import { useEffect, useMemo, useRef, useState } from "react";
import {
  BatteryCharging,
  CheckCircle2,
  Clock,
  History,
  Power,
  RefreshCw,
  Thermometer,
  UserCheck,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTelemetry } from "@/context/TelemetryContext";
import {
  ALT_VERIFY_V,
  WARMUP_SESSION,
  getUnitConnectionState,
  voltageHistory,
  type VehicleUnit,
} from "@/data/mockTelemetry";
import { computeBatteryPrediction } from "@/lib/battery-analytics";
import { Led, Panel, fmtV, unitTone } from "./primitives";
import { cn } from "@/lib/utils";

const WARMUP_TARGET_SEC = 600; // 10 minutes SOP Mitsubishi alternator charge

function formatMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface CompletedWarmupLog {
  id: string;
  unit_id: string;
  bay: string;
  model: string;
  timestamp: string;
  durationSec: number | null;
  peakV: number | null;
  sopStatus: "PASS" | "INCOMPLETE" | "DISPATCHED";
  note?: string;
}

interface LiveWarmupSample {
  t: string;
  rpm: number;
  temp: number;
  v: number;
}

const SIMULATOR_COMPLETED_LOGS: CompletedWarmupLog[] = [
  {
    id: "SIM-LOG-01",
    unit_id: "MITSUBISHI-STOCK-02",
    bay: "A-04",
    model: "XFORCE",
    timestamp: "08:15 WIB",
    durationSec: 620,
    peakV: 14.18,
    sopStatus: "PASS",
  },
  {
    id: "SIM-LOG-02",
    unit_id: "MITSUBISHI-STOCK-01",
    bay: "A-01",
    model: "PAJERO SPORT",
    timestamp: "09:05 WIB",
    durationSec: 280,
    peakV: 13.85,
    sopStatus: "INCOMPLETE",
  },
];

function resolveInitialElapsedSec(u: VehicleUnit): number {
  const runSec =
    typeof u.telemetry.run_time_s === "number" && u.telemetry.run_time_s > 0
      ? u.telemetry.run_time_s
      : 0;
  return Math.min(runSec, WARMUP_TARGET_SEC);
}

export function WarmupQueueModule() {
  const {
    units,
    selected,
    selectUnit,
    simulate,
    dispatchWarmup,
    configs,
    dataSource,
    apiStatus,
    isOfflineSnapshot,
    pollNow,
    history,
    auditLogs,
    setActiveModule,
  } = useTelemetry();

  const warmupStartRef = useRef<Record<string, number>>({});
  const peakVoltagesRef = useRef<Record<string, number>>({});
  const [warmupStartTimes, setWarmupStartTimes] = useState<Record<string, number>>({});
  const [liveCurveMap, setLiveCurveMap] = useState<Record<string, LiveWarmupSample[]>>({});
  const [recordedSessions, setRecordedSessions] = useState<CompletedWarmupLog[]>([]);
  const [, setTick] = useState(0);

  const hasRunningUnit = units.some(
    (u) => u.in_yard && (u.telemetry.engine_on || u.telemetry.v_bat >= ALT_VERIFY_V),
  );

  // Run 1-second stopwatch tick only while at least one engine is actively warming up
  useEffect(() => {
    if (!hasRunningUnit) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasRunningUnit]);

  // Automatic detection of engine start / alternator surge and shutdown session logging
  useEffect(() => {
    const now = Date.now();
    const nextStarts = { ...warmupStartRef.current };
    const nextPeaks = { ...peakVoltagesRef.current };
    const newLogs: CompletedWarmupLog[] = [];
    let startsChanged = false;
    const curveUpdates: Record<string, LiveWarmupSample> = {};

    for (const u of units) {
      const isRunning = u.telemetry.engine_on || u.telemetry.v_bat >= ALT_VERIFY_V;
      const startedAt = nextStarts[u.unit_id];

      if (isRunning) {
        if (!startedAt) {
          const initialOffsetMs = resolveInitialElapsedSec(u) * 1000;
          nextStarts[u.unit_id] = now - initialOffsetMs;
          nextPeaks[u.unit_id] = u.telemetry.v_bat;
          startsChanged = true;
        } else if (u.telemetry.v_bat > (nextPeaks[u.unit_id] ?? 0)) {
          nextPeaks[u.unit_id] = u.telemetry.v_bat;
        }

        const timeLabel = new Date(now).toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        curveUpdates[u.unit_id] = {
          t: timeLabel,
          rpm: Math.max(0, u.telemetry.rpm),
          temp: u.telemetry.temp_c > -40 ? Math.max(0, u.telemetry.temp_c) : 0,
          v: Number(u.telemetry.v_bat.toFixed(2)),
        };
      } else if (startedAt) {
        const durationSec = Math.floor((now - startedAt) / 1000);
        const peakV = nextPeaks[u.unit_id] ?? u.telemetry.v_bat;
        if (durationSec >= 5) {
          const timeStr = new Date(now).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          newLogs.push({
            id: `LOG-${now.toString().slice(-4)}-${u.bay}`,
            unit_id: u.unit_id,
            bay: u.bay,
            model: u.model,
            timestamp: `${timeStr} WIB`,
            durationSec,
            peakV,
            sopStatus:
              durationSec >= WARMUP_TARGET_SEC && peakV >= ALT_VERIFY_V ? "PASS" : "INCOMPLETE",
          });
        }
        delete nextStarts[u.unit_id];
        delete nextPeaks[u.unit_id];
        startsChanged = true;
      }
    }

    warmupStartRef.current = nextStarts;
    peakVoltagesRef.current = nextPeaks;

    if (startsChanged) {
      setWarmupStartTimes(nextStarts);
    }
    if (newLogs.length > 0) {
      setRecordedSessions((prev) => [...newLogs, ...prev].slice(0, 12));
    }
    if (Object.keys(curveUpdates).length > 0) {
      setLiveCurveMap((prev) => {
        let updated: Record<string, LiveWarmupSample[]> | null = null;
        for (const [uid, sample] of Object.entries(curveUpdates)) {
          const existing = prev[uid] ?? [];
          const last = existing[existing.length - 1];
          if (
            !last ||
            last.rpm !== sample.rpm ||
            last.temp !== sample.temp ||
            last.v !== sample.v
          ) {
            if (!updated) updated = { ...prev };
            updated[uid] = [...existing.slice(-39), sample];
          }
        }
        return updated ?? prev;
      });
    }
  }, [units]);

  const t = selected.telemetry;
  const critV = configs[selected.unit_id]?.crit_v ?? 11.8;
  const isEngineOn = t.engine_on || t.v_bat >= ALT_VERIFY_V;
  const isAlternatorVerified = t.v_bat >= ALT_VERIFY_V;
  const conn = getUnitConnectionState(selected, dataSource === "LIVE_API");
  const isDispatched = selected.status_label === "Warm-Up Dispatched";

  // Active stopwatch calculation for selected unit (uses real run_time_s fallback on first paint)
  const recordedStart = warmupStartTimes[selected.unit_id];
  const elapsedSec = isEngineOn
    ? typeof recordedStart === "number"
      ? Math.max(0, Math.floor((Date.now() - recordedStart) / 1000))
      : resolveInitialElapsedSec(selected)
    : 0;
  const remainingSec = Math.max(0, WARMUP_TARGET_SEC - elapsedSec);
  const progressPct = Math.min(100, Math.round((elapsedSec / WARMUP_TARGET_SEC) * 100));
  const isSopTargetMet = isEngineOn && elapsedSec >= WARMUP_TARGET_SEC;

  // Fleet Warmup Statistics
  const warmingCount = units.filter(
    (u) => u.telemetry.engine_on || u.telemetry.v_bat >= ALT_VERIFY_V,
  ).length;
  const verifiedCount = units.filter((u) => u.telemetry.v_bat >= ALT_VERIFY_V).length;
  const pendingQueue = units
    .filter((u) => !u.telemetry.engine_on && u.telemetry.v_bat < 12.3)
    .sort((a, b) => a.telemetry.v_bat - b.telemetry.v_bat);

  const selectedHistory = useMemo(() => {
    const pts = history[selected.unit_id];
    if (dataSource === "LIVE_API") {
      if (pts && pts.length > 0) return pts;
      const label = selected.last_seen ? selected.last_seen.slice(11, 16) : "LIVE";
      return [
        {
          t: label,
          v: t.v_bat,
          ...(typeof t.ts_epoch === "number" ? { ts: t.ts_epoch } : {}),
        },
      ];
    }
    return pts && pts.length >= 1 ? pts : voltageHistory(t.v_bat, t.engine_on);
  }, [history, selected.unit_id, selected.last_seen, dataSource, t.v_bat, t.ts_epoch, t.engine_on]);

  const prediction = useMemo(
    () => computeBatteryPrediction(selectedHistory, t.v_bat, critV, t.engine_on, t.rtc_temp_c),
    [selectedHistory, t.v_bat, critV, t.engine_on, t.rtc_temp_c],
  );

  // Honest visible session & audit history
  const visibleCompletedLogs = useMemo(() => {
    const activeUnitMap = new Map(units.map((u) => [u.unit_id, u]));
    if (dataSource === "SIMULATOR") {
      return [...recordedSessions, ...SIMULATOR_COMPLETED_LOGS];
    }
    const filteredRecorded = recordedSessions.filter((r) => activeUnitMap.has(r.unit_id));
    const dispatchAuditRows: CompletedWarmupLog[] = auditLogs
      .filter((ev) => /WARMUP/i.test(ev.event_type) && activeUnitMap.has(ev.unit_id))
      .map((ev) => {
        const unit = activeUnitMap.get(ev.unit_id)!;
        const timeText = /^\d{4}-\d{2}-\d{2}/.test(ev.created_at)
          ? `${ev.created_at.slice(11, 16)} WIB`
          : ev.created_at;
        return {
          id: `AUD-${ev.id}`,
          unit_id: ev.unit_id,
          bay: unit.bay,
          model: unit.model,
          timestamp: timeText,
          durationSec: null,
          peakV: null,
          sopStatus: "DISPATCHED",
          note: ev.message,
        };
      });
    return [...filteredRecorded, ...dispatchAuditRows];
  }, [dataSource, recordedSessions, auditLogs, units]);

  const selectedLastSession = visibleCompletedLogs.find((l) => l.unit_id === selected.unit_id);

  // Honest dynamic telemetry curve aligned to unit state & data source
  const chartData = useMemo(() => {
    if (isEngineOn) {
      if (dataSource === "LIVE_API") {
        const samples = liveCurveMap[selected.unit_id];
        if (samples && samples.length > 0) return samples;
        return [
          {
            t: selected.last_seen ? selected.last_seen.slice(11, 16) : "LIVE",
            rpm: Math.max(0, t.rpm),
            temp: t.temp_c > -40 ? Math.max(0, t.temp_c) : 0,
            v: Number(t.v_bat.toFixed(2)),
          },
        ];
      }
      return [
        ...WARMUP_SESSION.slice(0, -1),
        {
          t: WARMUP_SESSION[WARMUP_SESSION.length - 1]!.t,
          rpm: Math.max(0, t.rpm),
          temp: t.temp_c > -40 ? Math.max(0, t.temp_c) : 0,
          v: Number(t.v_bat.toFixed(2)),
        },
      ];
    }

    return selectedHistory.map((pt) => ({
      t: pt.t,
      rpm: 0,
      temp: Number(t.rtc_temp_c.toFixed(1)),
      v: Number(pt.v.toFixed(2)),
    }));
  }, [
    isEngineOn,
    dataSource,
    liveCurveMap,
    selected.unit_id,
    selected.last_seen,
    t.rpm,
    t.temp_c,
    t.v_bat,
    t.rtc_temp_c,
    selectedHistory,
  ]);

  const handleDispatchStaff = (unitId: string) => {
    selectUnit(unitId);
    dispatchWarmup(unitId);
  };

  const handleToggleSandboxContact = () => {
    if (isEngineOn) {
      simulate("STANDBY");
    } else {
      simulate("WARMUP");
    }
  };

  return (
    <div className="module-warmup flex h-full min-h-0 flex-1 flex-col gap-3 lg:overflow-hidden">
      <h1 className="sr-only">Antrean Pemanasan Mesin &amp; Verifikasi Alternator</h1>
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
      {/* Top Operational KPI Command Bar */}
      <div
        data-guide-target="m03-kpi"
        className="panel flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Thermometer className="text-emerald shrink-0" size={16} aria-hidden="true" />
            <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
              Pemantauan Pemanasan Mesin (SOP 10 Menit Mitsubishi)
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 border-l border-border/80 pl-3 num text-[11px] text-muted-foreground">
            <span>Deteksi Otomatis Tegangan Alternator &ge; {ALT_VERIFY_V.toFixed(2)}V</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 num text-[11px]">
          <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1">
            <Led tone={warmingCount > 0 ? "emerald" : "dim"} />
            <span className="text-muted-foreground">Sedang Nyala:</span>
            <span className="font-semibold text-foreground">{warmingCount} Unit</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1">
            <Led tone={verifiedCount > 0 ? "emerald" : "dim"} />
            <span className="text-muted-foreground">&ge; {ALT_VERIFY_V.toFixed(2)}V OK:</span>
            <span className="font-semibold text-emerald">{verifiedCount} Unit</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1">
            <Led tone={pendingQueue.length > 0 ? "amber" : "dim"} />
            <span className="text-muted-foreground">Menunggu:</span>
            <span
              className={cn(
                "font-semibold",
                pendingQueue.length > 0 ? "text-amber" : "text-foreground",
              )}
            >
              {pendingQueue.length} Unit
            </span>
          </div>
        </div>
      </div>

      {/* Target Node Quick-Selection Bar (Horizontal Scrollable Strip) */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto card-scroll rounded-[2px] border border-border bg-card/75 px-3 py-1.5 min-w-0">
        <span className="label-hmi mr-1 shrink-0 text-[11px]">Pilih Unit ({units.length}):</span>
        {units.map((u) => {
          const isSelected = u.unit_id === selected.unit_id;
          const uWarm = u.telemetry.engine_on || u.telemetry.v_bat >= ALT_VERIFY_V;
          const uCrit = configs[u.unit_id]?.crit_v ?? 11.8;
          const tn = unitTone(u, uCrit);
          return (
            <button
              key={u.unit_id}
              type="button"
              onClick={() => selectUnit(u.unit_id)}
              className={cn(
                "num inline-flex min-h-[44px] sm:min-h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                  : uWarm
                    ? "border-emerald/50 bg-emerald/10 text-emerald font-medium"
                    : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
              )}
            >
              <Led tone={uWarm ? "emerald" : tn} />
              <span>{u.bay}</span>
              <span className="text-[11px] text-muted-foreground">
                ({fmtV(u.telemetry.v_bat)}V)
              </span>
              {uWarm && <span className="text-[11px] uppercase font-bold text-emerald">RUN</span>}
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Dashboard Layout */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.1fr_1fr] lg:overflow-hidden">
        {/* Left Column: Active Warm-Up Console & Priority Queue */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          {/* Active Warm-Up Console for Selected Unit */}
          <Panel
            title={`Konsol Pemantauan: Bay ${selected.bay} (${selected.model})`}
            code="SOP"
            guideTarget="m03-console"
            className="shrink-0 lg:max-h-[60%]"
            right={
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "num inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                    conn.isOnline
                      ? "border-emerald/50 bg-emerald/15 text-emerald"
                      : "border-border bg-secondary/70 text-muted-foreground",
                  )}
                >
                  <Led tone={conn.isOnline ? "emerald" : "dim"} />
                  {conn.badgeText}
                </span>
                <span
                  className={cn(
                    "num inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                    isEngineOn
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : "border-border bg-secondary/60 text-muted-foreground",
                  )}
                >
                  <Led tone={isEngineOn ? "emerald" : "dim"} />
                  {isEngineOn ? "MESIN MENYALA (RUN - ALTERNATOR AKTIF)" : "STANDBY (KONTAK MATI)"}
                </span>
              </div>
            }
          >
            <div className="space-y-3.5">
              {/* Timer & Charging Progress Card */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="label-hmi text-[11px] text-muted-foreground">
                      {isEngineOn
                        ? "Stopwatch Durasi Nyala Mesin (Target SOP: 10:00)"
                        : "Durasi Pemanasan (Siap Deteksi Otomatis)"}
                    </div>
                    <div className="mt-1 font-mono text-3xl font-bold tracking-tight text-foreground">
                      {isEngineOn ? formatMmSs(elapsedSec) : "00:00"}
                      <span className="ml-2.5 text-xs font-normal text-muted-foreground">
                        {isEngineOn
                          ? isSopTargetMet
                            ? "(SOP 10 Menit Tercapai)"
                            : `(Sisa target: ${formatMmSs(remainingSec)})`
                          : "(Menunggu Mesin Dinyalakan di Lapangan)"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "num inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
                        isAlternatorVerified
                          ? "border-emerald/50 bg-emerald/15 text-emerald"
                          : isEngineOn
                            ? "border-amber/50 bg-amber/10 text-amber"
                            : "border-border bg-secondary/50 text-muted-foreground",
                      )}
                    >
                      <BatteryCharging size={13} className="shrink-0" aria-hidden="true" />
                      {isAlternatorVerified
                        ? `Alternator OK (${fmtV(t.v_bat)}V)`
                        : isEngineOn
                          ? `Mengisi (${fmtV(t.v_bat)}V)`
                          : `Standby (${fmtV(t.v_bat)}V)`}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between num text-[11px] text-muted-foreground">
                    <span>Progres Pengisian SOP 10 Menit:</span>
                    <span className="font-semibold text-foreground">{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-[1px] bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        isSopTargetMet
                          ? "bg-emerald"
                          : isEngineOn
                            ? "bg-foreground"
                            : "bg-muted-foreground/30",
                      )}
                      style={{ width: `${isEngineOn ? progressPct : 0}%` }}
                    />
                  </div>
                </div>

                {/* SOP Status Notice Box */}
                <div
                  className={cn(
                    "mt-3 rounded-[2px] border p-2.5 num text-[11px] leading-relaxed",
                    isSopTargetMet
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : isEngineOn
                        ? "border-amber/50 bg-amber/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground",
                  )}
                >
                  {isSopTargetMet ? (
                    <div className="flex items-start gap-2">
                      <CheckCircle2
                        size={15}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-emerald"
                      />
                      <span>
                        <strong>SOP 10 Menit Terpenuhi!</strong> Alternator telah mengisi baterai
                        optimal selama {formatMmSs(elapsedSec)} pada tegangan {fmtV(t.v_bat)}V.
                        Target tercapai, mesin sudah dapat dimatikan.
                      </span>
                    </div>
                  ) : isEngineOn ? (
                    <div className="flex items-start gap-2">
                      <BatteryCharging
                        size={15}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-amber"
                      />
                      <span>
                        <strong>Proses Pemanasan Berlangsung:</strong> Alternator aktif mengisi aki.
                        Butuh {formatMmSs(remainingSec)} lagi untuk mencapai target 10 menit.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <Clock
                        size={15}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-muted-foreground"
                      />
                      <div>
                        <span>
                          <strong>Deteksi Otomatis Aktif:</strong> Stopwatch pemanasan mulai
                          berjalan otomatis saat mesin dinyalakan (tegangan naik &ge;{" "}
                          {ALT_VERIFY_V.toFixed(2)}V atau kontak ON). ·{" "}
                          <span className="text-foreground">{prediction.statusText}</span>
                        </span>
                        {selectedLastSession && (
                          <div className="mt-1 text-[11px] text-foreground/80">
                            Catatan Terakhir: {selectedLastSession.timestamp}
                            {selectedLastSession.durationSec !== null &&
                            selectedLastSession.peakV !== null
                              ? ` (${formatMmSs(selectedLastSession.durationSec)}, Puncak ${fmtV(selectedLastSession.peakV)}V)`
                              : ""}
                            {" · "}Status:{" "}
                            {selectedLastSession.sopStatus === "PASS"
                              ? "Lolos 10 Menit"
                              : selectedLastSession.sopStatus === "DISPATCHED"
                                ? "Jadwal Pemanasan Tercatat"
                                : "Belum Tuntas"}
                            .
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Telemetry Stats Row (Hardware Pin 34 + OBD-II Mode 01/03) */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[11px]">Voltase Aki &amp; ADC</div>
                  <div
                    className={cn(
                      "num mt-1 text-base font-bold",
                      isAlternatorVerified
                        ? "text-emerald"
                        : t.crit_alert
                          ? "text-crimson"
                          : "text-foreground",
                    )}
                  >
                    {fmtV(t.v_bat)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">V</span>
                  </div>
                  <div className="num mt-0.5 text-[11px] text-muted-foreground">
                    {t.adc_raw_mv} mV · Komp 25°C: {prediction.compensatedV25.toFixed(2)} V
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[11px]">Putaran &amp; Beban Mesin</div>
                  <div
                    className={cn(
                      "num mt-1 text-base font-bold",
                      isEngineOn ? "text-emerald" : "text-muted-foreground",
                    )}
                  >
                    {isEngineOn && t.rpm > 0 ? t.rpm : "----"}
                    {isEngineOn && t.rpm > 0 && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">RPM</span>
                    )}
                  </div>
                  <div className="num mt-0.5 text-[11px] text-muted-foreground">
                    Beban: {(t.load_pct ?? 0).toFixed(1)}% · ECU: {(t.ecu_v ?? 0).toFixed(2)} V
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[11px]">Suhu Coolant &amp; RTC</div>
                  <div
                    className={cn(
                      "num mt-1 text-base font-bold",
                      isEngineOn && t.temp_c >= 60
                        ? "text-emerald"
                        : isEngineOn
                          ? "text-amber"
                          : "text-muted-foreground",
                    )}
                  >
                    {isEngineOn && t.temp_c > 0 ? `${t.temp_c}°C` : "Standby"}
                  </div>
                  <div className="num mt-0.5 text-[11px] text-muted-foreground">
                    RTC: {t.rtc_temp_c.toFixed(1)}°C · IAT: {t.iat_c ?? 0}°C
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[11px]">Diagnostik &amp; BBM</div>
                  <div
                    className={cn(
                      "num mt-1 text-sm font-semibold",
                      t.dtc_cnt > 0 ? "text-crimson" : "text-emerald",
                    )}
                  >
                    {t.dtc_cnt > 0 ? `${t.dtc} (${t.dtc_cnt} DTC)` : "0 DTC (OK)"}
                  </div>
                  <div className="num mt-0.5 text-[11px] text-muted-foreground">
                    BBM: {(t.fuel_pct ?? 0).toFixed(1)}% · {(t.fuel_rate_lh ?? 0).toFixed(2)} L/j
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isDispatched || isEngineOn}
                    onClick={() => handleDispatchStaff(selected.unit_id)}
                    className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/60 px-3 py-1.5 num text-[11px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    title="Catat jadwal pemanasan mesin 10 menit ke server dan log aktivitas"
                  >
                    <UserCheck size={13} className="shrink-0" aria-hidden="true" />
                    <span>
                      {isDispatched
                        ? "Jadwal Tercatat"
                        : isEngineOn
                          ? "Sedang Pemanasan"
                          : "Catat Jadwal Pemanasan"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveModule("04")}
                    className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/40 px-3 py-1.5 num text-[11px] font-medium uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="Buka instrumen lengkap OBD-II di Modul 04"
                  >
                    <span>Instrumen OBD-II</span>
                  </button>
                </div>

                {/* Sandbox Demo Trigger (Only visible during local/simulator mode) */}
                {dataSource === "SIMULATOR" && (
                  <button
                    type="button"
                    onClick={handleToggleSandboxContact}
                    className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border/80 bg-background px-3 py-1.5 num text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="Simulasikan putaran kontak mesin di lapangan untuk menguji auto-detection"
                  >
                    <Power
                      size={12}
                      className={isEngineOn ? "text-amber" : "text-muted-foreground"}
                      aria-hidden="true"
                    />
                    <span>
                      {isEngineOn
                        ? "Simulasikan Matikan Kunci (OFF)"
                        : "Simulasikan Kontak Nyala (ON)"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </Panel>

          {/* Pending Warm-Up Priority Queue List */}
          <Panel
            title="Daftar Prioritas Pemanasan Armada (Voltase Rendah)"
            code="QUEUE"
            guideTarget="m03-queue"
            right={
              <span className="num text-[11px] text-muted-foreground">
                {pendingQueue.length} Unit Perlu Dipanaskan
              </span>
            }
            className="min-h-[200px] flex-1 lg:min-h-0"
          >
            {pendingQueue.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-6 text-center num text-xs text-muted-foreground">
                <CheckCircle2 size={24} className="text-emerald mb-2" aria-hidden="true" />
                <span className="font-medium text-foreground">
                  Seluruh Unit dalam Kondisi Baterai Prima
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  Tidak ada unit dengan voltase di bawah 12.30V.
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingQueue.map((u, i) => {
                  const unitDispatched = u.status_label === "Warm-Up Dispatched";
                  return (
                    <div
                      key={u.unit_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-border bg-background/40 p-2.5 transition-colors hover:border-foreground/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="num text-xs font-bold text-muted-foreground w-6 shrink-0">
                          #{i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground text-xs">{u.bay}</span>
                            <span className="text-xs text-foreground/90 truncate">
                              {u.model} {u.trim}
                            </span>
                          </div>
                          <div className="num text-[11px] text-muted-foreground">
                            VIN: {u.vin} · Tegangan: {u.telemetry.v_bat.toFixed(2)}V
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={unitDispatched}
                          onClick={() => handleDispatchStaff(u.unit_id)}
                          className="num inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                          title="Catat jadwal pemanasan 10 menit untuk unit ini"
                        >
                          <UserCheck size={12} aria-hidden="true" />
                          <span>{unitDispatched ? "Terjadwal" : "Jadwalkan"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => selectUnit(u.unit_id)}
                          className="num inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
                        >
                          <span>Pilih</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Right Column: Dynamic Warmup / Voltage Curves & Session History */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          {/* Dynamic Unit Telemetry Curve */}
          <Panel
            title={
              isEngineOn
                ? `Kurva Live Pemanasan: Bay ${selected.bay}`
                : `Tren Tegangan & Suhu Standby: Bay ${selected.bay}`
            }
            code="CURVE"
            className="shrink-0"
            right={
              isEngineOn ? (
                <div className="flex items-center gap-2 num text-[11px]">
                  <span className="text-emerald">RPM (Hijau)</span>
                  <span className="text-amber">Coolant (Amber)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 num text-[11px]">
                  <span className="text-emerald">Voltase V (Hijau)</span>
                  <span className="text-amber">Suhu RTC (Amber)</span>
                </div>
              )
            }
          >
            <div className="h-[180px] sm:h-[190px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{
                      fill: "var(--muted-foreground)",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono",
                    }}
                    axisLine={{ stroke: "var(--chart-grid)" }}
                    tickLine={false}
                  />
                  {isEngineOn ? (
                    <YAxis
                      yAxisId="left"
                      domain={[0, 1800]}
                      tick={{
                        fill: "var(--emerald)",
                        fontSize: 10,
                        fontFamily: "JetBrains Mono",
                      }}
                      width={38}
                      axisLine={false}
                      tickLine={false}
                    />
                  ) : (
                    <YAxis
                      yAxisId="left"
                      domain={[11.0, 14.8]}
                      tick={{
                        fill: "var(--emerald)",
                        fontSize: 10,
                        fontFamily: "JetBrains Mono",
                      }}
                      width={38}
                      axisLine={false}
                      tickLine={false}
                    />
                  )}
                  <YAxis
                    yAxisId="t"
                    orientation="right"
                    domain={[0, 120]}
                    tick={{
                      fill: "var(--amber)",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono",
                    }}
                    width={30}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: 2,
                      fontFamily: "JetBrains Mono",
                      fontSize: 11,
                    }}
                  />
                  {!isEngineOn && (
                    <>
                      <ReferenceLine
                        yAxisId="left"
                        y={critV}
                        stroke="var(--crimson)"
                        strokeDasharray="3 3"
                      />
                      <ReferenceLine
                        yAxisId="left"
                        y={ALT_VERIFY_V}
                        stroke="var(--emerald)"
                        strokeDasharray="3 3"
                      />
                    </>
                  )}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey={isEngineOn ? "rpm" : "v"}
                    name={isEngineOn ? "Putaran (RPM)" : "Tegangan (V)"}
                    stroke="var(--emerald)"
                    strokeWidth={1.75}
                    dot={chartData.length <= 3 ? { r: 3, fill: "var(--emerald)" } : false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="t"
                    type="monotone"
                    dataKey="temp"
                    name={isEngineOn ? "Coolant (°C)" : "Suhu RTC (°C)"}
                    stroke="var(--amber)"
                    strokeWidth={1.5}
                    dot={chartData.length <= 3 ? { r: 2.5, fill: "var(--amber)" } : false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 num text-[11px] leading-relaxed text-muted-foreground">
              {isEngineOn
                ? dataSource === "LIVE_API"
                  ? "Sampel telemetri live selama sesi pemanasan berjalan. Target pengisian SOP 10 menit terverifikasi pada voltase >= " +
                    ALT_VERIFY_V.toFixed(2) +
                    "V."
                  : "Profil pemanasan mesin standar: idle awal 1.350 RPM turun menuju 850 RPM saat coolant mencapai suhu kerja optimal."
                : `Unit sedang Standby (mesin mati). Grafik menampilkan ${selectedHistory.length} titik riwayat voltase aki nyata terhadap ambang kritis (${critV.toFixed(2)}V) dan target alternator (${ALT_VERIFY_V.toFixed(2)}V).`}
            </div>
          </Panel>

          {/* Automatic Warmup Log History */}
          <Panel
            title="Riwayat Sesi & Penugasan Pemanasan Mesin"
            code="LOG"
            guideTarget="m03-history"
            right={
              <div className="flex items-center gap-1.5 num text-[11px] text-muted-foreground">
                <History size={12} aria-hidden="true" />
                <span>{visibleCompletedLogs.length} Catatan</span>
              </div>
            }
            className="min-h-[200px] flex-1 lg:min-h-0"
          >
            {visibleCompletedLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center num text-xs text-muted-foreground">
                <Clock size={22} className="mb-2 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">
                  Belum ada sesi pemanasan mesin tercatat pada shift ini
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  Sesi otomatis tercatat saat mesin menyala minimal 5 detik atau saat jadwal
                  pemanasan dicatat.
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left num text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 px-2.5 font-medium">Unit &amp; Bay</th>
                      <th className="py-2 px-2.5 font-medium">Waktu</th>
                      <th className="py-2 px-2.5 font-medium">Durasi</th>
                      <th className="py-2 px-2.5 font-medium">Puncak Volt</th>
                      <th className="py-2 px-2.5 text-right font-medium">Status SOP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleCompletedLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-secondary/20 transition-colors"
                        title={log.note}
                      >
                        <td className="py-2 px-2.5">
                          <span className="font-semibold text-foreground">{log.bay}</span>{" "}
                          <span className="text-[11px] text-muted-foreground">({log.model})</span>
                        </td>
                        <td className="py-2 px-2.5 text-muted-foreground">{log.timestamp}</td>
                        <td className="py-2 px-2.5 font-semibold text-foreground">
                          {log.durationSec !== null ? formatMmSs(log.durationSec) : "-"}
                        </td>
                        <td className="py-2 px-2.5 text-emerald font-semibold">
                          {log.peakV !== null ? `${fmtV(log.peakV)}V` : "-"}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                              log.sopStatus === "PASS"
                                ? "border-emerald/40 bg-emerald/10 text-emerald"
                                : log.sopStatus === "DISPATCHED"
                                  ? "border-border bg-secondary text-foreground"
                                  : "border-amber/50 bg-amber/10 text-amber",
                            )}
                          >
                            {log.sopStatus === "PASS"
                              ? "SOP Lolos"
                              : log.sopStatus === "DISPATCHED"
                                ? "Terjadwal"
                                : "Belum Tuntas"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap items-center justify-between gap-2">
              <span className="num text-[11px] text-muted-foreground">
                Verifikasi PDI Handover:
              </span>
              <button
                type="button"
                onClick={() => setActiveModule("02")}
                className="num inline-flex min-h-[44px] sm:min-h-[36px] cursor-pointer items-center text-[11px] font-semibold text-foreground underline hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Buka Lembar PDI di Modul 02
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
