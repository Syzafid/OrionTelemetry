import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, History, Link2, Link2Off, Search, Terminal, Wrench, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useTelemetry } from "@/context/TelemetryContext";
import type { AuditSeverity, TicketStatus } from "@/data/mockTelemetry";
import { olsCalibration } from "@/lib/calibration";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { DURATION, EASE_EXIT, EASE_STANDARD } from "@/lib/motion-tokens";
import { ResolveCheck } from "./motion-bits";
import { Led, Panel, Pill, fmtV } from "./primitives";
import { cn } from "@/lib/utils";

const WAKE = [300, 600, 900, 1800];

interface CalRow {
  dmm: string;
  mv: string;
}

const CAL_DEFAULT: CalRow[] = [
  { dmm: "11.00", mv: "1966" },
  { dmm: "12.00", mv: "2151" },
  { dmm: "13.00", mv: "2336" },
  { dmm: "14.40", mv: "2595" },
];

const SEVERITY_BADGE: Record<AuditSeverity, string> = {
  INFO: "border-cyan/40 bg-cyan/10 text-cyan",
  WARN: "border-amber/40 bg-amber/10 text-amber",
  CRITICAL: "border-crimson/50 bg-crimson/15 text-crimson",
};

const TICKET_STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "border-crimson/50 bg-crimson/15 text-crimson",
  IN_PROGRESS: "border-amber/50 bg-amber/15 text-amber",
  RESOLVED: "border-emerald/50 bg-emerald/15 text-emerald",
};

function formatEventTypeLabel(rawType: string): string {
  return rawType.replace(/_/g, " ");
}

function Slider({
  min,
  max,
  step,
  value,
  onChange,
  ariaLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full cursor-pointer accent-crimson"
    />
  );
}

