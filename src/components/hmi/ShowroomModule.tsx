import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { useTelemetry } from "@/context/TelemetryContext";
import { getUnitConnectionState } from "@/data/mockTelemetry";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { Led, Panel, Stat, unitTone, fmtV } from "./primitives";
import { cn } from "@/lib/utils";
import {
  formatDurationCompact,
  formatSleepInterval,
  VehicleTopologyMap,
  type TopologyNodeId,
} from "./VehicleTopologyMap";
import { ComponentNodeInspector } from "./ComponentNodeInspector";

export function ShowroomModule({ active: _active }: { active: boolean }) {
  const {
    units,
    selected,
    selectUnit,
    configs,
    dataSource,
    setActiveModule,
    history,
    pollNow,
    lastSyncTime,
    apiStatus,
    isOfflineSnapshot,
  } = useTelemetry();
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [activeTopologyNode, setActiveTopologyNode] = useState<TopologyNodeId>("battery");
  const activeUnitRef = useRef<HTMLButtonElement>(null);
  const t = selected.telemetry;
  const resolvedSsid = (t.sync_ssid || selected.sync_ssid || "").trim();
  const selectedConfig = configs[selected.unit_id];
  const tone = unitTone(selected, selectedConfig?.crit_v ?? 11.80);
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
        {/* Stage Heading (Compact 2-Row HMI Header) */}
        <div className="stage-heading relative z-10 flex shrink-0 flex-col border-b border-border/80 px-3.5 py-2.5 sm:px-4">
          {/* Quick unit switcher pill row for mobile screens */}
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

          {/* Row 1: Bay + Model Title + VIN / Manual Sync Trigger */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="num text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider">
                Bay {selected.bay} · {selected.unit_id}
              </div>
              <h1 className="mt-0.5 truncate font-display text-base font-semibold uppercase tracking-[0.06em] sm:text-lg sm:tracking-[0.08em]">
                Mitsubishi {selected.model}{" "}
                <span className="font-normal text-muted-foreground">{selected.trim}</span>
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {dataSource === "LIVE_API" && (
                <button
                  type="button"
                  onClick={pollNow}
                  title={
                    isOfflineSnapshot || apiStatus === "FALLBACK_ERROR"
                      ? "Koneksi bermasalah (Offline Cache). Klik untuk sinkronisasi ulang."
                      : "Sinkronisasi paksa endpoint get_data.php sekarang"
                  }
                  className={cn(
                    "num inline-flex min-h-[34px] sm:min-h-[30px] cursor-pointer items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    apiStatus === "FALLBACK_ERROR" || isOfflineSnapshot
                      ? "border-amber/60 bg-amber/15 text-amber hover:bg-amber/25"
                      : "border-border bg-card text-foreground hover:border-foreground/60",
                  )}
                >
                  <RefreshCw size={12} strokeWidth={1.75} aria-hidden="true" />
                  <span>Poll Live API ({lastSyncTime ?? "--"})</span>
                </button>
              )}
              <div className="hidden shrink-0 rounded-[2px] border border-border bg-background/80 px-2.5 py-1 text-right sm:block">
                <div className="label-hmi text-[9.5px]">VIN · {selected.color}</div>
                <div className="num text-[11px] font-medium text-foreground">{selected.vin}</div>
              </div>
            </div>
          </div>

          {/* Row 2: Live Status & Contextual Module Shortcuts */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5">
                <Led tone={tone} pulse={tone === "crimson" || tone === "amber"} />
                <span className="num text-xs font-medium text-foreground">{selected.status_label}</span>
              </div>
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
              {(selected.last_seen || (conn.lastSeenSec !== null && !conn.isOnline)) && (
                <span className="num text-[10.5px] text-muted-foreground">
                  Last seen:{" "}
                  <strong className="text-foreground">
                    {selected.last_seen ?? formatDurationCompact(conn.lastSeenSec)}
                  </strong>
                  {selected.last_seen && conn.lastSeenSec !== null
                    ? ` (${formatDurationCompact(conn.lastSeenSec)})`
                    : ""}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {tone === "crimson" && (
                <button
                  type="button"
                  onClick={() => setActiveModule("03")}
                  className="num inline-flex min-h-[32px] sm:min-h-[28px] cursor-pointer items-center rounded-[2px] border border-crimson/60 bg-crimson/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-crimson transition-colors hover:bg-crimson/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Antrean Pemanasan (03)
                </button>
              )}
              {(t.dtc_cnt > 0 || t.can_ok === false) && (
                <button
                  type="button"
                  onClick={() => setActiveModule("04")}
                  className="num inline-flex min-h-[32px] sm:min-h-[28px] cursor-pointer items-center rounded-[2px] border border-crimson/60 bg-crimson/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-crimson transition-colors hover:bg-crimson/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Diagnostik OBD (04)
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveModule("06")}
                className="num inline-flex min-h-[32px] sm:min-h-[28px] cursor-pointer items-center rounded-[2px] border border-border bg-card px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Kalibrasi &amp; Config (06)
              </button>
            </div>
          </div>
        </div>

        {/* Viewport: Orthographic Topology Blueprint & Component Diagnostic Inspector */}
        <div className="card-scroll relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2 sm:p-3">
          <VehicleTopologyMap
            unit={selected}
            activeNode={activeTopologyNode}
            onSelectNode={setActiveTopologyNode}
            config={selectedConfig}
            isLiveApi={dataSource === "LIVE_API"}
            className="shrink-0"
          />
          <ComponentNodeInspector
            unit={selected}
            activeNode={activeTopologyNode}
            onSelectNode={setActiveTopologyNode}
            config={selectedConfig}
            historyPoints={history[selected.unit_id]}
            isLiveApi={dataSource === "LIVE_API"}
            className="shrink-0"
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
                  ? `In Yard (Bay ${selected.bay}${resolvedSsid ? ` · SSID: ${resolvedSsid}` : ""})`
                  : (selected.telemetry?.net_zone === "TECH_HOTSPOT" || selected.net_zone === "TECH_HOTSPOT")
                    ? `Hotspot: ${resolvedSsid || "Teknisi"}`
                    : "Luar Geofence (Offline)"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-border pl-3 text-muted-foreground">
              <span>Sinkronisasi Data:</span>
              <span
                className={cn(
                  "font-medium",
                  selected.buffer_used > 0
                    ? "text-amber"
                    : !conn.isOnline
                      ? "text-muted-foreground"
                      : "text-emerald",
                )}
              >
                {selected.buffer_used > 0
                  ? `Tertunda (${selected.buffer_used} slot di Buffer)`
                  : !conn.isOnline
                    ? `Deep Sleep Hold (${selected.last_seen ? selected.last_seen.slice(11, 19) : formatDurationCompact(conn.lastSeenSec) || "Offline"})`
                    : `Real-time Uplink (${lastSyncTime ?? "Active"})`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            <span>Protokol: <strong className="text-foreground">ORION v1.6.0</strong></span>
            <span className="border-l border-border pl-3">Sinyal: <strong className="text-foreground">{t.rssi} dBm</strong></span>
            <span className="border-l border-border pl-3">Boot #{t.boot} · Seq: <strong className="text-foreground">#{t.seq ?? t.boot}</strong></span>
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
                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-11 py-1.5 num text-[11px] text-foreground outline-none placeholder:text-dim focus:border-foreground/60"
                />
                {sidebarQuery && (
                  <button
                    type="button"
                    onClick={() => setSidebarQuery("")}
                    aria-label="Clear unit filter"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    "shrink-0 rounded-[2px] border border-border bg-card/85 cursor-pointer p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full",
                    on ? "border-foreground/70 bg-foreground/[0.06]" : "hover:border-muted-foreground/60",
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
            {dataSource === "LIVE_API" && filteredSidebarUnits.length === 1 && (
              <div className="rounded-[2px] border border-border/60 bg-background/50 p-2.5 num text-[10.5px] text-muted-foreground space-y-1">
                <div className="flex items-center justify-between text-foreground font-medium">
                  <span>Node Live API Aktif</span>
                  <span className="text-emerald">Poll 3s</span>
                </div>
                <p className="leading-relaxed">
                  Terhubung ke node tunggal <strong className="text-foreground">{selected.unit_id}</strong>.{" "}
                  Sinkronisasi terakhir: {selected.last_seen ?? (lastSyncTime || "--")}.
                </p>
              </div>
            )}
            {filteredSidebarUnits.length === 0 && (
              <div className="py-6 text-center num text-xs text-muted-foreground">
                Tidak ada unit cocok dengan &ldquo;{sidebarQuery}&rdquo;.
              </div>
            )}
          </div>
        </section>

        {/* OBD-II & Node Summary (Complementary to Topology Map) */}
        <Panel title="OBD-II & Node Summary" code="PID" className="shrink-0">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-y-1.5">
            <Stat
              label="Speed / Load"
              value={!t.engine_on ? "----" : (t.speed_kmh ?? 0)}
              unit={!t.engine_on ? "" : `km/h · ${(t.load_pct ?? 0).toFixed(0)}%`}
              tone="dim"
            />
            <Stat
              label="Fuel / Rate"
              value={!t.engine_on ? "STANDBY" : `${(t.fuel_pct ?? 0).toFixed(0)}%`}
              unit={!t.engine_on ? "CAN Off" : `/ ${(t.fuel_rate_lh ?? 0).toFixed(2)} L/h`}
              tone={t.engine_on && (t.fuel_pct ?? 100) < 20 ? "amber" : "dim"}
            />
            <Stat
              label="ECU V / MIL"
              value={!t.engine_on || !t.ecu_v || t.ecu_v <= 0 ? "OFF" : t.ecu_v.toFixed(2)}
              unit={`${!t.engine_on || !t.ecu_v || t.ecu_v <= 0 ? "" : "V · "}${t.mil_on || t.dtc_cnt > 0 ? "MIL ON" : "MIL OFF"}`}
              tone={t.mil_on || t.dtc_cnt > 0 ? "crimson" : "dim"}
            />
            <Stat
              label="Dist Clr (0131)"
              value={!t.engine_on ? "----" : (t.dist_clr_km ?? 0).toLocaleString("id-ID")}
              unit={!t.engine_on ? "CAN Off" : "km"}
              tone="dim"
            />
            <Stat
              label="Daily Budget"
              value={t.daily_mah.toFixed(2)}
              unit="mAh"
              tone={t.daily_mah > 65 ? "amber" : "dim"}
            />
            <Stat
              label="Burst Queue"
              value={selected.buffer_used > 0 ? `${selected.buffer_used} Recs` : "LIVE (0)"}
              tone={selected.buffer_used > 0 ? "amber" : "emerald"}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-1.5 num text-[10px] text-muted-foreground">
            <span className="truncate">
              Siklus: <strong className="text-foreground">{formatSleepInterval(selectedConfig?.sleep_cfg ?? t.sleep_cfg)}</strong>
            </span>
            <span className="truncate text-right">
              Jaringan: <strong className="text-foreground">{resolvedSsid || selected.net_zone || "YARD"}</strong>
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
