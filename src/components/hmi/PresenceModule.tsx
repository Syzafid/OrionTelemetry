import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  HardDriveUpload,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  WifiOff,
  X,
} from "lucide-react";
import * as m from "motion/react-m";
import { useTelemetry } from "@/context/TelemetryContext";
import { OPERATIONAL_TAGS, getUnitConnectionState } from "@/data/mockTelemetry";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { DURATION, EASE_STANDARD } from "@/lib/motion-tokens";
import {
  buildMovementTripRows,
  evaluateMassDisconnectGuard,
  formatTripDuration,
  resolveRawDebounceLabel,
  resolveRawEventStatus,
} from "@/lib/presence-analytics";
import { formatDurationCompact } from "@/lib/vehicle-topology";
import { Led, Panel, fmtV } from "./primitives";
import { cn } from "@/lib/utils";

type PresenceFilter = "ALL" | "IN_YARD" | "OUT_OF_YARD" | "BURST_SYNCED";
type LogViewMode = "PAIRED" | "RAW";
type UnitScopeMode = "ALL" | "SELECTED";

const FILTER_ACTIVE_TONES = {
  dim: "border-foreground/60 bg-foreground/10 font-semibold text-foreground",
  emerald: "border-emerald/60 bg-emerald/15 font-semibold text-emerald",
  amber: "border-amber/60 bg-amber/15 font-semibold text-amber",
} as const;

