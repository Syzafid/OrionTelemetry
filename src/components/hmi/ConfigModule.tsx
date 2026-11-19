import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  History,
  Link2,
  Link2Off,
  RefreshCw,
  Search,
  Sliders,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useTelemetry } from "@/context/TelemetryContext";
import {
  getUnitConnectionState,
  type AuditSeverity,
  type TicketStatus,
} from "@/data/mockTelemetry";
import { olsCalibration } from "@/lib/calibration";
import {
  PCB_ADC_PRESETS,
  SLEEP_CFG_OPTIONS,
  buildWirePiggybackAck,
  filterAuditLogs,
  validateNvsConfigDraft,
  validateOlsCalibrationFit,
  type CalibrationPointInput,
  type PcbVersionKey,
} from "@/lib/config-validation";
import { matchesFleetSearch } from "@/lib/fleet-filter";
import { cn } from "@/lib/utils";
import { Led, Panel, fmtV } from "./primitives";

type ConfigSubTab = "ONBOARDING" | "CALIBRATION" | "TICKETS";

const SUB_TABS: Array<{ id: ConfigSubTab; label: string }> = [
  { id: "ONBOARDING", label: "01. Onboarding & Pairing IoT" },
  { id: "CALIBRATION", label: "02. Parameter NVS & Kalibrasi ADC" },
  { id: "TICKETS", label: "03. Tiket Pemeliharaan & Audit" },
];

const SEVERITY_BADGE: Record<AuditSeverity, string> = {
  INFO: "border-border bg-secondary/60 text-muted-foreground",
  WARN: "border-amber/40 bg-amber/10 text-amber",
  CRITICAL: "border-crimson/50 bg-crimson/15 text-crimson",
};

const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  INFO: "INFO",
  WARN: "PERINGATAN",
  CRITICAL: "KRITIS",
};

const TICKET_STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "border-crimson/50 bg-crimson/15 text-crimson",
  IN_PROGRESS: "border-amber/50 bg-amber/15 text-amber",
  RESOLVED: "border-emerald/50 bg-emerald/15 text-emerald",
};

const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "TERBUKA",
  IN_PROGRESS: "DIKERJAKAN",
  RESOLVED: "SELESAI",
};

const BAY_OPTIONS = [
  "A-01",
  "A-02",
  "A-03",
  "A-04",
  "B-01",
  "B-02",
  "B-03",
  "B-04",
  "C-01",
  "C-02",
  "C-03",
  "C-04",
];

const COLOR_OPTIONS = [
  "White Diamond",
  "Jet Black Mica",
  "Graphite Grey",
  "Red Metallic",
  "Silver Metallic",
];

