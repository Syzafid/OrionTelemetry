import { useMemo } from "react";
import type { VehicleUnit } from "@/data/mockTelemetry";
import { fmtV, Led, type Tone } from "./primitives";
import { cn } from "@/lib/utils";
import type { TopologyNodeId } from "./VehicleTopologyMap";

interface ComponentNodeInspectorProps {
  unit: VehicleUnit;
  activeNode: TopologyNodeId;
  className?: string;
}

interface ChannelRow {
  channelId: string;
  nodeKey: TopologyNodeId;
  parameter: string;
  readout: string;
  subReadout?: string;
  range: string;
  status: string;
  tone: Tone;
  waveformType: "battery" | "shunt" | "alternator" | "rpm" | "coolant" | "can" | "rtc" | "rf";
}

interface MiniWaveformProps {
  type: ChannelRow["waveformType"];
  tone: Tone;
  active: boolean;
  vBat: number;
  adcRawMv: number;
  engineOn: boolean;
  rpm: number;
  tempC: number;
  canOk: boolean;
  dtcCnt: number;
  seq: number;
  shuntUa: number;
}

/**
 * Authentic Dynamic Waveform Generator (SAE J1979 / Automotive Scope)
 * Real evidence over claims: wave points dynamically fluctuate with physical telemetry states.
 */
