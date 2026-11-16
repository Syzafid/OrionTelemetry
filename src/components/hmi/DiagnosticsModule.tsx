import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CircuitBoard, Search, ShieldCheck, X } from "lucide-react";
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
        <Panel title="Stored DTC (Mode 03)" code="03" right={<Led tone={hasDtc ? "crimson" : "emerald"} pulse={hasDtc} />}>
          <div className={cn("border p-3.5 sm:p-4", hasDtc ? "border-crimson/60 bg-crimson/5" : "border-emerald/40 bg-emerald/5")}>
            <div className="flex items-center gap-3">
              {hasDtc ? (
                <AlertTriangle className="text-crimson" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <ShieldCheck className="text-emerald" strokeWidth={1.5} aria-hidden="true" />
              )}
              <div className={cn("num text-lg font-medium", hasDtc ? "text-crimson" : "text-emerald")}>
                {t.dtc_cnt} DTC ({hasDtc ? t.dtc : "System Nominal"})
              </div>
            </div>
            {dtc && (
              <div className="mt-3 space-y-1.5">
                <div className="font-display text-sm uppercase tracking-widest">{dtc.title}</div>
                <div className="label-hmi">{dtc.system}</div>
                <p className="num text-xs leading-relaxed text-muted-foreground">{dtc.detail}</p>
                <div className="num text-[10px] text-muted-foreground">RAW: 43 01 01 15 (Frame 0x7E8)</div>
              </div>
            )}
          </div>
          <button
            onClick={() => injectDtc(selected.unit_id, hasDtc ? null : "P0115")}
            type="button"
            className="mt-3 flex min-h-[44px] w-full cursor-pointer items-center justify-center border border-border py-2.5 num text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-crimson hover:text-crimson focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {hasDtc ? "Clear Preview (Restore Nominal)" : "Inject Test Fault (P0115)"}
          </button>
          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">SN65HVD230</span>
              <span className={cn("text-right", t.can_ok === false ? "text-crimson" : "text-emerald")}>
                {t.can_ok === false ? "Loopback Fault (TWAI ERR)" : "Bus Healthy (TWAI Loopback OK)"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">CAN Bus Speed</span>
              <span className="text-right">500 kbps (0 RX Errors)</span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">Power Isolation</span>
              <span className={sleeping ? "text-cyan" : "text-emerald"}>
                {sleeping ? "Gated (Deep Sleep)" : "Active (Conducting)"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">Input Protection (B2/C2/F4)</span>
              <span className="text-right text-emerald">1A Fuse, 1N5819 &amp; SMBJ15A TVS</span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">MP1584 Buck Regulator</span>
              <span className="text-right text-emerald">3.30 V Locked (Modular Header)</span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">High-Side ADC Switch (GPIO27)</span>
              <span className="text-right text-cyan">AO3401A #1 &amp; 10V Zener ({t.adc_raw_mv} mV)</span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">CAN Power Gate (GPIO26)</span>
              <span className={cn("text-right", t.engine_on ? "text-emerald" : "text-cyan")}>
                {t.engine_on ? "Active (3.30 V)" : "Gated (0.00 V)"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">DS3231SN RTC (0x68)</span>
              <span className="text-right text-emerald">
                {t.rtc_temp_c.toFixed(1)} °C Die ({t.shunt_sleep_ua} µA Shunt)
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 num text-[11px]">
              <span className="shrink-0 text-muted-foreground">Thermal Comp (25°C / Arrhenius)</span>
              <span className={cn("text-right font-medium", thermalPred.thermalFactor > 1.35 ? "text-amber" : "text-cyan")}>
                25°C Comp: {thermalPred.compensatedV25.toFixed(2)}V ({thermalPred.tempCompensatedSocPct}% SOC) | Thermal Load: {thermalPred.thermalFactor.toFixed(2)}x @ {t.rtc_temp_c.toFixed(1)}°C
              </span>
            </div>
          </div>
        </Panel>

        <Panel
          title="OBD-II Harness & Node Pinout Matrix"
          code="HW"
          right={
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="num text-[9px] uppercase tracking-wider sm:hidden">Swipe</span>
              <CircuitBoard size={14} strokeWidth={1.5} aria-hidden="true" />
            </div>
          }
        >
          <div className="relative">
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
  );
}
