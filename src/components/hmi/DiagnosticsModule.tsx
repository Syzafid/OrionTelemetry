import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  CircuitBoard,
  Fuel,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSpring } from "motion/react";
import { useTelemetry } from "@/context/TelemetryContext";
import { DTC_LIBRARY, getUnitConnectionState, voltageHistory } from "@/data/mockTelemetry";
import { GUIDE_SUBTAB_EVENT } from "@/data/webGuideSteps";
import { computeBatteryPrediction } from "@/lib/battery-analytics";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { SPRING_GAUGE, prefersReducedMotion } from "@/lib/motion-tokens";
import {
  buildDiagnosticsTrendSeries,
  computeGaugeGeometry,
  formatRunTimeCompact,
  resolveWiringRows,
  type DiagnosticsChartPoint,
} from "@/lib/obd-diagnostics";
import { formatDurationCompact, getVehicleElectricalProfile } from "@/lib/vehicle-topology";
import { useChartIntroOnly } from "./motion-bits";
import { Led, Panel } from "./primitives";
import { cn } from "@/lib/utils";

function useAnimated(target: number) {
  const spring = useSpring(target, SPRING_GAUGE);
  const [v, setV] = useState(target);

  useEffect(() => {
    if (prefersReducedMotion()) {
      spring.jump(target);
      setV(target);
      return undefined;
    }
    spring.set(target);
    const unsub = spring.on("change", (latest) => {
      setV(latest);
    });
    return () => unsub();
  }, [target, spring]);

  return v;
}

function Gauge({
  value,
  max,
  label,
  pid,
  unit,
  redline,
  color,
}: {
  value: number;
  max: number;
  label: string;
  pid: string;
  unit: string;
  redline: number;
  color: string;
}) {
  const animatedVal = useAnimated(value < 0 ? 0 : Math.min(max, Math.max(0, value)));
  const geom = useMemo(
    () => computeGaugeGeometry(value < 0 ? -1 : animatedVal, max, redline),
    [value, animatedVal, max, redline],
  );
  const inactive = value < 0;
  const activeStroke = inactive ? "var(--muted-foreground)" : color;

  return (
    <div className="engine-gauge flex flex-col items-center">
      <svg
        viewBox="0 0 280 250"
        role="img"
        aria-label={
          inactive ? `${label}: Standby (Mesin Mati)` : `${label}: ${Math.round(value)} ${unit}`
        }
        className="w-full max-w-[210px] sm:max-w-[245px]"
      >
        <path d={geom.baseArcPath} stroke="var(--border)" strokeWidth="10" fill="none" />
        <path
          d={geom.redlineArcPath}
          stroke="var(--crimson)"
          strokeWidth="10"
          fill="none"
          opacity="0.75"
        />
        {geom.valueArcPath && (
          <path d={geom.valueArcPath} stroke={color} strokeWidth="10" fill="none" />
        )}
        {geom.ticks.map((tk, i) => (
          <line
            key={i}
            x1={tk.x1}
            y1={tk.y1}
            x2={tk.x2}
            y2={tk.y2}
            stroke={tk.isRedline ? "var(--crimson)" : "var(--muted-foreground)"}
            strokeWidth={tk.isMajor ? 1.5 : 1}
          />
        ))}
        {geom.labels.map((lbl) => (
          <text
            key={lbl.key}
            x={lbl.x}
            y={lbl.y}
            fill="var(--muted-foreground)"
            fontSize="10"
            fontFamily="JetBrains Mono"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {lbl.text}
          </text>
        ))}
        <line
          x1={140}
          y1={140}
          x2={geom.needleEnd[0]}
          y2={geom.needleEnd[1]}
          stroke={activeStroke}
          strokeWidth="2"
        />
        <circle cx={140} cy={140} r="6" fill="var(--background)" stroke={activeStroke} />
        <text
          x={140}
          y={192}
          fill="var(--foreground)"
          fontSize="30"
          fontFamily="JetBrains Mono"
          textAnchor="middle"
        >
          {inactive ? "----" : Math.round(value)}
        </text>
        <text
          x={140}
          y={212}
          fill="var(--muted-foreground)"
          fontSize="10.5"
          fontFamily="JetBrains Mono"
          textAnchor="middle"
        >
          {unit}
        </text>
      </svg>
      <div className="-mt-1 text-center sm:-mt-2">
        <div className="label-hmi text-foreground">{label}</div>
        <div className="num text-[11px] text-muted-foreground">{pid}</div>
      </div>
    </div>
  );
}

type DiagSubTab = "POWERTRAIN" | "EMISSIONS" | "ELECTRICAL";

const SUB_TABS: Array<{ id: DiagSubTab; shortTitle: string }> = [
  { id: "POWERTRAIN", shortTitle: "01. Instrumen & Powertrain" },
  { id: "EMISSIONS", shortTitle: "02. Emisi, BBM & DTC" },
  { id: "ELECTRICAL", shortTitle: "03. Kelistrikan & Pinout CAN" },
];