function MiniWaveform({
  type,
  tone,
  active,
  vBat,
  adcRawMv,
  engineOn,
  rpm,
  tempC,
  canOk,
  dtcCnt,
  seq,
  shuntUa,
}: MiniWaveformProps) {
  const points = useMemo(() => {
    switch (type) {
      case "battery": {
        // Voltage level mapped to vertical axis (11.0V -> Y=21, 14.8V -> Y=4)
        const clampedV = Math.max(11.0, Math.min(14.8, vBat));
        const baseY = 21 - ((clampedV - 11.0) / 3.8) * 17;
        const pts: string[] = [];
        for (let i = 0; i <= 10; i++) {
          const x = i * 15;
          // Analog noise variation derived from raw ADC micro-jitter and packet sequence
          const noise = Math.sin((i * 1.7) + (seq % 10) + (adcRawMv % 5)) * 1.4;
          const y = Math.max(3, Math.min(22, baseY + noise));
          pts.push(`${x},${y.toFixed(1)}`);
        }
        return pts.join(" ");
      }

      case "shunt": {
        // Flatline sleep baseline with pulse spikes if leakage > 50 uA
        if (engineOn) {
          return "0,12 30,12 60,11 90,12 120,11 150,12";
        }
        const pts: string[] = [];
        const isExcess = shuntUa > 50;
        for (let i = 0; i <= 10; i++) {
          const x = i * 15;
          // Pulse at specific step when excess drain occurs
          const y = isExcess && (i === 4 || i === 8) ? 10 : 18;
          pts.push(`${x},${y}`);
        }
        return pts.join(" ");
      }

      case "alternator": {
        // 3-phase rectified diode ripple scrolling with seq when active; flatline when off
        if (!active || !engineOn) {
          return "0,21 150,21";
        }
        const phase = (seq % 6) * 0.5;
        const pts: string[] = [];
        for (let i = 0; i <= 15; i++) {
          const x = i * 10;
          const ripple = Math.abs(Math.sin((i * 0.4) + phase)) * 7;
          const y = 8 + ripple;
          pts.push(`${x},${y.toFixed(1)}`);
        }
        return pts.join(" ");
      }

      case "rpm": {
        // Crankshaft variable reluctance pulse train: frequency scales with RPM
        if (!engineOn || rpm <= 0) {
          return "0,18 150,18";
        }
        const period = Math.max(10, Math.min(30, Math.round(18000 / rpm)));
        const pts: string[] = [];
        for (let x = 0; x <= 150; x += 5) {
          const mod = (x + (seq * 4)) % period;
          let y = 18;
          if (mod === 0) y = 4; // Positive reluctance spike
          else if (mod === 5) y = 22; // Negative zero-crossing undershoot
          pts.push(`${x},${y}`);
        }
        return pts.join(" ");
      }

      case "coolant": {
        // NTC thermistor thermal curve height proportional to engine temperature
        const clampedT = Math.max(30, Math.min(115, tempC > 0 ? tempC : 40));
        const endY = 21 - ((clampedT - 30) / 85) * 16;
        const pts: string[] = [];
        for (let i = 0; i <= 8; i++) {
          const x = i * 18.75;
          const interp = 21 - ((21 - endY) * (i / 8));
          pts.push(`${x.toFixed(0)},${interp.toFixed(1)}`);
        }
        return pts.join(" ");
      }

      case "can": {
        // High-Speed CAN differential bitstream. Clean square packets if OK, glitch if fault
        if (!canOk || dtcCnt > 0) {
          return "0,16 15,16 15,6 20,6 25,22 35,16 60,16 65,4 70,22 90,16 120,16 150,16";
        }
        const pts: string[] = ["0,16"];
        const bitPattern = [10, 10, 20, 15, 25, 20, 20, 30];
        let currX = 0;
        let isHigh = false;
        for (const span of bitPattern) {
          currX += span;
          if (currX > 150) break;
          isHigh = !isHigh;
          const y = isHigh ? 6 : 16;
          pts.push(`${currX},${isHigh ? 16 : 6} ${currX},${y}`);
        }
        pts.push("150,16");
        return pts.join(" ");
      }

      case "rtc": {
        // Ultra-stable TCXO reference baseline with micro temp flutter
        const yBase = 12 + ((tempC > 0 ? tempC : 28) - 25) * 0.1;
        return `0,${yBase.toFixed(1)} 150,${yBase.toFixed(1)}`;
      }

      case "rf": {
        // Periodic telemetry beacon pulses
        const pts: string[] = [];
        for (let i = 0; i <= 10; i++) {
          const x = i * 15;
          const isPulse = (i + seq) % 4 === 0;
          pts.push(`${x},${isPulse ? 6 : 18}`);
        }
        return pts.join(" ");
      }

      default:
        return "0,15 150,15";
    }
  }, [type, active, vBat, adcRawMv, engineOn, rpm, tempC, canOk, dtcCnt, seq, shuntUa]);

  const strokeColor =
    tone === "crimson"
      ? "#F45B60"
      : tone === "amber"
        ? "#F59E0B"
        : tone === "emerald"
          ? "#10B981"
          : "oklch(0.50 0.015 260)";

  return (
    <svg viewBox="0 0 150 24" className="h-5 w-24 sm:h-6 sm:w-28 shrink-0 select-none">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function ComponentNodeInspector({
  unit,
  activeNode,
  className,
}: ComponentNodeInspectorProps) {
  const t = unit.telemetry;
  const isCharging = t.engine_on && t.v_bat >= 13.2;
  const isBatteryCrit = t.crit_alert || t.v_bat < 11.8;
  const isBatteryLow = !isBatteryCrit && t.v_bat < 12.3;
  const isCanFault = t.can_ok === false || t.dtc_cnt > 0;
  const isOffline =
    unit.net_zone === "OFFLINE" || (!unit.in_yard && unit.net_zone !== "TECH_HOTSPOT");

  const rows: ChannelRow[] = useMemo(() => {
    return [
      {
        channelId: "CH-01",
        nodeKey: "battery",
        parameter: "V_BAT (Tegangan Aki Terminal)",
        readout: `${fmtV(t.v_bat)} V`,
        subReadout: `${t.adc_raw_mv} mV (GPIO34)`,
        range: "11.80V - 14.40V",
        status: isBatteryCrit ? "CRIT_ALERT" : isBatteryLow ? "LOW_WARN" : "NOMINAL",
        tone: isBatteryCrit ? "crimson" : isBatteryLow ? "amber" : "emerald",
        waveformType: "battery",
      },
      {
        channelId: "CH-02",
        nodeKey: "battery",
        parameter: "SHUNT_SLEEP (Arus Parasitik Tidur)",
        readout: `${t.shunt_sleep_ua} µA`,
        subReadout: "Shunt 10Ω R-Sense",
        range: "< 50.0 µA (Deep Sleep)",
        status: t.shunt_sleep_ua <= 50 ? "PASS" : "EXCESS_DRAIN",
        tone: t.shunt_sleep_ua <= 50 ? "emerald" : "amber",
        waveformType: "shunt",
      },
      {
        channelId: "CH-03",
        nodeKey: "alternator",
        parameter: "ALT_OUTPUT (Regulator Pengisian)",
        readout: isCharging ? "13.80 V" : "0.00 V",
        subReadout: isCharging ? "130A Denso Alternator" : "Mesin Mati / Standby",
        range: "13.20V - 14.60V (RUN)",
        status: isCharging ? "ACTIVE_CHARGING" : t.engine_on ? "LOW_REGULATE" : "STANDBY",
        tone: isCharging ? "emerald" : t.engine_on ? "amber" : "dim",
        waveformType: "alternator",
      },
      {
        channelId: "PID 0x0C",
        nodeKey: "powertrain",
        parameter: "ENGINE_RPM (Putaran Poros Engkol)",
        readout: !t.engine_on || t.rpm <= 0 ? "0 RPM" : `${t.rpm} RPM`,
        subReadout: t.engine_on ? "Reluctance Sensor OK" : "Kontak Mati",
        range: "650 - 850 RPM (Idle)",
        status: t.engine_on ? "CRANK_RUNNING" : "STOPPED",
        tone: t.engine_on ? "emerald" : "dim",
        waveformType: "rpm",
      },
      {
        channelId: "PID 0x05",
        nodeKey: "powertrain",
        parameter: "COOLANT_TEMP (Suhu Cairan Pendingin)",
        readout: !t.engine_on || t.temp_c <= 0 ? "--" : `${t.temp_c} °C`,
        subReadout: "NTC Engine Block Sensor",
        range: "82°C - 95°C (Target)",
        status:
          !t.engine_on || t.temp_c <= 0
            ? "UNAVAILABLE"
            : t.temp_c > 105
              ? "OVERHEAT_WARN"
              : t.temp_c >= 80
                ? "OPT_TEMP"
                : "COLD_WARMUP",
        tone:
          !t.engine_on || t.temp_c <= 0
            ? "dim"
            : t.temp_c > 105
              ? "crimson"
              : t.temp_c >= 80
                ? "emerald"
                : "amber",
        waveformType: "coolant",
      },
      {
        channelId: "CAN-01",
        nodeKey: "can_obd",
        parameter: "CAN_TWAI (J1962 Bus Transceiver)",
        readout: t.can_ok === false ? "BUS_FAULT" : "500 kbps",
        subReadout: `DTC: ${t.dtc} (${t.dtc_cnt} Fault)`,
        range: "ISO 11898-2 High-Speed",
        status: isCanFault ? "DTC_ACTIVE" : "HEALTHY",
        tone: isCanFault ? "crimson" : "emerald",
        waveformType: "can",
      },
      {
        channelId: "RTC-01",
        nodeKey: "esp32_core",
        parameter: "DS3231_TEMP (Suhu Kristal & Node)",
        readout: `${t.rtc_temp_c.toFixed(2)} °C`,
        subReadout: `Uptime: ${t.active_ms}ms | Seq #${t.seq}`,
        range: "-10.0°C s/d +65.0°C",
        status: "TCXO_COMPENSATED",
        tone: "emerald",
        waveformType: "rtc",
      },
      {
        channelId: "RF-01",
        nodeKey: "rf_network",
        parameter: "TELEMETRY_UPLINK (Gateway Jaringan)",
        readout: `${unit.net_zone ?? "YARD"} (${t.rssi} dBm)`,
        subReadout: `Buffer: ${unit.buffer_used}/20 slot`,
        range: "RSSI >= -85 dBm (Yard)",
        status: isOffline ? "TIER1_BUFFERING" : "LIVE_SYNC",
        tone: isOffline ? "dim" : unit.net_zone === "TECH_HOTSPOT" ? "amber" : "emerald",
        waveformType: "rf",
      },
    ];
  }, [t, unit, isCharging, isBatteryCrit, isBatteryLow, isCanFault, isOffline]);

  const filteredRows = useMemo(() => {
    if (activeNode === "all") return rows;
    return rows.filter((r) => r.nodeKey === activeNode);
  }, [rows, activeNode]);

  return (
    <div
      className={cn(
        "panel flex flex-col rounded-[2px] border border-border bg-card/90 p-3 sm:p-4 text-foreground",
        className,
      )}
    >
      {/* Table Header Controls */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="label-hmi text-foreground font-semibold text-[10.5px]">
            MATRIKS DATA STREAM TELEMETRI (SAE J1979 / OEM MUT-III FORMAT)
          </span>
          <span className="num text-[10px] text-muted-foreground">
            [{filteredRows.length} Saluran Aktif]
          </span>
        </div>
        <div className="num text-[10px] text-muted-foreground">
          Siklus Sampling: 5.0 detik | Resolusi ADC: 12-bit
        </div>
      </div>

      {/* Responsive Diagnostic Feed (Mobile View: Cards) */}
      <div className="flex flex-col gap-2 md:hidden">
        {filteredRows.map((r) => (
          <div
            key={r.channelId}
            className="rounded-[2px] border border-border/70 bg-background/60 p-2.5 num"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[9.5px] font-semibold text-foreground">
                  {r.channelId}
                </span>
                <span className="text-[10px] font-medium text-foreground truncate max-w-[180px]">
                  {r.parameter}
                </span>
              </div>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  r.tone === "crimson"
                    ? "bg-crimson/15 text-crimson border border-crimson/30"
                    : r.tone === "amber"
                      ? "bg-amber/15 text-amber border border-amber/30"
                      : r.tone === "emerald"
                        ? "bg-emerald/15 text-emerald border border-emerald/30"
                        : "bg-secondary text-muted-foreground border border-border",
                )}
              >
                {r.status}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">{r.readout}</div>
                {r.subReadout && (
                  <div className="text-[9.5px] text-muted-foreground">{r.subReadout}</div>
                )}
              </div>
              <div className="flex flex-col items-end">
                <MiniWaveform
                  type={r.waveformType}
                  tone={r.tone}
                  active={t.engine_on || isCharging}
                  vBat={t.v_bat}
                  adcRawMv={t.adc_raw_mv}
                  engineOn={t.engine_on}
                  rpm={t.rpm}
                  tempC={t.temp_c}
                  canOk={t.can_ok !== false}
                  dtcCnt={t.dtc_cnt}
                  seq={t.seq}
                  shuntUa={t.shunt_sleep_ua}
                />
                <span className="mt-0.5 text-[8.5px] text-muted-foreground">
                  Ambang: {r.range}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Diagnostic Matrix Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse num text-[11px]">
          <thead>
            <tr className="border-b border-border/70 text-left label-hmi text-[9.5px] text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">CH / PID</th>
              <th className="py-1.5 px-2 font-medium">PARAMETER SENSOR</th>
              <th className="py-1.5 px-2 font-medium">NILAI REAL-TIME</th>
              <th className="py-1.5 px-2 font-medium">RENTANG / AMBANG</th>
              <th className="py-1.5 px-2 font-medium">LIVE WAVEFORM</th>
              <th className="py-1.5 pl-2 font-medium text-right">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredRows.map((r) => (
              <tr
                key={r.channelId}
                className="hover:bg-foreground/[0.02] transition-colors"
              >
                <td className="py-2 pr-2 font-semibold text-foreground/90 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Led tone={r.tone} pulse={r.tone === "crimson"} />
                    <span>{r.channelId}</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-foreground/90">
                  <div className="font-medium">{r.parameter}</div>
                  {r.subReadout && (
                    <div className="text-[10px] text-muted-foreground">
                      {r.subReadout}
                    </div>
                  )}
                </td>
                <td className="py-2 px-2 font-bold text-foreground whitespace-nowrap">
                  {r.readout}
                </td>
                <td className="py-2 px-2 text-muted-foreground whitespace-nowrap text-[10.5px]">
                  {r.range}
                </td>
                <td className="py-2 px-2">
                  <MiniWaveform
                    type={r.waveformType}
                    tone={r.tone}
                    active={t.engine_on || isCharging}
                    vBat={t.v_bat}
                    adcRawMv={t.adc_raw_mv}
                    engineOn={t.engine_on}
                    rpm={t.rpm}
                    tempC={t.temp_c}
                    canOk={t.can_ok !== false}
                    dtcCnt={t.dtc_cnt}
                    seq={t.seq}
                    shuntUa={t.shunt_sleep_ua}
                  />
                </td>
                <td className="py-2 pl-2 text-right whitespace-nowrap">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-[1px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                      r.tone === "crimson"
                        ? "border-crimson/50 bg-crimson/15 text-crimson"
                        : r.tone === "amber"
                          ? "border-amber/50 bg-amber/15 text-amber"
                          : r.tone === "emerald"
                            ? "border-emerald/50 bg-emerald/15 text-emerald"
                            : "border-border bg-secondary/70 text-muted-foreground",
                    )}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
