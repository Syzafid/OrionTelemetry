import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  History,
  ShieldCheck,
  Thermometer,
  UserCheck,
  Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTelemetry } from "@/context/TelemetryContext";
import {
  ALT_VERIFY_V,
  WARMUP_SESSION,
  type VehicleUnit,
} from "@/data/mockTelemetry";
import { Led, Panel, fmtV, unitTone } from "./primitives";
import { cn } from "@/lib/utils";

const WARMUP_TARGET_SEC = 600; // 10 minutes SOP Mitsubishi alternator charge

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface CompletedWarmupLog {
  id: string;
  unit_id: string;
  bay: string;
  model: string;
  timestamp: string;
  durationSec: number;
  peakV: number;
  sopStatus: "PASS" | "INCOMPLETE";
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
    setActiveModule,
  } = useTelemetry();

  const [warmupStartTimes, setWarmupStartTimes] = useState<Record<string, number>>({});
  const [peakVoltages, setPeakVoltages] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);

  // Initial realistic warmup session history
  const [completedLogs, setCompletedLogs] = useState<CompletedWarmupLog[]>([
    {
      id: "LOG-01",
      unit_id: "MITSUBISHI-STOCK-02",
      bay: "A-01",
      model: "XPANDER CROSS",
      timestamp: "08:15 WIB",
      durationSec: 620,
      peakV: 14.18,
      sopStatus: "PASS",
    },
    {
      id: "LOG-02",
      unit_id: "MITSUBISHI-STOCK-05",
      bay: "B-01",
      model: "PAJERO SPORT",
      timestamp: "09:05 WIB",
      durationSec: 280,
      peakV: 13.85,
      sopStatus: "INCOMPLETE",
    },
  ]);

  // 1-second interval to drive live stopwatch
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Automatic physical detection of engine start / alternator surge
  useEffect(() => {
    const now = Date.now();
    units.forEach((u) => {
      const isRunning = u.telemetry.engine_on || u.telemetry.v_bat >= ALT_VERIFY_V;
      const started = warmupStartTimes[u.unit_id];

      if (isRunning) {
        if (!started) {
          // Engine just started running or alternator surged!
          const initialOffsetMs = Math.min(u.telemetry.active_ms || 0, WARMUP_TARGET_SEC * 1000);
          setWarmupStartTimes((prev) => ({ ...prev, [u.unit_id]: now - initialOffsetMs }));
          setPeakVoltages((prev) => ({ ...prev, [u.unit_id]: u.telemetry.v_bat }));
        } else {
          // Track highest alternator peak voltage
          setPeakVoltages((prev) => {
            const currentPeak = prev[u.unit_id] || 0;
            return u.telemetry.v_bat > currentPeak ? { ...prev, [u.unit_id]: u.telemetry.v_bat } : prev;
          });
        }
      } else if (started) {
        // Engine just shut down physically!
        const durationSec = Math.floor((now - started) / 1000);
        const peakV = peakVoltages[u.unit_id] || u.telemetry.v_bat;
        if (durationSec >= 15) {
          // Log sessions lasting 15s or longer
          const dateStr = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
          const newLog: CompletedWarmupLog = {
            id: `LOG-${Date.now().toString().slice(-4)}`,
            unit_id: u.unit_id,
            bay: u.bay,
            model: u.model,
            timestamp: `${dateStr} WIB`,
            durationSec,
            peakV,
            sopStatus: durationSec >= WARMUP_TARGET_SEC && peakV >= ALT_VERIFY_V ? "PASS" : "INCOMPLETE",
          };
          setCompletedLogs((prev) => [newLog, ...prev.slice(0, 9)]);
        }
        setWarmupStartTimes((prev) => {
          const next = { ...prev };
          delete next[u.unit_id];
          return next;
        });
      }
    });
  }, [units, warmupStartTimes, peakVoltages]);

  const t = selected.telemetry;
  const isEngineOn = t.engine_on || t.v_bat >= ALT_VERIFY_V;
  const isAlternatorVerified = t.v_bat >= ALT_VERIFY_V;

  // Active stopwatch calculation for selected unit
  const startTime = warmupStartTimes[selected.unit_id] ?? Date.now();
  const elapsedSec = isEngineOn
    ? Math.max(0, Math.floor((Date.now() - startTime) / 1000))
    : 0;
  const remainingSec = Math.max(0, WARMUP_TARGET_SEC - elapsedSec);
  const progressPct = Math.min(100, Math.round((elapsedSec / WARMUP_TARGET_SEC) * 100));
  const isSopTargetMet = elapsedSec >= WARMUP_TARGET_SEC;

  // Fleet Warmup Statistics
  const warmingCount = units.filter((u) => u.telemetry.engine_on || u.telemetry.v_bat >= ALT_VERIFY_V).length;
  const verifiedCount = units.filter((u) => u.telemetry.v_bat >= ALT_VERIFY_V).length;
  const pendingQueue = units
    .filter((u) => !u.telemetry.engine_on && u.telemetry.v_bat < 12.30)
    .sort((a, b) => a.telemetry.v_bat - b.telemetry.v_bat);

  const selectedLastSession = completedLogs.find((l) => l.unit_id === selected.unit_id);

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
    <div className="module-warmup flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Top Operational KPI Command Bar */}
      <div className="panel flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Flame className="text-emerald shrink-0" size={16} aria-hidden="true" />
            <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
              Pemantauan Pemanasan Mesin (SOP 10 Menit Mitsubishi)
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 border-l border-border/80 pl-3 num text-[11px] text-muted-foreground">
            <span>Deteksi Otomatis Tegangan Alternator &ge; 13.20V</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 num text-[11px]">
          <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1">
            <Led tone={warmingCount > 0 ? "emerald" : "dim"} pulse={warmingCount > 0} />
            <span className="text-muted-foreground">Sedang Nyala:</span>
            <span className="font-semibold text-foreground">{warmingCount} Unit</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1">
            <Led tone={verifiedCount > 0 ? "emerald" : "dim"} />
            <span className="text-muted-foreground">&ge; 13.2V OK:</span>
            <span className="font-semibold text-emerald">{verifiedCount} Unit</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1">
            <Led tone={pendingQueue.length > 0 ? "amber" : "dim"} />
            <span className="text-muted-foreground">Menunggu:</span>
            <span className={cn("font-semibold", pendingQueue.length > 0 ? "text-amber" : "text-foreground")}>
              {pendingQueue.length} Unit
            </span>
          </div>
        </div>
      </div>

      {/* Target Node Quick-Selection Bar (Horizontal Scrollable Strip) */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto card-scroll rounded-[2px] border border-border bg-card/75 px-3 py-1.5 min-w-0">
        <span className="label-hmi mr-1 shrink-0 text-[10px]">Pilih Unit:</span>
        {units.map((u) => {
          const isSelected = u.unit_id === selected.unit_id;
          const uWarm = u.telemetry.engine_on || u.telemetry.v_bat >= ALT_VERIFY_V;
          const uCrit = configs[u.unit_id]?.crit_v ?? 11.80;
          const tn = unitTone(u, uCrit);
          return (
            <button
              key={u.unit_id}
              type="button"
              onClick={() => selectUnit(u.unit_id)}
              className={cn(
                "num inline-flex min-h-[36px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isSelected
                  ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                  : uWarm
                    ? "border-emerald/50 bg-emerald/10 text-emerald font-medium"
                    : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
              )}
            >
              <Led tone={uWarm ? "emerald" : tn} pulse={uWarm} />
              <span>{u.bay}</span>
              <span className="text-[10px] text-muted-foreground">({fmtV(u.telemetry.v_bat)}V)</span>
              {uWarm && <span className="text-[9px] uppercase font-bold text-emerald">RUN</span>}
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Dashboard Layout */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.1fr_1fr]">
        {/* Left Column: Active Warm-Up Console & Priority Queue */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* Active Warm-Up Console for Selected Unit */}
          <Panel
            title={`Konsol Pemantauan: Bay ${selected.bay} (${selected.model})`}
            code="SOP"
            right={
              <span
                className={cn(
                  "num inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                  isEngineOn
                    ? "border-emerald/50 bg-emerald/10 text-emerald"
                    : "border-border bg-secondary/60 text-muted-foreground",
                )}
              >
                <Led tone={isEngineOn ? "emerald" : "dim"} pulse={isEngineOn} />
                {isEngineOn ? "MESIN MENYALA (RUN - ALTERNATOR AKTIF)" : "STANDBY (KONTAK MATI)"}
              </span>
            }
          >
            <div className="space-y-4">
              {/* Timer & Charging Progress Card */}
              <div className="rounded-[2px] border border-border bg-background/50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="label-hmi text-[10px] text-muted-foreground">
                      {isEngineOn ? "Stopwatch Durasi Nyala Mesin (Target SOP: 10:00)" : "Durasi Pemanasan (Siap Deteksi Otomatis)"}
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

                  <div className="flex items-center gap-2">
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
                      <Zap size={13} className="shrink-0" />
                      {isAlternatorVerified
                        ? `Alternator OK (${fmtV(t.v_bat)}V)`
                        : isEngineOn
                          ? `Mengisi (${fmtV(t.v_bat)}V)`
                          : `Standby (${fmtV(t.v_bat)}V)`}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3.5 space-y-1">
                  <div className="flex justify-between num text-[10px] text-muted-foreground">
                    <span>Progres Pengisian SOP 10 Menit:</span>
                    <span className="font-semibold text-foreground">{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-[1px] bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        isSopTargetMet ? "bg-emerald" : isEngineOn ? "bg-foreground" : "bg-muted-foreground/30",
                      )}
                      style={{ width: `${isEngineOn ? progressPct : 0}%` }}
                    />
                  </div>
                </div>

                {/* SOP Status Notice Box */}
                <div
                  className={cn(
                    "mt-3.5 rounded-[2px] border p-2.5 num text-[11px] leading-relaxed",
                    isSopTargetMet
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : isEngineOn
                        ? "border-amber/50 bg-amber/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground",
                  )}
                >
                  {isSopTargetMet ? (
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald" />
                      <span>
                        <strong>SOP 10 Menit Terpenuhi!</strong> Alternator telah mengisi baterai optimal selama {formatMmSs(elapsedSec)} pada tegangan {fmtV(t.v_bat)}V. Mesin siap dimatikan oleh teknisi di lapangan.
                      </span>
                    </div>
                  ) : isEngineOn ? (
                    <div className="flex items-start gap-2">
                      <Zap size={15} className="mt-0.5 shrink-0 text-amber" />
                      <span>
                        <strong>Proses Pemanasan Berlangsung:</strong> Alternator aktif mengisi aki. Butuh {formatMmSs(remainingSec)} lagi untuk mencapai standar minimal SOP Mitsubishi.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <Clock size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <div>
                        <span>
                          <strong>Sistem Deteksi Pasif Aktif:</strong> Pemanasan akan terdeteksi otomatis begitu teknisi menyalakan kontak mesin di lapangan (lonjakan tegangan &ge; 13.20V atau sinyal kontak aktif).
                        </span>
                        {selectedLastSession && (
                          <div className="mt-1 text-[10px] text-foreground/80">
                            Sesi Terakhir: {selectedLastSession.timestamp} ({formatMmSs(selectedLastSession.durationSec)}, Puncak {fmtV(selectedLastSession.peakV)}V) — Status: {selectedLastSession.sopStatus === "PASS" ? "Lolos SOP" : "Belum Tuntas"}.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Telemetry Stats Row */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[10px]">Voltase Baterai</div>
                  <div className={cn("num mt-1 text-lg font-bold", isAlternatorVerified ? "text-emerald" : t.crit_alert ? "text-crimson" : "text-foreground")}>
                    {fmtV(t.v_bat)} <span className="text-xs font-normal text-muted-foreground">V</span>
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[10px]">Putaran Mesin (RPM)</div>
                  <div className={cn("num mt-1 text-lg font-bold", isEngineOn ? "text-emerald" : "text-muted-foreground")}>
                    {isEngineOn && t.rpm > 0 ? t.rpm : "----"}
                    {isEngineOn && t.rpm > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">RPM</span>}
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[10px]">Suhu Coolant</div>
                  <div className={cn("num mt-1 text-lg font-bold", isEngineOn && t.temp_c >= 60 ? "text-emerald" : isEngineOn ? "text-amber" : "text-muted-foreground")}>
                    {isEngineOn && t.temp_c > 0 ? `${t.temp_c}°C` : "----"}
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                  <div className="label-hmi text-[10px]">OBD-II DTC Stored</div>
                  <div className={cn("num mt-1 text-sm font-semibold", t.dtc_cnt > 0 ? "text-crimson" : "text-emerald")}>
                    {t.dtc_cnt > 0 ? t.dtc : "0 DTC (OK)"}
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDispatchStaff(selected.unit_id)}
                    className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/60 px-3 py-1.5 num text-[11px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title="Tandai perintah tugas ke teknisi lapangan untuk memanaskan unit ini"
                  >
                    <UserCheck size={13} className="shrink-0" />
                    <span>Tugaskan Teknisi (Memo)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveModule("04")}
                    className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/40 px-3 py-1.5 num text-[11px] font-medium uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title="Buka instrumen lengkap OBD-II di Modul 04"
                  >
                    <span>Instrumen OBD-II</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* Sandbox Demo Trigger (Only visible during local/simulator mode) */}
                {dataSource === "SIMULATOR" && (
                  <button
                    type="button"
                    onClick={handleToggleSandboxContact}
                    className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border/80 bg-background px-2.5 py-1.5 num text-[10px] font-medium text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
                    title="Simulasikan putaran kontak mesin di lapangan untuk menguji auto-detection"
                  >
                    <Zap size={11} className={isEngineOn ? "text-amber" : "text-muted-foreground"} />
                    <span>{isEngineOn ? "Simulasikan Matikan Kunci (OFF)" : "Simulasikan Kontak Nyala (ON)"}</span>
                  </button>
                )}
              </div>
            </div>
          </Panel>

          {/* Pending Warm-Up Priority Queue List */}
          <Panel
            title="Daftar Prioritas Pemanasan Armada (Voltase Rendah)"
            code="QUEUE"
            right={
              <span className="num text-[10px] text-muted-foreground">
                {pendingQueue.length} Unit Perlu Dipanaskan
              </span>
            }
            className="flex-1 min-h-0"
          >
            {pendingQueue.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-6 text-center num text-xs text-muted-foreground">
                <CheckCircle2 size={24} className="text-emerald mb-2" />
                <span className="font-medium text-foreground">Seluruh Unit dalam Kondisi Baterai Prima</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">Tidak ada unit dengan voltase di bawah 12.30V.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingQueue.map((u, i) => (
                  <div
                    key={u.unit_id}
                    className="flex items-center justify-between rounded-[2px] border border-border bg-background/40 p-2.5 transition-colors hover:border-foreground/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="num text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-xs">{u.bay}</span>
                          <span className="text-xs text-foreground/90">{u.model} {u.trim}</span>
                        </div>
                        <div className="num text-[10.5px] text-muted-foreground">
                          VIN: {u.vin} | Sisa: {u.telemetry.v_bat.toFixed(2)}V
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDispatchStaff(u.unit_id)}
                        className="num inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-secondary/60 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-secondary"
                        title="Tandai perintah pemanasan untuk teknisi lapangan"
                      >
                        <UserCheck size={11} />
                        <span>Tugaskan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectUnit(u.unit_id)}
                        className="num inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-[2px] border border-border bg-background px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
                      >
                        <span>Pilih</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Right Column: Historical Warmup Curves & Session History */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* Dual-Axis Warmup Session Historical Chart */}
          <Panel
            title="Kurva Kenaikan Suhu & Voltase Alternator"
            code="CURVE"
            right={
              <div className="flex items-center gap-2 num text-[10px]">
                <span className="text-emerald">RPM (Hijau)</span>
                <span className="text-amber">Suhu Coolant (Amber)</span>
              </div>
            }
          >
            <div className="h-[180px] sm:h-[190px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={WARMUP_SESSION}>
                  <CartesianGrid stroke="#282E3B" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono" }}
                    axisLine={{ stroke: "#282E3B" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="r"
                    domain={[0, 1600]}
                    tick={{ fill: "#10B981", fontSize: 10, fontFamily: "JetBrains Mono" }}
                    width={36}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="t"
                    orientation="right"
                    domain={[0, 120]}
                    tick={{ fill: "#F59E0B", fontSize: 10, fontFamily: "JetBrains Mono" }}
                    width={28}
                    axisLine={false}
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
                  />
                  <Line
                    yAxisId="r"
                    type="monotone"
                    dataKey="rpm"
                    stroke="#10B981"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    yAxisId="t"
                    type="monotone"
                    dataKey="temp"
                    stroke="#F59E0B"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 num text-[10.5px] leading-relaxed text-muted-foreground">
              Profil pemanasan mesin Mitsubishi standar: Idle awal 1.350 RPM bertahap turun ke 850 RPM seiring suhu pendingin mesin mencapai suhu kerja optimal 86°C.
            </div>
          </Panel>

          {/* Automatic Warmup Log History */}
          <Panel
            title="Riwayat Sesi Pemanasan Mesin (Otomatis Terverifikasi)"
            code="LOG"
            right={
              <div className="flex items-center gap-1.5 num text-[10px] text-muted-foreground">
                <History size={12} />
                <span>{completedLogs.length} Sesi Tercatat</span>
              </div>
            }
            className="flex-1 min-h-0"
          >
            <div className="space-y-2">
              <table className="w-full border-collapse text-left num text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-[9.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-2.5 font-medium">Unit &amp; Bay</th>
                    <th className="py-2 px-2.5 font-medium">Waktu Sesi</th>
                    <th className="py-2 px-2.5 font-medium">Durasi</th>
                    <th className="py-2 px-2.5 font-medium">Puncak Voltase</th>
                    <th className="py-2 px-2.5 text-right font-medium">Status SOP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {completedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-2 px-2.5">
                        <span className="font-semibold text-foreground">{log.bay}</span>{" "}
                        <span className="text-[10px] text-muted-foreground">({log.model})</span>
                      </td>
                      <td className="py-2 px-2.5 text-muted-foreground">{log.timestamp}</td>
                      <td className="py-2 px-2.5 font-semibold text-foreground">{formatMmSs(log.durationSec)}</td>
                      <td className="py-2 px-2.5 text-emerald font-semibold">{fmtV(log.peakV)}V</td>
                      <td className="py-2 px-2.5 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                            log.sopStatus === "PASS"
                              ? "border-emerald/40 bg-emerald/10 text-emerald"
                              : "border-amber/50 bg-amber/10 text-amber",
                          )}
                        >
                          {log.sopStatus === "PASS" ? "SOP Lolos" : "Belum Tuntas"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between">
              <span className="num text-[10px] text-muted-foreground">Verifikasi PDI Handover:</span>
              <button
                type="button"
                onClick={() => setActiveModule("02")}
                className="num text-[11px] font-semibold text-foreground underline hover:text-muted-foreground"
              >
                Buka Lembar PDI di Modul 02 &rarr;
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
