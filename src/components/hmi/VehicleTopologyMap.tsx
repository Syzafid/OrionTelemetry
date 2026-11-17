import { useId, useState } from "react";
import type { VehicleUnit } from "@/data/mockTelemetry";
import { fmtV, Led, type Tone } from "./primitives";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Cpu,
  Gauge,
  Radio,
  Sliders,
  Thermometer,
  Wifi,
  Zap,
} from "lucide-react";

export type TopologyNodeId =
  | "battery"
  | "alternator"
  | "esp32_core"
  | "can_obd"
  | "powertrain"
  | "rf_network";

interface VehicleTopologyMapProps {
  unit: VehicleUnit;
  activeNode: TopologyNodeId;
  onSelectNode: (node: TopologyNodeId) => void;
  className?: string;
}

export function VehicleTopologyMap({
  unit,
  activeNode,
  onSelectNode,
  className,
}: VehicleTopologyMapProps) {
  const t = unit.telemetry;
  const isCharging = t.engine_on && t.v_bat >= 13.2;
  const isBatteryCrit = t.crit_alert || t.v_bat < 11.8;
  const isBatteryLow = !isBatteryCrit && t.v_bat < 12.3;
  const isCanFault = t.can_ok === false || t.dtc_cnt > 0;
  const isOffline = unit.net_zone === "OFFLINE" || (!unit.in_yard && unit.net_zone !== "TECH_HOTSPOT");

  const batteryTone: Tone = isBatteryCrit ? "crimson" : isBatteryLow ? "amber" : "emerald";
  const alternatorTone: Tone = isCharging ? "emerald" : t.engine_on ? "amber" : "dim";
  const canTone: Tone = isCanFault ? "crimson" : "emerald";
  const rfTone: Tone = isOffline ? "dim" : unit.net_zone === "TECH_HOTSPOT" ? "amber" : "emerald";

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-card/60 p-3 sm:p-4",
        className,
      )}
    >
      {/* Blueprint Header Status Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-background px-2 py-1 num text-[10px] uppercase font-semibold text-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald" />
            TOPOLOGI KELISTRIKAN & SENSOR ORION
          </div>
          <span className="num hidden text-[11px] text-muted-foreground sm:inline">
            PCB v1.0 | Mitsubishi Harness Blueprint v3.3
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10.5px] num">
          <span className="text-muted-foreground">SIMPUL AKTIF:</span>
          <span className="font-semibold uppercase text-foreground">
            {activeNode.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Main Interactive Vector Blueprint Canvas */}
      <div className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden rounded-[2px] border border-border bg-background/90 p-2">
        <svg
          viewBox="0 0 920 440"
          className="h-full min-h-[340px] w-full min-w-[760px] select-none"
          role="img"
          aria-label="Diagram skematik topologi kelistrikan dan telemetri kendaraan"
        >
          <defs>
            {/* Subtle engineering grid pattern */}
            <pattern
              id="cad-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="oklch(0.28 0.015 265 / 0.35)"
                strokeWidth="0.5"
              />
            </pattern>

            {/* Marker Arrows */}
            <marker
              id="arrow-power"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#F45B60" />
            </marker>
            <marker
              id="arrow-can"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#10B981" />
            </marker>
          </defs>

          {/* Grid background */}
          <rect width="920" height="440" fill="url(#cad-grid)" />

          {/* Boundaries: Engine Bay / Cockpit Cabin / IoT Node Enclosure */}
          <g className="subsystem-zones opacity-70">
            {/* Engine Bay Zone */}
            <rect
              x="20"
              y="20"
              width="270"
              height="400"
              rx="2"
              fill="none"
              stroke="oklch(0.35 0.01 265)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text
              x="30"
              y="38"
              fill="oklch(0.65 0.01 260)"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              [KOMPARTEMEN MESIN / POWERTRAIN]
            </text>

            {/* Cabin / OBD Zone */}
            <rect
              x="310"
              y="20"
              width="270"
              height="400"
              rx="2"
              fill="none"
              stroke="oklch(0.35 0.01 265)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text
              x="320"
              y="38"
              fill="oklch(0.65 0.01 260)"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              [KABIN / KONEKTOR OBD-II J1962]
            </text>

            {/* ORION Hardware Enclosure */}
            <rect
              x="600"
              y="20"
              width="300"
              height="400"
              rx="2"
              fill="none"
              stroke="oklch(0.40 0.02 265)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text
              x="610"
              y="38"
              fill="oklch(0.75 0.02 260)"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              [MODUL GATEWAY ORION ESP32 v1.0]
            </text>
          </g>

          {/* ================= ELECTRICAL BUS LINES ================= */}
          <g className="bus-lines">
            {/* Alternator to Battery Charge Line */}
            <path
              d="M 155 125 L 155 185"
              fill="none"
              stroke={isCharging ? "#10B981" : "oklch(0.35 0.01 265)"}
              strokeWidth={isCharging ? "3" : "1.5"}
              strokeDasharray={isCharging ? "none" : "3 3"}
            />
            <text
              x="162"
              y="160"
              fill={isCharging ? "#10B981" : "oklch(0.60 0.01 260)"}
              fontSize="8.5"
              fontFamily="monospace"
            >
              {isCharging ? "CHARGING CURRENT" : "STANDBY"}
            </text>

            {/* Battery 12V Main Feed to ORION ADC Pin 16 Divider */}
            <path
              d="M 235 220 L 630 220 L 630 160 L 670 160"
              fill="none"
              stroke={isBatteryCrit ? "#F45B60" : "#F59E0B"}
              strokeWidth="2"
            />
            <text
              x="330"
              y="214"
              fill="#F59E0B"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="600"
            >
              PIN 16 SENSE FEED (300k / 68k DIVIDER)
            </text>

            {/* Engine Sensors to OBD-II Port Line */}
            <path
              d="M 155 315 L 155 350 L 445 350 L 445 285"
              fill="none"
              stroke={t.engine_on ? "#10B981" : "oklch(0.35 0.01 265)"}
              strokeWidth="1.5"
            />
            <text
              x="210"
              y="344"
              fill="oklch(0.65 0.01 260)"
              fontSize="8.5"
              fontFamily="monospace"
            >
              ECU TRANSDUCER (RPM / COOLANT / MAP)
            </text>

            {/* OBD-II Port to WCMCU-230 CAN Bus Pair */}
            <path
              d="M 445 200 L 445 130 L 670 130"
              fill="none"
              stroke={isCanFault ? "#F45B60" : "#10B981"}
              strokeWidth={isCanFault ? "2" : "2"}
              strokeDasharray={isCanFault ? "4 3" : "none"}
            />
            <text
              x="475"
              y="124"
              fill={isCanFault ? "#F45B60" : "#10B981"}
              fontSize="9"
              fontFamily="monospace"
              fontWeight="600"
            >
              TWAI CAN BUS HIGH/LOW (PIN 6 & 14)
            </text>

            {/* ESP32 to RF Radio / Antenna Line */}
            <path
              d="M 770 200 L 770 280"
              fill="none"
              stroke={isOffline ? "oklch(0.40 0.01 260)" : "#10B981"}
              strokeWidth="2"
              strokeDasharray={isOffline ? "3 3" : "none"}
            />
            <text
              x="778"
              y="245"
              fill="oklch(0.65 0.01 260)"
              fontSize="8.5"
              fontFamily="monospace"
            >
              SPI / 2.4GHz RF
            </text>
          </g>

          {/* ================= COMPONENT INTERACTIVE NODES ================= */}

          {/* 1. ALTERNATOR & REGULATOR */}
          <g
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            onClick={() => onSelectNode("alternator")}
            tabIndex={0}
            role="button"
            aria-label="Simpul Alternator dan Sirkuit Pengisian"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectNode("alternator");
            }}
          >
            <rect
              x="80"
              y="65"
              width="150"
              height="60"
              rx="2"
              fill="oklch(0.18 0.01 265)"
              stroke={activeNode === "alternator" ? "#F2EFE9" : isCharging ? "#10B981" : "oklch(0.32 0.01 265)"}
              strokeWidth={activeNode === "alternator" ? "2" : "1"}
            />
            <circle cx="98" cy="85" r="4" fill={isCharging ? "#10B981" : "oklch(0.45 0.01 265)"} />
            <text x="110" y="88" fill="#F2EFE9" fontSize="11" fontWeight="bold">
              ALTERNATOR 130A
            </text>
            <text x="95" y="108" fill="oklch(0.70 0.01 260)" fontSize="9.5" fontFamily="monospace">
              Status: {isCharging ? "CHARGING (RUN)" : t.engine_on ? "LOW REGULATE" : "OFF / STANDBY"}
            </text>
          </g>

          {/* 2. 12V MAIN BATTERY & SHUNT */}
          <g
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            onClick={() => onSelectNode("battery")}
            tabIndex={0}
            role="button"
            aria-label="Simpul Baterai Aki 12V dan Resistor Shunt"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectNode("battery");
            }}
          >
            <rect
              x="75"
              y="185"
              width="160"
              height="75"
              rx="2"
              fill="oklch(0.18 0.01 265)"
              stroke={
                activeNode === "battery"
                  ? "#F2EFE9"
                  : isBatteryCrit
                    ? "#F45B60"
                    : isBatteryLow
                      ? "#F59E0B"
                      : "#10B981"
              }
              strokeWidth={activeNode === "battery" ? "2" : "1.5"}
            />
            <circle cx="92" cy="205" r="4" fill={isBatteryCrit ? "#F45B60" : isBatteryLow ? "#F59E0B" : "#10B981"} />
            <text x="104" y="208" fill="#F2EFE9" fontSize="11" fontWeight="bold">
              AKI 12V (70Ah PB)
            </text>
            <text x="92" y="228" fill="#F2EFE9" fontSize="12" fontWeight="600" fontFamily="monospace">
              {fmtV(t.v_bat)} V <tspan fill="oklch(0.65 0.01 260)" fontSize="10">({t.adc_raw_mv} mV)</tspan>
            </text>
            <text x="92" y="246" fill="oklch(0.70 0.01 260)" fontSize="9" fontFamily="monospace">
              Sleep Shunt: {t.shunt_sleep_ua} µA
            </text>
          </g>

          {/* 3. POWERTRAIN TRANSDUCERS (RPM / COOLANT / MAP) */}
          <g
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            onClick={() => onSelectNode("powertrain")}
            tabIndex={0}
            role="button"
            aria-label="Simpul Powertrain RPM dan Coolant Temperature"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectNode("powertrain");
            }}
          >
            <rect
              x="75"
              y="285"
              width="160"
              height="65"
              rx="2"
              fill="oklch(0.18 0.01 265)"
              stroke={activeNode === "powertrain" ? "#F2EFE9" : "oklch(0.32 0.01 265)"}
              strokeWidth={activeNode === "powertrain" ? "2" : "1"}
            />
            <circle cx="92" cy="305" r="4" fill={t.engine_on ? "#10B981" : "oklch(0.45 0.01 265)"} />
            <text x="104" y="308" fill="#F2EFE9" fontSize="11" fontWeight="bold">
              SENSOR POWERTRAIN
            </text>
            <text x="92" y="326" fill="oklch(0.85 0.01 260)" fontSize="10" fontFamily="monospace">
              RPM: <tspan fill="#F2EFE9" fontWeight="bold">{!t.engine_on || t.rpm <= 0 ? "0" : t.rpm}</tspan> | Coolant: <tspan fill="#F2EFE9" fontWeight="bold">{!t.engine_on || t.temp_c <= 0 ? "--" : `${t.temp_c}°C`}</tspan>
            </text>
            <text x="92" y="342" fill="oklch(0.65 0.01 260)" fontSize="8.5" fontFamily="monospace">
              Engine Load: {t.load_pct ?? 0}% | IAT: {t.iat_c ?? 30}°C
            </text>
          </g>

          {/* 4. OBD-II DIAGNOSTIC PORT & CAN INTERFACE */}
          <g
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            onClick={() => onSelectNode("can_obd")}
            tabIndex={0}
            role="button"
            aria-label="Simpul Port OBD-II dan Jalur CAN Bus"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectNode("can_obd");
            }}
          >
            <rect
              x="365"
              y="200"
              width="160"
              height="85"
              rx="2"
              fill="oklch(0.18 0.01 265)"
              stroke={activeNode === "can_obd" ? "#F2EFE9" : isCanFault ? "#F45B60" : "#10B981"}
              strokeWidth={activeNode === "can_obd" ? "2" : "1.5"}
            />
            <circle cx="382" cy="220" r="4" fill={isCanFault ? "#F45B60" : "#10B981"} />
            <text x="394" y="223" fill="#F2EFE9" fontSize="11" fontWeight="bold">
              OBD-II PORT (J1962)
            </text>
            <text x="382" y="243" fill={isCanFault ? "#F45B60" : "#10B981"} fontSize="10" fontWeight="bold" fontFamily="monospace">
              CAN Status: {t.can_ok === false ? "FAULT / DOWN" : "HEALTHY (500 kbps)"}
            </text>
            <text x="382" y="261" fill="oklch(0.75 0.01 260)" fontSize="9.5" fontFamily="monospace">
              DTC Error Code: <tspan fill={t.dtc_cnt > 0 ? "#F45B60" : "#10B981"} fontWeight="bold">{t.dtc}</tspan> ({t.dtc_cnt})
            </text>
            <text x="382" y="277" fill="oklch(0.60 0.01 260)" fontSize="8.5" fontFamily="monospace">
              Pins: 6 (CAN-H), 14 (CAN-L), 4/5 (GND)
            </text>
          </g>

          {/* 5. ESP32 ORION HARDWARE GATEWAY */}
          <g
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            onClick={() => onSelectNode("esp32_core")}
            tabIndex={0}
            role="button"
            aria-label="Simpul Mikrokontroler ESP32 Orion Core"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectNode("esp32_core");
            }}
          >
            <rect
              x="670"
              y="90"
              width="200"
              height="110"
              rx="2"
              fill="oklch(0.18 0.01 265)"
              stroke={activeNode === "esp32_core" ? "#F2EFE9" : "#10B981"}
              strokeWidth={activeNode === "esp32_core" ? "2" : "1.5"}
            />
            <circle cx="688" cy="110" r="4" fill="#10B981" />
            <text x="700" y="113" fill="#F2EFE9" fontSize="11" fontWeight="bold">
              ORION ESP32 (NODE {unit.unit_id})
            </text>
            <text x="688" y="133" fill="oklch(0.85 0.01 260)" fontSize="9.5" fontFamily="monospace">
              DS3231 RTC Temp: <tspan fill="#F2EFE9" fontWeight="bold">{t.rtc_temp_c.toFixed(1)}°C</tspan>
            </text>
            <text x="688" y="151" fill="oklch(0.85 0.01 260)" fontSize="9.5" fontFamily="monospace">
              Kalibrasi OLS: <tspan fill="#10B981">m=0.005412, c=0.069</tspan>
            </text>
            <text x="688" y="169" fill="oklch(0.85 0.01 260)" fontSize="9.5" fontFamily="monospace">
              Uptime Siklus: <tspan fill="#F2EFE9">{t.active_ms} ms</tspan> | Boot #{t.boot}
            </text>
            <text x="688" y="187" fill="oklch(0.70 0.01 260)" fontSize="8.5" fontFamily="monospace">
              Konsumsi Harian: {t.daily_mah} mAh | Seq #{t.seq}
            </text>
          </g>

          {/* 6. RF GATEWAY / NETWORK PRESENCE */}
          <g
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            onClick={() => onSelectNode("rf_network")}
            tabIndex={0}
            role="button"
            aria-label="Simpul Antena RF dan Manajemen Zona Jaringan"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectNode("rf_network");
            }}
          >
            <rect
              x="670"
              y="280"
              width="200"
              height="80"
              rx="2"
              fill="oklch(0.18 0.01 265)"
              stroke={
                activeNode === "rf_network"
                  ? "#F2EFE9"
                  : isOffline
                    ? "oklch(0.35 0.01 265)"
                    : unit.net_zone === "TECH_HOTSPOT"
                      ? "#F59E0B"
                      : "#10B981"
              }
              strokeWidth={activeNode === "rf_network" ? "2" : "1.5"}
            />
            <circle cx="688" cy="300" r="4" fill={isOffline ? "oklch(0.50 0.01 260)" : unit.net_zone === "TECH_HOTSPOT" ? "#F59E0B" : "#10B981"} />
            <text x="700" y="303" fill="#F2EFE9" fontSize="11" fontWeight="bold">
              RF GATEWAY & GEOFENCE
            </text>
            <text x="688" y="323" fill="oklch(0.85 0.01 260)" fontSize="9.5" fontFamily="monospace">
              Zona: <tspan fill={isOffline ? "oklch(0.70 0.01 260)" : "#10B981"} fontWeight="bold">{unit.net_zone ?? "YARD"}</tspan> | {t.rssi} dBm
            </text>
            <text x="688" y="341" fill="oklch(0.85 0.01 260)" fontSize="9.5" fontFamily="monospace">
              Antrean Buffer: <tspan fill={unit.buffer_used > 0 ? "#F59E0B" : "#10B981"} fontWeight="bold">{unit.buffer_used} slot</tspan> (Tier-1 RTC)
            </text>
          </g>
        </svg>
      </div>

      {/* Interactive Node Selector Badges / Button Bar */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
        <span className="label-hmi mr-1 text-[10px] text-muted-foreground">PILIH SIMPUL:</span>
        {[
          { id: "battery", label: "Aki 12V", tone: batteryTone },
          { id: "alternator", label: "Alternator", tone: alternatorTone },
          { id: "can_obd", label: "CAN / OBD-II", tone: canTone },
          { id: "powertrain", label: "Powertrain", tone: "dim" as Tone },
          { id: "esp32_core", label: "ESP32 Core", tone: "emerald" as Tone },
          { id: "rf_network", label: "Gateway RF", tone: rfTone },
        ].map((node) => {
          const isActive = activeNode === node.id;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectNode(node.id as TopologyNodeId)}
              className={cn(
                "flex min-h-[36px] items-center gap-1.5 rounded-[2px] border px-2.5 py-1 num text-[10.5px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isActive
                  ? "border-foreground bg-foreground/10 font-semibold text-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              <Led tone={node.tone} />
              <span>{node.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