function formatEventTypeLabel(rawType: string): string {
  return rawType.replace(/_/g, " ");
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
    registerUnit,
    auditLogs,
    tickets,
    updateTicketStatus,
    dataSource,
    apiStatus,
    isOfflineSnapshot,
    lastSyncTime,
    pollNow,
    setActiveModule,
  } = useTelemetry();

  const isLiveApi = dataSource === "LIVE_API";
  const [activeSubTab, setActiveSubTab] = useState<ConfigSubTab>("ONBOARDING");
  const tabRefs = useRef<Partial<Record<ConfigSubTab, HTMLButtonElement | null>>>({});

  const cfg = useMemo(
    () =>
      configs[selected.unit_id] ?? {
        unit_id: selected.unit_id,
        crit_v: 11.8,
        sleep_cfg: 300,
        fast_poll_s: 10,
        debounce_cnt: 3,
        cal_slope: 0.005412,
        cal_offset: 0.069,
        pending_ack: false,
      },
    [configs, selected.unit_id],
  );
  const conn = getUnitConnectionState(selected, isLiveApi);
  const t = selected.telemetry;

  // --------------------------------------------------------------------------
  // Sub-Tab 01 State: Onboarding & Directory Search / Re-Pair
  // --------------------------------------------------------------------------
  const [nodeFilter, setNodeFilter] = useState("");
  const [nodeIdInput, setNodeIdInput] = useState("");
  const [pcbVersion, setPcbVersion] = useState<PcbVersionKey>("1");
  const [vinInput, setVinInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [trimInput, setTrimInput] = useState("");
  const [colorInput, setColorInput] = useState("White Diamond");
  const [bayInput, setBayInput] = useState("A-01");
  const [critVOnboardInput, setCritVOnboardInput] = useState("11.80");
  const [sleepCfgOnboardInput, setSleepCfgOnboardInput] = useState("300");
  const [isSubmittingOnboard, setIsSubmittingOnboard] = useState(false);
  const [onboardStatus, setOnboardStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // Re-Pair inline form state for unpaired units
  const [repairUnitId, setRepairUnitId] = useState<string | null>(null);
  const [repairVin, setRepairVin] = useState("");
  const [repairModel, setRepairModel] = useState("");
  const [repairBay, setRepairBay] = useState("A-01");
  const [repairColor, setRepairColor] = useState("White Diamond");
  const [directoryFeedback, setDirectoryFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // --------------------------------------------------------------------------
  // Sub-Tab 02 State: NVS Config Draft & 4-Point OLS Calibration
  // --------------------------------------------------------------------------
  const [critVDraft, setCritVDraft] = useState(cfg.crit_v.toFixed(2));
  const [sleepCfgDraft, setSleepCfgDraft] = useState(String(cfg.sleep_cfg));
  const [debounceDraft, setDebounceDraft] = useState(cfg.debounce_cnt);
  const [fastPollDraft, setFastPollDraft] = useState(String(cfg.fast_poll_s));
  const [isSavingNvs, setIsSavingNvs] = useState(false);
  const [nvsFeedback, setNvsFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [cal, setCal] = useState<CalibrationPointInput[]>(() =>
    PCB_ADC_PRESETS["1"].points.map((pt) => ({ ...pt })),
  );
  const [isSavingCal, setIsSavingCal] = useState(false);
  const [calFeedback, setCalFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Synchronize draft inputs when selected unit or remote config changes
  useEffect(() => {
    setCritVDraft(cfg.crit_v.toFixed(2));
    setSleepCfgDraft(String(cfg.sleep_cfg));
    setDebounceDraft(cfg.debounce_cnt);
    setFastPollDraft(String(cfg.fast_poll_s));
  }, [selected.unit_id, cfg.crit_v, cfg.sleep_cfg, cfg.debounce_cnt, cfg.fast_poll_s]);

  // --------------------------------------------------------------------------
  // Sub-Tab 03 State: Tickets & Audit Log Filtering
  // --------------------------------------------------------------------------
  const selectedTicket = useMemo(
    () => tickets.find((tk) => tk.unit_id === selected.unit_id) ?? null,
    [tickets, selected.unit_id],
  );
  const [assigneeInput, setAssigneeInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [isSavingTicket, setIsSavingTicket] = useState(false);
  const [ticketFeedback, setTicketFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [auditQuery, setAuditQuery] = useState("");
  const [auditSeverity, setAuditSeverity] = useState<AuditSeverity | "ALL">("ALL");
  const [auditSelectedUnitOnly, setAuditSelectedUnitOnly] = useState(false);

  useEffect(() => {
    const existingAssignee = selectedTicket?.assigned_to?.trim() ?? "";
    setAssigneeInput(existingAssignee && existingAssignee !== "Unassigned" ? existingAssignee : "");
    setNoteInput(selectedTicket?.handover_note ?? "");
    setTicketFeedback(null);
  }, [selected.unit_id, selectedTicket]);

  // --------------------------------------------------------------------------
  // Derived Computations
  // --------------------------------------------------------------------------
  const activeTicketCount = useMemo(
    () => tickets.filter((tk) => tk.status !== "RESOLVED").length,
    [tickets],
  );

  const filteredUnits = useMemo(
    () => units.filter((u) => matchesFleetSearch(u, nodeFilter)),
    [units, nodeFilter],
  );

  const filteredAuditLogs = useMemo(
    () =>
      filterAuditLogs(
        auditLogs,
        auditQuery,
        auditSeverity,
        auditSelectedUnitOnly ? selected.unit_id : undefined,
      ),
    [auditLogs, auditQuery, auditSeverity, auditSelectedUnitOnly, selected.unit_id],
  );

  const parsedCritV = Number.parseFloat(critVDraft);
  const parsedSleepCfg = Number.parseInt(sleepCfgDraft, 10);
  const parsedFastPoll = Number.parseInt(fastPollDraft, 10);

  const nvsValidation = useMemo(
    () =>
      validateNvsConfigDraft({
        crit_v: parsedCritV,
        sleep_cfg: parsedSleepCfg,
        debounce_cnt: debounceDraft,
        fast_poll_s: parsedFastPoll,
      }),
    [parsedCritV, parsedSleepCfg, debounceDraft, parsedFastPoll],
  );

  const wireAckPreview = useMemo(() => buildWirePiggybackAck(cfg, 1), [cfg]);

  const numericCalPoints = useMemo(
    () =>
      cal.map((pt) => ({
        dmm: Number.parseFloat(pt.dmm),
        mv: Number.parseFloat(pt.mv),
      })),
    [cal],
  );
  const validCalCount = useMemo(
    () =>
      numericCalPoints.filter(
        (pt) => Number.isFinite(pt.dmm) && Number.isFinite(pt.mv) && pt.dmm > 0 && pt.mv > 0,
      ).length,
    [numericCalPoints],
  );
  const fit = useMemo(() => olsCalibration(numericCalPoints), [numericCalPoints]);
  const olsValidation = useMemo(
    () => validateOlsCalibrationFit(fit, validCalCount),
    [fit, validCalCount],
  );

  const activePreset = PCB_ADC_PRESETS[pcbVersion];

  // --------------------------------------------------------------------------
  // Event Handlers
  // --------------------------------------------------------------------------
  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx = -1;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % SUB_TABS.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + SUB_TABS.length) % SUB_TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = SUB_TABS.length - 1;
    if (nextIdx >= 0) {
      e.preventDefault();
      const targetTab = SUB_TABS[nextIdx]!;
      setActiveSubTab(targetTab.id);
      tabRefs.current[targetTab.id]?.focus();
    }
  };

  const handleLoadSandboxExample = () => {
    if (isLiveApi) return;
    const nextNum = units.length + 1;
    setNodeIdInput(`MITSUBISHI-STOCK-${String(nextNum).padStart(2, "0")}`);
    setPcbVersion("2");
    setVinInput("MMBXFUJ40SH000877");
    setModelInput("XFORCE");
    setTrimInput("ULTIMATE CVT");
    setBayInput("B-02");
    setColorInput("White Diamond");
    setCritVOnboardInput("11.80");
    setSleepCfgOnboardInput("300");
    setOnboardStatus(null);
  };

  const handleExecuteOnboard = async (e: FormEvent) => {
    e.preventDefault();
    const cleanId = nodeIdInput.trim().toUpperCase();
    const cleanVin = vinInput.trim().toUpperCase();
    const cleanModel = modelInput.trim().toUpperCase();
    const cleanBay = bayInput.trim().toUpperCase();
    const parsedOnboardCrit = Number.parseFloat(critVOnboardInput);
    const parsedOnboardSleep = Number.parseInt(sleepCfgOnboardInput, 10) || 300;

    if (!cleanId || !cleanVin || !cleanModel) {
      setOnboardStatus({
        ok: false,
        text: "Unit Node ID, VIN (17 karakter), dan Model Kendaraan wajib diisi.",
      });
      return;
    }
    if (
      !Number.isFinite(parsedOnboardCrit) ||
      parsedOnboardCrit <= 5.0 ||
      parsedOnboardCrit >= 16.0
    ) {
      setOnboardStatus({
        ok: false,
        text: "Ambang Voltase Kritis awal harus berada pada rentang > 5.0V s.d. < 16.0V.",
      });
      return;
    }

    setIsSubmittingOnboard(true);
    setOnboardStatus(null);
    const result = await registerUnit({
      unit_id: cleanId,
      vin: cleanVin,
      model: cleanModel,
      trim: trimInput.trim().toUpperCase() || "STANDARD",
      color: colorInput.trim() || "White Diamond",
      bay: cleanBay,
      crit_v: parsedOnboardCrit,
      sleep_cfg: parsedOnboardSleep,
      pcb_version: pcbVersion,
      cal_slope: activePreset.slope,
      cal_offset: activePreset.offset,
    });
    setIsSubmittingOnboard(false);

    if (result.ok) {
      setOnboardStatus({
        ok: true,
        text: `Node ${cleanId} (${activePreset.label}) terdaftar untuk ${cleanModel} di Bay ${cleanBay}. Parameter NVS awal diantrekan (pending_ack=1).`,
      });
      setNodeIdInput("");
      setVinInput("");
      setModelInput("");
      setTrimInput("");
    } else {
      setOnboardStatus({
        ok: false,
        text: `Gagal mendaftarkan node ${cleanId}: ${result.error ?? "Galat jaringan server"}.`,
      });
    }
  };

  const handleConfirmRepair = async (e: FormEvent, unitId: string) => {
    e.preventDefault();
    const cleanVin = repairVin.trim().toUpperCase();
    const cleanModel = repairModel.trim().toUpperCase();
    const cleanBay = repairBay.trim().toUpperCase();
    if (!cleanVin || !cleanModel) {
      setDirectoryFeedback({
        ok: false,
        text: "VIN dan Model Kendaraan wajib diisi untuk menautkan ulang node.",
      });
      return;
    }
    const res = await pairUnit(unitId, {
      vin: cleanVin,
      model: cleanModel,
      bay: cleanBay,
      color: repairColor,
    });
    if (res.ok) {
      setRepairUnitId(null);
      setDirectoryFeedback({
        ok: true,
        text: `Node ${unitId} berhasil ditautkan ulang ke ${cleanModel} (VIN ${cleanVin}, Bay ${cleanBay}).`,
      });
    } else {
      setDirectoryFeedback({
        ok: false,
        text: `Gagal menautkan ulang ${unitId}: ${res.error ?? "Galat server"}.`,
      });
    }
  };

  const handleSaveNvsParams = async (e: FormEvent) => {
    e.preventDefault();
    if (!nvsValidation.valid) return;
    setIsSavingNvs(true);
    setNvsFeedback(null);
    const res = await updateConfig(selected.unit_id, {
      crit_v: Number(parsedCritV.toFixed(2)),
      sleep_cfg: parsedSleepCfg,
      debounce_cnt: debounceDraft,
      fast_poll_s: parsedFastPoll,
    });
    setIsSavingNvs(false);
    if (res.ok) {
      setNvsFeedback({
        ok: true,
        text: `Konfigurasi ${selected.unit_id} tersimpan dan diantrekan untuk Piggyback ACK berikutnya (pending_ack=1).`,
      });
    } else {
      setNvsFeedback({
        ok: false,
        text: `Gagal menyimpan konfigurasi ke server: ${res.error ?? "Coba lagi nanti"}.`,
      });
    }
  };

  const handleLoadCalPreset = (ver: PcbVersionKey) => {
    const preset = PCB_ADC_PRESETS[ver];
    setCal(preset.points.map((pt) => ({ ...pt })));
    setCalFeedback(null);
  };

  const handleSaveCalibration = async () => {
    if (!olsValidation.valid) return;
    setIsSavingCal(true);
    setCalFeedback(null);
    const slopeFixed = Number(fit.slope.toFixed(7));
    const offsetFixed = Number(fit.offset.toFixed(4));
    const res = await updateConfig(selected.unit_id, {
      cal_slope: slopeFixed,
      cal_offset: offsetFixed,
    });
    setIsSavingCal(false);
    if (res.ok) {
      setCalFeedback({
        ok: true,
        text: `Kalibrasi ADC (m=${slopeFixed.toFixed(7)}, c=${offsetFixed.toFixed(4)}V) diantrekan ke NVS ${selected.unit_id} (pending_ack=1).`,
      });
    } else {
      setCalFeedback({
        ok: false,
        text: `Gagal menyimpan kalibrasi ke server: ${res.error ?? "Periksa koneksi endpoint"}.`,
      });
    }
  };

  const handleTicketAction = async (status: TicketStatus) => {
    setIsSavingTicket(true);
    setTicketFeedback(null);
    const res = await updateTicketStatus(
      selected.unit_id,
      status,
      assigneeInput.trim() || undefined,
      noteInput.trim() || undefined,
    );
    setIsSavingTicket(false);
    if (res.ok) {
      setTicketFeedback({
        ok: true,
        text: `Status tiket ${selected.unit_id} diperbarui menjadi ${TICKET_STATUS_LABEL[status]}.`,
      });
    } else {
      setTicketFeedback({
        ok: false,
        text: `Gagal memperbarui tiket ${selected.unit_id}: ${res.error ?? "Galat server"}.`,
      });
    }
  };

  return (
    <div className="module-config flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Sticky/Non-shrinking Header Wrapper (:first-child in .module-config) */}
      <div className="flex shrink-0 flex-col gap-2">
        {(apiStatus === "FALLBACK_ERROR" || isOfflineSnapshot) && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-crimson/50 bg-crimson/10 px-3 py-2 num text-xs text-crimson"
          >
            <div className="flex items-center gap-2">
              <WifiOff size={15} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>
                Koneksi Live API terganggu. Menampilkan snapshot terakhir (sinkron:{" "}
                {selected.last_seen ?? (lastSyncTime || "belum tercatat")}).
              </span>
            </div>
            <button
              type="button"
              onClick={pollNow}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-crimson/60 bg-background/80 px-3 py-1.5 font-semibold uppercase tracking-wider text-crimson transition-colors hover:bg-crimson/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
              <span>Poll Live API</span>
            </button>
          </div>
        )}

        <div className="panel panel-toolbar flex flex-col gap-2.5 px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div
              role="tablist"
              aria-label="Sub-menu konfigurasi node"
              className="flex flex-wrap items-center gap-1.5 num text-xs"
            >
              {SUB_TABS.map((tab, idx) => {
                const active = activeSubTab === tab.id;
                const displayLabel =
                  tab.id === "TICKETS" ? `${tab.label} (${activeTicketCount})` : tab.label;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[tab.id] = el;
                    }}
                    id={`tab-config-${tab.id}`}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    aria-controls={`panel-config-${tab.id}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setActiveSubTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={cn(
                      "inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      active
                        ? "border-foreground bg-foreground/10 text-foreground"
                        : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                    )}
                  >
                    {tab.id === "ONBOARDING" && (
                      <Cpu
                        size={14}
                        aria-hidden="true"
                        className={active ? "text-emerald" : "text-muted-foreground"}
                      />
                    )}
                    {tab.id === "CALIBRATION" && (
                      <Sliders
                        size={14}
                        aria-hidden="true"
                        className={active ? "text-emerald" : "text-muted-foreground"}
                      />
                    )}
                    {tab.id === "TICKETS" && (
                      <ClipboardCheck
                        size={14}
                        aria-hidden="true"
                        className={active ? "text-emerald" : "text-muted-foreground"}
                      />
                    )}
                    <span>{displayLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 num text-[11px]">
              <label htmlFor="config-unit-selector" className="text-muted-foreground shrink-0">
                Target Node:
              </label>
              <select
                id="config-unit-selector"
                aria-label="Pilih target node konfigurasi"
                value={selected.unit_id}
                onChange={(e) => selectUnit(e.target.value)}
                className="min-h-[44px] cursor-pointer rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {units.map((u) => (
                  <option key={u.unit_id} value={u.unit_id}>
                    {u.bay} - {u.unit_id} ({u.model})
                  </option>
                ))}
              </select>

              <span
                className={cn(
                  "inline-flex min-h-[32px] items-center gap-1.5 rounded-[2px] border px-2 py-1 text-[10px] font-semibold uppercase",
                  conn.isOnline
                    ? "border-emerald/50 bg-emerald/10 text-emerald"
                    : "border-border bg-secondary/70 text-foreground",
                )}
              >
                <Led tone={conn.isOnline ? "emerald" : "dim"} />
                {conn.badgeText}
              </span>

              <span
                className={cn(
                  "inline-flex min-h-[32px] items-center rounded-[2px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
                  cfg.pending_ack
                    ? "border-amber/60 bg-amber/15 text-amber"
                    : "border-emerald/40 bg-emerald/10 text-emerald",
                )}
              >
                {cfg.pending_ack ? "ACK Tertunda" : "NVS Sinkron"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2 num text-[11px]">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>
                V_bat: <strong className="text-foreground">{fmtV(t.v_bat)}V</strong>
              </span>
              <span className="text-border">|</span>
              <span>
                ADC Raw: <strong className="text-foreground">{t.adc_raw_mv} mV</strong>
              </span>
              <span className="text-border">|</span>
              <span>
                Slope: <strong className="text-foreground">{cfg.cal_slope.toFixed(7)}</strong> |
                Offset: <strong className="text-foreground">{cfg.cal_offset.toFixed(4)}V</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {isLiveApi && (
                <button
                  type="button"
                  onClick={pollNow}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-border bg-background px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
                  <span>Poll Live API ({lastSyncTime ?? "--"})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveModule("04")}
                className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[2px] border border-border bg-card px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Diagnostik OBD (04)
              </button>
              <button
                type="button"
                onClick={() => setActiveModule("05")}
                className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[2px] border border-border bg-card px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Presensi &amp; Debounce (05)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SUB-TAB 01: ONBOARDING & PAIRING IOT */}
      {activeSubTab === "ONBOARDING" && (
        <div
          id="panel-config-ONBOARDING"
          role="tabpanel"
          aria-labelledby="tab-config-ONBOARDING"
          className="config-details grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.15fr_1fr]"
        >
          <Panel
            title="Registrasi Node IoT Baru & Penautan Kendaraan"
            code="ONBOARD"
            right={
              !isLiveApi ? (
                <button
                  type="button"
                  onClick={handleLoadSandboxExample}
                  className="inline-flex min-h-[36px] cursor-pointer items-center rounded-[2px] border border-border bg-secondary/50 px-2.5 py-1 num text-[10.5px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Isi Contoh Data (Sandbox)
                </button>
              ) : (
                <span className="num text-[10px] font-semibold uppercase text-emerald">
                  MySQL Two-Way Persist
                </span>
              )
            }
          >
            <form onSubmit={(e) => void handleExecuteOnboard(e)} className="space-y-4">
              {onboardStatus && (
                <div
                  role="status"
                  className={cn(
                    "flex items-start gap-2.5 rounded-[2px] border p-3 num text-xs",
                    onboardStatus.ok
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : "border-crimson/50 bg-crimson/10 text-crimson",
                  )}
                >
                  {onboardStatus.ok ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{onboardStatus.text}</span>
                </div>
              )}

              {isLiveApi && (
                <div className="rounded-[2px] border border-border bg-background/50 p-2.5 num text-[11px] leading-relaxed text-muted-foreground">
                  Pendaftaran menyimpan identitas node ke tabel `vehicles` dan profil kalibrasi ke
                  `node_configs` (`pending_ack=1`). Status koneksi awal node dicatat sebagai{" "}
                  <strong className="text-foreground">OFFLINE / Menunggu Paket Pertama</strong>{" "}
                  hingga perangkat ESP32 mengirim telemetri nyata.
                </div>
              )}

              {/* Step 1: Hardware Identity & PCB Revision */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                      1
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Identitas Hardware Node ESP32 &amp; Revisi PCB
                    </span>
                  </div>
                  <span className="num text-[10px] text-muted-foreground">
                    Default ADC: m={activePreset.slope.toFixed(7)}, c=
                    {activePreset.offset.toFixed(4)}V
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 num text-xs">
                  <div>
                    <label
                      htmlFor="onboard-node-id"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Unit Node ID
                    </label>
                    <input
                      id="onboard-node-id"
                      type="text"
                      value={nodeIdInput}
                      onChange={(e) => setNodeIdInput(e.target.value)}
                      placeholder="Mis. MITSUBISHI-STOCK-02"
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 font-mono uppercase text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onboard-pcb-ver"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Versi Hardware PCB Divider
                    </label>
                    <select
                      id="onboard-pcb-ver"
                      value={pcbVersion}
                      onChange={(e) => setPcbVersion(e.target.value as PcbVersionKey)}
                      className="min-h-[44px] w-full cursor-pointer rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="1">PCB v1.0 (R1 300k / R2 68k, offset 0.069V)</option>
                      <option value="2">PCB v2.0 (R1 100k / R2 27k, offset 0.160V)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 2: Vehicle Identity */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5">
                <div className="flex items-center gap-2 border-b border-border/80 pb-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                    2
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Identitas Kendaraan (VIN &amp; Model)
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 num text-xs">
                  <div>
                    <label
                      htmlFor="onboard-vin"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Nomor Rangka (VIN 17-Karakter)
                    </label>
                    <input
                      id="onboard-vin"
                      type="text"
                      value={vinInput}
                      onChange={(e) => setVinInput(e.target.value)}
                      maxLength={17}
                      placeholder="17 karakter alfanumerik VIN"
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 font-mono uppercase text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onboard-model"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Model Kendaraan
                    </label>
                    <input
                      id="onboard-model"
                      type="text"
                      value={modelInput}
                      onChange={(e) => setModelInput(e.target.value)}
                      placeholder="Mis. PAJERO SPORT"
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 font-medium uppercase text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onboard-trim"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Varian / Trim
                    </label>
                    <input
                      id="onboard-trim"
                      type="text"
                      value={trimInput}
                      onChange={(e) => setTrimInput(e.target.value)}
                      placeholder="Mis. DAKAR 4x4"
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 uppercase text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Yard Placement & Initial NVS Profile */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5">
                <div className="flex items-center gap-2 border-b border-border/80 pb-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                    3
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Penempatan Yard &amp; Parameter NVS Awal
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 num text-xs">
                  <div>
                    <label
                      htmlFor="onboard-bay"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Lokasi Parkir (Bay)
                    </label>
                    <select
                      id="onboard-bay"
                      value={bayInput}
                      onChange={(e) => setBayInput(e.target.value)}
                      className="min-h-[44px] w-full cursor-pointer rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {BAY_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          Bay {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="onboard-color"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Warna Bodi
                    </label>
                    <select
                      id="onboard-color"
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      className="min-h-[44px] w-full cursor-pointer rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="onboard-critv"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Ambang Volt Kritis (V)
                    </label>
                    <input
                      id="onboard-critv"
                      type="number"
                      step="0.05"
                      min="5.1"
                      max="15.9"
                      value={critVOnboardInput}
                      onChange={(e) => setCritVOnboardInput(e.target.value)}
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onboard-sleepcfg"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Interval Deep Sleep
                    </label>
                    <select
                      id="onboard-sleepcfg"
                      value={sleepCfgOnboardInput}
                      onChange={(e) => setSleepCfgOnboardInput(e.target.value)}
                      className="min-h-[44px] w-full cursor-pointer rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {SLEEP_CFG_OPTIONS.map((opt) => (
                        <option key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={isSubmittingOnboard}
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-foreground px-5 py-2 num text-xs font-semibold uppercase tracking-wider text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Link2 size={15} aria-hidden="true" />
                    <span>
                      {isSubmittingOnboard ? "Menyimpan..." : "Daftarkan Unit Baru & Antrekan NVS"}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </Panel>

          {/* Right: Node Directory with Search, Unpair & Re-Pair */}
          <Panel
            title="Direktori Node IoT Terdaftar"
            code="DIRECTORY"
            right={
              <span className="num text-[10.5px] text-muted-foreground">
                {filteredUnits.length}/{units.length} Unit
              </span>
            }
          >
            <div className="space-y-3">
              <div className="relative">
                <Search
                  size={13}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="config-directory-search"
                  type="search"
                  aria-label="Cari node terdaftar"
                  value={nodeFilter}
                  onChange={(e) => setNodeFilter(e.target.value)}
                  placeholder="Cari Unit ID, Bay, Model, atau VIN..."
                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-11 py-1.5 num text-xs text-foreground outline-none placeholder:text-dim focus:border-foreground/60"
                />
                {nodeFilter && (
                  <button
                    type="button"
                    aria-label="Hapus pencarian node"
                    onClick={() => setNodeFilter("")}
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              {directoryFeedback && (
                <div
                  role="status"
                  className={cn(
                    "rounded-[2px] border p-2.5 num text-xs",
                    directoryFeedback.ok
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : "border-crimson/50 bg-crimson/10 text-crimson",
                  )}
                >
                  {directoryFeedback.text}
                </div>
              )}

              {filteredUnits.length === 0 ? (
                <div className="rounded-[2px] border border-dashed border-border p-5 text-center num text-xs text-muted-foreground space-y-2.5">
                  <div>Tidak ada node yang cocok dengan kata kunci &quot;{nodeFilter}&quot;.</div>
                  <button
                    type="button"
                    onClick={() => setNodeFilter("")}
                    className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    Reset Pencarian
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUnits.map((u) => {
                    const isSelected = u.unit_id === selected.unit_id;
                    const uCfg = configs[u.unit_id];
                    const uConn = getUnitConnectionState(u, isLiveApi);
                    const isUnitUnpaired = unpaired.includes(u.unit_id);
                    const isEditingRepair = repairUnitId === u.unit_id;

                    return (
                      <div
                        key={u.unit_id}
                        className={cn(
                          "rounded-[2px] border p-3 transition-colors",
                          isSelected
                            ? "border-foreground/70 bg-foreground/5"
                            : "border-border bg-background/40 hover:border-foreground/30",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">{u.bay}</span>
                              <span className="text-xs font-medium text-foreground/90">
                                {u.model} {u.trim}
                              </span>
                              {isUnitUnpaired && (
                                <span className="num rounded-[2px] border border-amber/50 bg-amber/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-amber">
                                  Terlepas
                                </span>
                              )}
                            </div>
                            <div className="num mt-0.5 text-[10.5px] text-muted-foreground">
                              ID: <strong className="text-foreground">{u.unit_id}</strong> | VIN:{" "}
                              {u.vin}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "num inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                                uConn.isOnline
                                  ? "border-emerald/40 bg-emerald/10 text-emerald"
                                  : "border-border bg-secondary/50 text-muted-foreground",
                              )}
                            >
                              <Led tone={uConn.isOnline ? "emerald" : "dim"} />
                              {uConn.badgeText}
                            </span>

                            <span
                              className={cn(
                                "num inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                                uCfg?.pending_ack
                                  ? "border-amber/50 bg-amber/10 text-amber"
                                  : "border-border bg-secondary/40 text-muted-foreground",
                              )}
                            >
                              {uCfg?.pending_ack ? "ACK Tertunda" : "Sinkron"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 num text-[10.5px] text-muted-foreground">
                          <span>
                            Baterai:{" "}
                            <strong className="text-foreground">
                              {u.telemetry.v_bat <= 0 &&
                                u.status_label.toLowerCase().includes("menunggu")
                                ? "Menunggu Paket"
                                : `${fmtV(u.telemetry.v_bat)}V`}
                            </strong>
                          </span>
                          <span>
                            Ambang:{" "}
                            <strong className="text-foreground">
                              {(uCfg?.crit_v ?? 11.8).toFixed(2)}V
                            </strong>
                          </span>
                          <span>
                            Sleep:{" "}
                            <strong className="text-foreground">{uCfg?.sleep_cfg ?? 300}s</strong>
                          </span>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => selectUnit(u.unit_id)}
                            className={cn(
                              "min-h-[44px] cursor-pointer rounded-[2px] border px-3 py-1.5 num text-[10.5px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                              isSelected
                                ? "border-foreground bg-foreground/10 text-foreground"
                                : "border-border bg-secondary/40 text-foreground hover:border-foreground/60",
                            )}
                          >
                            {isSelected ? "Target Aktif" : "Pilih Target"}
                          </button>

                          {!isUnitUnpaired ? (
                            <button
                              type="button"
                              onClick={() => {
                                unpairUnit(u.unit_id);
                                setRepairUnitId(u.unit_id);
                                setRepairVin(u.vin);
                                setRepairModel(u.model);
                                setRepairBay(u.bay);
                                setRepairColor(u.color);
                                setDirectoryFeedback(null);
                              }}
                              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-amber/50 bg-amber/10 px-3 py-1.5 num text-[10.5px] font-semibold uppercase tracking-wider text-amber hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              <Link2Off size={13} aria-hidden="true" />
                              <span>Lepas Node</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingRepair) {
                                  setRepairUnitId(null);
                                } else {
                                  setRepairUnitId(u.unit_id);
                                  setRepairVin(u.vin);
                                  setRepairModel(u.model);
                                  setRepairBay(u.bay);
                                  setRepairColor(u.color);
                                }
                              }}
                              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-emerald/50 bg-emerald/10 px-3 py-1.5 num text-[10.5px] font-semibold uppercase tracking-wider text-emerald hover:bg-emerald/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              <Link2 size={13} aria-hidden="true" />
                              <span>
                                {isEditingRepair ? "Tutup Form Re-Pair" : "Pasang Ulang Node"}
                              </span>
                            </button>
                          )}
                        </div>

                        {isUnitUnpaired && isEditingRepair && (
                          <form
                            onSubmit={(e) => void handleConfirmRepair(e, u.unit_id)}
                            className="mt-3 space-y-2.5 rounded-[2px] border border-amber/40 bg-background/70 p-3 num text-xs"
                          >
                            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-amber">
                              Tautkan Ulang {u.unit_id} ke Kendaraan Baru
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label
                                  htmlFor={`repair-vin-${u.unit_id}`}
                                  className="label-hmi mb-1 block text-[9.5px] text-muted-foreground"
                                >
                                  VIN Baru
                                </label>
                                <input
                                  id={`repair-vin-${u.unit_id}`}
                                  type="text"
                                  value={repairVin}
                                  onChange={(e) => setRepairVin(e.target.value)}
                                  maxLength={17}
                                  placeholder="VIN 17 karakter"
                                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2 py-1 font-mono uppercase text-foreground"
                                  required
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor={`repair-model-${u.unit_id}`}
                                  className="label-hmi mb-1 block text-[9.5px] text-muted-foreground"
                                >
                                  Model Baru
                                </label>
                                <input
                                  id={`repair-model-${u.unit_id}`}
                                  type="text"
                                  value={repairModel}
                                  onChange={(e) => setRepairModel(e.target.value)}
                                  placeholder="Mis. XPANDER CROSS"
                                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2 py-1 uppercase text-foreground"
                                  required
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor={`repair-bay-${u.unit_id}`}
                                  className="label-hmi mb-1 block text-[9.5px] text-muted-foreground"
                                >
                                  Bay Parkir
                                </label>
                                <select
                                  id={`repair-bay-${u.unit_id}`}
                                  value={repairBay}
                                  onChange={(e) => setRepairBay(e.target.value)}
                                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2 py-1 text-foreground"
                                >
                                  {BAY_OPTIONS.map((b) => (
                                    <option key={b} value={b}>
                                      {b}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label
                                  htmlFor={`repair-color-${u.unit_id}`}
                                  className="label-hmi mb-1 block text-[9.5px] text-muted-foreground"
                                >
                                  Warna
                                </label>
                                <select
                                  id={`repair-color-${u.unit_id}`}
                                  value={repairColor}
                                  onChange={(e) => setRepairColor(e.target.value)}
                                  className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2 py-1 text-foreground"
                                >
                                  {COLOR_OPTIONS.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="submit"
                                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-[2px] bg-foreground px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-background hover:bg-foreground/90"
                              >
                                <CheckCircle2 size={13} aria-hidden="true" />
                                <span>Simpan Penautan Ulang</span>
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 02: PARAMETER NVS & KALIBRASI ADC */}
      {activeSubTab === "CALIBRATION" && (
        <div
          id="panel-config-CALIBRATION"
          role="tabpanel"
          aria-labelledby="tab-config-CALIBRATION"
          className="config-details grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.15fr_1fr]"
        >
          {/* Left: NVS Piggyback Parameters & Exact Server Wire JSON Preview */}
          <Panel
            title="Parameter NVS ESP32 & Antrean Piggyback ACK"
            code="NVS"
            right={
              <span className="num text-[10px] text-muted-foreground">
                Target: {selected.unit_id} ({selected.bay})
              </span>
            }
          >
            <form onSubmit={(e) => void handleSaveNvsParams(e)} className="space-y-3.5 num text-xs">
              {nvsFeedback && (
                <div
                  role="status"
                  className={cn(
                    "flex items-start gap-2 rounded-[2px] border p-2.5 text-xs",
                    nvsFeedback.ok
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : "border-crimson/50 bg-crimson/10 text-crimson",
                  )}
                >
                  {nvsFeedback.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{nvsFeedback.text}</span>
                </div>
              )}

              {/* Firmware NVS Parameters (Over-the-air via Piggyback ACK) */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
                  <span className="font-sans text-xs font-semibold text-foreground">
                    1. Parameter NVS Firmware (Dikirim via HTTP 200 ACK)
                  </span>
                  <span className="rounded-[2px] border border-emerald/40 bg-emerald/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-emerald">
                    Terapkan di Siklus Wake
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="cfg-crit-v"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Ambang Voltase Kritis (crit_v)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="cfg-crit-v"
                        type="number"
                        step="0.05"
                        value={critVDraft}
                        onChange={(e) => {
                          setCritVDraft(e.target.value);
                          setNvsFeedback(null);
                        }}
                        className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <span className="text-[11px] text-muted-foreground shrink-0">V</span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Batas aman firmware: &gt; 5.0V dan &lt; 16.0V.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="cfg-sleep-cfg"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Interval Deep Sleep (sleep_cfg)
                    </label>
                    <select
                      id="cfg-sleep-cfg"
                      value={sleepCfgDraft}
                      onChange={(e) => {
                        setSleepCfgDraft(e.target.value);
                        setNvsFeedback(null);
                      }}
                      className="min-h-[44px] w-full cursor-pointer rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {SLEEP_CFG_OPTIONS.map((opt) => (
                        <option key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Server Evaluation Parameters (Stored in MySQL node_configs) */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
                  <span className="font-sans text-xs font-semibold text-foreground">
                    2. Profil Evaluasi Server (`node_configs`)
                  </span>
                  <span className="rounded-[2px] border border-border bg-secondary/60 px-1.5 py-0.5 text-[9.5px] font-medium uppercase text-muted-foreground">
                    Disimpan di Backend
                  </span>
                </div>
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  Nilai debounce server dan interval fast poll disimpan pada profil tabel
                  `node_configs` dan tidak dikirim di JSON Piggyback ACK firmware.
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="label-hmi mb-1 block text-[10px] text-muted-foreground">
                      Debounce Miss Keberadaan
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[1, 2, 3, 5].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          aria-pressed={debounceDraft === cnt}
                          onClick={() => {
                            setDebounceDraft(cnt);
                            setNvsFeedback(null);
                          }}
                          className={cn(
                            "min-h-[44px] min-w-[44px] cursor-pointer rounded-[2px] border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            debounceDraft === cnt
                              ? "border-foreground bg-foreground/15 text-foreground"
                              : "border-border bg-secondary/50 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                          )}
                        >
                          {cnt}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="cfg-fast-poll"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Interval Fast Poll (detik)
                    </label>
                    <input
                      id="cfg-fast-poll"
                      type="number"
                      min="5"
                      max="300"
                      step="1"
                      value={fastPollDraft}
                      onChange={(e) => {
                        setFastPollDraft(e.target.value);
                        setNvsFeedback(null);
                      }}
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>
              </div>

              {!nvsValidation.valid && (
                <div
                  role="alert"
                  className="rounded-[2px] border border-crimson/50 bg-crimson/10 p-2.5 text-[11px] text-crimson space-y-1"
                >
                  {nvsValidation.errors.map((errMsg) => (
                    <div key={errMsg} className="flex items-start gap-1.5">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{errMsg}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={!nvsValidation.valid || isSavingNvs}
                className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-wider text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>{isSavingNvs ? "Mengirim ke Server..." : "Simpan & Antrekan ACK NVS"}</span>
              </button>

              {/* Honest Wire Contract JSON Preview (Exact match with simpan_data.php) */}
              <div className="rounded-[2px] border border-border bg-background/40 p-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="label-hmi text-[10px] text-muted-foreground">
                    Kontrak HTTP 200 JSON (simpan_data.php)
                  </span>
                  <span
                    className={cn(
                      "rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                      cfg.pending_ack
                        ? "border-amber/50 bg-amber/10 text-amber"
                        : "border-emerald/40 bg-emerald/10 text-emerald",
                    )}
                  >
                    {cfg.pending_ack
                      ? "Antrean Aktif (pending_ack: true)"
                      : "Sinkron (pending_ack: false)"}
                  </span>
                </div>
                <pre className="overflow-x-auto font-mono text-[10.5px] leading-relaxed text-foreground/90">
                  {JSON.stringify(wireAckPreview, null, 2)}
                </pre>
              </div>
            </form>
          </Panel>

          {/* Right: 4-Point ADC OLS Calibration (SOP C.1) */}
          <Panel
            title="Kalibrasi ADC 4-Titik Pin 34 (SOP C.1 Multimeter)"
            code="OLS"
            right={
              <span className="num text-[10.5px] text-muted-foreground">
                R² = {fit.rSquared.toFixed(4)}
              </span>
            }
          >
            <div className="space-y-3.5 num text-xs">
              {calFeedback && (
                <div
                  role="status"
                  className={cn(
                    "flex items-start gap-2 rounded-[2px] border p-2.5 text-xs",
                    calFeedback.ok
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : "border-crimson/50 bg-crimson/10 text-crimson",
                  )}
                >
                  {calFeedback.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{calFeedback.text}</span>
                </div>
              )}

              <div className="rounded-[2px] border border-border bg-background/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                Uji 4 titik tegangan catu daya DC stabil (11.0V s.d. 14.4V) memakai Digital
                Multimeter (DMM) terkalibrasi lalu catat milivolt mentah ESP32 Pin 34. Pembacaan
                node saat ini:{" "}
                <strong className="text-foreground">
                  {t.adc_raw_mv > 0 ? `${t.adc_raw_mv} mV` : "Menunggu sampel"}
                </strong>{" "}
                (V_bat server: <strong className="text-foreground">{fmtV(t.v_bat)}V</strong>).
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadCalPreset("1")}
                  className="min-h-[44px] cursor-pointer rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Muat Preset PCB v1.0 (0.069V)
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadCalPreset("2")}
                  className="min-h-[44px] cursor-pointer rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Muat Preset PCB v2.0 (0.160V)
                </button>
              </div>

              {/* Mobile Calibration Card Stack (< md) */}
              <div className="space-y-2 md:hidden">
                {cal.map((row, i) => {
                  const dmmNum = Number.parseFloat(row.dmm) || 0;
                  const mvNum = Number.parseFloat(row.mv) || 0;
                  const predicted = fit.slope * mvNum + fit.offset;
                  const err = dmmNum > 0 && mvNum > 0 ? (predicted - dmmNum).toFixed(3) : "--";
                  return (
                    <div
                      key={i}
                      className="rounded-[2px] border border-border bg-background/50 p-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground">Titik #{i + 1}</span>
                        <span className="text-muted-foreground">Error: {err} V</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            htmlFor={`cal-m-dmm-${i}`}
                            className="label-hmi mb-1 block text-[9.5px] text-muted-foreground"
                          >
                            Tegangan DMM (V)
                          </label>
                          <input
                            id={`cal-m-dmm-${i}`}
                            type="text"
                            value={row.dmm}
                            onChange={(e) => {
                              const next = [...cal];
                              next[i] = { ...next[i]!, dmm: e.target.value };
                              setCal(next);
                              setCalFeedback(null);
                            }}
                            className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`cal-m-mv-${i}`}
                            className="label-hmi mb-1 block text-[9.5px] text-muted-foreground"
                          >
                            ADC Raw (mV)
                          </label>
                          <input
                            id={`cal-m-mv-${i}`}
                            type="text"
                            value={row.mv}
                            onChange={(e) => {
                              const next = [...cal];
                              next[i] = { ...next[i]!, mv: e.target.value };
                              setCal(next);
                              setCalFeedback(null);
                            }}
                            className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Calibration Table (>= md) */}
              <div className="hidden md:block overflow-x-auto rounded-[2px] border border-border/80">
                <table className="w-full border-collapse text-left num text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 px-2.5 font-medium">Titik</th>
                      <th className="py-2 px-2.5 font-medium">Tegangan DMM (V)</th>
                      <th className="py-2 px-2.5 font-medium">ADC Raw (mV)</th>
                      <th className="py-2 px-2.5 text-right font-medium">Galat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cal.map((row, i) => {
                      const dmmNum = Number.parseFloat(row.dmm) || 0;
                      const mvNum = Number.parseFloat(row.mv) || 0;
                      const predicted = fit.slope * mvNum + fit.offset;
                      const err = dmmNum > 0 && mvNum > 0 ? (predicted - dmmNum).toFixed(3) : "--";
                      return (
                        <tr key={i} className="hover:bg-secondary/20">
                          <td className="py-2 px-2.5 font-semibold text-foreground">
                            Titik #{i + 1}
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="text"
                              aria-label={`Titik #${i + 1} Tegangan DMM (V)`}
                              value={row.dmm}
                              onChange={(e) => {
                                const next = [...cal];
                                next[i] = { ...next[i]!, dmm: e.target.value };
                                setCal(next);
                                setCalFeedback(null);
                              }}
                              className="min-h-[40px] w-20 rounded-[2px] border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="text"
                              aria-label={`Titik #${i + 1} ADC Raw (mV)`}
                              value={row.mv}
                              onChange={(e) => {
                                const next = [...cal];
                                next[i] = { ...next[i]!, mv: e.target.value };
                                setCal(next);
                                setCalFeedback(null);
                              }}
                              className="min-h-[40px] w-20 rounded-[2px] border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono text-[11px] text-muted-foreground">
                            {err} V
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-[2px] border border-border bg-background/40 p-3 text-center">
                <div>
                  <div className="label-hmi text-[9.5px]">Koefisien Slope (m)</div>
                  <div className="num mt-1 font-mono text-sm font-bold text-emerald">
                    {fit.slope.toFixed(7)}
                  </div>
                </div>
                <div>
                  <div className="label-hmi text-[9.5px]">Offset Koreksi (c)</div>
                  <div className="num mt-1 font-mono text-sm font-bold text-emerald">
                    {fit.offset.toFixed(4)} V
                  </div>
                </div>
              </div>

              {!olsValidation.valid && (
                <div
                  role="alert"
                  className="rounded-[2px] border border-crimson/50 bg-crimson/10 p-2.5 text-[11px] text-crimson space-y-1"
                >
                  {olsValidation.errors.map((errMsg) => (
                    <div key={errMsg} className="flex items-start gap-1.5">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{errMsg}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={!olsValidation.valid || isSavingCal}
                onClick={() => void handleSaveCalibration()}
                className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-wider text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sliders size={14} aria-hidden="true" />
                <span>
                  {isSavingCal ? "Menyimpan..." : "Simpan Parameter Kalibrasi ke NVS Flash"}
                </span>
              </button>
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 03: TIKET PEMELIHARAAN & JEJAK AUDIT */}
      {activeSubTab === "TICKETS" && (
        <div
          id="panel-config-TICKETS"
          role="tabpanel"
          aria-labelledby="tab-config-TICKETS"
          className="config-details grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.15fr_1fr]"
        >
          {/* Left: Interactive Shift Handover Ticket Editor & List */}
          <Panel
            title="Tiket Pemeliharaan Baterai & Shift Handover"
            code="TICKETS"
            right={
              <span className="num text-[10.5px] text-muted-foreground">
                {activeTicketCount} Tiket Aktif
              </span>
            }
          >
            <div className="space-y-3.5 num text-xs">
              {ticketFeedback && (
                <div
                  role="status"
                  className={cn(
                    "flex items-start gap-2 rounded-[2px] border p-2.5 text-xs",
                    ticketFeedback.ok
                      ? "border-emerald/50 bg-emerald/10 text-emerald"
                      : "border-crimson/50 bg-crimson/10 text-crimson",
                  )}
                >
                  {ticketFeedback.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{ticketFeedback.text}</span>
                </div>
              )}

              {/* Active Selected Unit Ticket Action Card */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
                  <div className="flex items-center gap-2 font-sans text-xs font-semibold text-foreground">
                    <Wrench size={14} className="text-muted-foreground" aria-hidden="true" />
                    <span>
                      Kelola Tiket Unit: {selected.unit_id} (Bay {selected.bay})
                    </span>
                  </div>
                  {selectedTicket && (
                    <span
                      className={cn(
                        "rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase",
                        TICKET_STATUS_STYLE[selectedTicket.status],
                      )}
                    >
                      {TICKET_STATUS_LABEL[selectedTicket.status]}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="ticket-assignee"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Nama Teknisi Bertugas
                    </label>
                    <input
                      id="ticket-assignee"
                      type="text"
                      value={assigneeInput}
                      onChange={(e) => setAssigneeInput(e.target.value)}
                      placeholder="Masukkan nama teknisi lapangan..."
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ticket-note"
                      className="label-hmi mb-1 block text-[10px] text-muted-foreground"
                    >
                      Catatan Handover Shift
                    </label>
                    <input
                      id="ticket-note"
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Catatan tindak lanjut baterai/CAN..."
                      className="min-h-[44px] w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isSavingTicket}
                    onClick={() => void handleTicketAction("OPEN")}
                    className="min-h-[44px] cursor-pointer rounded-[2px] border border-crimson/50 bg-crimson/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-crimson hover:bg-crimson/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  >
                    Buka Tiket
                  </button>
                  <button
                    type="button"
                    disabled={isSavingTicket}
                    onClick={() => void handleTicketAction("IN_PROGRESS")}
                    className="min-h-[44px] cursor-pointer rounded-[2px] border border-amber/50 bg-amber/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber hover:bg-amber/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  >
                    Klaim Dikerjakan
                  </button>
                  <button
                    type="button"
                    disabled={isSavingTicket}
                    onClick={() => void handleTicketAction("RESOLVED")}
                    className="min-h-[44px] cursor-pointer rounded-[2px] border border-emerald/50 bg-emerald/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-emerald hover:bg-emerald/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  >
                    Selesaikan Tiket
                  </button>
                </div>
              </div>

              {/* Ticket List or Honest Empty State */}
              {tickets.length === 0 ? (
                <div className="rounded-[2px] border border-dashed border-border p-5 text-center text-muted-foreground space-y-1.5">
                  <div className="font-sans text-xs font-medium text-foreground">
                    Belum ada tiket pemeliharaan aktif untuk armada saat ini.
                  </div>
                  <p className="text-[11px]">
                    Gunakan panel di atas jika ingin membuka tiket tindak lanjut untuk unit{" "}
                    {selected.unit_id}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tickets.map((tk) => {
                    const isCurrent = tk.unit_id === selected.unit_id;
                    return (
                      <div
                        key={tk.id}
                        className={cn(
                          "rounded-[2px] border p-3 transition-colors",
                          isCurrent
                            ? "border-foreground/60 bg-foreground/5"
                            : "border-border bg-background/40 hover:border-foreground/30",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {tk.bay}
                              </span>
                              <span className="text-xs font-medium text-foreground/90">
                                {tk.unit_id}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                              Masalah:{" "}
                              <strong className="text-foreground">{tk.issue_summary}</strong>
                            </div>
                          </div>

                          <span
                            className={cn(
                              "inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                              TICKET_STATUS_STYLE[tk.status],
                            )}
                          >
                            {TICKET_STATUS_LABEL[tk.status]}
                          </span>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[10.5px] text-muted-foreground">
                          <div>
                            <div>
                              Teknisi: <strong className="text-foreground">{tk.assigned_to}</strong>
                            </div>
                            {tk.handover_note && (
                              <div className="mt-0.5 text-foreground/80">
                                Catatan: {tk.handover_note}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => selectUnit(tk.unit_id)}
                            className="min-h-[38px] cursor-pointer rounded-[2px] border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase text-foreground hover:border-foreground/60"
                          >
                            Pilih Unit Ini
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          {/* Right: Operational Audit Trail with Search, Severity Filter & Full Message */}
          <Panel
            title="Jejak Audit Operasional & Log Sistem"
            code="AUDIT"
            right={
              <div className="flex items-center gap-1.5 num text-[10.5px] text-muted-foreground">
                <History size={12} aria-hidden="true" />
                <span>{filteredAuditLogs.length} Entri</span>
              </div>
            }
          >
            <div className="space-y-3">
              {/* Filter Bar */}
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search
                    size={13}
                    strokeWidth={1.75}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="audit-search-input"
                    type="search"
                    aria-label="Cari log audit sistem"
                    value={auditQuery}
                    onChange={(e) => setAuditQuery(e.target.value)}
                    placeholder="Cari pesan audit, tipe event, atau Unit ID..."
                    className="min-h-[44px] w-full rounded-[2px] border border-border bg-background pl-8 pr-11 py-1.5 num text-xs text-foreground outline-none placeholder:text-dim focus:border-foreground/60"
                  />
                  {auditQuery && (
                    <button
                      type="button"
                      aria-label="Hapus pencarian log audit"
                      onClick={() => setAuditQuery("")}
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[2px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 num text-[10.5px]">
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        { id: "ALL", label: "Semua" },
                        { id: "INFO", label: "Info" },
                        { id: "WARN", label: "Peringatan" },
                        { id: "CRITICAL", label: "Kritis" },
                      ] as const
                    ).map((sev) => (
                      <button
                        key={sev.id}
                        type="button"
                        aria-pressed={auditSeverity === sev.id}
                        onClick={() => setAuditSeverity(sev.id)}
                        className={cn(
                          "min-h-[44px] cursor-pointer rounded-[2px] border px-2.5 py-1 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          auditSeverity === sev.id
                            ? "border-foreground/70 bg-foreground/10 text-foreground"
                            : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {sev.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    aria-pressed={auditSelectedUnitOnly}
                    onClick={() => setAuditSelectedUnitOnly((v) => !v)}
                    className={cn(
                      "min-h-[44px] cursor-pointer rounded-[2px] border px-2.5 py-1 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      auditSelectedUnitOnly
                        ? "border-foreground/70 bg-foreground/10 text-foreground"
                        : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {auditSelectedUnitOnly ? `Unit ${selected.bay}` : "Semua Unit"}
                  </button>
                </div>
              </div>

              {filteredAuditLogs.length === 0 ? (
                <div className="rounded-[2px] border border-dashed border-border p-5 text-center num text-xs text-muted-foreground space-y-2.5">
                  <div>Tidak ada catatan audit yang cocok dengan filter aktif.</div>
                  {(auditQuery || auditSeverity !== "ALL" || auditSelectedUnitOnly) && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuditQuery("");
                        setAuditSeverity("ALL");
                        setAuditSelectedUnitOnly(false);
                      }}
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[2px] border border-border bg-secondary/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      Reset Filter Audit
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile Audit Card Stack (< md) */}
                  <div className="space-y-2 md:hidden num text-xs">
                    {filteredAuditLogs.slice(0, 30).map((log) => (
                      <div
                        key={log.id}
                        className="rounded-[2px] border border-border bg-card/60 p-2.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{log.unit_id}</span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                              SEVERITY_BADGE[log.severity],
                            )}
                          >
                            {SEVERITY_LABEL[log.severity]}
                          </span>
                        </div>
                        <div className="text-[11px] font-medium text-foreground/90">
                          {formatEventTypeLabel(log.event_type)}
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {log.message}
                        </p>
                        <div className="text-[10px] text-dim">{log.created_at}</div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Audit Table (>= md) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-collapse text-left num text-[11px]">
                      <thead>
                        <tr className="border-b border-border bg-secondary/40 text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          <th className="py-2 px-2.5 font-medium">Waktu</th>
                          <th className="py-2 px-2.5 font-medium">Unit &amp; Tipe</th>
                          <th className="py-2 px-2.5 font-medium">Keterangan Detail</th>
                          <th className="py-2 px-2.5 text-right font-medium">Tingkat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredAuditLogs.slice(0, 30).map((log) => (
                          <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="py-2 px-2.5 whitespace-nowrap align-top text-muted-foreground">
                              {log.created_at}
                            </td>
                            <td className="py-2 px-2.5 align-top">
                              <div className="font-semibold text-foreground whitespace-nowrap">
                                {log.unit_id}
                              </div>
                              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {formatEventTypeLabel(log.event_type)}
                              </div>
                            </td>
                            <td className="py-2 px-2.5 align-top text-foreground/90 leading-relaxed">
                              {log.message}
                            </td>
                            <td className="py-2 px-2.5 text-right align-top">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                                  SEVERITY_BADGE[log.severity],
                                )}
                              >
                                {SEVERITY_LABEL[log.severity]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