export function DiagnosticsModule() {
  const {
    selected,
    units,
    selectUnit,
    configs,
    history,
    dataSource,
    apiStatus,
    isOfflineSnapshot,
    lastSyncTime,
    pollNow,
    simulate,
    injectDtc,
    setActiveModule,
  } = useTelemetry();

  const [activeSubTab, setActiveSubTab] = useState<DiagSubTab>("POWERTRAIN");
  const [nodeFilter, setNodeFilter] = useState("");
  const [liveSamplesMap, setLiveSamplesMap] = useState<Record<string, DiagnosticsChartPoint[]>>({});
  const tabRefs = useRef<Partial<Record<DiagSubTab, HTMLButtonElement | null>>>({});
  const chartIntro = useChartIntroOnly();

  useEffect(() => {
    const onGuideSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ moduleId?: string; subTab?: string }>).detail;
      if (
        detail?.moduleId === "04" &&
        (detail.subTab === "POWERTRAIN" ||
          detail.subTab === "EMISSIONS" ||
          detail.subTab === "ELECTRICAL")
      ) {
        setActiveSubTab(detail.subTab);
      }
    };
    window.addEventListener(GUIDE_SUBTAB_EVENT, onGuideSubTab);
    return () => window.removeEventListener(GUIDE_SUBTAB_EVENT, onGuideSubTab);
  }, []);

  const isLiveApi = dataSource === "LIVE_API";
  const t = selected.telemetry;
  const hasDtc = t.dtc !== "NONE" || t.dtc_cnt > 0;
  const dtc = hasDtc ? DTC_LIBRARY[t.dtc] : null;
  const sleeping = !t.engine_on;
  const selectedConfig = configs[selected.unit_id];
  const critV = selectedConfig?.crit_v ?? 11.8;
  const profile = getVehicleElectricalProfile(selected.model);
  const conn = getUnitConnectionState(selected, isLiveApi);
  const isBatCrit = t.crit_alert || t.v_bat < critV;
  const isBatLow = isBatCrit || t.v_bat < 12.3;

  // Capture real live streaming points while engine is running in LIVE_API mode
  useEffect(() => {
    if (!isLiveApi) return;
    const nowLabel = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const updates: Record<string, DiagnosticsChartPoint> = {};
    for (const u of units) {
      if (!u.telemetry.engine_on) continue;
      updates[u.unit_id] = {
        t: nowLabel,
        rpm: Math.max(0, u.telemetry.rpm),
        temp: u.telemetry.temp_c > -40 ? Math.max(0, u.telemetry.temp_c) : 0,
        v: Number(u.telemetry.v_bat.toFixed(2)),
      };
    }
    if (Object.keys(updates).length === 0) return;

    setLiveSamplesMap((prev) => {
      let next: Record<string, DiagnosticsChartPoint[]> | null = null;
      for (const [uid, pt] of Object.entries(updates)) {
        const cur = prev[uid] ?? [];
        const last = cur[cur.length - 1];
        if (!last || last.rpm !== pt.rpm || last.temp !== pt.temp || last.v !== pt.v) {
          if (!next) next = { ...prev };
          next[uid] = [...cur.slice(-19), pt];
        }
      }
      return next ?? prev;
    });
  }, [isLiveApi, units]);

  const unitHist = useMemo(() => {
    const pts = history[selected.unit_id];
    if (isLiveApi) {
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
    return pts && pts.length >= 2 ? pts : voltageHistory(t.v_bat, t.engine_on);
  }, [history, selected.unit_id, selected.last_seen, isLiveApi, t.v_bat, t.ts_epoch, t.engine_on]);

  const thermalPred = computeBatteryPrediction(unitHist, t.v_bat, critV, t.engine_on, t.rtc_temp_c);

  const trendSeries = useMemo(
    () =>
      buildDiagnosticsTrendSeries({
        historyPoints: history[selected.unit_id],
        unit: selected,
        isLiveApi,
        liveSamples: liveSamplesMap[selected.unit_id] ?? [],
      }),
    [history, selected, isLiveApi, liveSamplesMap],
  );

  const filteredUnits = useMemo(
    () => units.filter((u) => matchesFleetSearch(u, nodeFilter)),
    [units, nodeFilter],
  );

  const wiringRows = useMemo(
    () => resolveWiringRows(selected, critV, selectedConfig),
    [selected, critV, selectedConfig],
  );

  const milActive = Boolean(t.mil_on) || t.dtc_cnt > 0;
  const speedKmh = t.speed_kmh ?? 0;
  const iatC = t.iat_c ?? 0;
  const mapKpa = t.map_kpa ?? 0;
  const loadPct = t.load_pct ?? 0;
  const tpsPct = t.tps_pct ?? 0;
  const ignDeg = t.ign_deg ?? 0;
  const mafGs = t.maf_gs ?? 0;
  const runTimeS = t.run_time_s ?? 0;
  const fuelPct = t.fuel_pct ?? 0;
  const fuelRateLh = t.fuel_rate_lh ?? 0;
  const o2V = t.o2_v ?? 0;
  const stftPct = t.stft_pct ?? 0;
  const ecuV = t.ecu_v ?? 0;
  const distClrKm = t.dist_clr_km ?? 0;
  const ecuVoltageDelta = t.engine_on && ecuV > 0 ? Math.abs(t.v_bat - ecuV) : null;
  const estimatedFuelLiters = ((fuelPct / 100) * profile.fuelTankLiters).toFixed(1);
  const resolvedSsid = (t.sync_ssid || selected.sync_ssid || "").trim();

  // Mixture diagnosis derived strictly from live O2 & STFT values
  let mixtureStatus = "----";
  let mixtureSub = "Menunggu Closed-Loop";
  let mixtureTone: "emerald" | "amber" | "muted" = "muted";
  if (!sleeping) {
    if (Math.abs(stftPct) > 10) {
      mixtureStatus = stftPct > 0 ? "TERLALU KURUS (LEAN)" : "TERLALU KAYA (RICH)";
      mixtureSub = `Koreksi melebihi ±10% (${stftPct > 0 ? "+" : ""}${stftPct.toFixed(1)}%)`;
      mixtureTone = "amber";
    } else if (o2V >= 0.1 && o2V <= 0.9) {
      mixtureStatus = "STOIKIOMETRIK OPTIMAL";
      mixtureSub = "Pembakaran closed-loop seimbang (AFR ~14.7:1)";
      mixtureTone = "emerald";
    } else {
      mixtureStatus = "OPEN-LOOP PEMANASAN";
      mixtureSub = "Menunggu sensor O2 mencapai suhu operasi";
      mixtureTone = "muted";
    }
  }

  const powertrainMetrics = [
    {
      label: "Kecepatan Kendaraan",
      pid: "010D",
      val: sleeping ? "----" : `${speedKmh}`,
      unit: sleeping ? "" : "km/h",
      barPct: sleeping ? 0 : Math.min(100, (speedKmh / 160) * 100),
      barTone: "bg-foreground/60",
      refHint: "Parkir Stock Yard: 0 km/h",
    },
    {
      label: "Suhu Udara Masuk (IAT)",
      pid: "010F",
      val: sleeping ? "----" : `${iatC}`,
      unit: sleeping ? "" : "°C",
      refHint: "Normal ruang tropis: 28 - 55 °C",
    },
    {
      label: "Tekanan Manifold (MAP)",
      pid: "010B",
      val: sleeping ? "----" : `${mapKpa}`,
      unit: sleeping ? "" : "kPa",
      refHint: "Normal idle vakum: 25 - 45 kPa",
    },
    {
      label: "Beban Mesin",
      pid: "0104",
      val: sleeping ? "----" : loadPct.toFixed(1),
      unit: sleeping ? "" : "%",
      barPct: sleeping ? 0 : Math.min(100, Math.max(0, loadPct)),
      barTone: loadPct > 80 ? "bg-amber" : "bg-emerald",
      refHint: "Batas beban stasioner: < 80%",
    },
    {
      label: "Posisi Throttle (TPS)",
      pid: "0111",
      val: sleeping ? "----" : tpsPct.toFixed(1),
      unit: sleeping ? "" : "%",
      barPct: sleeping ? 0 : Math.min(100, Math.max(0, tpsPct)),
      barTone: "bg-foreground/60",
      refHint: "Posisi idle tertutup: 10 - 20%",
    },
    {
      label: "Sudut Pengapian",
      pid: "010E",
      val: sleeping ? "----" : `${ignDeg >= 0 ? "+" : ""}${ignDeg.toFixed(1)}`,
      unit: sleeping ? "" : "°",
      refHint: "Timing idle: +5° s/d +18° BTDC",
    },
    {
      label: "Aliran Udara (MAF)",
      pid: "0110",
      val: sleeping ? "----" : mafGs.toFixed(2),
      unit: sleeping ? "" : "g/s",
      refHint: "Idle stasioner: 2.0 - 6.0 g/s",
    },
    {
      label: "Durasi Mesin Menyala",
      pid: "011F",
      val: sleeping ? "----" : formatRunTimeCompact(runTimeS),
      unit: "",
      refHint: "Target SOP pemanasan: 10m 00d",
    },
  ];

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIdx: number) => {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") {
      nextIdx = (currentIdx + 1) % SUB_TABS.length;
    } else if (e.key === "ArrowLeft") {
      nextIdx = (currentIdx - 1 + SUB_TABS.length) % SUB_TABS.length;
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = SUB_TABS.length - 1;
    }
    if (nextIdx === null) return;
    e.preventDefault();
    const targetTab = SUB_TABS[nextIdx]!;
    setActiveSubTab(targetTab.id);
    tabRefs.current[targetTab.id]?.focus();
  };

  return (
    <div className="module-diagnostics flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Offline Cache Alert Banner when Live API fails */}
      {isLiveApi && (apiStatus === "FALLBACK_ERROR" || isOfflineSnapshot) && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[2px] border border-amber/60 bg-amber/10 px-3 py-2 num text-xs text-amber"
        >
          <div className="flex items-center gap-2">
            <WifiOff size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
            <span>
              Koneksi Live API terganggu. Menampilkan snapshot terakhir (sinkron:{" "}
              {selected.last_seen ?? (lastSyncTime || "belum tercatat")}).
            </span>
          </div>
          <button
            type="button"
            onClick={pollNow}
            className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-amber/70 bg-amber/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:bg-amber/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Muat Ulang API
          </button>
        </div>
      )}

      {/* Target Unit Command & Context Strip (shrink-0) */}
      <div
        data-guide-target="m04-toolbar"
        className="flex shrink-0 flex-col gap-2 rounded-[2px] border border-border bg-card/80 px-3 py-2"
      >
        <h1 className="sr-only">Diagnostik OBD-II &amp; Powertrain Stock Yard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-hmi mr-1 shrink-0">Target Unit</span>
          {units.length > 3 && (
            <div className="relative w-full sm:w-52 shrink-0">
              <Search
                size={13}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={nodeFilter}
                onChange={(e) => setNodeFilter(e.target.value)}
                placeholder="Cari Bay / Model / DTC..."
                aria-label="Cari unit diagnostik OBD-II"
                className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-11 py-1.5 num text-[11px] text-foreground placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {nodeFilter && (
                <button
                  type="button"
                  onClick={() => setNodeFilter("")}
                  aria-label="Hapus pencarian unit"
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="card-scroll flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
            {filteredUnits.length > 0 ? (
              filteredUnits.map((u) => {
                const isSelected = u.unit_id === selected.unit_id;
                const uCrit = u.telemetry.dtc_cnt > 0;
                return (
                  <button
                    key={u.unit_id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectUnit(u.unit_id)}
                    className={cn(
                      "num inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isSelected
                        ? uCrit
                          ? "border-crimson bg-crimson/15 font-semibold text-crimson"
                          : "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                        : uCrit
                          ? "border-crimson/50 bg-crimson/5 text-crimson hover:bg-crimson/10"
                          : "border-border bg-card text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>
                      {u.bay} ({u.model})
                    </span>
                    {uCrit && <span className="font-bold">[{u.telemetry.dtc}]</span>}
                  </button>
                );
              })
            ) : (
              <div className="flex flex-wrap items-center gap-2 py-1 num text-xs text-muted-foreground">
                <span>Tidak ada unit cocok dengan &ldquo;{nodeFilter}&rdquo;.</span>
                <button
                  type="button"
                  onClick={() => setNodeFilter("")}
                  className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-semibold uppercase text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Reset Filter
                </button>
              </div>
            )}
          </div>

          {isLiveApi && (
            <button
              type="button"
              onClick={pollNow}
              title="Sinkronisasi data terbaru dari server sekarang"
              className="num inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-background px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
              <span>Segarkan Data ({lastSyncTime ?? "--"})</span>
            </button>
          )}
        </div>

        {/* Unit Specification & Action Shortcuts Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 num text-[11px]">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="font-semibold text-foreground">
              {selected.bay} · {selected.model}
            </span>
            <span className="text-border">|</span>
            <span>Mesin: {profile.engineCode}</span>
            <span className="text-border">|</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase",
                conn.isOnline
                  ? "border-emerald/50 bg-emerald/15 text-emerald"
                  : "border-border bg-secondary/80 text-foreground",
              )}
            >
              <Led tone={conn.isOnline ? "emerald" : "dim"} />
              {conn.badgeText}
            </span>
            {(selected.last_seen || conn.lastSeenSec !== null) && (
              <span>
                Last seen:{" "}
                <strong className="text-foreground">
                  {selected.last_seen ?? formatDurationCompact(conn.lastSeenSec)}
                </strong>
                {selected.last_seen && conn.lastSeenSec !== null
                  ? ` (${formatDurationCompact(conn.lastSeenSec)})`
                  : ""}
              </span>
            )}
            {resolvedSsid && (
              <>
                <span className="text-border">|</span>
                <span>SSID: {resolvedSsid}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!isLiveApi && (
              <div className="flex flex-wrap items-center gap-1.5 border-r border-border/70 pr-2 mr-0.5">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Mode Simulasi:
                </span>
                <button
                  type="button"
                  onClick={() => simulate(sleeping ? "WARMUP" : "STANDBY")}
                  className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {sleeping ? "Simulasikan Mesin ON" : "Matikan Mesin (OFF)"}
                </button>
                <button
                  type="button"
                  onClick={() => injectDtc(selected.unit_id, "P0133")}
                  className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-crimson/50 bg-crimson/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-crimson hover:bg-crimson/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Simulasi DTC P0133
                </button>
                {hasDtc && (
                  <button
                    type="button"
                    onClick={() => injectDtc(selected.unit_id, null)}
                    className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-emerald/50 bg-emerald/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald hover:bg-emerald/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Pulihkan Nominal
                  </button>
                )}
              </div>
            )}

            {(hasDtc || t.can_ok === false) && (
              <button
                type="button"
                onClick={() => setActiveModule("02")}
                className="inline-flex min-h-[44px] md:min-h-[36px] cursor-pointer items-center gap-1 rounded-[2px] border border-crimson/60 bg-crimson/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-crimson hover:bg-crimson/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Wrench size={12} strokeWidth={1.75} aria-hidden="true" />
                <span>Buka Tiket Armada (02)</span>
              </button>
            )}
            {isBatLow && (
              <button
                type="button"
                onClick={() => setActiveModule("03")}
                className="inline-flex min-h-[44px] md:min-h-[36px] cursor-pointer items-center gap-1 rounded-[2px] border border-amber/60 bg-amber/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber hover:bg-amber/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>Antrean Pemanasan (03)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveModule("06")}
              className="inline-flex min-h-[44px] md:min-h-[36px] cursor-pointer items-center rounded-[2px] border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>Kalibrasi &amp; Config (06)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Menu Navigation Bar (Accessible Segmented Control: role="tablist") */}
      <div
        data-guide-target="m04-subtabs"
        className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 rounded-[2px] border border-border bg-card/90 px-3 py-2"
      >
        <div
          role="tablist"
          aria-label="Kategori Diagnostik OBD-II"
          className="flex flex-wrap items-center gap-1.5 num text-xs"
        >
          {SUB_TABS.map((tab, idx) => {
            const isActive = activeSubTab === tab.id;
            const label =
              tab.id === "EMISSIONS" && hasDtc
                ? `${tab.shortTitle} [${t.dtc}]`
                : tab.id === "ELECTRICAL"
                  ? `${tab.shortTitle} (${t.v_bat.toFixed(2)}V)`
                  : tab.shortTitle;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                id={`diag-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`diag-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveSubTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive
                    ? "border-foreground bg-foreground/10 text-foreground"
                    : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                )}
              >
                {tab.id === "POWERTRAIN" && (
                  <Activity
                    size={14}
                    aria-hidden="true"
                    className={isActive ? "text-emerald" : "text-muted-foreground"}
                  />
                )}
                {tab.id === "EMISSIONS" && (
                  <Fuel
                    size={14}
                    aria-hidden="true"
                    className={
                      isActive
                        ? milActive
                          ? "text-crimson"
                          : "text-emerald"
                        : "text-muted-foreground"
                    }
                  />
                )}
                {tab.id === "ELECTRICAL" && (
                  <BatteryCharging
                    size={14}
                    aria-hidden="true"
                    className={isActive ? "text-amber" : "text-muted-foreground"}
                  />
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 num text-[11px] text-muted-foreground">
          <span className="hidden sm:inline">Status Aliran ECU:</span>
          <span
            className={cn(
              "font-semibold uppercase flex items-center gap-1.5",
              !conn.isOnline
                ? "text-muted-foreground"
                : sleeping
                  ? "text-muted-foreground"
                  : "text-emerald",
            )}
          >
            <Led tone={!conn.isOnline || sleeping ? "dim" : "emerald"} />
            {!conn.isOnline ? conn.badgeText : sleeping ? "STANDBY / KUNCI OFF" : "LIVE CAN AKTIF"}
          </span>
        </div>
      </div>

      {/* SUB-TAB 01: POWERTRAIN & INSTRUMENTS */}
      {activeSubTab === "POWERTRAIN" && (
        <div
          id="diag-panel-POWERTRAIN"
          role="tabpanel"
          aria-labelledby="diag-tab-POWERTRAIN"
          className="flex flex-col gap-3 flex-1 min-h-0 lg:overflow-y-auto card-scroll pr-0.5"
        >
          {/* Row 1: Dual Analog Gauges + Dual Axis Real-History Trend Chart */}
          <div
            data-guide-target="m04-gauges"
            className="diagnostics-instruments grid shrink-0 gap-3 [&>*]:min-w-0 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]"
          >
            <Panel title="Putaran Mesin (RPM)" code="010C">
              <Gauge
                value={!t.engine_on || t.rpm <= 0 ? -1 : t.rpm}
                max={profile.rpmMax}
                redline={profile.rpmRedline}
                label={`Putaran (${profile.fuelType})`}
                pid="Mode 01, PID 010C"
                unit="RPM"
                color="var(--emerald)"
              />
            </Panel>

            <Panel title="Suhu Cairan Pendingin" code="0105">
              <Gauge
                value={!t.engine_on || t.temp_c <= 0 ? -1 : t.temp_c}
                max={120}
                redline={105}
                label="Suhu Coolant"
                pid="Mode 01, PID 0105"
                unit="°C"
                color="var(--amber)"
              />
            </Panel>

            <Panel
              title="Tren RPM & Suhu Coolant (Riwayat Nyata)"
              code={isLiveApi ? "LIVE" : "HIST"}
              right={
                <div className="flex items-center gap-3 num text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 bg-emerald" aria-hidden="true" />
                    RPM
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 bg-amber" aria-hidden="true" />
                    Coolant (°C)
                  </span>
                </div>
              }
              className="lg:col-span-2 xl:col-span-1"
            >
              {!trendSeries.hasEngineActivity ? (
                <div className="flex h-[200px] sm:h-[220px] flex-col items-center justify-center rounded-[2px] border border-dashed border-border/80 bg-background/40 p-4 text-center">
                  <Activity
                    size={20}
                    strokeWidth={1.5}
                    className="mb-2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="num text-xs font-semibold text-foreground">
                    Mesin Standby (0 RPM) pada {trendSeries.points.length} Rekaman Terakhir
                  </div>
                  <p className="mt-1 max-w-sm num text-[11px] leading-relaxed text-muted-foreground">
                    {isLiveApi
                      ? "Grafik hanya memetakan aktivitas RPM dan suhu coolant aktual dari MySQL. Saat kontak ON, kurva akan tergambar otomatis."
                      : "Pada mode Simulasi, klik Simulasikan Mesin ON di bilah atas atau jadwalkan pemanasan untuk melihat grafik aktif."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveModule("03")}
                    className="mt-3 min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-border bg-secondary/50 px-3 py-1 num text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Menuju Antrean Pemanasan (03)
                  </button>
                </div>
              ) : (
                <div className="session-chart h-[200px] sm:h-[220px] lg:h-[235px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendSeries.points}>
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
                      <YAxis
                        yAxisId="r"
                        domain={[0, trendSeries.maxRpmDomain]}
                        tick={{
                          fill: "var(--emerald)",
                          fontSize: 10,
                          fontFamily: "JetBrains Mono",
                        }}
                        width={40}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="t"
                        orientation="right"
                        domain={[0, 120]}
                        tick={{ fill: "var(--amber)", fontSize: 10, fontFamily: "JetBrains Mono" }}
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
                      <Line
                        yAxisId="r"
                        type="monotone"
                        dataKey="rpm"
                        name="Putaran (RPM)"
                        stroke="var(--emerald)"
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={chartIntro}
                      />
                      <Line
                        yAxisId="t"
                        type="monotone"
                        dataKey="temp"
                        name="Coolant (°C)"
                        stroke="var(--amber)"
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={chartIntro}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          {/* Row 2: 8 Powertrain Telemetry Cards */}
          <Panel
            title="8 Parameter Powertrain (Mode 01 Read-Only)"
            code="PWR"
            right={
              <span
                className={cn(
                  "num text-[11px] font-semibold uppercase",
                  sleeping ? "text-muted-foreground" : "text-emerald",
                )}
              >
                {sleeping ? "KUNCI OFF (BUS CAN STANDBY)" : "ALIRAN CAN AKTIF"}
              </span>
            }
            className="shrink-0"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {powertrainMetrics.map((m) => (
                <div
                  key={m.pid}
                  className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between hover:border-foreground/30 transition-colors min-h-[120px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="label-hmi text-xs text-foreground font-semibold tracking-wider">
                      {m.label}
                    </span>
                    <span className="num shrink-0 rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      PID {m.pid}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div
                      className={cn(
                        "num text-2xl sm:text-3xl font-bold leading-none tracking-tight",
                        sleeping ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {m.val}
                      {m.unit && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {m.unit}
                        </span>
                      )}
                    </div>
                    {typeof m.barPct === "number" && (
                      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-[2px] bg-muted/70">
                        <div
                          className={cn("h-full transition-all duration-300", m.barTone)}
                          style={{ width: `${m.barPct}%` }}
                        />
                      </div>
                    )}
                    <div className="mt-2 num text-[11px] text-muted-foreground">{m.refHint}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 02: EMISSIONS, FUEL & DTC */}
      {activeSubTab === "EMISSIONS" && (
        <div
          id="diag-panel-EMISSIONS"
          data-guide-target="m04-dtc"
          role="tabpanel"
          aria-labelledby="diag-tab-EMISSIONS"
          className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.1fr_1.35fr]"
        >
          {/* Left Column: Read-Only DTC Fault Monitor (Mode 03 / Mode 07 honesty) */}
          <Panel
            title="Monitor Kode Kerusakan DTC (Mode 03 Read-Only)"
            code="03/07"
            right={
              <span className="num inline-flex items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Lock size={10} strokeWidth={2} aria-hidden="true" />
                Read-Only ECU
              </span>
            }
          >
            <div className="space-y-4">
              {/* Primary DTC Status Box (Single authoritative MIL indicator) */}
              <div
                className={cn(
                  "rounded-[2px] border p-4",
                  hasDtc ? "border-crimson/60 bg-crimson/5" : "border-emerald/40 bg-emerald/5",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {hasDtc ? (
                      <AlertTriangle
                        className="h-6 w-6 shrink-0 text-crimson"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    ) : (
                      <ShieldCheck
                        className="h-6 w-6 shrink-0 text-emerald"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <div
                        className={cn(
                          "num text-lg sm:text-xl font-bold tracking-tight",
                          hasDtc ? "text-crimson" : "text-emerald",
                        )}
                      >
                        {t.dtc_cnt} DTC Terdeteksi ({hasDtc ? t.dtc : "Sistem Nominal"})
                      </div>
                      <div className="num text-xs text-muted-foreground mt-0.5">
                        Protokol ISO 15031-6 Mode 03 Polling Pasif
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "num rounded-[2px] border px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
                      milActive
                        ? "border-crimson/60 bg-crimson/15 text-crimson"
                        : "border-emerald/40 bg-emerald/10 text-emerald",
                    )}
                  >
                    {milActive ? "MIL ON (PERINGATAN)" : "MIL OFF (NORMAL)"}
                  </span>
                </div>

                {dtc ? (
                  <div className="mt-4 space-y-2.5 border-t border-border/70 pt-3">
                    <div className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                      {dtc.title}
                    </div>
                    <div className="label-hmi text-xs text-muted-foreground">{dtc.system}</div>
                    <p className="num text-xs leading-relaxed text-foreground/90">{dtc.detail}</p>
                    <div className="rounded-[2px] border border-border/70 bg-background/50 p-3">
                      <div className="label-hmi text-[11px] text-foreground mb-1.5">
                        Langkah Inspeksi SOP Teknisi
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 num text-xs text-muted-foreground">
                        {dtc.sopSteps.map((step, sIdx) => (
                          <li key={sIdx}>{step}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="num text-[11px] text-muted-foreground pt-0.5">
                      Frame Respons Mode 03: <strong className="text-foreground">{t.dtc}</strong>{" "}
                      (CAN Arbitration ID: 0x7E8)
                    </div>
                  </div>
                ) : hasDtc ? (
                  <div className="mt-3 num text-xs text-foreground/90">
                    Kode kerusakan tersimpan <strong className="text-crimson">{t.dtc}</strong>{" "}
                    dilaporkan melalui pembacaan pasif Mode 03. Lakukan pemeriksaan scanner bengkel
                    resmi MUT-III.
                  </div>
                ) : (
                  <div className="mt-3 num text-xs text-muted-foreground leading-relaxed">
                    Tidak ada kode kerusakan mesin tersimpan pada memori ECU (P0000). Seluruh sensor
                    emisi dan aktuator yang terpantau dalam batas nominal.
                  </div>
                )}
              </div>

              {/* Honest Mode 07 Pending Codes Status (not yet polled in v1.6.0 firmware) */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="label-hmi text-xs text-foreground font-semibold">
                    Mode 07: Pending Diagnostic Trouble Codes
                  </span>
                  <span className="num rounded-[2px] border border-border bg-secondary/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-muted-foreground">
                    Belum Dipoling (FW v1.6.0)
                  </span>
                </div>
                <p className="num text-xs leading-relaxed text-muted-foreground">
                  Firmware ESP32 v1.6.0 saat ini mem-poll Mode 01 (PID langsung) dan Mode 03 (DTC
                  tersimpan) secara pasif. Dukungan pembacaan Mode 07 memerlukan frame query
                  tambahan pada fungsi pollRealEcuObd2.
                </p>
              </div>

              {/* Strict ECU Write Lock Notice */}
              <div className="flex items-start gap-3 rounded-[2px] border border-border bg-secondary/30 p-3.5 num text-xs text-muted-foreground">
                <Lock
                  size={15}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="leading-relaxed">
                  <strong className="text-foreground block mb-0.5">
                    Kebijakan ECU 100% Read-Only (Mode 01 &amp; Mode 03)
                  </strong>
                  Perintah OBD-II Mode 04 (Hapus DTC / Reset Memori ECU) dinonaktifkan permanen pada
                  driver TWAI ESP32 dan HMI untuk menjaga keaslian histori emisi unit stock yard.
                </div>
              </div>
            </div>
          </Panel>

          {/* Right Column: Fuel & Emission Readiness (Mode 01 Read-Only) */}
          <Panel
            title="Sistem Bahan Bakar & Kontrol Emisi (Mode 01 Read-Only)"
            code="BBM"
            right={
              <Fuel
                size={14}
                strokeWidth={1.5}
                className="text-muted-foreground"
                aria-hidden="true"
              />
            }
          >
            <div className="space-y-4">
              {/* Fuel Tank Level (PID 012F) with honest CAN Off standby masking & OEM model tank capacity */}
              <div className="rounded-[2px] border border-border bg-card/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="label-hmi text-xs text-foreground font-semibold tracking-wider">
                      Level Tangki Bahan Bakar ({selected.model})
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">
                      Mode 01, PID 012F · Kapasitas OEM {profile.fuelTankLiters}L (
                      {profile.fuelType})
                    </div>
                  </div>
                  <div
                    className={cn(
                      "num text-2xl sm:text-3xl font-bold tracking-tight",
                      sleeping
                        ? "text-muted-foreground"
                        : fuelPct > 0 && fuelPct < 20
                          ? "text-amber"
                          : "text-foreground",
                    )}
                  >
                    {sleeping ? (
                      <span className="text-xl uppercase">STANDBY (CAN Off)</span>
                    ) : (
                      <>
                        {fuelPct.toFixed(1)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">%</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3.5 h-3 w-full overflow-hidden rounded-[2px] bg-muted/80">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      sleeping
                        ? "bg-muted-foreground/30"
                        : fuelPct < 20
                          ? "bg-amber"
                          : "bg-emerald",
                    )}
                    style={{ width: sleeping ? "0%" : `${Math.min(100, Math.max(0, fuelPct))}%` }}
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 num text-xs text-muted-foreground">
                  {sleeping ? (
                    <span>
                      Pembacaan level BBM tersedia otomatis saat kontak ON (bus CAN aktif)
                    </span>
                  ) : (
                    <span>
                      Estimasi Volume:{" "}
                      <strong className="text-foreground">{estimatedFuelLiters} Liter</strong>
                    </span>
                  )}
                  <span>
                    Ambang Isi Ulang Yard: <strong>15.0%</strong>
                  </span>
                </div>
              </div>

              {/* 4 Distinct Emission & Injection Cards */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">
                        Konsumsi BBM (Rate)
                      </span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        PID 015E
                      </span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">
                      Laju Aliran Bahan Bakar
                    </div>
                  </div>
                  <div className="mt-3">
                    <div
                      className={cn(
                        "num text-2xl sm:text-3xl font-bold",
                        sleeping ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {sleeping ? "----" : fuelRateLh.toFixed(2)}
                      {!sleeping && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">L/h</span>
                      )}
                    </div>
                    <div className="mt-1.5 num text-[11px] text-muted-foreground">
                      Normal idle stasioner: 0.7 - 1.5 L/h
                    </div>
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">
                        Sensor O2 (Bank 1)
                      </span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        PID 0114
                      </span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">
                      Tegangan Lambda Upstream
                    </div>
                  </div>
                  <div className="mt-3">
                    <div
                      className={cn(
                        "num text-2xl sm:text-3xl font-bold",
                        sleeping ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {sleeping ? "----" : o2V.toFixed(2)}
                      {!sleeping && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">V</span>
                      )}
                    </div>
                    <div className="mt-1.5 num text-[11px] text-muted-foreground">
                      Rentang switching normal: 0.10 - 0.90 V
                    </div>
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">
                        Short-Term Fuel Trim
                      </span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        PID 0106
                      </span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">
                      Koreksi Injeksi Closed-Loop
                    </div>
                  </div>
                  <div className="mt-3">
                    <div
                      className={cn(
                        "num text-2xl sm:text-3xl font-bold",
                        sleeping
                          ? "text-muted-foreground"
                          : Math.abs(stftPct) > 10
                            ? "text-amber"
                            : "text-foreground",
                      )}
                    >
                      {sleeping ? "----" : `${stftPct > 0 ? "+" : ""}${stftPct.toFixed(1)}`}
                      {!sleeping && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">%</span>
                      )}
                    </div>
                    <div className="mt-1.5 num text-[11px] text-muted-foreground">
                      Toleransi normal: -10.0% s/d +10.0%
                    </div>
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">
                        Status Campuran BBM
                      </span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        O2 + STFT
                      </span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">
                      Evaluasi Rasio Udara-BBM
                    </div>
                  </div>
                  <div className="mt-3">
                    <div
                      className={cn(
                        "num text-lg sm:text-xl font-bold uppercase",
                        mixtureTone === "emerald"
                          ? "text-emerald"
                          : mixtureTone === "amber"
                            ? "text-amber"
                            : "text-muted-foreground",
                      )}
                    >
                      {mixtureStatus}
                    </div>
                    <div className="mt-1.5 num text-[11px] text-muted-foreground">{mixtureSub}</div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 03: ELECTRICAL, ECU VOLTAGE & CAN PINOUT */}
      {activeSubTab === "ELECTRICAL" && (
        <div
          id="diag-panel-ELECTRICAL"
          role="tabpanel"
          aria-labelledby="diag-tab-ELECTRICAL"
          className="flex flex-col gap-3 flex-1 min-h-0"
        >
          {/* Top Row: 4 Electrical Parameter Cards */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4 shrink-0">
            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">
                    Voltase Modul ECU
                  </span>
                  <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    PID 0142
                  </span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">
                  Pasokan Internal Chip ECU
                </div>
              </div>
              <div className="mt-3">
                <div
                  className={cn(
                    "num text-2xl sm:text-3xl font-bold",
                    sleeping || ecuV <= 0 ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {sleeping || ecuV <= 0 ? "----" : ecuV.toFixed(2)}
                  {!sleeping && ecuV > 0 && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">V</span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">
                    Jarak Sejak Reset DTC
                  </span>
                  <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    PID 0131
                  </span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">
                  {sleeping ? "Bus CAN Nonaktif Saat Standby" : "Jarak Setelah Memori DTC Bersih"}
                </div>
              </div>
              <div className="mt-3">
                <div
                  className={cn(
                    "num text-2xl sm:text-3xl font-bold",
                    sleeping ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {sleeping ? "----" : distClrKm.toLocaleString("id-ID")}
                  {!sleeping && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">km</span>
                  )}
                  {sleeping && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">CAN Off</span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">
                    Tegangan Pin 16 Baterai
                  </span>
                  <span className="num text-[11px] text-muted-foreground">
                    {ecuVoltageDelta !== null
                      ? `Drop ${ecuVoltageDelta.toFixed(2)}V`
                      : `${t.adc_raw_mv}mV · Batas ${critV.toFixed(2)}V`}
                  </span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">
                  Terminal J1962 Aki 12V
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <div
                  className={cn(
                    "num text-2xl sm:text-3xl font-bold",
                    isBatCrit ? "text-crimson" : t.v_bat < 12.3 ? "text-amber" : "text-emerald",
                  )}
                >
                  {t.v_bat.toFixed(2)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">V</span>
                </div>
                <Led tone={isBatCrit ? "crimson" : t.v_bat < 12.3 ? "amber" : "emerald"} />
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">
                    Kompensasi Suhu 25°C
                  </span>
                  <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    RTC DS3231
                  </span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">
                  Faktor {thermalPred.thermalFactor.toFixed(2)}x @ {t.rtc_temp_c.toFixed(1)}°C
                </div>
              </div>
              <div className="mt-3">
                <div className="num text-2xl sm:text-3xl font-bold text-foreground">
                  {thermalPred.compensatedV25.toFixed(2)}V
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({thermalPred.tempCompensatedSocPct}% SoC)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Responsive Hardware Pinout Matrix (Mobile Cards + Desktop Table) */}
          <Panel
            title="Matriks Pinout Hardware OBD-II & Jalur Sinyal J1962 (SOP D.1)"
            code="WIRING"
            right={
              <div className="flex items-center gap-2 num text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "font-semibold uppercase",
                    t.can_ok === false ? "text-crimson" : "text-emerald",
                  )}
                >
                  {t.can_ok === false ? "TWAI CAN LOOPBACK FAULT" : "TWAI TRANSCEIVER 500 KBPS OK"}
                </span>
                <CircuitBoard
                  size={14}
                  strokeWidth={1.5}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            }
            className="flex-1 min-h-0"
          >
            {/* Mobile Card Stack (< md): eliminates horizontal scroll leak */}
            <div className="space-y-2.5 md:hidden">
              {wiringRows.map((w) => (
                <div
                  key={w.id}
                  className="rounded-[2px] border border-border bg-card/60 p-3 space-y-1.5 num text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground">{w.wire}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                        w.liveStatus === "FAULT"
                          ? "border-crimson/50 bg-crimson/10 text-crimson"
                          : w.liveStatus === "WARN"
                            ? "border-amber/50 bg-amber/10 text-amber"
                            : "border-emerald/50 bg-emerald/10 text-emerald",
                      )}
                    >
                      <Led
                        tone={
                          w.liveStatus === "FAULT"
                            ? "crimson"
                            : w.liveStatus === "WARN"
                              ? "amber"
                              : "emerald"
                        }
                      />
                      {w.statusLabel}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{w.path}</div>
                  <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-1.5">
                    <span className="text-[11px] text-muted-foreground">{w.signal}</span>
                    <span className="font-semibold text-foreground">{w.liveReading}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop & Tablet Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left num text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 px-3 font-medium">Jalur Kabel</th>
                    <th className="py-2.5 px-3 font-medium">Pinout &amp; Rangkaian</th>
                    <th className="py-2.5 px-3 font-medium">Fungsi Sinyal</th>
                    <th className="py-2.5 px-3 font-medium">Pembacaan / Referensi</th>
                    <th className="py-2.5 px-3 text-right font-medium">Status Sirkuit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {wiringRows.map((w) => {
                    const badgeTone =
                      w.liveStatus === "FAULT"
                        ? "crimson"
                        : w.liveStatus === "WARN"
                          ? "amber"
                          : w.statusLabel === "SLEEP" || w.statusLabel === "STANDBY"
                            ? "dim"
                            : "emerald";

                    return (
                      <tr key={w.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-3 px-3 font-bold text-foreground whitespace-nowrap">
                          {w.wire}
                        </td>
                        <td className="py-3 px-3 text-foreground/90 font-medium">{w.path}</td>
                        <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                          {w.signal}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{w.liveReading}</span>
                            <span className="rounded-[2px] border border-border bg-secondary/50 px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground">
                              {w.sourceKind === "SENSOR" ? "Sensor" : "Referensi"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                              badgeTone === "emerald"
                                ? "border-emerald/50 bg-emerald/10 text-emerald"
                                : badgeTone === "crimson"
                                  ? "border-crimson/50 bg-crimson/10 text-crimson"
                                  : badgeTone === "amber"
                                    ? "border-amber/50 bg-amber/10 text-amber"
                                    : "border-border bg-secondary/50 text-foreground",
                            )}
                          >
                            <Led tone={badgeTone} />
                            {w.statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
