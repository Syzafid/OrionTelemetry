import { useState } from "react";
import type { VehicleUnit } from "@/data/mockTelemetry";
import { fmtV, Led, type Tone } from "./primitives";
import { cn } from "@/lib/utils";

export type TopologyNodeId =
  | "all"
  | "battery"
  | "alternator"
  | "powertrain"
  | "can_obd"
  | "esp32_core"
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
  const [focusedNode, setFocusedNode] = useState<TopologyNodeId | null>(null);

  const t = unit.telemetry;
  const isCharging = t.engine_on && t.v_bat >= 13.2;
  const isBatteryCrit = t.crit_alert || t.v_bat < 11.8;
  const isBatteryLow = !isBatteryCrit && t.v_bat < 12.3;
  const isCanFault = t.can_ok === false || t.dtc_cnt > 0;
  const isOffline =
    unit.net_zone === "OFFLINE" || (!unit.in_yard && unit.net_zone !== "TECH_HOTSPOT");

  const batteryTone: Tone = isBatteryCrit ? "crimson" : isBatteryLow ? "amber" : "emerald";
  const alternatorTone: Tone = isCharging ? "emerald" : t.engine_on ? "amber" : "dim";
  const canTone: Tone = isCanFault ? "crimson" : "emerald";
  const rfTone: Tone = isOffline ? "dim" : unit.net_zone === "TECH_HOTSPOT" ? "amber" : "emerald";

  // Helper to determine node opacity based on active selection (C-1 Visual Hierarchy)
  const getNodeOpacityClass = (nodeId: TopologyNodeId) => {
    if (activeNode === "all" || activeNode === nodeId) {
      return "opacity-100 transition-opacity duration-200";
    }
    return "opacity-25 hover:opacity-80 transition-opacity duration-200";
  };

  // Active node metadata for high-legibility mobile summary card (R-03 / R-25)
  const probeSummaries: Record<
    TopologyNodeId,
    { title: string; location: string; reading: string; tone: Tone }
  > = {
    all: {
      title: "SELURUH HARNESS KELISTRIKAN",
      location: "Chassis Pajero Sport (6 Titik Probe)",
      reading: `${fmtV(t.v_bat)}V · ${t.engine_on ? `${t.rpm} RPM` : "Mesin Mati"} · ${t.can_ok === false ? "CAN ERR" : "CAN OK"}`,
      tone: isBatteryCrit || isCanFault ? "crimson" : isBatteryLow ? "amber" : "emerald",
    },
    battery: {
      title: "PROBE 01: AKI 12V 70Ah & SHUNT RESISTOR",
      location: "Ruang Mesin Sisi Kiri (Dekat Box Filter Udara)",
      reading: `${fmtV(t.v_bat)} V (${t.adc_raw_mv} mV) | Arus Tidur: ${t.shunt_sleep_ua} µA`,
      tone: batteryTone,
    },
    alternator: {
      title: "PROBE 02: ALTERNATOR 130A & REGULATOR",
      location: "Ruang Mesin Depan Tengah (Belt-Driven Pulley)",
      reading: isCharging ? "13.80V (Pengisian Aktif Denso 130A)" : "0.0V (Standby / Kontak Mati)",
      tone: alternatorTone,
    },
    powertrain: {
      title: "PROBE 03: TRANSDUSER MESIN (RPM & COOLANT)",
      location: "Blok Mesin 4D56 & Cover Timing Bawah",
      reading: `${!t.engine_on || t.rpm <= 0 ? "0 RPM" : `${t.rpm} RPM`} | Suhu: ${!t.engine_on || t.temp_c <= 0 ? "--" : `${t.temp_c}°C`}`,
      tone: t.engine_on ? "emerald" : "dim",
    },
    can_obd: {
      title: "PROBE 04: PORT OBD-II J1962 & CAN BUS",
      location: "Bawah Kolom Setir Pengemudi (Kanan / RHD)",
      reading: `${t.can_ok === false ? "CAN FAULT" : "TWAI 500 kbps (OK)"} | DTC: ${t.dtc} (${t.dtc_cnt} Kode)`,
      tone: canTone,
    },
    esp32_core: {
      title: "PROBE 05: ORION IOT GATEWAY v1.0 & RTC",
      location: "Konsol Tengah Dashboard / Glovebox",
      reading: `RTC DS3231: ${t.rtc_temp_c.toFixed(1)}°C | Siklus: #${t.seq} | Uptime: ${t.active_ms}ms`,
      tone: "emerald",
    },
    rf_network: {
      title: "PROBE 06: ANTENA RF DUAL-BAND & GEOFENCE",
      location: "Pilar A Atap Kabin Interior",
      reading: `Zona: ${unit.net_zone ?? "YARD"} (${t.rssi} dBm) | Queue: ${unit.buffer_used}/20 slot`,
      tone: rfTone,
    },
  };

  const activeProbeMeta = probeSummaries[activeNode] ?? probeSummaries.all;

  return (
    <div
      className={cn(
        "relative flex w-full flex-col rounded-[2px] border border-border bg-card/60 p-3 sm:p-4",
        className,
      )}
    >
      {/* Workbench Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-[1px] border border-border/80 bg-background px-2.5 py-1 num text-[10.5px] uppercase font-semibold text-foreground">
            <span className="h-2 w-2 rounded-full bg-crimson" />
            <span>MITSUBISHI PAJERO SPORT HARNESS TOPOLOGY</span>
          </div>
          <span className="num hidden text-[11px] text-muted-foreground md:inline">
            Orthographic Chassis Cutaway (Skala Rasio 1:1 OEM)
          </span>
        </div>

        {/* Quick Filter Pill Controls */}
        <div className="flex flex-wrap items-center gap-1 num text-[10.5px]">
          <span className="mr-1 text-muted-foreground text-[10px]">FILTER PROBE:</span>
          {[
            { id: "all", label: "SEMUA PROBE" },
            { id: "battery", label: "AKI 12V", tone: batteryTone },
            { id: "alternator", label: "ALTERNATOR", tone: alternatorTone },
            { id: "powertrain", label: "MESIN / RPM", tone: "dim" as Tone },
            { id: "can_obd", label: "CAN BUS", tone: canTone },
            { id: "esp32_core", label: "ESP32", tone: "emerald" as Tone },
            { id: "rf_network", label: "GATEWAY RF", tone: rfTone },
          ].map((item) => {
            const on = activeNode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNode(item.id as TopologyNodeId)}
                className={cn(
                  "flex min-h-[32px] items-center gap-1 rounded-[1px] border px-2 py-0.5 uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
                  on
                    ? "border-foreground/80 bg-foreground/15 font-semibold text-foreground"
                    : "border-border text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {item.tone && <Led tone={item.tone} />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Orthographic Chassis Blueprint Container */}
      <div className="relative flex-1 rounded-[2px] border border-border/80 bg-background/95 p-2 sm:p-3 flex items-center justify-center">
        <svg
          viewBox="0 0 960 400"
          className="w-full h-auto aspect-[2.4/1] max-h-[380px] select-none"
          role="img"
          aria-label="Topologi potongan chassis kendaraan Mitsubishi Pajero Sport dengan letak fisik komponen sensor"
        >
          {/* High-Contrast Technical Dimension Axis / Centerline (R-25 Contrast WCAG AA) */}
          <line
            x1="40"
            y1="200"
            x2="920"
            y2="200"
            stroke="oklch(0.45 0.015 265 / 0.6)"
            strokeDasharray="8 4 2 4"
            strokeWidth="0.85"
          />
          <text
            x="50"
            y="204"
            fill="oklch(0.72 0.01 260)"
            fontSize="8.5"
            fontFamily="monospace"
            fontWeight="500"
          >
            CL VEHICLE CENTERLINE
          </text>

          {/* ================= CHASSIS SILHOUETTE (PAJERO SPORT TOP-DOWN) ================= */}
          <g className="chassis-geometry" stroke="oklch(0.45 0.015 265)" fill="none" strokeWidth="1.5">
            {/* Outer Vehicle Body Shell */}
            <path
              d="
                M 120 130
                C 140 100, 180 80, 240 80
                L 700 80
                C 760 80, 800 100, 830 130
                C 850 150, 855 180, 855 200
                C 855 220, 850 250, 830 270
                C 800 300, 760 320, 700 320
                L 240 320
                C 180 320, 140 300, 120 270
                C 105 250, 100 220, 100 200
                C 100 180, 105 150, 120 130
                Z
              "
              fill="oklch(0.14 0.008 265 / 0.85)"
              stroke="oklch(0.48 0.015 265)"
              strokeWidth="2"
            />

            {/* Front Bumper / Skid Plate Contour */}
            <path
              d="M 98 175 C 95 185, 95 215, 98 225 L 115 235 L 115 165 Z"
              fill="oklch(0.18 0.01 265)"
              stroke="oklch(0.40 0.015 265)"
            />

            {/* Hood / Engine Bay Divider (Bulkhead Firewall) */}
            <line x1="280" y1="82" x2="280" y2="318" stroke="oklch(0.42 0.015 265)" strokeWidth="1.5" />
            <text x="200" y="98" fill="oklch(0.72 0.01 260)" fontSize="9" fontFamily="monospace" fontWeight="500">
              FRONT ENGINE BAY (RUANG MESIN)
            </text>

            {/* Windshield Contour & A-Pillars */}
            <path
              d="M 285 105 L 340 115 L 340 285 L 285 295 Z"
              fill="oklch(0.16 0.01 265)"
              stroke="oklch(0.38 0.015 265)"
            />

            {/* Cabin Green-House / Roof Rails */}
            <rect
              x="350"
              y="110"
              width="340"
              height="180"
              rx="4"
              fill="oklch(0.13 0.008 265)"
              stroke="oklch(0.35 0.015 265)"
              strokeWidth="1"
            />
            <text x="440" y="125" fill="oklch(0.72 0.01 260)" fontSize="9" fontFamily="monospace" fontWeight="500">
              PASSENGER CABIN & CARGO (KABIN)
            </text>

            {/* Tailgate / Rear Bumper Contour */}
            <line x1="720" y1="85" x2="720" y2="315" stroke="oklch(0.38 0.015 265)" strokeWidth="1.2" />

            {/* 4 Wheels (Orthographic Tires & Rims) */}
            <rect x="200" y="48" width="80" height="28" rx="2" fill="oklch(0.20 0.01 265)" stroke="oklch(0.48 0.015 265)" />
            <rect x="200" y="324" width="80" height="28" rx="2" fill="oklch(0.20 0.01 265)" stroke="oklch(0.48 0.015 265)" />
            <rect x="640" y="48" width="80" height="28" rx="2" fill="oklch(0.20 0.01 265)" stroke="oklch(0.48 0.015 265)" />
            <rect x="640" y="324" width="80" height="28" rx="2" fill="oklch(0.20 0.01 265)" stroke="oklch(0.48 0.015 265)" />

            {/* Axle Lines */}
            <line x1="240" y1="76" x2="240" y2="324" stroke="oklch(0.35 0.015 265)" strokeDasharray="3 3" />
            <line x1="680" y1="76" x2="680" y2="324" stroke="oklch(0.35 0.015 265)" strokeDasharray="3 3" />
          </g>

          {/* ================= ELECTRICAL HARNESS WIRING ================= */}
          <g className="wiring-harness">
            {/* Alternator to Battery B+ Wire */}
            <path
              d="M 160 185 L 160 140 L 210 140"
              fill="none"
              stroke={isCharging ? "#10B981" : "oklch(0.40 0.015 265)"}
              strokeWidth={isCharging ? "2.5" : "1.5"}
            />

            {/* Battery B+ Wire to Cabin ORION Node (Firewall pass-through) */}
            <path
              d="M 240 140 L 290 140 L 290 180 L 490 180 L 490 190"
              fill="none"
              stroke={isBatteryCrit ? "#F45B60" : "#F59E0B"}
              strokeWidth="2"
            />

            {/* Engine Sensors to OBD-II Harness */}
            <path
              d="M 230 230 L 320 230 L 320 250 L 370 250"
              fill="none"
              stroke={t.engine_on ? "#10B981" : "oklch(0.40 0.015 265)"}
              strokeWidth="1.5"
            />

            {/* OBD-II to ORION TWAI CAN Differential Pair */}
            <path
              d="M 390 240 L 450 240 L 450 215 L 490 215"
              fill="none"
              stroke={isCanFault ? "#F45B60" : "#10B981"}
              strokeWidth="2"
              strokeDasharray={isCanFault ? "4 2" : "none"}
            />
          </g>

          {/* ================= COMPONENT PROBE HOTSPOTS ================= */}

          {/* PROBE 1: 12V BATTERY & SHUNT SENSOR (Ruang Mesin Kiri) */}
          <g
            className={cn("cursor-pointer outline-none", getNodeOpacityClass("battery"))}
            onClick={() => onSelectNode("battery")}
            onFocus={() => setFocusedNode("battery")}
            onBlur={() => setFocusedNode(null)}
            tabIndex={0}
            role="button"
            aria-label="Probe Aki 12V dan Resistor Shunt"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode("battery");
              }
            }}
          >
            {/* Keyboard Focus Ring */}
            {focusedNode === "battery" && (
              <rect
                x="195"
                y="110"
                width="60"
                height="50"
                rx="3"
                fill="none"
                stroke="#F2EFE9"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            )}

            {/* Physical Battery Box */}
            <rect
              x="200"
              y="115"
              width="50"
              height="40"
              rx="1.5"
              fill={activeNode === "battery" ? "oklch(0.24 0.02 265)" : "oklch(0.18 0.01 265)"}
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
            {/* Battery Terminals */}
            <rect x="206" y="110" width="8" height="5" fill="#F45B60" />
            <rect x="236" y="110" width="8" height="5" fill="#64748B" />
            <text x="210" y="138" fill="#F2EFE9" fontSize="9" fontWeight="bold" fontFamily="monospace">
              12V
            </text>

            {/* Probe Number Badge (Always Visible on Mobile & Desktop) */}
            <circle cx="200" cy="115" r="9" fill="#10B981" />
            <text x="196" y="118.5" fill="#0B0D11" fontSize="8" fontWeight="bold" fontFamily="monospace">
              01
            </text>

            {/* Live Readout Callout Tag (Shown on sm+ Screens) */}
            <g transform="translate(140, 20)" className="hidden sm:inline">
              <rect
                x="0"
                y="0"
                width="160"
                height="32"
                rx="1"
                fill="oklch(0.12 0.01 265 / 0.95)"
                stroke={activeNode === "battery" ? "#F2EFE9" : "oklch(0.35 0.015 265)"}
                strokeWidth={activeNode === "battery" ? "1.5" : "1"}
              />
              <line x1="85" y1="32" x2="85" y2="92" stroke="oklch(0.40 0.01 265)" strokeDasharray="2 2" />
              <text x="8" y="14" fill="oklch(0.72 0.01 260)" fontSize="8.5" fontFamily="monospace" fontWeight="600">
                PROBE 01: AKI 12V 70Ah
              </text>
              <text x="8" y="26" fill={isBatteryCrit ? "#F45B60" : isBatteryLow ? "#F59E0B" : "#10B981"} fontSize="11" fontWeight="bold" fontFamily="monospace">
                {fmtV(t.v_bat)} V <tspan fill="oklch(0.72 0.01 260)" fontSize="9">({t.adc_raw_mv} mV)</tspan>
              </text>
            </g>
          </g>

          {/* PROBE 2: ALTERNATOR & REGULATOR (Ruang Mesin Depan) */}
          <g
            className={cn("cursor-pointer outline-none", getNodeOpacityClass("alternator"))}
            onClick={() => onSelectNode("alternator")}
            onFocus={() => setFocusedNode("alternator")}
            onBlur={() => setFocusedNode(null)}
            tabIndex={0}
            role="button"
            aria-label="Probe Alternator dan Regulator"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode("alternator");
              }
            }}
          >
            {/* Keyboard Focus Ring */}
            {focusedNode === "alternator" && (
              <circle
                cx="160"
                cy="200"
                r="26"
                fill="none"
                stroke="#F2EFE9"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            )}

            {/* Alternator Pulley & Body */}
            <circle
              cx="160"
              cy="200"
              r="22"
              fill={activeNode === "alternator" ? "oklch(0.24 0.02 265)" : "oklch(0.18 0.01 265)"}
              stroke={activeNode === "alternator" ? "#F2EFE9" : isCharging ? "#10B981" : "oklch(0.35 0.015 265)"}
              strokeWidth={activeNode === "alternator" ? "2" : "1.5"}
            />
            <circle cx="160" cy="200" r="10" fill="oklch(0.12 0.01 265)" stroke="oklch(0.40 0.015 265)" />
            <text x="146" y="203" fill="#F2EFE9" fontSize="8" fontWeight="bold" fontFamily="monospace">
              ALT
            </text>

            {/* Probe Number Badge */}
            <circle cx="140" cy="185" r="9" fill={isCharging ? "#10B981" : "#F59E0B"} />
            <text x="136" y="188.5" fill="#0B0D11" fontSize="8" fontWeight="bold" fontFamily="monospace">
              02
            </text>

            {/* Live Readout Callout Tag */}
            <g transform="translate(60, 245)" className="hidden sm:inline">
              <rect
                x="0"
                y="0"
                width="165"
                height="32"
                rx="1"
                fill="oklch(0.12 0.01 265 / 0.95)"
                stroke={activeNode === "alternator" ? "#F2EFE9" : "oklch(0.35 0.015 265)"}
                strokeWidth={activeNode === "alternator" ? "1.5" : "1"}
              />
              <line x1="100" y1="0" x2="145" y2="-25" stroke="oklch(0.40 0.01 265)" strokeDasharray="2 2" />
              <text x="8" y="14" fill="oklch(0.72 0.01 260)" fontSize="8.5" fontFamily="monospace" fontWeight="600">
                PROBE 02: ALTERNATOR 130A
              </text>
              <text x="8" y="26" fill={isCharging ? "#10B981" : "oklch(0.75 0.01 260)"} fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                {isCharging ? "13.80V (PENGISIAN AKTIF)" : "0.0V (STANDBY / OFF)"}
              </text>
            </g>
          </g>

          {/* PROBE 3: ENGINE TRANSDUCERS (RPM & COOLANT SENSOR) */}
          <g
            className={cn("cursor-pointer outline-none", getNodeOpacityClass("powertrain"))}
            onClick={() => onSelectNode("powertrain")}
            onFocus={() => setFocusedNode("powertrain")}
            onBlur={() => setFocusedNode(null)}
            tabIndex={0}
            role="button"
            aria-label="Probe Sensor Putaran Mesin dan Coolant"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode("powertrain");
              }
            }}
          >
            {/* Keyboard Focus Ring */}
            {focusedNode === "powertrain" && (
              <rect
                x="210"
                y="175"
                width="55"
                height="50"
                rx="3"
                fill="none"
                stroke="#F2EFE9"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            )}

            {/* Engine Block Visual */}
            <rect
              x="215"
              y="180"
              width="45"
              height="40"
              rx="1.5"
              fill={activeNode === "powertrain" ? "oklch(0.24 0.02 265)" : "oklch(0.18 0.01 265)"}
              stroke={activeNode === "powertrain" ? "#F2EFE9" : "oklch(0.35 0.015 265)"}
              strokeWidth={activeNode === "powertrain" ? "2" : "1"}
            />
            <text x="221" y="204" fill="#F2EFE9" fontSize="8" fontWeight="bold" fontFamily="monospace">
              ENGINE
            </text>

            {/* Probe Number Badge */}
            <circle cx="215" cy="180" r="9" fill="#10B981" />
            <text x="211" y="183.5" fill="#0B0D11" fontSize="8" fontWeight="bold" fontFamily="monospace">
              03
            </text>

            {/* Live Readout Callout Tag */}
            <g transform="translate(180, 290)" className="hidden sm:inline">
              <rect
                x="0"
                y="0"
                width="155"
                height="32"
                rx="1"
                fill="oklch(0.12 0.01 265 / 0.95)"
                stroke={activeNode === "powertrain" ? "#F2EFE9" : "oklch(0.35 0.015 265)"}
                strokeWidth={activeNode === "powertrain" ? "1.5" : "1"}
              />
              <line x1="60" y1="0" x2="45" y2="-70" stroke="oklch(0.40 0.01 265)" strokeDasharray="2 2" />
              <text x="8" y="14" fill="oklch(0.72 0.01 260)" fontSize="8.5" fontFamily="monospace" fontWeight="600">
                PROBE 03: TRANSDUSER MESIN
              </text>
              <text x="8" y="26" fill="#F2EFE9" fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                {!t.engine_on || t.rpm <= 0 ? "0 RPM" : `${t.rpm} RPM`} | {!t.engine_on || t.temp_c <= 0 ? "--" : `${t.temp_c}°C`}
              </text>
            </g>
          </g>

          {/* PROBE 4: OBD-II PORT J1962 & CAN BUS (Bawah Setir Kabin) */}
          <g
            className={cn("cursor-pointer outline-none", getNodeOpacityClass("can_obd"))}
            onClick={() => onSelectNode("can_obd")}
            onFocus={() => setFocusedNode("can_obd")}
            onBlur={() => setFocusedNode(null)}
            tabIndex={0}
            role="button"
            aria-label="Probe Port OBD-II dan CAN Bus"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode("can_obd");
              }
            }}
          >
            {/* Keyboard Focus Ring */}
            {focusedNode === "can_obd" && (
              <rect
                x="362"
                y="230"
                width="42"
                height="32"
                rx="3"
                fill="none"
                stroke="#F2EFE9"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            )}

            {/* Trapezoidal OBD-II Connector Icon */}
            <path
              d="M 370 235 L 395 235 L 398 255 L 367 255 Z"
              fill={activeNode === "can_obd" ? "oklch(0.24 0.02 265)" : "oklch(0.18 0.01 265)"}
              stroke={activeNode === "can_obd" ? "#F2EFE9" : isCanFault ? "#F45B60" : "#10B981"}
              strokeWidth={activeNode === "can_obd" ? "2" : "1.5"}
            />
            <text x="372" y="248" fill="#F2EFE9" fontSize="8" fontWeight="bold" fontFamily="monospace">
              OBD
            </text>

            {/* Probe Number Badge */}
            <circle cx="367" cy="235" r="9" fill={isCanFault ? "#F45B60" : "#10B981"} />
            <text x="363" y="238.5" fill="#0B0D11" fontSize="8" fontWeight="bold" fontFamily="monospace">
              04
            </text>

            {/* Live Readout Callout Tag */}
            <g transform="translate(340, 290)" className="hidden sm:inline">
              <rect
                x="0"
                y="0"
                width="165"
                height="32"
                rx="1"
                fill="oklch(0.12 0.01 265 / 0.95)"
                stroke={activeNode === "can_obd" ? "#F2EFE9" : "oklch(0.35 0.015 265)"}
                strokeWidth={activeNode === "can_obd" ? "1.5" : "1"}
              />
              <line x1="45" y1="0" x2="45" y2="-35" stroke="oklch(0.40 0.01 265)" strokeDasharray="2 2" />
              <text x="8" y="14" fill="oklch(0.72 0.01 260)" fontSize="8.5" fontFamily="monospace" fontWeight="600">
                PROBE 04: OBD-II / CAN BUS
              </text>
              <text x="8" y="26" fill={isCanFault ? "#F45B60" : "#10B981"} fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                {t.can_ok === false ? "CAN FAULT" : "CAN OK"} | DTC: {t.dtc}
              </text>
            </g>
          </g>

          {/* PROBE 5: ORION ESP32 GATEWAY (Laci Kabin / Konsol Tengah) */}
          <g
            className={cn("cursor-pointer outline-none", getNodeOpacityClass("esp32_core"))}
            onClick={() => onSelectNode("esp32_core")}
            onFocus={() => setFocusedNode("esp32_core")}
            onBlur={() => setFocusedNode(null)}
            tabIndex={0}
            role="button"
            aria-label="Probe Gateway ORION ESP32 dan RTC"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode("esp32_core");
              }
            }}
          >
            {/* Keyboard Focus Ring */}
            {focusedNode === "esp32_core" && (
              <rect
                x="485"
                y="175"
                width="70"
                height="50"
                rx="3"
                fill="none"
                stroke="#F2EFE9"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            )}

            {/* PCB Module Silhouette */}
            <rect
              x="490"
              y="180"
              width="60"
              height="40"
              rx="1.5"
              fill={activeNode === "esp32_core" ? "oklch(0.24 0.02 265)" : "oklch(0.18 0.01 265)"}
              stroke={activeNode === "esp32_core" ? "#F2EFE9" : "#10B981"}
              strokeWidth={activeNode === "esp32_core" ? "2" : "1.5"}
            />
            {/* IC Chip on PCB */}
            <rect x="508" y="190" width="24" height="20" fill="oklch(0.10 0.008 265)" stroke="#10B981" strokeWidth="0.8" />
            <text x="496" y="202" fill="#F2EFE9" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
              ESP32
            </text>

            {/* Probe Number Badge */}
            <circle cx="490" cy="180" r="9" fill="#10B981" />
            <text x="486" y="183.5" fill="#0B0D11" fontSize="8" fontWeight="bold" fontFamily="monospace">
              05
            </text>

            {/* Live Readout Callout Tag */}
            <g transform="translate(470, 25)" className="hidden sm:inline">
              <rect
                x="0"
                y="0"
                width="175"
                height="32"
                rx="1"
                fill="oklch(0.12 0.01 265 / 0.95)"
                stroke={activeNode === "esp32_core" ? "#F2EFE9" : "oklch(0.35 0.015 265)"}
                strokeWidth={activeNode === "esp32_core" ? "1.5" : "1"}
              />
              <line x1="50" y1="32" x2="50" y2="155" stroke="oklch(0.40 0.01 265)" strokeDasharray="2 2" />
              <text x="8" y="14" fill="oklch(0.72 0.01 260)" fontSize="8.5" fontFamily="monospace" fontWeight="600">
                PROBE 05: ORION GATEWAY v1.0
              </text>
              <text x="8" y="26" fill="#10B981" fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                RTC: {t.rtc_temp_c.toFixed(1)}°C | Day: {t.daily_mah}mAh
              </text>
            </g>
          </g>

          {/* PROBE 6: RF ANTENNA & GEOFENCE (Pilar Atap Kabin) */}
          <g
            className={cn("cursor-pointer outline-none", getNodeOpacityClass("rf_network"))}
            onClick={() => onSelectNode("rf_network")}
            onFocus={() => setFocusedNode("rf_network")}
            onBlur={() => setFocusedNode(null)}
            tabIndex={0}
            role="button"
            aria-label="Probe Antena RF dan Geofence Gateway"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode("rf_network");
              }
            }}
          >
            {/* Keyboard Focus Ring */}
            {focusedNode === "rf_network" && (
              <circle
                cx="680"
                cy="200"
                r="22"
                fill="none"
                stroke="#F2EFE9"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            )}

            {/* Antenna Symbol */}
            <circle cx="680" cy="200" r="12" fill="oklch(0.18 0.01 265)" stroke={activeNode === "rf_network" ? "#F2EFE9" : "oklch(0.35 0.015 265)"} strokeWidth="1" />
            <path d="M 674 195 A 8 8 0 0 1 686 195 M 671 190 A 13 13 0 0 1 689 190" stroke={isOffline ? "oklch(0.50 0.01 260)" : "#10B981"} fill="none" strokeWidth="1.2" />
            <circle cx="680" cy="200" r="2.5" fill="#10B981" />

            {/* Probe Number Badge */}
            <circle cx="680" cy="188" r="9" fill={isOffline ? "#64748B" : "#10B981"} />
            <text x="676" y="191.5" fill="#0B0D11" fontSize="8" fontWeight="bold" fontFamily="monospace">
              06
            </text>

            {/* Live Readout Callout Tag */}
            <g transform="translate(680, 25)" className="hidden sm:inline">
              <rect
                x="0"
                y="0"
                width="165"
                height="32"
                rx="1"
                fill="oklch(0.12 0.01 265 / 0.95)"
                stroke={activeNode === "rf_network" ? "#F2EFE9" : "oklch(0.35 0.015 265)"}
                strokeWidth={activeNode === "rf_network" ? "1.5" : "1"}
              />
              <line x1="0" y1="20" x2="-20" y2="175" stroke="oklch(0.40 0.01 265)" strokeDasharray="2 2" />
              <text x="8" y="14" fill="oklch(0.72 0.01 260)" fontSize="8.5" fontFamily="monospace" fontWeight="600">
                PROBE 06: RF & GEOFENCE
              </text>
              <text x="8" y="26" fill={isOffline ? "oklch(0.70 0.01 260)" : unit.net_zone === "TECH_HOTSPOT" ? "#F59E0B" : "#10B981"} fontSize="10.5" fontWeight="bold" fontFamily="monospace">
                {unit.net_zone ?? "YARD"} ({t.rssi} dBm)
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* High-Legibility Mobile Active Probe Callout Banner (R-03 / R-25) */}
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[2px] border border-border/80 bg-background/90 px-3 py-2 sm:hidden num">
        <div className="flex items-center gap-2 min-w-0">
          <Led tone={activeProbeMeta.tone} pulse={activeProbeMeta.tone === "crimson"} />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-foreground truncate">
              {activeProbeMeta.title}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {activeProbeMeta.reading}
            </div>
          </div>
        </div>
        <span className="shrink-0 text-[9.5px] uppercase font-semibold text-muted-foreground border border-border px-1.5 py-0.5 rounded-[1px]">
          TAP SENSOR
        </span>
      </div>
    </div>
  );
}
