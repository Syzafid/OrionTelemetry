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
        <div className="num text-[10px] text-crimson">{pid}</div>
      </div>
    </div>
  );
}

export function DiagnosticsModule() {
  const { selected, units, selectUnit, injectDtc, configs, history, dataSource } = useTelemetry();
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
      barTone: "bg-cyan",
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
      barTone: "bg-cyan",
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
      <div className="panel flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
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
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-8 py-1.5 num text-[11px] text-foreground outline-none placeholder:text-dim focus:border-cyan"
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
                tone={u.telemetry.dtc_cnt > 0 ? "crimson" : "cyan"}
              >
                {u.bay} ({u.model}) {u.telemetry.dtc_cnt > 0 ? `[${u.telemetry.dtc}]` : ""}
              </Pill>
            </div>
          ))}
        </div>
      </div>

      <div className="diagnostics-instruments grid min-h-0 flex-1 gap-3 [&>*]:min-w-0 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr]">
        <Panel title="Engine Speed" code="010C">
          <Gauge value={!t.engine_on || t.rpm <= 0 ? -1 : t.rpm} max={4000} redline={3400} label="Engine RPM" pid="Mode 01, PID 010C" unit="RPM" color="#10B981" />
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
          <div className="session-chart h-[200px] sm:h-[220px] lg:h-full">
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

      <div className="diagnostics-details grid min-h-0 flex-1 gap-3 [&>*]:min-w-0 lg:grid-cols-[1fr_1.6fr]">
        {/* Left Column: Panel 3 (Read-Only DTC Monitor) + Panel 2 (Fuel & Emission Readiness) */}
        <div className="grid min-h-0 gap-3 [&>*]:min-w-0 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel
            title="Read-Only DTC Monitor (Mode 03 / 07)"
            code="03"
            right={
              <div className="flex items-center gap-2">
                <span className="num inline-flex items-center gap-1 rounded-[2px] border border-cyan/40 bg-cyan/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-cyan">
                  <Lock size={10} strokeWidth={2} aria-hidden="true" />
                  100% READ-ONLY
                </span>
                <Led tone={hasDtc || milActive ? "crimson" : "emerald"} pulse={hasDtc || milActive} />
              </div>
            }
          >
            <div className={cn("border p-3", hasDtc ? "border-crimson/60 bg-crimson/5" : "border-emerald/40 bg-emerald/5")}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {hasDtc ? (
                    <AlertTriangle className="shrink-0 text-crimson" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="shrink-0 text-emerald" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <div className={cn("num text-base font-medium", hasDtc ? "text-crimson" : "text-emerald")}>
                    {t.dtc_cnt} DTC ({hasDtc ? t.dtc : "System Nominal"})
                  </div>
                </div>
                <span
                  className={cn(
                    "num rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold uppercase",
                    milActive
                      ? "border-crimson/60 bg-crimson/15 text-crimson"
                      : "border-emerald/40 bg-emerald/10 text-emerald",
                  )}
                >
                  {milActive ? "MIL ON" : "MIL OFF"}
                </span>
              </div>
              {dtc ? (
                <div className="mt-2.5 space-y-1">
                  <div className="font-display text-xs uppercase tracking-widest text-foreground">{dtc.title}</div>
                  <div className="label-hmi text-[10px]">{dtc.system}</div>
                  <p className="num text-[11px] leading-relaxed text-muted-foreground">{dtc.detail}</p>
                  <div className="num text-[10px] text-muted-foreground">MODE 03 READ: {t.dtc} (Frame 0x7E8)</div>
                </div>
              ) : hasDtc ? (
                <div className="mt-2 num text-[11px] text-muted-foreground">
                  Stored fault code <span className="font-semibold text-crimson">{t.dtc}</span> reported via passive OBD-II Mode 03/07 poll.
                </div>
              ) : null}
            </div>

            <div className="mt-2.5 flex items-start gap-2 rounded-[2px] border border-cyan/35 bg-cyan/5 px-2.5 py-2 num text-[10px] text-cyan">
              <Lock size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                ECU WRITE LOCK: 100% READ-ONLY POLICY (Mode 01 / 03 / 07 only — OBD-II Mode 04 write/clear disabled by firmware &amp; HMI).
              </span>
            </div>

            {dataSource === "SIMULATOR" && (
              <button
                onClick={() => injectDtc(selected.unit_id, hasDtc ? null : "P0102")}
                type="button"
                className="mt-2.5 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-[2px] border border-border px-3 py-2 num text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {hasDtc ? "Restore Nominal Sandbox Preview (Sim)" : "Simulate Mode 03 Fault (P0102)"}
              </button>
            )}
          </Panel>

          <Panel
            title="Fuel & Emission Readiness (Mode 01 Read-Only)"
            code="FUEL"
            right={
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "num inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                    milActive
                      ? "border-crimson/60 bg-crimson/15 text-crimson"
                      : "border-emerald/40 bg-emerald/10 text-emerald",
                  )}
                >
                  <Led tone={milActive ? "crimson" : "emerald"} pulse={milActive} />
                  {milActive ? "MIL ON (CHECK ENGINE)" : "MIL OFF (READY)"}
                </span>
                <Fuel size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 rounded-[2px] border border-border bg-background/50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="label-hmi text-[10px]">Fuel Tank Level</div>
                    <div className="num text-[9.5px] text-crimson">Mode 01, PID 012F</div>
                  </div>
                  <div className={cn("num text-lg font-semibold", fuelPct > 0 && fuelPct < 20 ? "text-amber" : "text-foreground")}>
                    {fuelPct.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-[1px] bg-muted">
                  <div
                    className={cn("h-full transition-all duration-300", fuelPct < 20 ? "bg-amber" : "bg-emerald")}
                    style={{ width: `${Math.min(100, Math.max(0, fuelPct))}%` }}
                  />
                </div>
              </div>

              <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                <div className="label-hmi text-[10px]">Fuel Rate</div>
                <div className="num text-[9.5px] text-crimson">PID 015E / MAF</div>
                <div className="num mt-1 text-base font-medium text-foreground">
                  {sleeping ? "----" : fuelRateLh.toFixed(2)}
                  {!sleeping && <span className="ml-1 text-[10.5px] text-muted-foreground">L/h</span>}
                </div>
              </div>

              <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                <div className="label-hmi text-[10px]">O2 Sensor (B1S1)</div>
                <div className="num text-[9.5px] text-crimson">PID 0114</div>
                <div className="num mt-1 text-base font-medium text-foreground">
                  {sleeping ? "----" : o2V.toFixed(2)}
                  {!sleeping && <span className="ml-1 text-[10.5px] text-muted-foreground">V</span>}
                </div>
              </div>

              <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                <div className="label-hmi text-[10px]">Short Term Trim</div>
                <div className="num text-[9.5px] text-crimson">PID 0106</div>
                <div className={cn("num mt-1 text-base font-medium", !sleeping && Math.abs(stftPct) > 10 ? "text-amber" : "text-foreground")}>
                  {sleeping ? "----" : `${stftPct > 0 ? "+" : ""}${stftPct.toFixed(1)}`}
                  {!sleeping && <span className="ml-1 text-[10.5px] text-muted-foreground">%</span>}
                </div>
              </div>

              <div className="rounded-[2px] border border-border bg-background/40 p-2.5">
                <div className="label-hmi text-[10px]">Check Engine MIL</div>
                <div className="num text-[9.5px] text-crimson">PID 0101 Bit A7</div>
                <div className={cn("num mt-1 text-sm font-semibold", milActive ? "text-crimson" : "text-emerald")}>
                  {milActive ? "MIL ACTIVE" : "NOMINAL"}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right Column: Panel 1 (Powertrain Telemetry) + Panel 4 (Electrical, Distance & CAN Harness) */}
        <div className="grid min-h-0 gap-3 [&>*]:min-w-0 lg:grid-rows-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <Panel
            title="Powertrain Telemetry (Mode 01 Read-Only)"
            code="PWR"
            right={
              <div className="flex items-center gap-2">
                <span className={cn("num text-[10px] font-semibold uppercase", sleeping ? "text-cyan" : "text-emerald")}>
                  {sleeping ? "ENGINE OFF (----)" : "LIVE ECU STREAM"}
                </span>
                <Activity size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {powertrainMetrics.map((m) => (
                <div key={m.pid} className="rounded-[2px] border border-border bg-background/45 p-2.5 flex flex-col justify-between">
                  <div>
                    <div className="label-hmi text-[10px]">{m.label}</div>
                    <div className="num text-[9.5px] text-crimson">PID {m.pid}</div>
                  </div>
                  <div className="mt-2">
                    <div className={cn("num text-lg leading-none font-medium", sleeping ? "text-muted-foreground" : "text-foreground")}>
                      {m.val}
                      {m.unit && <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">{m.unit}</span>}
                    </div>
                    {typeof m.barPct === "number" && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-[1px] bg-muted">
                        <div className={cn("h-full transition-all duration-300", m.barTone)} style={{ width: `${m.barPct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Electrical, Distance & CAN Harness (Mode 01 & HW)"
            code="ELEC"
            right={
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="num text-[10px] text-cyan">{t.can_ok === false ? "TWAI FAULT" : "TWAI 500 kbps"}</span>
                <Zap size={14} strokeWidth={1.5} className="text-amber" aria-hidden="true" />
                <CircuitBoard size={14} strokeWidth={1.5} aria-hidden="true" />
              </div>
            }
          >
            {/* Electrical & Distance Top Strip */}
            <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-[2px] border border-border bg-background/50 p-2.5">
                <div className="label-hmi text-[10px]">ECU Module Voltage</div>
                <div className="num text-[9.5px] text-crimson">Mode 01, PID 0142</div>
                <div className="num mt-1 text-base font-medium text-foreground">
                  {sleeping || ecuV <= 0 ? "----" : ecuV.toFixed(2)}
                  {!sleeping && ecuV > 0 && <span className="ml-1 text-[10.5px] text-muted-foreground">V</span>}
                </div>
              </div>

              <div className="rounded-[2px] border border-border bg-background/50 p-2.5">
                <div className="label-hmi text-[10px]">Dist Since Cleared</div>
                <div className="num text-[9.5px] text-crimson">Mode 01, PID 0131</div>
                <div className="num mt-1 text-base font-medium text-foreground">
                  {distClrKm.toLocaleString("id-ID")}
                  <span className="ml-1 text-[10.5px] text-muted-foreground">km</span>
                </div>
              </div>

              <div className="rounded-[2px] border border-border bg-background/50 p-2.5">
                <div className="label-hmi text-[10px]">Pin 16 Bat / Δ ECU</div>
                <div className="num text-[9.5px] text-muted-foreground">
                  {ecuVoltageDelta !== null ? `Δ ${ecuVoltageDelta.toFixed(2)} V drop` : `${t.adc_raw_mv} mV ADC`}
                </div>
                <div className={cn("num mt-1 text-base font-medium", t.crit_alert ? "text-crimson" : "text-emerald")}>
                  {t.v_bat.toFixed(2)}
                  <span className="ml-1 text-[10.5px] text-muted-foreground">V</span>
                </div>
              </div>

              <div className="rounded-[2px] border border-border bg-background/50 p-2.5">
                <div className="label-hmi text-[10px]">25°C Comp &amp; RTC</div>
                <div className="num text-[9.5px] text-muted-foreground">
                  {thermalPred.thermalFactor.toFixed(2)}x @ {t.rtc_temp_c.toFixed(1)}°C
                </div>
                <div className="num mt-1 text-base font-medium text-cyan">
                  {thermalPred.compensatedV25.toFixed(2)}V
                  <span className="ml-1 text-[10.5px] text-muted-foreground">({thermalPred.tempCompensatedSocPct}%)</span>
                </div>
              </div>
            </div>

            {/* Hardware Pinout Matrix */}
            <div className="relative border-t border-border pt-2.5">
              <div className="card-scroll overflow-x-auto">
                <table className="w-full min-w-[540px] text-left">
                  <thead>
                    <tr className="border-b border-border">
                      {["WIRE", "SIGNAL PATH", "FUNCTION", "READING", "STATUS"].map((h) => (
                        <th key={h} className="label-hmi py-2 pr-3 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {WIRING.map((w) => {
                      const gated = sleeping && (w.id === "W-04" || w.id === "W-06" || w.id === "W-07");
                      let liveReading = w.reading;
                      let liveStatus: "OK" | "WARN" | "FAULT" = w.status;

                      if (w.id === "W-01") {
                        liveReading = `${t.v_bat.toFixed(2)} V`;
                        liveStatus = t.crit_alert ? "WARN" : "OK";
                      } else if (w.id === "W-04") {
                        liveReading = sleeping ? "0.00 V (OFF)" : "PULSED 40ms";
                      } else if (w.id === "W-05") {
                        liveReading = `${t.adc_raw_mv} mV`;
                      } else if (w.id === "W-06") {
                        liveReading = t.engine_on ? "ACTIVE / 3.3V" : "GATED / 3.3V";
                      } else if (w.id === "W-07") {
                        liveReading = t.can_ok === false ? "LOOPBACK ERR" : "500 kbps";
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
                              ? "cyan"
                              : "emerald";

                      return (
                        <tr key={w.id} className="border-b border-border/60 align-top">
                          <td className="num py-2 pr-3 text-xs font-semibold text-crimson">{w.wire}</td>
                          <td className="num py-2 pr-3 text-[11px] text-foreground">{w.path}</td>
                          <td className="label-hmi py-2 pr-3 text-[10px]">{w.signal}</td>
                          <td className="num py-2 pr-3 text-[11px] text-muted-foreground">{liveReading}</td>
                          <td className="py-2">
                            <span className="flex items-center gap-1.5 num text-[10px]">
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
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card via-card/70 to-transparent sm:hidden" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
