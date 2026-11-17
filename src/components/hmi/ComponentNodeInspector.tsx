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

function MiniWaveform({
  type,
  tone,
  active,
}: {
  type: ChannelRow["waveformType"];
  tone: Tone;
  active: boolean;
}) {
  const points = useMemo(() => {
    switch (type) {
      case "battery":
        // Slight analog jitter around nominal line
        return "0,14 15,13 30,14 45,15 60,13 75,14 90,12 105,14 120,13 135,14 150,13";
      case "shunt":
        // Ultra-flat baseline with tiny microamp blips
        return "0,18 25,18 50,17 75,18 80,14 85,18 115,18 135,18 150,18";
      case "alternator":
        // Alternator 3-phase rectified ripple wave
        return active
          ? "0,12 12,6 24,12 36,6 48,12 60,6 72,12 84,6 96,12 108,6 120,12 132,6 150,12"
          : "0,20 150,20";
      case "rpm":
        // Crankshaft reluctance pulse train
        return active
          ? "0,18 15,18 18,4 22,20 35,18 38,4 42,20 55,18 58,4 62,20 75,18 78,4 82,20 95,18 98,4 102,20 120,18"
          : "0,18 150,18";
      case "coolant":
        // Slow thermal curve
        return "0,20 30,19 60,17 90,14 120,12 150,11";
      case "can":
        // Differential CAN-H / CAN-L bitstream square waves
        return "0,16 10,16 10,6 20,6 20,16 35,16 35,6 45,6 45,16 60,16 60,6 75,6 75,16 90,16 100,6 110,16 130,16 130,6 140,6 140,16 150,16";
      case "rtc":
        // Ultra-stable reference line
        return "0,12 30,12 60,12 90,12 120,12 150,12";
      case "rf":
        // RF beacon pulses
        return "0,18 20,18 22,8 26,18 45,18 47,8 51,18 70,18 72,8 76,18 95,18 97,8 101,18 125,18 127,8 131,18 150,18";
      default:
        return "0,15 150,15";
    }
  }, [type, active]);

  const strokeColor =
    tone === "crimson"
      ? "#F45B60"
      : tone === "amber"
        ? "#F59E0B"
        : tone === "emerald"
          ? "#10B981"
          : "oklch(0.50 0.015 260)";

  return (
    <svg viewBox="0 0 150 24" className="h-6 w-28 shrink-0 select-none">
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
        "panel flex flex-col rounded-[2px] border border-border bg-card/80 p-3 sm:p-4 text-foreground",
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

      {/* High-Density Diagnostic Data Stream Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse num text-[11px]">
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
            {filteredRows.map((row) => (
              <tr
                key={row.channelId}
                className={cn(
                  "transition-colors hover:bg-card/90",
                  activeNode === row.nodeKey && "bg-foreground/[0.04]",
                )}
              >
                <td className="py-2 pr-2 font-mono font-semibold text-foreground/90">
                  {row.channelId}
                </td>
                <td className="py-2 px-2">
                  <div className="font-medium text-foreground">{row.parameter}</div>
                  {row.subReadout && (
                    <div className="text-[9.5px] text-muted-foreground">{row.subReadout}</div>
                  )}
                </td>
                <td className="py-2 px-2 font-semibold">
                  <span
                    className={cn(
                      row.tone === "crimson"
                        ? "text-crimson"
                        : row.tone === "amber"
                          ? "text-amber"
                          : row.tone === "emerald"
                            ? "text-emerald"
                            : "text-foreground",
                    )}
                  >
                    {row.readout}
                  </span>
                </td>
                <td className="py-2 px-2 text-[10.5px] text-muted-foreground">
                  {row.range}
                </td>
                <td className="py-2 px-2">
                  <MiniWaveform
                    type={row.waveformType}
                    tone={row.tone}
                    active={
                      row.waveformType === "alternator"
                        ? isCharging
                        : row.waveformType === "rpm"
                          ? t.engine_on
                          : true
                    }
                  />
                </td>
                <td className="py-2 pl-2 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-[1px] border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider uppercase",
                      row.tone === "crimson"
                        ? "border-crimson/50 bg-crimson/15 text-crimson"
                        : row.tone === "amber"
                          ? "border-amber/50 bg-amber/15 text-amber"
                          : row.tone === "emerald"
                            ? "border-emerald/50 bg-emerald/15 text-emerald"
                            : "border-border bg-secondary text-muted-foreground",
                    )}
                  >
                    <Led tone={row.tone} />
                    <span>{row.status}</span>
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