export function PresenceModule() {
  const {
    units,
    selected,
    selectUnit,
    movement,
    movementPairs,
    massDisconnectGuard,
    auditLogs,
    tagMovement,
    flushBuffer,
    simulateBurstSync,
    simulate,
    dataSource,
    apiStatus,
    isOfflineSnapshot,
    lastSyncTime,
    pollNow,
    setActiveModule,
  } = useTelemetry();

  const [searchQuery, setSearchQuery] = useState("");
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("ALL");
  const [logViewMode, setLogViewMode] = useState<LogViewMode>("PAIRED");
  const [unitScope, setUnitScope] = useState<UnitScopeMode>("ALL");
  const rowsMountedRef = useRef(false);

  useEffect(() => {
    rowsMountedRef.current = true;
  }, []);

  const isLiveApi = dataSource === "LIVE_API";
  const used = selected.buffer_used;
  const conn = getUnitConnectionState(selected, isLiveApi);
  const resolvedSsid = (selected.telemetry.sync_ssid || selected.sync_ssid || "").trim();
  const activeZone =
    selected.telemetry.net_zone || selected.net_zone || (selected.in_yard ? "YARD" : "OFFLINE");

  const guardEval = useMemo(
    () => evaluateMassDisconnectGuard(units, isLiveApi, massDisconnectGuard),
    [units, isLiveApi, massDisconnectGuard],
  );

  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      if (!matchesFleetSearch(u, searchQuery)) return false;
      if (presenceFilter === "IN_YARD") return u.in_yard;
      if (presenceFilter === "OUT_OF_YARD") return !u.in_yard;
      if (presenceFilter === "BURST_SYNCED") return u.buffer_used > 0;
      return true;
    });
  }, [units, searchQuery, presenceFilter]);

  const tripRows = useMemo(
    () => buildMovementTripRows(movement, movementPairs, isLiveApi),
    [movement, movementPairs, isLiveApi],
  );

  const filteredTripRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tripRows.filter((row) => {
      if (unitScope === "SELECTED" && row.unit_id !== selected.unit_id) return false;
      if (!q) return true;
      const u = units.find((x) => x.unit_id === row.unit_id);
      return (
        row.id.toLowerCase().includes(q) ||
        row.unit_id.toLowerCase().includes(q) ||
        row.zoneRoute.toLowerCase().includes(q) ||
        (row.tag && row.tag.toLowerCase().includes(q)) ||
        (u && matchesFleetSearch(u, q))
      );
    });
  }, [tripRows, unitScope, selected.unit_id, searchQuery, units]);

  const filteredRawMovement = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return movement.filter((e) => {
      if (unitScope === "SELECTED" && e.unit_id !== selected.unit_id) return false;
      if (!q) return true;
      const u = units.find((x) => x.unit_id === e.unit_id);
      return (
        e.id.toLowerCase().includes(q) ||
        e.unit_id.toLowerCase().includes(q) ||
        (e.from_zone && e.from_zone.toLowerCase().includes(q)) ||
        (e.to_zone && e.to_zone.toLowerCase().includes(q)) ||
        (e.tag && e.tag.toLowerCase().includes(q)) ||
        (u && matchesFleetSearch(u, q))
      );
    });
  }, [movement, unitScope, selected.unit_id, searchQuery, units]);

  const burstSyncAuditRows = useMemo(
    () => auditLogs.filter((ev) => /BURST_SYNC/i.test(ev.event_type)).slice(0, 4),
    [auditLogs],
  );

  const resetAllFilters = () => {
    setSearchQuery("");
    setPresenceFilter("ALL");
    setUnitScope("ALL");
  };

  const hasActiveFilter =
    searchQuery.trim().length > 0 || presenceFilter !== "ALL" || unitScope !== "ALL";
  const visibleRowCount =
    logViewMode === "PAIRED" ? filteredTripRows.length : filteredRawMovement.length;

  return (
    <div className="module-presence flex h-full min-h-0 flex-1 flex-col gap-3">
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

      {/* Top Guard & Search/Filter Command Bar (shrink-0) */}
      <div
        data-guide-target="m05-guard"
        className="panel flex shrink-0 flex-col gap-2.5 px-3 py-2.5 sm:px-4"
      >
        <h1 className="sr-only">Presensi Yard, Buffer Offline &amp; Log Pergerakan</h1>
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2.5",
            guardEval.active && "text-amber",
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <ShieldAlert
              size={18}
              strokeWidth={1.5}
              className={cn("shrink-0", guardEval.active ? "text-amber" : "text-emerald")}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="font-display text-xs uppercase tracking-[0.08em] text-foreground">
                Proteksi Putus Wi-Fi Massal
              </div>
              <div className="num text-[11px] text-muted-foreground">{guardEval.reasonText}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 num text-xs">
            <Led tone={guardEval.active ? "amber" : "emerald"} />
            <span className="hidden sm:inline font-medium">
              {guardEval.active
                ? "Proteksi Aktif (Keberangkatan Ditahan)"
                : `Pemantauan Aktif (${guardEval.awayCount}/${guardEval.totalUnits} di luar yard)`}
            </span>
            <span className="inline sm:hidden font-medium">
              {guardEval.active
                ? "Proteksi Aktif"
                : `${guardEval.awayCount}/${guardEval.totalUnits} Luar`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search
              size={13}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Bay, Model, VIN, ID Event, Tag..."
              aria-label="Cari unit presensi dan log pergerakan"
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-11 py-1.5 num text-xs text-foreground placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Hapus pencarian presensi"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "ALL", label: "Semua", count: units.length, tone: "dim" },
                {
                  id: "IN_YARD",
                  label: "Di Dalam Yard",
                  count: guardEval.inYardCount,
                  tone: "emerald",
                },
                {
                  id: "OUT_OF_YARD",
                  label: "Di Luar Yard",
                  count: guardEval.awayCount,
                  tone: "amber",
                },
                {
                  id: "BURST_SYNCED",
                  label: "Antrean Buffer > 0",
                  count: guardEval.burstCount,
                  tone: "amber",
                },
              ] as const
            ).map((f) => {
              const active = presenceFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPresenceFilter(f.id)}
                  className={cn(
                    "num inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    active
                      ? FILTER_ACTIVE_TONES[f.tone]
                      : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{f.label}</span>
                  <span className="rounded-[2px] bg-card px-1.5 py-0.5 text-[11px] font-bold">
                    {f.count}
                  </span>
                </button>
              );
            })}

            {isLiveApi && (
              <button
                type="button"
                onClick={pollNow}
                title="Sinkronisasi data terbaru dari server sekarang"
                className="num inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-background px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>Segarkan Data ({lastSyncTime ?? "--"})</span>
              </button>
            )}
          </div>
        </div>

        {/* Sandbox Controls & Cross-Module Navigation Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 num text-[11px]">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="font-semibold text-foreground">
              {selected.bay} · {selected.model}
            </span>
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
            <span className="text-border">|</span>
            <span>
              Zona: <strong className="text-foreground">{activeZone}</strong>
              {resolvedSsid ? ` (${resolvedSsid})` : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!isLiveApi && (
              <div className="flex flex-wrap items-center gap-1.5 border-r border-border/70 pr-2 mr-0.5">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Uji Sandbox:
                </span>
                <button
                  type="button"
                  onClick={() => simulate(selected.in_yard ? "DEPARTED" : "STANDBY")}
                  className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {selected.in_yard ? "Simulasikan Keluar Yard" : "Kembalikan ke Yard"}
                </button>
                <button
                  type="button"
                  onClick={() => simulateBurstSync(selected.unit_id)}
                  className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-amber/50 bg-amber/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Simulasi 28 Data Offline
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveModule("01")}
              className="inline-flex min-h-[44px] md:min-h-[36px] cursor-pointer items-center rounded-[2px] border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Topologi &amp; RF (01)
            </button>
            <button
              type="button"
              onClick={() => setActiveModule("06")}
              className="inline-flex min-h-[44px] md:min-h-[36px] cursor-pointer items-center rounded-[2px] border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Config Debounce (06)
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Card Split Grid */}
      <div className="presence-details grid min-h-0 flex-1 gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.55fr)]">
        <Panel
          title="Presensi Unit & Antrean Dua Tingkat"
          code="BUF"
          guideTarget="m05-buffer"
          right={<span className="num text-[11px] text-muted-foreground">Maks 2.020 Slot</span>}
        >
          {/* Filtered Unit Selector Buttons (Accessible >= 44px touch target) */}
          <div className="card-scroll mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
            {filteredUnits.length > 0 ? (
              filteredUnits.map((u) => {
                const isSelected = u.unit_id === selected.unit_id;
                return (
                  <button
                    key={u.unit_id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectUnit(u.unit_id)}
                    className={cn(
                      "num inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[2px] border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isSelected
                        ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                        : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                    )}
                  >
                    {u.bay} ({u.buffer_used > 0 ? `${u.buffer_used}` : "0"})
                  </button>
                );
              })
            ) : (
              <div className="flex flex-wrap items-center gap-2 py-1 num text-xs text-muted-foreground">
                <span>Tidak ada unit sesuai filter.</span>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-semibold uppercase text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Reset Filter
                </button>
              </div>
            )}
          </div>

          {/* Architecture Spec Banner */}
          <div className="mb-3 space-y-1.5 rounded-[2px] border border-border bg-background/60 p-2.5 num text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-[11px] font-semibold text-foreground">
                Arsitektur Antrean Dua Tingkat (Two-Tier Queue)
              </span>
              <span className="rounded-[2px] border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                Kapasitas: 2.020 Slot
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
              <span>Tier 1: 20 Slot (RTC SRAM Cepat)</span>
              <span>Tier 2: 2.000 Slot (LittleFS Flash)</span>
            </div>
          </div>

          {/* Tier 1 Visualization: Honest Slot Occupancy (No fabricated hex addresses) */}
          <div className="mb-2 flex items-center justify-between num text-[11px] text-muted-foreground">
            <span className="font-sans font-medium text-foreground">
              Tier 1: Antrean RTC SRAM (20 Slot)
            </span>
            <span>{Math.min(used, 20)}/20 terisi</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {Array.from({ length: 20 }).map((_, i) => {
              const occupied = i < used;
              return (
                <div
                  key={i}
                  data-slot-active={occupied ? "1" : "0"}
                  className={cn(
                    "relative flex aspect-[1.8/1] flex-col justify-between border p-1.5 transition-colors duration-200",
                    occupied ? "border-amber/60 bg-amber/10" : "border-border",
                  )}
                >
                  <span className="num text-[11px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "num text-[11px] font-semibold tracking-tight uppercase",
                      occupied ? "text-amber" : "text-dim",
                    )}
                  >
                    {occupied ? "TERISI" : "KOSONG"}
                  </span>
                </div>
              );
            })}
          </div>

          {used > 20 && (
            <div className="mt-2.5 flex items-center justify-between rounded-[2px] border border-amber/40 bg-amber/5 p-2 num text-[11px] text-amber">
              <span className="flex items-center gap-1.5">
                <Led tone="amber" />
                Spillover Flash Non-Volatil Tier-2
              </span>
              <span className="font-semibold">+{used - 20} rekaman di LittleFS</span>
            </div>
          )}

          {/* Queue Status & Two-Way Flush Acknowledge Control */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="num text-sm">
              {used > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-amber">{used} rekaman tertahan</span>
                  <span className="rounded-[2px] border border-amber/50 bg-amber/10 px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-amber">
                    {used > 20 ? "Tier 1 + Tier 2 Flash (> 20)" : "Tier 1 RTC Cache (<= 20)"}
                  </span>
                </div>
              ) : conn.isOnline ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald">
                  <Led tone="emerald" />
                  Streaming Langsung (Antrean Kosong)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Led tone="dim" />
                  Antrean Kosong ({conn.badgeText})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {used > 0 && (
                <button
                  type="button"
                  onClick={() => flushBuffer(selected.unit_id)}
                  className="num inline-flex min-h-[44px] md:min-h-[36px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-emerald/50 bg-emerald/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald hover:bg-emerald/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CheckCircle2 size={13} strokeWidth={1.75} aria-hidden="true" />
                  <span>Konfirmasi / Reset Antrean</span>
                </button>
              )}
              <span className="num text-[11px] text-muted-foreground">
                Boot #{selected.telemetry.boot}
              </span>
            </div>
          </div>

          {/* Honest Queue Callout */}
          <div className="mt-3 rounded-[2px] border border-border bg-background/50 p-3 num text-[11px] leading-relaxed">
            <div className="flex items-center gap-2">
              <HardDriveUpload
                size={14}
                className={
                  used > 0 ? "text-amber" : conn.isOnline ? "text-emerald" : "text-muted-foreground"
                }
                aria-hidden="true"
              />
              <span className="font-semibold text-foreground">
                {used > 0
                  ? `Antrean Offline Aktif (${used} Rekaman Menunggu Burst Sync)`
                  : conn.isOnline
                    ? "Sinkronisasi Live Penuh (Antrean Kosong)"
                    : `Unit Sedang Standby / Offline (${conn.badgeText})`}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {used > 0
                ? "Node menyimpan rekaman di Tier-1 RTC SRAM & Tier-2 LittleFS Flash selama terputus. Firmware ESP32 mengirim batch FIFO per 5 rekaman secara otomatis begitu terhubung ke Wi-Fi gudang atau hotspot teknisi."
                : conn.isOnline
                  ? "Seluruh rekaman telah terkirim ke server tanpa penumpukan pada memori flash lokal."
                  : "Memori antrean di node kosong (0 tertahan). Data akan kembali mengalir saat siklus bangun atau kontak ON berikutnya."}
            </p>
          </div>

          {/* Real Burst Sync History from audit_logs */}
          <div className="mt-3 rounded-[2px] border border-border/80 bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="label-hmi text-[11px] text-foreground flex items-center gap-1.5">
                <History
                  size={12}
                  strokeWidth={1.75}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
                Riwayat Burst Sync Terkirim (Audit Server)
              </span>
              <span className="num text-[11px] text-muted-foreground">
                {burstSyncAuditRows.length} Terbaru
              </span>
            </div>
            {burstSyncAuditRows.length > 0 ? (
              <ul className="space-y-1.5 num text-[11px]">
                {burstSyncAuditRows.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border/40 pt-1.5 first:border-t-0 first:pt-0"
                  >
                    <span className="text-foreground/90">{ev.message}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {ev.created_at}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="num text-[11px] text-muted-foreground">
                Belum ada histori event BURST_SYNC yang tercatat pada sesi audit ini.
              </p>
            )}
          </div>

          {/* Filtered Fleet Presence Directory */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="label-hmi mb-2 text-[11px]">
              Direktori Presensi Armada ({filteredUnits.length} Unit)
            </div>
            {filteredUnits.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-border p-4 text-center num text-xs text-muted-foreground space-y-2">
                <div>Tidak ada unit yang cocok dengan filter aktif.</div>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border border-border bg-secondary/50 px-3 py-1 text-[11px] font-semibold uppercase text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Reset Filter
                </button>
              </div>
            ) : (
              <div className="flex flex-row flex-nowrap overflow-x-auto snap-x snap-mandatory gap-2 pb-2 lg:flex-col lg:overflow-visible lg:space-y-1.5 card-scroll">
                {filteredUnits.map((u) => {
                  const uConn = getUnitConnectionState(u, isLiveApi);
                  const uZone = u.telemetry?.net_zone || u.net_zone || "";
                  const isTechHotspot = !u.in_yard && uZone === "TECH_HOTSPOT";
                  return (
                    <button
                      key={u.unit_id}
                      type="button"
                      aria-pressed={u.unit_id === selected.unit_id}
                      onClick={() => selectUnit(u.unit_id)}
                      className={cn(
                        "flex min-h-[44px] shrink-0 cursor-pointer items-center justify-between rounded-[2px] border px-2.5 py-2 text-left num text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "w-[235px] snap-start lg:w-full",
                        u.unit_id === selected.unit_id
                          ? "border-foreground/70 bg-foreground/[0.06]"
                          : "border-border bg-background/40 hover:border-muted-foreground",
                      )}
                    >
                      <div className="min-w-0 pr-1.5">
                        <span className="font-semibold text-foreground">{u.bay}</span>{" "}
                        <span className="font-medium text-foreground truncate block sm:inline">
                          {u.model}
                        </span>{" "}
                        <span className="text-[11px] text-muted-foreground">({u.trim})</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-muted-foreground">
                          {fmtV(u.telemetry.v_bat)}V
                        </span>
                        <span
                          className={cn(
                            "rounded-[2px] border px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                            u.in_yard
                              ? uConn.isOnline
                                ? "border-emerald/40 bg-emerald/15 text-emerald"
                                : "border-border bg-secondary/70 text-foreground"
                              : isTechHotspot
                                ? "border-amber/50 bg-amber/15 text-amber"
                                : "border-amber/40 bg-amber/10 text-amber",
                          )}
                        >
                          {u.in_yard
                            ? uConn.isOnline
                              ? "DI YARD · LIVE"
                              : "DI YARD · SLEEP"
                            : isTechHotspot
                              ? "HOTSPOT TEKNISI"
                              : "DI LUAR YARD"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Log Pergerakan & Transisi Zona"
          code="LOG"
          guideTarget="m05-log-table"
          right={
            <div
              data-guide-target="m05-log-controls"
              className="flex flex-wrap items-center gap-1.5"
            >
              <div className="flex items-center gap-1" role="group" aria-label="Cakupan unit log">
                <button
                  type="button"
                  aria-pressed={unitScope === "ALL"}
                  onClick={() => setUnitScope("ALL")}
                  className={cn(
                    "num min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    unitScope === "ALL"
                      ? "border-foreground/70 bg-foreground/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  Semua Unit
                </button>
                <button
                  type="button"
                  aria-pressed={unitScope === "SELECTED"}
                  onClick={() => setUnitScope("SELECTED")}
                  className={cn(
                    "num min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    unitScope === "SELECTED"
                      ? "border-foreground/70 bg-foreground/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  Unit {selected.bay}
                </button>
              </div>
              <div
                className="flex items-center gap-1 border-l border-border pl-1.5"
                role="group"
                aria-label="Mode tampilan log pergerakan"
              >
                <button
                  type="button"
                  aria-pressed={logViewMode === "PAIRED"}
                  onClick={() => setLogViewMode("PAIRED")}
                  className={cn(
                    "num min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    logViewMode === "PAIRED"
                      ? "border-emerald/60 bg-emerald/15 text-emerald"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  Sesi Keluar-Masuk
                </button>
                <button
                  type="button"
                  aria-pressed={logViewMode === "RAW"}
                  onClick={() => setLogViewMode("RAW")}
                  className={cn(
                    "num min-h-[44px] md:min-h-[36px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    logViewMode === "RAW"
                      ? "border-foreground/70 bg-foreground/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  Transisi 4-Zona
                </button>
              </div>
            </div>
          }
        >
          {visibleRowCount === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[2px] border border-dashed border-border p-8 text-center num text-xs text-muted-foreground space-y-2">
              <div className="font-semibold text-foreground">
                {hasActiveFilter
                  ? "Tidak ada log pergerakan cocok dengan filter atau pencarian."
                  : "Belum ada catatan pergerakan unit di luar area gudang."}
              </div>
              <p className="max-w-md text-[11px]">
                Event keluar-masuk otomatis dicatat saat unit meninggalkan jangkauan Wi-Fi gudang
                melewati debounce 3x miss scan.
              </p>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="min-h-[40px] cursor-pointer rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[11px] font-semibold uppercase text-foreground hover:border-foreground/60"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : logViewMode === "PAIRED" ? (
            <>
              {/* Mobile Card Stack (< md): zero horizontal scroll leak */}
              <div className="space-y-2.5 md:hidden">
                {filteredTripRows.map((row) => {
                  const u = units.find((x) => x.unit_id === row.unit_id);
                  return (
                    <div
                      key={row.id}
                      className="rounded-[2px] border border-border bg-card/60 p-3 space-y-2 num text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold text-foreground">{row.id}</span>
                          <div className="text-[11px] text-muted-foreground">
                            {u?.model ?? row.unit_id} (Bay {u?.bay ?? "--"})
                          </div>
                        </div>
                        <span className="rounded-[2px] border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-foreground">
                          {row.durationLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-2 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Keluar:</span>
                          <span className="text-foreground">{row.exitTime}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Kembali:</span>
                          {row.isStillAway ? (
                            <span className="inline-flex items-center gap-1.5 text-amber font-semibold">
                              <Led tone="amber" />
                              Masih di Luar
                            </span>
                          ) : (
                            <span className="text-foreground">{row.returnTime ?? "Selesai"}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
                        <span>{row.zoneRoute}</span>
                        <span>{row.debounceText}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {OPERATIONAL_TAGS.map((tg) => {
                          const on = row.tag === tg;
                          return (
                            <button
                              key={tg}
                              type="button"
                              aria-pressed={on}
                              onClick={() => tagMovement(row.id, tg, row.pairedId ?? undefined)}
                              className={cn(
                                "num min-h-[44px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors",
                                on
                                  ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                                  : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                              )}
                            >
                              {tg}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop & Tablet Table (>= md) */}
              <div className="hidden md:block card-scroll overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        "Sesi / Event",
                        "Kendaraan & Zona",
                        "Waktu Keluar",
                        "Waktu Kembali",
                        "Durasi",
                        "Debounce",
                        "Tag Operasional",
                      ].map((h) => (
                        <th key={h} className="label-hmi py-2 pr-3 font-normal whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTripRows.map((row) => {
                      const u = units.find((x) => x.unit_id === row.unit_id);
                      return (
                        <m.tr
                          key={row.id}
                          initial={rowsMountedRef.current ? { opacity: 0, y: -4 } : false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: DURATION.instant, ease: EASE_STANDARD }}
                          className="border-b border-border/60"
                        >
                          <td className="num py-2.5 pr-3 text-[11px] font-medium text-foreground">
                            <div>{row.id}</div>
                            {row.pairedId && (
                              <div className="text-[11px] text-muted-foreground">
                                Masuk: {row.pairedId}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-display text-[11px] font-medium uppercase tracking-wider">
                              {u?.model ?? row.unit_id}
                            </div>
                            <div className="num text-[11px] text-muted-foreground">
                              Bay {u?.bay ?? "--"} · {row.zoneRoute}
                            </div>
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px] whitespace-nowrap">
                            {row.exitTime}
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px] whitespace-nowrap">
                            {row.isStillAway ? (
                              <span className="inline-flex items-center gap-1.5 text-amber font-semibold">
                                <Led tone="amber" />
                                Masih di Luar
                              </span>
                            ) : (
                              <span>{row.returnTime ?? "Selesai"}</span>
                            )}
                          </td>
                          <td
                            className="num py-2.5 pr-3 text-[11px] whitespace-nowrap"
                            title={
                              row.clockAdjusted
                                ? "Estimasi waktu server akibat sinkronisasi jam NTP RTC"
                                : undefined
                            }
                          >
                            <span className="font-semibold text-foreground">
                              {row.durationLabel}
                            </span>
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px] text-emerald whitespace-nowrap">
                            {row.debounceText}
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {OPERATIONAL_TAGS.map((tg) => {
                                const on = row.tag === tg;
                                return (
                                  <button
                                    key={tg}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() =>
                                      tagMovement(row.id, tg, row.pairedId ?? undefined)
                                    }
                                    className={cn(
                                      "num min-h-[38px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors",
                                      on
                                        ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                                        : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    {tg}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </m.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* RAW 4-ZONE TRANSITION VIEW */
            <>
              <div className="space-y-2.5 md:hidden">
                {filteredRawMovement.map((e) => {
                  const u = units.find((x) => x.unit_id === e.unit_id);
                  const rawStatus = resolveRawEventStatus(e);
                  const durLabel = formatTripDuration(
                    e.durasi_di_luar_sec,
                    e.away_min,
                    e.clock_adjusted,
                  );
                  return (
                    <div
                      key={e.id}
                      className="rounded-[2px] border border-border bg-card/60 p-3 space-y-2 num text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{e.id}</span>
                        <span className="rounded-[2px] border border-border bg-secondary/50 px-2 py-0.5 text-[11px]">
                          {e.event_type ?? "EXIT_YARD"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {u?.model ?? e.unit_id} (Bay {u?.bay ?? "--"}) · {e.from_zone ?? "YARD"}{" "}
                        -&gt; {e.to_zone ?? "OFFLINE"}
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span>{e.departed}</span>
                        <span>
                          {durLabel} · {resolveRawDebounceLabel(e)}
                        </span>
                      </div>
                      <div className="text-[11px]">
                        Status:{" "}
                        <strong
                          className={rawStatus.isStillAway ? "text-amber" : "text-foreground"}
                        >
                          {rawStatus.label}
                        </strong>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {OPERATIONAL_TAGS.map((tg) => (
                          <button
                            key={tg}
                            type="button"
                            aria-pressed={e.tag === tg}
                            onClick={() => tagMovement(e.id, tg)}
                            className={cn(
                              "num min-h-[44px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors",
                              e.tag === tg
                                ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                                : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                            )}
                          >
                            {tg}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block card-scroll overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        "Event ID",
                        "Kendaraan",
                        "Transisi Zona",
                        "Waktu Event",
                        "Kembali / Status",
                        "Durasi",
                        "Debounce",
                        "Tag",
                      ].map((h) => (
                        <th key={h} className="label-hmi py-2 pr-3 font-normal whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRawMovement.map((e) => {
                      const u = units.find((x) => x.unit_id === e.unit_id);
                      const rawStatus = resolveRawEventStatus(e);
                      const durLabel = formatTripDuration(
                        e.durasi_di_luar_sec,
                        e.away_min,
                        e.clock_adjusted,
                      );
                      const isEnter = e.event_type === "ENTER_YARD";
                      return (
                        <tr key={e.id} className="border-b border-border/60">
                          <td className="num py-2.5 pr-3 text-[11px] font-medium text-foreground">
                            {e.id}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-display text-[11px] font-medium uppercase tracking-wider">
                              {u?.model ?? e.unit_id}
                            </div>
                            <div className="num text-[11px] text-muted-foreground">
                              Bay {u?.bay ?? "--"}
                            </div>
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px]">
                            <span
                              className={cn(
                                "rounded-[2px] border px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                                isEnter
                                  ? "border-emerald/40 bg-emerald/10 text-emerald"
                                  : "border-amber/40 bg-amber/10 text-amber",
                              )}
                            >
                              {e.from_zone ?? "YARD"} -&gt; {e.to_zone ?? "OFFLINE"}
                            </span>
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px] whitespace-nowrap">
                            {e.departed}
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px] whitespace-nowrap">
                            {rawStatus.isStillAway ? (
                              <span className="inline-flex items-center gap-1.5 text-amber font-semibold">
                                <Led tone="amber" />
                                {rawStatus.label}
                              </span>
                            ) : (
                              <span>{rawStatus.label}</span>
                            )}
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px] whitespace-nowrap">
                            {durLabel}
                          </td>
                          <td className="num py-2.5 pr-3 text-[11px] text-emerald whitespace-nowrap">
                            {resolveRawDebounceLabel(e)}
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {OPERATIONAL_TAGS.map((tg) => (
                                <button
                                  key={tg}
                                  type="button"
                                  aria-pressed={e.tag === tg}
                                  onClick={() => tagMovement(e.id, tg)}
                                  className={cn(
                                    "num min-h-[38px] cursor-pointer rounded-[2px] border px-2 py-1 text-[11px] uppercase tracking-wider transition-colors",
                                    e.tag === tg
                                      ? "border-foreground/70 bg-foreground/10 font-semibold text-foreground"
                                      : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  {tg}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
