import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, CircuitBoard, Fuel, Lock, Search, ShieldCheck, X, Zap } from "lucide-react";
import { useSpring } from "motion/react";
import { useTelemetry } from "@/context/TelemetryContext";
import { DTC_LIBRARY, WARMUP_SESSION, WIRING, voltageHistory } from "@/data/mockTelemetry";
import { computeBatteryPrediction } from "@/lib/battery-analytics";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { SPRING_GAUGE, prefersReducedMotion } from "@/lib/motion-tokens";
import { useChartIntroOnly } from "./motion-bits";
import { Led, Panel, Pill } from "./primitives";
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
  const v = useAnimated(Math.max(0, value));
  const R = 110,
    cx = 140,
    cy = 140,
    start = 135,
    sweep = 270;
  const ang = (x: number) => ((start + (x / max) * sweep) * Math.PI) / 180;
  const pt = (x: number, r: number) => [cx + Math.cos(ang(x)) * r, cy + Math.sin(ang(x)) * r];
  const arc = (a: number, b: number, r: number) => {
    const [x1, y1] = pt(a, r);
    const [x2, y2] = pt(b, r);
    const large = ((b - a) / max) * sweep > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const ticks = Array.from({ length: 41 }, (_, i) => (i / 40) * max);
  const [nx, ny] = pt(v, R - 18);
  return (
    <div className="engine-gauge flex flex-col items-center">
      <svg viewBox="0 0 280 250" className="w-full max-w-[220px] sm:max-w-[260px]">
        <path d={arc(0, max, R)} stroke="#1E222B" strokeWidth="10" fill="none" />
        <path d={arc(redline, max, R)} stroke="#E60012" strokeWidth="10" fill="none" opacity="0.6" />
        {v > 0.5 && (
          <path
            d={arc(0, Math.min(v, max), R)}
            stroke={color}
            strokeWidth="10"
            fill="none"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        )}
        {ticks.map((x, i) => {
          const [a1, b1] = pt(x, R - 12);
          const [a2, b2] = pt(x, R - (i % 5 === 0 ? 24 : 17));
          return (
            <line
              key={i}
              x1={a1}
              y1={b1}
              x2={a2}
              y2={b2}
              stroke={x >= redline ? "#E60012" : "#64748B"}
              strokeWidth={i % 5 === 0 ? 1.5 : 1}
            />
          );
        })}
        {ticks
          .filter((_, i) => i % 10 === 0)
          .map((x) => {
            const [a, b] = pt(x, R - 38);
            return (
              <text
                key={x}
                x={a}
                y={b}
                fill="#94A3B8"
                fontSize="10"
                fontFamily="JetBrains Mono"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {Math.round(x)}
              </text>
            );
          })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2" />
        <circle cx={cx} cy={cy} r="6" fill="#0F1116" stroke={color} />
        <text x={cx} y={cy + 52} fill="#F2EFE9" fontSize="30" fontFamily="JetBrains Mono" textAnchor="middle">
          {value < 0 ? "----" : Math.round(value)}
        </text>
        <text x={cx} y={cy + 72} fill="#94A3B8" fontSize="10.5" fontFamily="JetBrains Mono" textAnchor="middle">
          {unit}
        </text>
      </svg>
      <div className="-mt-1 text-center sm:-mt-2">
        <div className="label-hmi text-foreground">{label}</div>
        <div className="num text-[10px] text-muted-foreground">{pid}</div>
      </div>
    </div>
  );
}

type DiagSubTab = "POWERTRAIN" | "EMISSIONS" | "ELECTRICAL";

export function DiagnosticsModule() {
  const { selected, units, selectUnit, configs, history, dataSource } = useTelemetry();
  const [activeSubTab, setActiveSubTab] = useState<DiagSubTab>("POWERTRAIN");
  const [nodeFilter, setNodeFilter] = useState("");
  const chartIntro = useChartIntroOnly();
  const t = selected.telemetry;
  const hasDtc = t.dtc !== "NONE";
  const dtc = hasDtc ? DTC_LIBRARY[t.dtc] : null;
  const sleeping = !t.engine_on;
  const critV = configs[selected.unit_id]?.crit_v ?? 11.80;
  const unitHist =
    dataSource === "LIVE_API" && history[selected.unit_id] && history[selected.unit_id]!.length >= 2
      ? history[selected.unit_id]!
      : voltageHistory(t.v_bat, t.engine_on);
  const thermalPred = computeBatteryPrediction(unitHist, t.v_bat, critV, t.engine_on, t.rtc_temp_c);

  const filteredUnits = useMemo(
    () => units.filter((u) => matchesFleetSearch(u, nodeFilter)),
    [units, nodeFilter],
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

  const powertrainMetrics = [
    {
      label: "Vehicle Speed",
      pid: "010D",
      val: sleeping ? "----" : `${speedKmh}`,
      unit: sleeping ? "" : "km/h",
      barPct: sleeping ? 0 : Math.min(100, (speedKmh / 160) * 100),
      barTone: "bg-foreground/60",
    },
    {
      label: "Intake Air Temp",
      pid: "010F",
      val: sleeping ? "----" : `${iatC}`,
      unit: sleeping ? "" : "°C",
    },
    {
      label: "Manifold Press",
      pid: "010B",
      val: sleeping ? "----" : `${mapKpa}`,
      unit: sleeping ? "" : "kPa",
    },
    {
      label: "Engine Load",
      pid: "0104",
      val: sleeping ? "----" : loadPct.toFixed(1),
      unit: sleeping ? "" : "%",
      barPct: sleeping ? 0 : Math.min(100, Math.max(0, loadPct)),
      barTone: loadPct > 80 ? "bg-amber" : "bg-emerald",
    },
    {
      label: "Throttle Pos",
      pid: "0111",
      val: sleeping ? "----" : tpsPct.toFixed(1),
      unit: sleeping ? "" : "%",
      barPct: sleeping ? 0 : Math.min(100, Math.max(0, tpsPct)),
      barTone: "bg-foreground/60",
    },
    {
      label: "Ignition Timing",
      pid: "010E",
      val: sleeping ? "----" : `${ignDeg >= 0 ? "+" : ""}${ignDeg.toFixed(1)}`,
      unit: sleeping ? "" : "°",
    },
    {
      label: "Mass Air Flow",
      pid: "0110",
      val: sleeping ? "----" : mafGs.toFixed(2),
      unit: sleeping ? "" : "g/s",
    },
    {
      label: "Engine Run Time",
      pid: "011F",
      val: sleeping ? "----" : `${runTimeS}`,
      unit: sleeping ? "" : "s",
    },
  ];

  return (
    <div className="module-diagnostics flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Sticky Single-Row Target Node Selector Bar (shrink-0) */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[2px] border border-border bg-card/75 px-3 py-2">
        <span className="label-hmi mr-1 shrink-0">Target Node</span>
        {units.length > 3 && (
          <div className="relative w-44 sm:w-52 shrink-0">
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
              placeholder="Filter Bay / DTC..."
              aria-label="Filter target diagnostic node"
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-8 py-1.5 num text-[11px] text-foreground outline-none placeholder:text-dim focus:border-foreground/60"
            />
            {nodeFilter && (
              <button
                type="button"
                onClick={() => setNodeFilter("")}
                aria-label="Clear node filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X size={13} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <div className="card-scroll flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          {filteredUnits.map((u) => (
            <div key={u.unit_id} className="shrink-0">
              <Pill
                active={u.unit_id === selected.unit_id}
                onClick={() => selectUnit(u.unit_id)}
                tone={u.telemetry.dtc_cnt > 0 ? "crimson" : "dim"}
              >
                {u.bay} ({u.model}) {u.telemetry.dtc_cnt > 0 ? `[${u.telemetry.dtc}]` : ""}
              </Pill>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Menu Navigation Bar (Segmented Control: 3 Tab Diagnostik OBD-II) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 rounded-[2px] border border-border bg-card/90 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5 num text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab("POWERTRAIN")}
            className={cn(
              "flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeSubTab === "POWERTRAIN"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
            )}
          >
            <Activity size={14} className={activeSubTab === "POWERTRAIN" ? "text-emerald" : "text-muted-foreground"} />
            <span>01. Instrumen &amp; Powertrain Mesin</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("EMISSIONS")}
            className={cn(
              "flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeSubTab === "EMISSIONS"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
            )}
          >
            <Fuel size={14} className={activeSubTab === "EMISSIONS" ? (milActive ? "text-crimson" : "text-emerald") : "text-muted-foreground"} />
            <span>02. Emisi, Bahan Bakar &amp; DTC {hasDtc ? `[${t.dtc}]` : ""}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("ELECTRICAL")}
            className={cn(
              "flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeSubTab === "ELECTRICAL"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
            )}
          >
            <Zap size={14} className={activeSubTab === "ELECTRICAL" ? "text-amber" : "text-muted-foreground"} />
            <span>03. Kelistrikan &amp; Pinout CAN ({t.v_bat.toFixed(2)}V)</span>
          </button>
        </div>

        <div className="flex items-center gap-3 num text-[11px] text-muted-foreground">
          <span className="hidden sm:inline">ECU Stream:</span>
          <span className={cn("font-semibold uppercase flex items-center gap-1.5", sleeping ? "text-muted-foreground" : "text-emerald")}>
            <Led tone={sleeping ? "dim" : "emerald"} pulse={!sleeping} />
            {sleeping ? "STANDBY / KEY OFF" : "LIVE CAN BUS ACTIVE"}
          </span>
        </div>
      </div>

      {/* SUB-TAB 01: POWERTRAIN & INSTRUMENTS */}
      {activeSubTab === "POWERTRAIN" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Row 1: Dual Analog Gauges + Dual Axis LineChart */}
          <div className="diagnostics-instruments grid shrink-0 gap-3 [&>*]:min-w-0 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr] lg:h-[285px]">
            <Panel title="Engine Speed" code="010C">
              <Gauge
                value={!t.engine_on || t.rpm <= 0 ? -1 : t.rpm}
                max={4000}
                redline={3400}
                label="Engine RPM"
                pid="Mode 01, PID 010C"
                unit="RPM"
                color="#10B981"
              />
            </Panel>
            <Panel title="Coolant Temp" code="0105">
              <Gauge
                value={!t.engine_on || t.temp_c <= 0 ? -1 : t.temp_c}
                max={120}
                redline={105}
                label="Coolant Temp"
                pid="Mode 01, PID 0105"
                unit="°C"
                color="#F59E0B"
              />
            </Panel>
            <Panel title="Warm-Up Session (Dual Axis)" code="HIST" className="lg:col-span-2 xl:col-span-1">
              <div className="session-chart h-[190px] sm:h-[210px] lg:h-full">
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
                      isAnimationActive={chartIntro}
                    />
                    <Line
                      yAxisId="t"
                      type="monotone"
                      dataKey="temp"
                      stroke="#F59E0B"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={chartIntro}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          {/* Row 2: 8 Parameter Powertrain Telemetry Cards (Large, crisp, high contrast) */}
          <Panel
            title="8 Parameter Powertrain Telemetry (Mode 01 Read-Only)"
            code="PWR"
            right={
              <div className="flex items-center gap-2">
                <span className={cn("num text-[10.5px] font-semibold uppercase", sleeping ? "text-muted-foreground" : "text-emerald")}>
                  {sleeping ? "ENGINE OFF (----)" : "LIVE CAN BUS STREAM"}
                </span>
                <span className="num inline-flex items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Lock size={10} strokeWidth={2} />
                  100% READ-ONLY
                </span>
              </div>
            }
            className="flex-1 min-h-0"
          >
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              {powertrainMetrics.map((m) => (
                <div
                  key={m.pid}
                  className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between hover:border-foreground/30 transition-colors min-h-[115px]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="label-hmi text-xs text-foreground font-semibold tracking-wider truncate">{m.label}</span>
                      <span className="num shrink-0 rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                        PID {m.pid}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className={cn("num text-2xl sm:text-3xl font-bold leading-none tracking-tight", sleeping ? "text-muted-foreground" : "text-foreground")}>
                      {m.val}
                      {m.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{m.unit}</span>}
                    </div>
                    {typeof m.barPct === "number" && (
                      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-[2px] bg-muted/70">
                        <div className={cn("h-full transition-all duration-300", m.barTone)} style={{ width: `${m.barPct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 02: EMISSIONS, FUEL & DTC */}
      {activeSubTab === "EMISSIONS" && (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.1fr_1.35fr]">
          {/* Left Column: Read-Only DTC Fault Monitor (Mode 03 / Mode 07) */}
          <Panel
            title="Read-Only DTC Monitor & Fault Diagnostics (Mode 03 / 07)"
            code="03/07"
            right={
              <div className="flex items-center gap-2">
                <span className="num inline-flex items-center gap-1 rounded-[2px] border border-border bg-secondary/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Lock size={10} strokeWidth={2} />
                  100% READ-ONLY
                </span>
                <Led tone={hasDtc || milActive ? "crimson" : "emerald"} pulse={hasDtc || milActive} />
              </div>
            }
          >
            <div className="space-y-4">
              {/* Primary DTC Status Box */}
              <div className={cn("rounded-[2px] border p-4", hasDtc ? "border-crimson/60 bg-crimson/5" : "border-emerald/40 bg-emerald/5")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {hasDtc ? (
                      <AlertTriangle className="h-6 w-6 shrink-0 text-crimson" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-6 w-6 shrink-0 text-emerald" strokeWidth={1.75} aria-hidden="true" />
                    )}
                    <div>
                      <div className={cn("num text-xl font-bold tracking-tight", hasDtc ? "text-crimson" : "text-emerald")}>
                        {t.dtc_cnt} DTC Terdeteksi ({hasDtc ? t.dtc : "System Nominal"})
                      </div>
                      <div className="num text-xs text-muted-foreground mt-0.5">
                        Protokol ISO 15031-6 Mode 03 Passive Polling
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
                    {milActive ? "MIL ON (WARNING)" : "MIL OFF (READY)"}
                  </span>
                </div>

                {dtc ? (
                  <div className="mt-4 space-y-2 border-t border-border/70 pt-3">
                    <div className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">{dtc.title}</div>
                    <div className="label-hmi text-xs text-muted-foreground">{dtc.system}</div>
                    <p className="num text-xs leading-relaxed text-foreground/90">{dtc.detail}</p>
                    <div className="num text-[11px] text-muted-foreground pt-1">
                      Mode 03 Response Frame: <strong className="text-foreground">{t.dtc}</strong> (CAN Arbitration ID: 0x7E8)
                    </div>
                  </div>
                ) : hasDtc ? (
                  <div className="mt-3 num text-xs text-muted-foreground">
                    Kode kerusakan tersimpan <span className="font-bold text-crimson">{t.dtc}</span> dilaporkan melalui pembacaan pasif Mode 03.
                  </div>
                ) : (
                  <div className="mt-3 num text-xs text-muted-foreground leading-relaxed">
                    Tidak ada kode kerusakan mesin tersimpan pada memori ECU (P0000). Seluruh sensor emisi dan aktuator dalam kondisi nominal.
                  </div>
                )}
              </div>

              {/* Mode 07 Pending Codes Status */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="label-hmi text-xs text-foreground font-semibold">Mode 07: Pending Diagnostic Trouble Codes</span>
                  <span className="num text-[11px] text-emerald font-semibold uppercase">0 PENDING FAULT</span>
                </div>
                <p className="num text-xs leading-relaxed text-muted-foreground">
                  Mode 07 memantau kode kerusakan yang terdeteksi selama siklus pengoperasian mesin saat ini sebelum ambang batas Check Engine MIL diaktifkan.
                </p>
              </div>

              {/* Strict ECU Write Lock Notice */}
              <div className="flex items-start gap-3 rounded-[2px] border border-border bg-secondary/30 p-3.5 num text-xs text-muted-foreground">
                <Lock size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="leading-relaxed">
                  <strong className="text-foreground block mb-0.5">KEBIJAKAN 100% READ-ONLY (STRICT_MODE_01_03_07_ONLY)</strong>
                  Perintah OBD-II Mode 04 (Clear Diagnostic Trouble Codes / Reset ECU Memory) dinonaktifkan secara permanen pada level firmware ESP32 TWAI driver dan HMI untuk mencegah penghapusan histori emisi unit stok yard tanpa otorisasi.
                </div>
              </div>
            </div>
          </Panel>

          {/* Right Column: Fuel & Emission Readiness (Mode 01 Read-Only) */}
          <Panel
            title="Sistem Bahan Bakar & Kesiapan Emisi (Mode 01 Read-Only)"
            code="FUEL"
            right={
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "num inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    milActive
                      ? "border-crimson/60 bg-crimson/15 text-crimson"
                      : "border-emerald/40 bg-emerald/10 text-emerald",
                  )}
                >
                  <Led tone={milActive ? "crimson" : "emerald"} pulse={milActive} />
                  {milActive ? "MIL ON (CHECK ENGINE)" : "EMISI NOMINAL"}
                </span>
                <Fuel size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
              </div>
            }
          >
            <div className="space-y-4">
              {/* Fuel Tank Level (PID 012F) */}
              <div className="rounded-[2px] border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="label-hmi text-xs text-foreground font-semibold tracking-wider">Level Tangki Bahan Bakar (Fuel Tank)</div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">Mode 01, PID 012F (Kapasitas Tangki 68L)</div>
                  </div>
                  <div className={cn("num text-3xl font-bold tracking-tight", fuelPct > 0 && fuelPct < 20 ? "text-amber" : "text-foreground")}>
                    {fuelPct.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="mt-3.5 h-3 w-full overflow-hidden rounded-[2px] bg-muted/80">
                  <div
                    className={cn("h-full transition-all duration-300", fuelPct < 20 ? "bg-amber" : "bg-emerald")}
                    style={{ width: `${Math.min(100, Math.max(0, fuelPct))}%` }}
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between num text-xs text-muted-foreground">
                  <span>Estimasi Volume: <strong className="text-foreground">{((fuelPct / 100) * 68).toFixed(1)} Liter</strong></span>
                  <span>Ambang Minimal Yard: <strong>15.0%</strong></span>
                </div>
              </div>

              {/* 4 Large Emission Cards */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[115px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">Konsumsi BBM (Rate)</span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">PID 015E</span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">Real-time Fuel Rate / MAF</div>
                  </div>
                  <div className="mt-3">
                    <div className="num text-2xl sm:text-3xl font-bold text-foreground">
                      {sleeping ? "----" : fuelRateLh.toFixed(2)}
                      {!sleeping && <span className="ml-1 text-sm font-normal text-muted-foreground">L/h</span>}
                    </div>
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[115px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">O2 Sensor (Bank 1)</span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">PID 0114</span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">Upstream Lambda 0.1V - 0.9V</div>
                  </div>
                  <div className="mt-3">
                    <div className="num text-2xl sm:text-3xl font-bold text-foreground">
                      {sleeping ? "----" : o2V.toFixed(2)}
                      {!sleeping && <span className="ml-1 text-sm font-normal text-muted-foreground">V</span>}
                    </div>
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[115px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">Short-Term Fuel Trim</span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">PID 0106</span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">Koreksi Injeksi Closed-Loop</div>
                  </div>
                  <div className="mt-3">
                    <div className={cn("num text-2xl sm:text-3xl font-bold", !sleeping && Math.abs(stftPct) > 10 ? "text-amber" : "text-foreground")}>
                      {sleeping ? "----" : `${stftPct > 0 ? "+" : ""}${stftPct.toFixed(1)}`}
                      {!sleeping && <span className="ml-1 text-sm font-normal text-muted-foreground">%</span>}
                    </div>
                  </div>
                </div>

                <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[115px]">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="label-hmi text-xs text-foreground font-semibold">Check Engine Lamp</span>
                      <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">PID 0101 A7</span>
                    </div>
                    <div className="num text-[11px] text-muted-foreground mt-0.5">Malfunction Indicator Status</div>
                  </div>
                  <div className="mt-3">
                    <div className={cn("num text-xl sm:text-2xl font-bold uppercase", milActive ? "text-crimson" : "text-emerald")}>
                      {milActive ? "MIL ACTIVE" : "NOMINAL"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 03: ELECTRICAL, ECU VOLTAGE & CAN PINOUT */}
      {activeSubTab === "ELECTRICAL" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Top Row: 4 Large Electrical Parameter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 shrink-0">
            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">Voltase Modul ECU</span>
                  <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">PID 0142</span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">Pasokan Internal Chip ECU</div>
              </div>
              <div className="mt-3">
                <div className="num text-2xl sm:text-3xl font-bold text-foreground">
                  {sleeping || ecuV <= 0 ? "----" : ecuV.toFixed(2)}
                  {!sleeping && ecuV > 0 && <span className="ml-1 text-sm font-normal text-muted-foreground">V</span>}
                </div>
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">Jarak Tempuh Sejak Reset</span>
                  <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">PID 0131</span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">Jarak Setelah DTC Dihapus</div>
              </div>
              <div className="mt-3">
                <div className="num text-2xl sm:text-3xl font-bold text-foreground">
                  {distClrKm.toLocaleString("id-ID")}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">km</span>
                </div>
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">Tegangan Pin 16 Baterai</span>
                  <span className="num text-[11px] text-muted-foreground">
                    {ecuVoltageDelta !== null ? `Δ ${ecuVoltageDelta.toFixed(2)}V Drop` : `${t.adc_raw_mv}mV ADC`}
                  </span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">Terminal J1962 Aki 12V</div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <div className={cn("num text-2xl sm:text-3xl font-bold", t.crit_alert ? "text-crimson" : t.v_bat < 12.3 ? "text-amber" : "text-emerald")}>
                  {t.v_bat.toFixed(2)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">V</span>
                </div>
                <Led tone={t.crit_alert ? "crimson" : t.v_bat < 12.3 ? "amber" : "emerald"} />
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-card/60 p-4 flex flex-col justify-between min-h-[120px]">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="label-hmi text-xs text-foreground font-semibold">Kompensasi Suhu 25°C</span>
                  <span className="num rounded-[2px] bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">RTC DS3231</span>
                </div>
                <div className="num text-[11px] text-muted-foreground mt-0.5">
                  Faktor {thermalPred.thermalFactor.toFixed(2)}x @ {t.rtc_temp_c.toFixed(1)}°C
                </div>
              </div>
              <div className="mt-3">
                <div className="num text-2xl sm:text-3xl font-bold text-foreground">
                  {thermalPred.compensatedV25.toFixed(2)}V
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">({thermalPred.tempCompensatedSocPct}% SoC)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Hardware Pinout Matrix Table */}
          <Panel
            title="Matriks Pinout Hardware OBD-II & Jalur Sinyal J1962 (SOP D.1)"
            code="WIRING"
            right={
              <div className="flex items-center gap-2 num text-[11px] text-muted-foreground">
                <span className={cn("font-semibold uppercase", t.can_ok === false ? "text-crimson" : "text-emerald")}>
                  {t.can_ok === false ? "TWAI CAN LOOPBACK FAULT" : "TWAI TRANSCEIVER 500 KBPS OK"}
                </span>
                <CircuitBoard size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
              </div>
            }
            className="flex-1 min-h-0"
          >
            <div className="space-y-2">
              <table className="w-full border-collapse text-left num text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 px-3 font-medium">Wire ID</th>
                    <th className="py-2.5 px-3 font-medium">Signal Path &amp; Pinout</th>
                    <th className="py-2.5 px-3 font-medium">Function Description</th>
                    <th className="py-2.5 px-3 font-medium">Real-Time Reading</th>
                    <th className="py-2.5 px-3 text-right font-medium">Circuit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {WIRING.map((w) => {
                    const gated = sleeping && (w.id === "W-04" || w.id === "W-06" || w.id === "W-07");
                    let liveReading = w.reading;
                    let liveStatus: "OK" | "WARN" | "FAULT" = w.status;

                    if (w.id === "W-01") {
                      liveReading = `${t.v_bat.toFixed(2)} V`;
                      liveStatus = t.crit_alert ? "WARN" : "OK";
                    } else if (w.id === "W-04") {
                      liveReading = sleeping ? "0.00 V (OFF / MOSFET GATED)" : "PULSED 40ms ACTIVE";
                    } else if (w.id === "W-05") {
                      liveReading = `${t.adc_raw_mv} mV`;
                    } else if (w.id === "W-06") {
                      liveReading = t.engine_on ? "ACTIVE / 3.3V REGULATED" : "GATED 0V (SLEEP)";
                    } else if (w.id === "W-07") {
                      liveReading = t.can_ok === false ? "CAN BUS ERR / LOOPBACK" : "500 kbps (TWAI HIGH-SPEED)";
                      liveStatus = t.can_ok === false ? "FAULT" : "OK";
                    } else if (w.id === "W-08") {
                      liveReading = `${t.rtc_temp_c.toFixed(2)} °C`;
                    }

                    const statusTone =
                      liveStatus === "FAULT"
                        ? "crimson"
                        : liveStatus === "WARN"
                          ? "amber"
                          : gated
                            ? "dim"
                            : "emerald";

                    return (
                      <tr key={w.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-3 px-3 font-bold text-foreground">{w.wire}</td>
                        <td className="py-3 px-3 text-foreground/90 font-medium">{w.path}</td>
                        <td className="py-3 px-3 text-muted-foreground">{w.signal}</td>
                        <td className="py-3 px-3 font-semibold text-foreground">{liveReading}</td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                              statusTone === "emerald"
                                ? "border-emerald/50 bg-emerald/10 text-emerald"
                                : statusTone === "crimson"
                                  ? "border-crimson/50 bg-crimson/10 text-crimson"
                                  : statusTone === "amber"
                                    ? "border-amber/50 bg-amber/10 text-amber"
                                    : "border-border bg-secondary/50 text-muted-foreground",
                            )}
                          >
                            <Led tone={statusTone} />
                            {liveStatus !== "OK" ? liveStatus : gated ? "SLEEP" : liveStatus}
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
