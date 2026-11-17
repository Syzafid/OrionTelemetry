import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTelemetry } from "@/context/TelemetryContext";
import { getUnitConnectionState } from "@/data/mockTelemetry";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { Led, Panel, Stat, unitTone, fmtV } from "./primitives";
import { cn } from "@/lib/utils";
import { VehicleTopologyMap, type TopologyNodeId } from "./VehicleTopologyMap";
import { ComponentNodeInspector } from "./ComponentNodeInspector";

export function ShowroomModule({ active: _active }: { active: boolean }) {
  const { units, selected, selectUnit, configs, dataSource } = useTelemetry();
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [activeTopologyNode, setActiveTopologyNode] = useState<TopologyNodeId>("battery");
  const activeUnitRef = useRef<HTMLButtonElement>(null);
  const t = selected.telemetry;
  const tone = unitTone(selected, configs[selected.unit_id]?.crit_v ?? 11.80);
  const conn = getUnitConnectionState(selected, dataSource === "LIVE_API");

  const filteredSidebarUnits = useMemo(
    () => units.filter((u) => matchesFleetSearch(u, sidebarQuery)),
    [units, sidebarQuery],
  );

  // Auto-scroll the active unit card into view inside the horizontal mobile strip
  useEffect(() => {
    if (activeUnitRef.current && typeof activeUnitRef.current.scrollIntoView === "function") {
      activeUnitRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selected.unit_id]);

  return (
    <div className="module-showroom grid h-full min-h-0 gap-4 [&>*]:min-w-0 lg:grid-cols-[290px_1fr]">
      {/* Main Telemetry & Electrical Topology Workbench */}
      <section className="showroom-stage panel relative order-1 flex min-h-[400px] flex-col overflow-hidden md:order-2 lg:min-h-0">
        {/* Stage Heading */}
        <div className="stage-heading relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border/80 p-3.5 sm:p-4 md:p-5">
          <div className="min-w-0 flex-1">
            {/* Quick unit switcher pill row for mobile screens (Single source on mobile) */}
            <div className="card-scroll mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 lg:hidden">
              <span className="label-hmi mr-0.5 shrink-0 text-[10px]">UNIT:</span>
              {units.map((u) => {
                const on = u.unit_id === selected.unit_id;
                const tn = unitTone(u, configs[u.unit_id]?.crit_v ?? 11.80);
                return (
                  <button
                    key={u.unit_id}
                    onClick={() => selectUnit(u.unit_id)}
                    type="button"
                    className={cn(
                      "flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border px-2.5 py-1 num text-[10.5px] uppercase transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      on
                        ? "border-foreground/70 bg-foreground/[0.06] font-semibold text-foreground"
                        : "border-border text-muted-foreground hover:bg-card/60 hover:text-foreground",
                    )}
                  >
                    <Led tone={tn} pulse={tn === "crimson"} />
                    <span>{u.bay}</span>
                    <span className="text-muted-foreground">({fmtV(u.telemetry.v_bat)}V)</span>
                  </button>
                );
              })}
            </div>

            <div className="num text-[11px] font-medium text-muted-foreground">
              Bay {selected.bay} ({selected.unit_id})
            </div>
            <h1 className="mt-0.5 truncate font-display text-lg font-semibold uppercase tracking-[0.06em] sm:mt-1 sm:text-xl sm:tracking-[0.08em] md:text-2xl md:tracking-[0.1em]">
              {selected.model} <span className="font-normal text-muted-foreground">{selected.trim}</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Led tone={tone} pulse={tone === "crimson" || tone === "amber"} />
              <span className="num text-xs">{selected.status_label}</span>
              <span
                className={cn(
                  "num inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  conn.isOnline
                    ? "border-emerald/50 bg-emerald/15 text-emerald"
                    : "border-border bg-secondary/80 text-muted-foreground",
                )}
              >
                <Led tone={conn.isOnline ? "emerald" : "dim"} />
                {conn.lastSeenSec !== null && conn.isOnline
                  ? `LIVE / ONLINE (${conn.lastSeenSec}s)`
                  : conn.badgeText}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden shrink-0 rounded-[2px] border border-border bg-card/90 px-3.5 py-2 text-right md:block">
              <div className="label-hmi text-[10px]">VIN</div>
              <div className="num text-xs font-medium">{selected.vin}</div>
              <div className="label-hmi mt-0.5 text-[10px]">{selected.color}</div>
            </div>
          </div>
        </div>

        {/* Viewport: Orthographic Topology Blueprint & Component Diagnostic Inspector */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto p-2 sm:p-3">
          <VehicleTopologyMap
            unit={selected}
            activeNode={activeTopologyNode}
            onSelectNode={setActiveTopologyNode}
            className="flex-1 min-h-[380px]"
          />
          <ComponentNodeInspector
            unit={selected}
            activeNode={activeTopologyNode}
            onSelectNode={setActiveTopologyNode}
            className="mt-2.5"
          />
        </div>

        {/* Telemetry Link & Node Heartbeat Ribbon */}
        <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-2.5 num text-[10.5px]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Led tone={t.engine_on ? "emerald" : "dim"} pulse={t.engine_on} />
              <span className="font-semibold uppercase tracking-wider text-foreground">
                ECU: {t.engine_on ? "RUN (CRANK ACTIVE)" : "STANDBY (KEY OFF)"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-border pl-3 text-muted-foreground">
              <span>Lokasi Node:</span>
              <span
                className={cn(
                  "font-medium",
                  selected.in_yard
                    ? "text-emerald"
                    : (selected.telemetry?.net_zone === "TECH_HOTSPOT" || selected.net_zone === "TECH_HOTSPOT")
                      ? "text-emerald"
                      : "text-amber",
                )}
              >
                {selected.in_yard
                  ? `In Yard (Bay ${selected.bay})`
                  : (selected.telemetry?.net_zone === "TECH_HOTSPOT" || selected.net_zone === "TECH_HOTSPOT")
                    ? `Hotspot: ${selected.telemetry?.sync_ssid || selected.sync_ssid || "Teknisi"}`
                    : "Luar Geofence (Offline)"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-border pl-3 text-muted-foreground">
              <span>Sinkronisasi Data:</span>
              <span className={cn("font-medium", selected.buffer_used > 0 ? "text-amber" : "text-emerald")}>
                {selected.buffer_used > 0 ? `Tertunda (${selected.buffer_used} slot)` : "Real-time Uplink"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            <span>Protokol: <strong className="text-foreground">ORION v1.4.1</strong></span>
            <span className="border-l border-border pl-3">Sinyal: <strong className="text-foreground">{t.rssi} dBm</strong></span>
            <span className="border-l border-border pl-3">Seq: <strong className="text-foreground">#{t.seq ?? t.boot}</strong></span>
          </div>
        </div>
      </section>

      {/* Sidebar: Stock Yard Units (Desktop List) & Live Payload */}
      <div className="showroom-sidebar order-2 flex min-h-0 flex-col gap-3 md:order-1">
        {/* Unit List: Shown on desktop; hidden on mobile where top switcher is used */}
        <section
          aria-label="Stock Yard Units"
          className="panel hidden lg:flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <header className="shrink-0 border-b border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="label-hmi text-foreground">Stock Yard Units</h3>
              <span className="num text-[10px] text-muted-foreground">
                {filteredSidebarUnits.length}/{units.length} Active
              </span>
            </div>
            {units.length > 3 && (
              <div className="relative">
                <Search
                  size={13}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={sidebarQuery}
                  onChange={(e) => setSidebarQuery(e.target.value)}
                  placeholder="Filter Bay, Model, VIN..."
                  aria-label="Filter stock yard units"
                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-8 py-1.5 num text-[11px] text-foreground outline-none placeholder:text-dim focus:border-foreground/60"
                />
                {sidebarQuery && (
                  <button
                    type="button"
                    onClick={() => setSidebarQuery("")}
                    aria-label="Clear unit filter"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <X size={13} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </header>

          <div className="unit-list card-scroll flex flex-1 min-h-0 flex-col overflow-y-auto gap-2.5 p-3 pb-3" tabIndex={0}>
            {filteredSidebarUnits.map((u) => {
              const on = u.unit_id === selected.unit_id;
              const tn = unitTone(u, configs[u.unit_id]?.crit_v ?? 11.80);
              const uConn = getUnitConnectionState(u, dataSource === "LIVE_API");
              return (
                <button
                  key={u.unit_id}
                  ref={on ? activeUnitRef : undefined}
                  onClick={() => selectUnit(u.unit_id)}
                  type="button"
                  className={cn(
                    "panel shrink-0 cursor-pointer p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full",
                    on ? "border-foreground/70 bg-foreground/[0.05]" : "hover:border-muted-foreground/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-[10px] text-muted-foreground">BAY {u.bay}</span>
                    <span
                      className={cn(
                        "num inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        uConn.isOnline
                          ? "border-emerald/45 bg-emerald/15 text-emerald"
                          : "border-border bg-secondary/70 text-muted-foreground",
                      )}
                    >
                      <Led tone={uConn.isOnline ? "emerald" : "dim"} />
                      {uConn.isOnline ? "LIVE / ONLINE" : "OFFLINE / SLEEP"}
                    </span>
                  </div>
                  <div className="mt-1 font-display text-sm font-semibold uppercase tracking-widest">{u.model}</div>
                  <div className="label-hmi text-[10px]">{u.trim}</div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={cn("num text-[10px] truncate", `text-${tn}`)}>{u.status_label}</span>
                    <span className="num shrink-0 text-xs">
                      {fmtV(u.telemetry.v_bat)} V{" "}
                      <span className="text-[10px] text-muted-foreground">({u.telemetry.adc_raw_mv}mV)</span>
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredSidebarUnits.length === 0 && (
              <div className="py-6 text-center num text-xs text-muted-foreground">
                Tidak ada unit cocok dengan &ldquo;{sidebarQuery}&rdquo;.
              </div>
            )}
          </div>
        </section>

        {/* Live Payload Summary */}
        <Panel title="Live Payload" code="RX" className="shrink-0">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-y-1.5">
            <Stat label="Battery" value={fmtV(t.v_bat)} unit="V" tone={tone === "emerald" ? "dim" : tone} />
            <Stat label="ADC Pin 34" value={t.adc_raw_mv} unit="mV" tone="dim" />
            <Stat label="RPM" value={!t.engine_on || t.rpm <= 0 ? "----" : t.rpm} tone={t.engine_on ? "emerald" : "dim"} />
            <Stat
              label="Coolant"
              value={!t.engine_on || t.temp_c <= 0 ? "----" : t.temp_c}
              unit={!t.engine_on || t.temp_c <= 0 ? "" : "°C"}
              tone={t.engine_on && t.temp_c > 105 ? "crimson" : "dim"}
            />
            <Stat label="RTC Temp" value={t.rtc_temp_c.toFixed(1)} unit="°C" tone="dim" />
            <Stat label="Sleep Current" value={t.engine_on ? "ACTIVE" : t.shunt_sleep_ua} unit={t.engine_on ? "" : "µA"} tone="dim" />
            <Stat
              label="Burst Sync"
              value={selected.buffer_used > 0 ? `${selected.buffer_used} Recs` : "LIVE (0)"}
              tone={selected.buffer_used > 0 ? "amber" : "emerald"}
            />
            <Stat
              label="CAN Bus TWAI"
              value={t.can_ok === false ? "ERROR" : "OK (500k)"}
              tone={t.can_ok === false ? "crimson" : "dim"}
            />
            <Stat
              label="Uplink Seq"
              value={`#${t.seq ?? t.boot}`}
              unit={`${t.rssi} dBm`}
              tone={t.rssi < -85 ? "amber" : "dim"}
            />
            <Stat
              label="Speed / Load"
              value={!t.engine_on ? "----" : (t.speed_kmh ?? 0)}
              unit={!t.engine_on ? "" : `km/h · ${(t.load_pct ?? 0).toFixed(0)}%`}
              tone="dim"
            />
            <Stat
              label="Fuel / Rate"
              value={`${(t.fuel_pct ?? 74.5).toFixed(0)}%`}
              unit={!t.engine_on ? "/ ----" : `/ ${(t.fuel_rate_lh ?? 0).toFixed(2)} L/h`}
              tone={(t.fuel_pct ?? 74.5) < 20 ? "amber" : "dim"}
            />
            <Stat
              label="ECU V / MIL"
              value={!t.engine_on || !t.ecu_v || t.ecu_v <= 0 ? "----" : t.ecu_v.toFixed(2)}
              unit={`${!t.engine_on || !t.ecu_v || t.ecu_v <= 0 ? "" : "V · "}${t.mil_on || t.dtc_cnt > 0 ? "MIL ON" : "MIL OFF"}`}
              tone={t.mil_on || t.dtc_cnt > 0 ? "crimson" : "dim"}
            />
            <Stat
              label="Dist Clr (0131)"
              value={(t.dist_clr_km ?? 1420).toLocaleString("id-ID")}
              unit="km"
              tone="dim"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
