import { useEffect, useMemo, useRef, useState } from "react";
import { HardDriveUpload, Search, ShieldAlert, X } from "lucide-react";
import * as m from "motion/react-m";
import { useTelemetry } from "@/context/TelemetryContext";
import { OPERATIONAL_TAGS } from "@/data/mockTelemetry";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { DURATION, EASE_STANDARD } from "@/lib/motion-tokens";
import { Led, Panel, Pill, fmtV } from "./primitives";
import { cn } from "@/lib/utils";

type PresenceFilter = "ALL" | "IN_YARD" | "OUT_OF_YARD" | "BURST_SYNCED";

export function PresenceModule() {
  const { units, selected, selectUnit, movement, tagMovement } = useTelemetry();
  const [searchQuery, setSearchQuery] = useState("");
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("ALL");
  const slotGridRef = useRef<HTMLDivElement>(null);
  const rowsMountedRef = useRef(false);

  useEffect(() => {
    rowsMountedRef.current = true;
  }, []);

  const used = selected.buffer_used;
  const awayCount = units.filter((u) => !u.in_yard).length;
  const inYardCount = units.length - awayCount;
  const burstCount = units.filter((u) => u.buffer_used > 0).length;
  const massDisconnect = awayCount >= Math.ceil(units.length * 0.66);

  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      if (!matchesFleetSearch(u, searchQuery)) return false;
      if (presenceFilter === "IN_YARD") return u.in_yard;
      if (presenceFilter === "OUT_OF_YARD") return !u.in_yard;
      if (presenceFilter === "BURST_SYNCED") return u.buffer_used > 0;
      return true;
    });
  }, [units, searchQuery, presenceFilter]);

  const filteredMovement = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return movement;
    return movement.filter((e) => {
      const u = units.find((x) => x.unit_id === e.unit_id);
      return (
        e.id.toLowerCase().includes(q) ||
        e.unit_id.toLowerCase().includes(q) ||
        (e.tag && e.tag.toLowerCase().includes(q)) ||
        (u && matchesFleetSearch(u, q))
      );
    });
  }, [movement, units, searchQuery]);

  return (
    <div className="module-presence flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Top Guard & Search/Filter Command Bar (shrink-0) */}
      <div className="panel flex shrink-0 flex-col gap-2.5 px-3 py-2.5 sm:px-4">
        <div className={cn("flex flex-wrap items-center justify-between gap-2.5", massDisconnect && "text-amber")}>
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <ShieldAlert
              size={18}
              strokeWidth={1.5}
              className={cn("shrink-0", massDisconnect ? "text-amber" : "text-emerald")}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="font-display text-xs uppercase tracking-[0.16em] sm:tracking-[0.2em]">
                Mass Disconnect Guard
              </div>
              <div className="num text-[9.5px] text-muted-foreground sm:text-[10px]">
                Trigger: &ge; 66% units offline within 1 wake window (AP outage protection)
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 num text-xs">
            <Led tone={massDisconnect ? "amber" : "emerald"} pulse={massDisconnect} />
            <span className="hidden sm:inline">
              {massDisconnect
                ? "Active (Departures held for review)"
                : `Monitoring (${awayCount}/${units.length} out of yard)`}
            </span>
            <span className="inline sm:hidden">{massDisconnect ? "Active" : `${awayCount}/${units.length} Away`}</span>
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
              placeholder="Search Bay, Model, VIN, Event ID..."
              aria-label="Search yard presence units and movement logs"
              className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-8 py-1.5 num text-xs text-foreground outline-none placeholder:text-dim focus:border-foreground/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear presence search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X size={13} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "ALL", label: "All", count: units.length, tone: "dim" },
                { id: "IN_YARD", label: "In Yard", count: inYardCount, tone: "emerald" },
                { id: "OUT_OF_YARD", label: "Out of Yard", count: awayCount, tone: "amber" },
                { id: "BURST_SYNCED", label: "Burst Synced > 0", count: burstCount, tone: "amber" },
              ] as const
            ).map((f) => {
              const active = presenceFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPresenceFilter(f.id)}
                  className={cn(
                    "num inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    active
                      ? f.tone === "dim"
                        ? "border-foreground/60 bg-foreground/10 font-semibold text-foreground"
                        : cn("border-current bg-current/15 font-semibold", `text-${f.tone}`)
                      : "border-border bg-background/50 text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{f.label}</span>
                  <span className="rounded-[2px] bg-card px-1.5 py-0.5 text-[10px] font-bold">{f.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main 2-Card Split Grid (Each Card uses Internal Card Scroll) */}
      <div className="presence-details grid min-h-0 flex-1 gap-4 [&>*]:min-w-0 xl:grid-cols-[1fr_1.55fr]">
        <Panel
          title="Unit Presence & Two-Tier Queue"
          code="BUF"
          right={<span className="num text-[10px] text-muted-foreground">2,020 Slots Max</span>}
        >
          {/* Filtered Unit Selector Pills (Horizontal Scroll) */}
          <div className="card-scroll mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
            {filteredUnits.map((u) => (
              <div key={u.unit_id} className="shrink-0">
                <Pill
                  tone="dim"
                  active={u.unit_id === selected.unit_id}
                  onClick={() => selectUnit(u.unit_id)}
                >
                  {u.bay} ({u.buffer_used > 0 ? `${u.buffer_used}` : "0"})
                </Pill>
              </div>
            ))}
          </div>

          {/* Architecture Spec Banner */}
          <div className="mb-3 space-y-1.5 rounded-[2px] border border-border bg-background/60 p-2.5 num text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-sans text-[11px] font-semibold text-foreground">
                Arsitektur Antrean Dua Tingkat (Two-Tier Queue)
              </span>
              <span className="rounded-[2px] border border-border bg-secondary/60 px-1.5 py-0.5 text-[9.5px] font-medium text-foreground">
                Kapasitas: 2.020 Slot
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>Tier 1: 20 Slot (RTC SRAM Cepat)</span>
              <span>Tier 2: 2.000 Slot (LittleFS Flash)</span>
            </div>
          </div>

          {/* Tier 1 Visualization: 20 Fast Cache Slots */}
          <div className="mb-2 flex items-center justify-between num text-[10px] text-muted-foreground">
            <span className="font-sans font-medium text-foreground">Tier 1: Fast Write RTC SRAM (20 Slot)</span>
            <span>{Math.min(used, 20)}/20 aktif</span>
          </div>
          <div ref={slotGridRef} className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {Array.from({ length: 20 }).map((_, i) => {
              const occupied = i < used;
              return (
                <div
                  key={i}
                  data-slot-active={occupied ? "1" : "0"}
                  className={cn(
                    "relative flex aspect-[1.8/1] flex-col justify-between border p-1.5 transition-colors duration-200",
                    occupied
                      ? "border-foreground/50 bg-foreground/[0.06]"
                      : "border-border",
                  )}
                >
                  <span className="num text-[10px] text-muted-foreground">
                    {String(i).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "num text-[10px] font-medium tracking-tight",
                      occupied ? "text-foreground" : "text-dim",
                    )}
                  >
                    {occupied ? `0x${(0x3FF0 + i * 0x18).toString(16).toUpperCase()}` : "FREE"}
                  </span>
                </div>
              );
            })}
          </div>

          {used > 20 && (
            <div className="mt-2.5 flex items-center justify-between rounded-[2px] border border-amber/40 bg-amber/5 p-2 num text-[10px] text-amber">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                Tier 2 Non-Volatile Flash Spillover
              </span>
              <span className="font-semibold">+{used - 20} records from LittleFS</span>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="num text-sm">
              {used > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium", used > 20 ? "text-amber" : "text-foreground")}>{used} recs synced</span>
                  <span
                    className={cn(
                      "rounded-[2px] px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                      used > 20
                        ? "border border-amber/50 bg-amber/10 text-amber"
                        : "border border-border bg-secondary/50 text-muted-foreground",
                    )}
                  >
                    {used > 20 ? "Tier 1 + Tier 2 Flash Spillover (> 20)" : "Tier 1 Fast Cache (<= 20)"}
                  </span>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald">
                  <Led tone="emerald" />
                  Live Stream (Queue Empty)
                </span>
              )}
            </div>
            <span className="num text-[10px] text-muted-foreground">Boot #{selected.telemetry.boot}</span>
          </div>

          {/* Automatic Flash Buffer Status Callout */}
          <div className="mt-3 rounded-[2px] border border-border bg-background/50 p-3 num text-[11px] leading-relaxed">
            <div className="flex items-center gap-2">
              <HardDriveUpload size={14} className={used > 0 ? "text-amber" : "text-emerald"} aria-hidden="true" />
              <span className="font-semibold text-foreground">
                {used > 0 ? `Antrean Offline (${used} Rekaman Tertahan)` : "Sinkronisasi Live Penuh (Queue Kosong)"}
              </span>
            </div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              {used > 0
                ? "Node menyimpan rekaman telemetri di Tier-1 RTC SRAM & Tier-2 LittleFS Flash selama offline. Firmware ESP32 akan melakukan kuras antrean (Auto-Burst Sync) secara otomatis saat terhubung kembali ke Wi-Fi dealer."
                : "Seluruh rekaman tersinkronisasi ke server. Firmware streaming langsung secara real-time tanpa penumpukan memori flash lokal."}
            </p>
          </div>

          {/* Filtered Fleet Presence Directory inside Scrollable Card Body (Horizontal Snap Strip on Mobile, Stacked on Desktop) */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="label-hmi mb-2 text-[10px]">
              Filtered Yard Presence Directory ({filteredUnits.length} Units)
            </div>
            <div className="flex flex-row flex-nowrap overflow-x-auto snap-x snap-mandatory gap-2 pb-2 lg:flex-col lg:overflow-visible lg:space-y-1.5 card-scroll">
              {filteredUnits.map((u) => (
                <button
                  key={u.unit_id}
                  type="button"
                  onClick={() => selectUnit(u.unit_id)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center justify-between rounded-[2px] border px-2.5 py-2 text-left num text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "w-[220px] snap-start lg:w-full",
                    u.unit_id === selected.unit_id
                      ? "border-foreground/70 bg-foreground/[0.06]"
                      : "border-border bg-background/40 hover:border-muted-foreground",
                  )}
                >
                  <div className="min-w-0 pr-1.5">
                    <span className="font-semibold text-foreground">{u.bay}</span>{" "}
                    <span className="font-medium text-foreground truncate block sm:inline">{u.model}</span>{" "}
                    <span className="text-[10px] text-muted-foreground">({u.trim})</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{fmtV(u.telemetry.v_bat)}V</span>
                    <span
                      className={cn(
                        "rounded-[2px] px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                        u.in_yard ? "bg-emerald/15 text-emerald" : "bg-amber/15 text-amber",
                      )}
                    >
                      {u.in_yard ? "IN YARD" : "AWAY"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Movement Event Log"
          code="LOG"
          right={
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="num text-[9px] uppercase tracking-wider sm:hidden">Swipe</span>
              <span className="num hidden text-[10px] sm:inline">3x RSSI Miss Debounce</span>
            </div>
          }
        >
          <div className="relative">
            <div className="card-scroll overflow-x-auto">
              <table className="w-full min-w-[660px] text-left">
                <thead>
                  <tr className="border-b border-border">
                    {["Event", "Vehicle", "Departed", "Returned", "Duration", "Debounce", "Operational Tag"].map(
                      (h) => (
                        <th key={h} className="label-hmi py-2 pr-3 font-normal">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredMovement.map((e) => {
                    const u = units.find((x) => x.unit_id === e.unit_id);
                    return (
                      <m.tr
                        key={e.id}
                        initial={rowsMountedRef.current ? { opacity: 0, y: -4 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: DURATION.instant, ease: EASE_STANDARD }}
                        className="border-b border-border/60"
                      >
                        <td className="num py-2.5 pr-3 text-[11px] font-medium text-foreground">{e.id}</td>
                        <td className="py-2.5 pr-3">
                          <div className="font-display text-[11px] font-medium uppercase tracking-wider">
                            {u?.model ?? e.unit_id}
                          </div>
                          <div className="num text-[10px] text-muted-foreground">Bay {u?.bay ?? "--"}</div>
                        </td>
                        <td className="num py-2.5 pr-3 text-[11px]">{e.departed}</td>
                        <td className="num py-2.5 pr-3 text-[11px]">
                          {e.returned ?? (
                            <span className="flex items-center gap-1.5 text-amber">
                              <Led tone="amber" pulse />
                              Away
                            </span>
                          )}
                        </td>
                        <td className="num py-2.5 pr-3 text-[11px]">
                          {e.away_min != null ? `${e.away_min} min` : "--"}
                        </td>
                        <td className="num py-2.5 pr-3 text-[11px] text-emerald">{e.debounce_hits}/3 verified</td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {OPERATIONAL_TAGS.map((tg) => (
                              <Pill key={tg} active={e.tag === tg} onClick={() => tagMovement(e.id, tg)} tone="dim">
                                {tg}
                              </Pill>
                            ))}
                          </div>
                        </td>
                      </m.tr>
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