export function ConfigModule() {
  const {
    units,
    selected,
    selectUnit,
    configs,
    updateConfig,
    unpaired,
    unpairUnit,
    pairUnit,
    auditLogs,
    tickets,
    updateTicketStatus,
    dataSource,
  } = useTelemetry();

  const [nodeFilter, setNodeFilter] = useState("");
  const [bottomTab, setBottomTab] = useState<"TICKETS" | "AUDIT">("TICKETS");
  const cfg = configs[selected.unit_id]!;
  const isUnpaired = unpaired.includes(selected.unit_id);
  const t = selected.telemetry;
  const [cal, setCal] = useState<CalRow[]>(CAL_DEFAULT);
  const fit = useMemo(() => olsCalibration(cal.map((p) => ({ dmm: Number(p.dmm), mv: Number(p.mv) }))), [cal]);
  const [form, setForm] = useState({ vin: "", model: "", color: "", bay: "" });
  const canPair = form.vin.length >= 11 && form.model && form.bay;

  const selectedTicket = useMemo(
    () => tickets.find((tk) => tk.unit_id === selected.unit_id) ?? null,
    [tickets, selected.unit_id],
  );

  const [assigneeInput, setAssigneeInput] = useState("");
  const [noteInput, setNoteInput] = useState("");

  useEffect(() => {
    setAssigneeInput(
      selectedTicket?.assigned_to && selectedTicket.assigned_to !== "Unassigned"
        ? selectedTicket.assigned_to
        : "R. Pratama (Shift A)",
    );
    setNoteInput(selectedTicket?.handover_note ?? "");
  }, [selected.unit_id, selectedTicket]);

  const activeTicketCount = useMemo(
    () => tickets.filter((tk) => tk.status !== "RESOLVED").length,
    [tickets],
  );

  const initialResolvedRef = useRef<Set<string> | null>(null);
  if (initialResolvedRef.current === null) {
    initialResolvedRef.current = new Set(tickets.filter((tk) => tk.status === "RESOLVED").map((tk) => tk.unit_id));
  }

  const filteredUnits = useMemo(
    () => units.filter((u) => matchesFleetSearch(u, nodeFilter)),
    [units, nodeFilter],
  );

  const sleepLabel =
    cfg.sleep_cfg >= 3600 && cfg.sleep_cfg % 3600 === 0
      ? `${cfg.sleep_cfg / 3600} Hours`
      : cfg.sleep_cfg >= 60 && cfg.sleep_cfg % 60 === 0
        ? `${cfg.sleep_cfg / 60} Minutes`
        : `${cfg.sleep_cfg} Seconds`;

  const payload = {
    status: "ok",
    saved: 1,
    pending_ack: true,
    target: selected.unit_id,
    crit_v: Number(cfg.crit_v.toFixed(2)),
    slope_m: Number(cfg.cal_slope.toFixed(7)),
    offset_c: Number(cfg.cal_offset.toFixed(4)),
    sleep_cfg: sleepLabel,
    fast_poll_s: cfg.fast_poll_s,
    debounce_cnt: cfg.debounce_cnt,
    paired: !isUnpaired,
    vin: isUnpaired ? null : selected.vin,
    apply_on: "NEXT_WAKE",
  };

  const pct = (v: number) => ((v - 11) / 1.5) * 100;

  return (
    <div className="module-config flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Sticky Single-Row Configure Node Bar (shrink-0) */}
      <div className="panel flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
        <span className="label-hmi mr-1 shrink-0">Configure Node</span>
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
              placeholder="Filter Bay / VIN..."
              aria-label="Filter configuration target node"
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
                tone="crimson"
                active={u.unit_id === selected.unit_id}
                onClick={() => selectUnit(u.unit_id)}
              >
                {u.unit_id.replace("MITSUBISHI-", "")} ({u.bay})
              </Pill>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Zero-Main-Scroll Grid (Each Panel Scrolls Internally) */}
      <div className="config-details grid min-h-0 flex-1 gap-3 [&>*]:min-w-0 xl:grid-cols-[1.15fr_1fr]">
        {/* Left Column: Wake Cycle + Shift Handover Tickets & Operational Audit Trail */}
        <div className="grid min-h-0 gap-3 lg:grid-rows-[1.15fr_1.1fr]">
          <Panel
            title="Wake Cycle & Node Assignment"
            code="CFG"
            right={
              <span className="flex items-center gap-1.5 num text-[10px]">
                <Led tone={isUnpaired ? "amber" : "emerald"} pulse={isUnpaired} />
                {isUnpaired ? "UNPAIRED" : "PAIRED"}
              </span>
            }
          >
            <div className="space-y-5">
              <div>
                <div className="label-hmi mb-2">Heartbeat Wake Interval</div>
                <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
                  {WAKE.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateConfig(selected.unit_id, { sleep_cfg: s })}
                      type="button"
                      className={cn(
                        "flex min-h-[44px] cursor-pointer items-center justify-center bg-card py-2.5 num text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        cfg.sleep_cfg === s
                          ? "bg-crimson/10 font-semibold text-crimson"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s / 60} MIN
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between">
                  <span className="label-hmi">Engine-On Fast Poll</span>
                  <span className="num text-xs text-emerald">{cfg.fast_poll_s} s</span>
                </div>
                <Slider
                  ariaLabel="Engine-On Fast Poll Interval"
                  min={5}
                  max={30}
                  step={1}
                  value={cfg.fast_poll_s}
                  onChange={(v) => updateConfig(selected.unit_id, { fast_poll_s: v })}
                />
                <div className="flex justify-between num text-[10px] text-muted-foreground">
                  <span>5s</span>
                  <span>30s</span>
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between">
                  <span className="label-hmi">Critical Battery Threshold</span>
                  <span className="num text-xs text-crimson">{fmtV(cfg.crit_v)} V</span>
                </div>
                <Slider
                  ariaLabel="Critical Battery Threshold Voltage"
                  min={11}
                  max={12.5}
                  step={0.05}
                  value={cfg.crit_v}
                  onChange={(v) => updateConfig(selected.unit_id, { crit_v: v })}
                />
                <div className="relative mt-2.5 h-24 border border-border bg-muted/30 overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-crimson/15" style={{ width: `${pct(cfg.crit_v)}%` }} />
                  <div
                    className="absolute inset-y-0 w-px bg-crimson"
                    style={{ left: `${pct(cfg.crit_v)}%`, boxShadow: "0 0 8px var(--crimson)" }}
                  />
                  {[...units]
                    .sort((a, b) => a.telemetry.v_bat - b.telemetry.v_bat)
                    .slice(0, 4)
                    .map((u, index) => {
                      const v = Math.min(12.5, Math.max(11, u.telemetry.v_bat));
                      const p = Math.min(94, Math.max(6, pct(v)));
                      const below = u.telemetry.v_bat < cfg.crit_v;
                      return (
                        <div
                          key={u.unit_id}
                          className="absolute flex -translate-x-1/2 flex-col items-center"
                          style={{ left: `${p}%`, top: `${6 + index * 20}px` }}
                        >
                          <Led tone={below ? "crimson" : "emerald"} />
                          <span className="num mt-0.5 whitespace-nowrap rounded-[1px] border border-border bg-carbon/95 px-1.5 py-0.5 text-[10px] leading-none text-foreground">
                            {u.bay} <span className="text-muted-foreground">({fmtV(u.telemetry.v_bat)}V)</span>
                          </span>
                        </div>
                      );
                    })}
                </div>
                <div className="flex justify-between num text-[10px] text-muted-foreground">
                  <span>11.00 V</span>
                  <span>12.50 V</span>
                </div>
              </div>

              <div>
                <div className="label-hmi mb-2">Departure Debounce Count</div>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 4, 5].map((n) => (
                    <Pill
                      key={n}
                      tone="amber"
                      active={cfg.debounce_cnt === n}
                      onClick={() => updateConfig(selected.unit_id, { debounce_cnt: n })}
                    >
                      {n}x
                    </Pill>
                  ))}
                </div>
              </div>

              {/* Vehicle Node Assignment Sub-Section inside Internal Card Scroll */}
              <div className="border-t border-border pt-4">
                <div className="label-hmi mb-2">Vehicle Node Assignment</div>
                {!isUnpaired ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-border bg-background/40 p-3">
                    <div className="num text-xs leading-relaxed">
                      <div>
                        <span className="text-muted-foreground">NODE </span>
                        {selected.unit_id}
                      </div>
                      <div>
                        <span className="text-muted-foreground">VIN </span>
                        {selected.vin}
                      </div>
                      <div>
                        <span className="text-muted-foreground">UNIT </span>
                        {selected.model} {selected.trim}, {selected.color}, Bay {selected.bay}
                      </div>
                    </div>
                    <button
                      onClick={() => unpairUnit(selected.unit_id)}
                      type="button"
                      className="flex min-h-[44px] cursor-pointer items-center gap-2 border border-crimson/60 px-4 py-2 num text-[11px] font-medium text-crimson transition-colors hover:bg-crimson/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <Link2Off size={14} strokeWidth={1.5} aria-hidden="true" /> UNPAIR (VEHICLE SOLD)
                    </button>
                  </div>
                ) : (
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (canPair) {
                        pairUnit(selected.unit_id, form);
                        setForm({ vin: "", model: "", color: "", bay: "" });
                      }
                    }}
                  >
                    {(
                      [
                        ["vin", "VIN (17 CHAR)"],
                        ["model", "MODEL e.g. DESTINATOR ULTIMATE"],
                        ["color", "COLOR"],
                        ["bay", "YARD BAY e.g. C-03"],
                      ] as const
                    ).map(([k, ph]) => (
                      <label key={k} className="flex flex-col gap-1">
                        <span className="label-hmi text-[10px]">{k}</span>
                        <input
                          value={form[k]}
                          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                          placeholder={ph}
                          maxLength={k === "vin" ? 17 : 40}
                          className="min-h-[44px] border border-border bg-background px-3 py-2 num text-xs uppercase outline-none placeholder:text-dim focus:border-cyan"
                        />
                      </label>
                    ))}
                    <button
                      type="submit"
                      disabled={!canPair}
                      className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 border border-emerald/60 py-2.5 num text-[11px] font-medium text-emerald transition-colors hover:bg-emerald/10 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2"
                    >
                      <Link2 size={14} strokeWidth={1.5} aria-hidden="true" /> ASSIGN NODE TO INCOMING VEHICLE
                    </button>
                  </form>
                )}
              </div>
            </div>
          </Panel>

          {/* Shift Handover Tickets & Operational Audit Trail Card (Internal Card Scroll) */}
          <Panel
            title="Shift Handover & Audit Log"
            code="OPS"
            right={
              <span className="num flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <History size={13} strokeWidth={1.5} className="text-cyan" aria-hidden="true" />
                <span>{dataSource === "LIVE_API" ? "MySQL Live Sync" : "Local Buffer"}</span>
              </span>
            }
          >
            {/* Segmented Mode Switcher (min-h-[44px]) */}
            <div className="mb-3 grid grid-cols-2 gap-1.5 border-b border-border pb-2.5">
              <button
                type="button"
                onClick={() => setBottomTab("TICKETS")}
                className={cn(
                  "relative num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  bottomTab === "TICKETS"
                    ? "border-cyan/60 text-cyan"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {bottomTab === "TICKETS" && (
                  <m.span
                    layoutId="config-ops-tab"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[2px] bg-cyan/15"
                    transition={{ duration: DURATION.quick, ease: EASE_STANDARD }}
                  />
                )}
                <Wrench size={13} strokeWidth={1.75} className="relative" aria-hidden="true" />
                <span className="relative">Shift Tickets ({activeTicketCount} Active)</span>
              </button>
              <button
                type="button"
                onClick={() => setBottomTab("AUDIT")}
                className={cn(
                  "relative num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  bottomTab === "AUDIT"
                    ? "border-cyan/60 text-cyan"
                    : "border-border bg-background/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {bottomTab === "AUDIT" && (
                  <m.span
                    layoutId="config-ops-tab"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[2px] bg-cyan/15"
                    transition={{ duration: DURATION.quick, ease: EASE_STANDARD }}
                  />
                )}
                <History size={13} strokeWidth={1.75} className="relative" aria-hidden="true" />
                <span className="relative">Audit Trail ({auditLogs.length})</span>
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
            {bottomTab === "TICKETS" ? (
              <m.div
                key="tickets"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
                exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
                className="space-y-3"
              >
                {/* Active Node Ticket Dispatch / Handover Editor */}
                <div className="rounded-[2px] border border-border bg-background/60 p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="num text-xs font-semibold text-foreground">
                      Target: <span className="text-crimson">{selected.bay}</span> ({selected.unit_id})
                    </div>
                    <span
                      className={cn(
                        "num inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        TICKET_STATUS_STYLE[selectedTicket?.status ?? "OPEN"],
                      )}
                    >
                      {selectedTicket?.status === "RESOLVED" && (
                        <ResolveCheck animateIn={!initialResolvedRef.current?.has(selected.unit_id)} className="h-3 w-3" />
                      )}
                      <span>
                        {selectedTicket ? `${selectedTicket.ticket_code}: ${selectedTicket.status.replace("_", " ")}` : "NO TICKET (READY)"}
                      </span>
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="label-hmi text-[10px]">Assigned Technician (Shift PIC)</span>
                      <input
                        type="text"
                        value={assigneeInput}
                        onChange={(e) => setAssigneeInput(e.target.value)}
                        placeholder="e.g. R. Pratama (Shift A)"
                        aria-label="Assigned technician name"
                        className="min-h-[44px] rounded-[2px] border border-border bg-background px-2.5 py-1.5 num text-xs text-foreground outline-none focus:border-cyan"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="label-hmi text-[10px]">Shift Handover Note</span>
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Write inspection or handover notes..."
                        aria-label="Shift handover note"
                        className="min-h-[44px] rounded-[2px] border border-border bg-background px-2.5 py-1.5 num text-xs text-foreground outline-none focus:border-cyan"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateTicketStatus(
                          selected.unit_id,
                          "IN_PROGRESS",
                          assigneeInput || "Tech Shift A",
                          noteInput || "Technician claimed unit for battery & ECU service.",
                        )
                      }
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border border-amber/60 bg-amber/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-amber transition-colors hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <Wrench size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span>Claim Ticket (In Progress)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateTicketStatus(
                          selected.unit_id,
                          "RESOLVED",
                          assigneeInput || "Tech Shift A",
                          noteInput || "Alternator warm-up verified; unit ready for PDI.",
                        )
                      }
                      className="num inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border border-emerald/60 bg-emerald/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-emerald transition-colors hover:bg-emerald/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <ClipboardCheck size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span>Resolve Ticket (Resolved)</span>
                    </button>
                  </div>
                </div>

                {/* All Fleet Maintenance Tickets List */}
                <div className="overflow-x-auto border border-border">
                  <table className="w-full border-collapse text-left num text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 px-2.5 font-medium">Ticket</th>
                        <th className="py-2 px-2.5 font-medium">Unit / Bay</th>
                        <th className="py-2 px-2.5 font-medium">Status</th>
                        <th className="py-2 px-2.5 font-medium">Assignee &amp; Handover Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {tickets.map((tk) => (
                        <tr
                          key={tk.ticket_code}
                          onClick={() => selectUnit(tk.unit_id)}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-secondary/30",
                            tk.unit_id === selected.unit_id && "bg-cyan/5",
                          )}
                        >
                          <td className="whitespace-nowrap py-2 px-2.5 font-semibold text-crimson">
                            {tk.ticket_code}
                          </td>
                          <td className="whitespace-nowrap py-2 px-2.5">
                            <span className="font-semibold text-foreground">{tk.bay}</span>{" "}
                            <span className="text-[10px] text-muted-foreground">
                              ({tk.unit_id.replace("MITSUBISHI-", "")})
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2 px-2.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                                TICKET_STATUS_STYLE[tk.status],
                              )}
                            >
                              {tk.status === "RESOLVED" && (
                                <ResolveCheck animateIn={!initialResolvedRef.current?.has(tk.unit_id)} className="h-3 w-3" />
                              )}
                              <span>{tk.status.replace("_", " ")}</span>
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-sans text-xs text-foreground/90">
                            <div className="font-semibold text-foreground">{tk.assigned_to}</div>
                            <div className="text-[11px] text-muted-foreground">{tk.handover_note}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </m.div>
            ) : auditLogs.length === 0 ? (
              <m.div
                key="audit-empty"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
                exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
                className="py-4 text-center num text-xs text-muted-foreground"
              >
                Belum ada aktivitas audit operasional tercatat.
              </m.div>
            ) : (
              <m.table
                key="audit-table"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_STANDARD } }}
                exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: EASE_EXIT } }}
                className="w-full border-collapse text-left num text-xs"
              >
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-2.5 font-medium">Timestamp</th>
                    <th className="py-2 px-2.5 font-medium">Unit Node</th>
                    <th className="py-2 px-2.5 font-medium">Action Type</th>
                    <th className="py-2 px-2.5 font-medium">Audit Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {auditLogs.map((ev) => (
                    <tr key={ev.id} className="hover:bg-secondary/20">
                      <td className="whitespace-nowrap py-2 px-2.5 text-[10.5px] text-muted-foreground">
                        {ev.created_at}
                      </td>
                      <td className="whitespace-nowrap py-2 px-2.5 font-semibold text-foreground">{ev.unit_id}</td>
                      <td className="whitespace-nowrap py-2 px-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                            SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.INFO,
                          )}
                        >
                          {formatEventTypeLabel(ev.event_type)}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-sans text-xs text-foreground/90">{ev.message}</td>
                    </tr>
                  ))}
                </tbody>
              </m.table>
            )}
            </AnimatePresence>
          </Panel>
        </div>

        {/* Right Column: Queued ACK Payload & 4-Point ADC Calibration */}
        <div className="grid min-h-0 gap-3 lg:grid-rows-[0.9fr_1.35fr]">
          <Panel
            title="Queued ACK Payload"
            code="JSON"
            right={<Terminal size={14} strokeWidth={1.5} className="text-emerald" aria-hidden="true" />}
          >
            <div className="border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between num text-[10px] text-muted-foreground">
                <span>POST /api/node/{selected.unit_id}/ack</span>
                <span className="flex items-center gap-1.5">
                  <Led tone="amber" />
                  QUEUED
                </span>
              </div>
              <pre className="card-scroll num max-h-36 overflow-auto text-xs leading-tight">
                {"{\n"}
                {Object.entries(payload).map(([k, v], i, arr) => (
                  <span key={k}>
                    {"  "}
                    <span className="text-cyan">"{k}"</span>:{" "}
                    <span
                      className={
                        typeof v === "string"
                          ? "text-amber"
                          : typeof v === "boolean" || v === null
                            ? "text-crimson"
                            : "text-emerald"
                      }
                    >
                      {JSON.stringify(v)}
                    </span>
                    {i < arr.length - 1 ? "," : ""}
                    {"\n"}
                  </span>
                ))}
                {"}"}
              </pre>
            </div>
            <div className="mt-2 num text-[10px] leading-relaxed text-muted-foreground">
              Delivered in ACK response of next telemetry POST. Node writes to NVS and applies before entering deep
              sleep.
            </div>
          </Panel>

          <Panel
            title="4-Point ADC Calibration (SOP C.1)"
            code="CAL"
            right={<span className="num text-[10px] text-cyan">R² {fit.rSquared.toFixed(4)}</span>}
          >
            <div className="num text-[11px]">
              <div className="label-hmi grid grid-cols-[1fr_1fr_0.9fr] gap-2 border-b border-border pb-1.5 text-[10px]">
                <span>DMM (V)</span>
                <span>GPIO34 (mV)</span>
                <span className="text-right">DERIVED (V)</span>
              </div>
              {cal.map((p, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_0.9fr] items-center gap-2 border-b border-border/60 py-1.5"
                >
                  <input
                    type="number"
                    step="0.01"
                    aria-label={`DMM point ${i + 1}`}
                    value={p.dmm}
                    onChange={(e) => setCal((c) => c.map((q, j) => (j === i ? { ...q, dmm: e.target.value } : q)))}
                    className="min-h-[44px] w-full min-w-0 border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-cyan"
                  />
                  <input
                    type="number"
                    step="1"
                    aria-label={`ADC point ${i + 1}`}
                    value={p.mv}
                    onChange={(e) => setCal((c) => c.map((q, j) => (j === i ? { ...q, mv: e.target.value } : q)))}
                    className="min-h-[44px] w-full min-w-0 border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-cyan"
                  />
                  <span className="text-right text-cyan">{(Number(p.mv) * fit.slope + fit.offset).toFixed(2)}</span>
                </div>
              ))}
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <div>
                  <span className="label-hmi">SLOPE m</span>
                  <div className="text-xs font-medium text-emerald">{fit.slope.toFixed(6)}</div>
                </div>
                <div>
                  <span className="label-hmi">OFFSET b</span>
                  <div className="text-xs font-medium text-emerald">{fit.offset.toFixed(3)}</div>
                </div>
                <div>
                  <span className="label-hmi">R²</span>
                  <div className="text-xs font-medium text-emerald">{fit.rSquared.toFixed(4)}</div>
                </div>
              </div>
              <div className="mt-2 border border-border bg-background p-2 text-center font-mono text-[10px] leading-relaxed">
                Vbat = (mV × slope) + offset
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>Node M: {t.adc_raw_mv} mV</span>
                <span>
                  Derived: {(t.adc_raw_mv * fit.slope + fit.offset).toFixed(2)} V (Reported: {fmtV(t.v_bat)} V)
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateConfig(selected.unit_id, {
                    cal_slope: Number(fit.slope.toFixed(6)),
                    cal_offset: Number(fit.offset.toFixed(3)),
                  })
                }
                className="mt-3 flex min-h-[44px] w-full cursor-pointer items-center justify-center border border-emerald/60 py-2.5 num text-[11px] font-semibold uppercase tracking-wider text-emerald transition-colors hover:bg-emerald/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                APPLY TO NODE CONFIG
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
