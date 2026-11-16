import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  History,
  Link2,
  Link2Off,
  Radio,
  RefreshCw,
  Scan,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useTelemetry } from "@/context/TelemetryContext";
import type { AuditSeverity, TicketStatus, VehicleUnit } from "@/data/mockTelemetry";
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
  INFO: "border-border bg-secondary/60 text-muted-foreground",
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

type ConfigSubTab = "ONBOARDING" | "CALIBRATION" | "TICKETS";

export function ConfigModule() {
  const {
    units,
    allUnits,
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
  } = useTelemetry();

  const [activeSubTab, setActiveSubTab] = useState<ConfigSubTab>("ONBOARDING");
  const [nodeFilter, setNodeFilter] = useState("");
  const cfg = configs[selected.unit_id] ?? {
    unit_id: selected.unit_id,
    crit_v: 11.80,
    sleep_cfg: 300,
    fast_poll_s: 10,
    debounce_cnt: 3,
    cal_slope: 0.005412,
    cal_offset: 0.358,
    pending_ack: false,
  };
  const isUnpaired = unpaired.includes(selected.unit_id);
  const t = selected.telemetry;

  // Calibration OLS State
  const [cal, setCal] = useState<CalRow[]>(CAL_DEFAULT);
  const fit = useMemo(() => olsCalibration(cal.map((p) => ({ dmm: Number(p.dmm), mv: Number(p.mv) }))), [cal]);

  // Onboarding Wizard State
  const [nodeIdInput, setNodeIdInput] = useState(`MITSUBISHI-STOCK-${String(units.length + 1).padStart(2, "0")}`);
  const [macInput, setMacInput] = useState("24:6F:28:B1:9A:02");
  const [pcbVersion, setPcbVersion] = useState("1");
  const [vinInput, setVinInput] = useState("MMBXFUJ40SH000877");
  const [modelInput, setModelInput] = useState("XFORCE");
  const [trimInput, setTrimInput] = useState("ULTIMATE CVT");
  const [engineInput, setEngineInput] = useState("4A91 1.5L DOHC MIVEC");
  const [colorInput, setColorInput] = useState("White Diamond");
  const [bayInput, setBayInput] = useState("B-02");
  const [critVInput, setCritVInput] = useState("11.80");
  const [sleepCfgInput, setSleepCfgInput] = useState("300");
  const [isScanningEcu, setIsScanningEcu] = useState(false);
  const [ecuScanSuccess, setEcuScanSuccess] = useState(false);
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState<string | null>(null);

  // Tickets State
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

  const handleScanEcu = () => {
    setIsScanningEcu(true);
    setEcuScanSuccess(false);
    setTimeout(() => {
      setVinInput("MMBXFUJ40SH000877");
      setModelInput("XFORCE");
      setTrimInput("ULTIMATE CVT");
      setEngineInput("4A91 1.5L DOHC MIVEC");
      setIsScanningEcu(false);
      setEcuScanSuccess(true);
    }, 700);
  };

  const handleExecuteOnboard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeIdInput.trim() || !vinInput.trim() || !bayInput.trim()) return;

    registerUnit({
      unit_id: nodeIdInput.trim().toUpperCase(),
      vin: vinInput.trim().toUpperCase(),
      model: modelInput.trim().toUpperCase(),
      trim: trimInput.trim().toUpperCase(),
      color: colorInput.trim(),
      bay: bayInput.trim().toUpperCase(),
      crit_v: parseFloat(critVInput) || 11.80,
      sleep_cfg: parseInt(sleepCfgInput, 10) || 300,
    });

    setRegisterSuccessMsg(
      `Node ${nodeIdInput.toUpperCase()} berhasil didaftarkan dan terhubung ke ECU ${modelInput} ${trimInput} (Bay ${bayInput.toUpperCase()})!`,
    );

    setTimeout(() => {
      setRegisterSuccessMsg(null);
    }, 5000);
  };

  return (
    <div className="module-config flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Sub-Menu Navigation Bar (Opsi 2: Manajemen & Onboarding Node) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 rounded-[2px] border border-border bg-card/90 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5 num text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab("ONBOARDING")}
            className={cn(
              "flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeSubTab === "ONBOARDING"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
            )}
          >
            <Cpu size={14} className={activeSubTab === "ONBOARDING" ? "text-emerald" : "text-muted-foreground"} />
            <span>01. Onboarding &amp; Pairing IoT</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("CALIBRATION")}
            className={cn(
              "flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeSubTab === "CALIBRATION"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
            )}
          >
            <Sliders size={14} className={activeSubTab === "CALIBRATION" ? "text-emerald" : "text-muted-foreground"} />
            <span>02. Parameter NVS &amp; Kalibrasi ADC</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("TICKETS")}
            className={cn(
              "flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[2px] border px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeSubTab === "TICKETS"
                ? "border-foreground bg-foreground/10 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-foreground/50 hover:text-foreground",
            )}
          >
            <ClipboardCheck size={14} className={activeSubTab === "TICKETS" ? "text-emerald" : "text-muted-foreground"} />
            <span>03. Tiket Pemeliharaan &amp; Audit ({activeTicketCount})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 num text-[11px] text-muted-foreground">
          <span>Target Node Terpilih:</span>
          <span className="font-semibold text-foreground">{selected.bay} ({selected.unit_id})</span>
        </div>
      </div>

      {/* SUB-TAB 01: ONBOARDING & PAIRING IOT WIZARD */}
      {activeSubTab === "ONBOARDING" && (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
          {/* Left: 3-Step Interactive Onboarding Wizard */}
          <Panel
            title="Wizard Registrasi Node IoT Baru & Pengenalan Otomatis Data ECU"
            code="WIZARD"
            right={
              <span className="num text-[10px] text-emerald font-semibold uppercase">
                Protokol ISO 15765-4 CAN Ready
              </span>
            }
          >
            <form onSubmit={handleExecuteOnboard} className="space-y-4">
              {registerSuccessMsg && (
                <div className="flex items-start gap-2.5 rounded-[2px] border border-emerald/50 bg-emerald/10 p-3 num text-xs text-emerald">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>{registerSuccessMsg}</span>
                </div>
              )}

              {/* Tahap 1: Deteksi Hardware IoT */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5">
                <div className="flex items-center justify-between border-b border-border/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                      1
                    </span>
                    <span className="font-semibold text-foreground text-xs uppercase tracking-wider">
                      Deteksi &amp; Identitas Hardware Node IoT
                    </span>
                  </div>
                  <span className="num text-[10.5px] text-muted-foreground">ESP32 + Pin 34 ADC + TWAI</span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3 num text-xs">
                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Unit Node ID
                    </label>
                    <input
                      type="text"
                      value={nodeIdInput}
                      onChange={(e) => setNodeIdInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 uppercase font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="MITSUBISHI-STOCK-02"
                      required
                    />
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      ESP32 MAC Address
                    </label>
                    <input
                      type="text"
                      value={macInput}
                      onChange={(e) => setMacInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 uppercase font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="24:6F:28:B1:9A:02"
                    />
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Hardware PCB Version
                    </label>
                    <select
                      value={pcbVersion}
                      onChange={(e) => setPcbVersion(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="1">PCB v1.0 (ESP32 + DS3231SN + WCMCU-230)</option>
                      <option value="2">PCB v2.0 (Integrated SMD + LittleFS)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tahap 2: Pengenalan Data ECU Mobil (Automated ECU Fingerprinting) */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                      2
                    </span>
                    <span className="font-semibold text-foreground text-xs uppercase tracking-wider">
                      Pengenalan Data ECU Mobil (Auto-Fingerprint)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleScanEcu}
                    disabled={isScanningEcu}
                    className="inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-[2px] border border-foreground/50 bg-secondary px-3 py-1 num text-[10.5px] font-semibold uppercase tracking-wider text-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {isScanningEcu ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Scan size={12} />
                    )}
                    <span>{isScanningEcu ? "Memindai Bus CAN..." : "Pindai ECU (Mode 09 PID 02)"}</span>
                  </button>
                </div>

                {ecuScanSuccess && (
                  <div className="mt-2.5 rounded-[2px] border border-emerald/40 bg-emerald/10 px-2.5 py-1.5 num text-[10.5px] text-emerald flex items-center gap-2">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>ECU terdeteksi via ISO 15765-4 CAN (11-bit, 500 kbaud). VIN &amp; model berhasil didekode!</span>
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-2 num text-xs">
                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Nomor Rangka (VIN 17-Karakter)
                    </label>
                    <input
                      type="text"
                      value={vinInput}
                      onChange={(e) => setVinInput(e.target.value)}
                      maxLength={17}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 uppercase font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="MMBXFUJ40SH000877"
                      required
                    />
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Model Kendaraan Teridentifikasi
                    </label>
                    <input
                      type="text"
                      value={modelInput}
                      onChange={(e) => setModelInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 uppercase font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="XFORCE"
                      required
                    />
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Varian &amp; Tipe Transmisi
                    </label>
                    <input
                      type="text"
                      value={trimInput}
                      onChange={(e) => setTrimInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 uppercase text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="ULTIMATE CVT"
                    />
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Kode Mesin &amp; Spesifikasi
                    </label>
                    <input
                      type="text"
                      value={engineInput}
                      onChange={(e) => setEngineInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 uppercase text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="4A91 1.5L DOHC MIVEC"
                    />
                  </div>
                </div>
              </div>

              {/* Tahap 3: Penempatan Yard & Parameter Registrasi Database */}
              <div className="rounded-[2px] border border-border bg-background/50 p-3.5">
                <div className="flex items-center gap-2 border-b border-border/80 pb-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                    3
                  </span>
                  <span className="font-semibold text-foreground text-xs uppercase tracking-wider">
                    Penempatan Yard &amp; Registrasi ke Database MySQL
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-4 num text-xs">
                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Lokasi Parkir (Bay)
                    </label>
                    <select
                      value={bayInput}
                      onChange={(e) => setBayInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="A-01">Bay A-01</option>
                      <option value="A-02">Bay A-02</option>
                      <option value="A-03">Bay A-03</option>
                      <option value="A-04">Bay A-04</option>
                      <option value="B-01">Bay B-01</option>
                      <option value="B-02">Bay B-02</option>
                      <option value="B-03">Bay B-03</option>
                      <option value="B-04">Bay B-04</option>
                      <option value="C-01">Bay C-01</option>
                      <option value="C-02">Bay C-02</option>
                      <option value="C-03">Bay C-03</option>
                      <option value="C-04">Bay C-04</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Warna Bodi
                    </label>
                    <select
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="White Diamond">White Diamond</option>
                      <option value="Jet Black Mica">Jet Black Mica</option>
                      <option value="Graphite Gray">Graphite Gray</option>
                      <option value="Red Metallic">Red Metallic</option>
                      <option value="Silver Metallic">Silver Metallic</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Ambang Volt Kritis
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={critVInput}
                      onChange={(e) => setCritVInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="11.80"
                    />
                  </div>

                  <div>
                    <label className="label-hmi block text-[9.5px] text-muted-foreground mb-1">
                      Interval Sleep (Detik)
                    </label>
                    <select
                      value={sleepCfgInput}
                      onChange={(e) => setSleepCfgInput(e.target.value)}
                      className="w-full rounded-[2px] border border-border bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="300">300s (5 Menit)</option>
                      <option value="600">600s (10 Menit)</option>
                      <option value="1800">1800s (30 Menit)</option>
                      <option value="21600">21600s (6 Jam)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-foreground px-6 py-2.5 num text-xs font-semibold uppercase tracking-wider text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Link2 size={15} />
                    <span>Daftarkan Unit Baru &amp; Mulai Pemantauan</span>
                  </button>
                </div>
              </div>
            </form>
          </Panel>

          {/* Right: Live Registered Units Directory & Hardware Link Status */}
          <Panel
            title="Daftar Node IoT Terdaftar di Database MySQL"
            code="DIRECTORY"
            right={
              <span className="num text-[10.5px] text-muted-foreground">
                {units.length} Unit Aktif
              </span>
            }
          >
            <div className="space-y-2">
              {units.map((u) => {
                const isSelected = u.unit_id === selected.unit_id;
                const uCfg = configs[u.unit_id];
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
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-xs">{u.bay}</span>
                          <span className="text-xs text-foreground/90 font-medium">
                            {u.model} {u.trim}
                          </span>
                        </div>
                        <div className="num text-[10.5px] text-muted-foreground mt-0.5">
                          ID: <strong className="text-foreground">{u.unit_id}</strong> | VIN: {u.vin}
                        </div>
                      </div>

                      <span
                        className={cn(
                          "num inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                          u.online_status === "ONLINE"
                            ? "border-emerald/40 bg-emerald/10 text-emerald"
                            : "border-border bg-secondary/50 text-muted-foreground",
                        )}
                      >
                        <Led tone={u.online_status === "ONLINE" ? "emerald" : "dim"} />
                        {u.online_status === "ONLINE" ? "LINKED" : "STANDBY"}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2 num text-[10px] text-muted-foreground">
                      <span>Baterai: <strong className="text-foreground">{fmtV(u.telemetry.v_bat)}V</strong></span>
                      <span>Ambang: <strong className="text-foreground">{uCfg?.crit_v ?? 11.80}V</strong></span>
                      <span>Sleep: <strong className="text-foreground">{uCfg?.sleep_cfg ?? 300}s</strong></span>
                      <button
                        type="button"
                        onClick={() => selectUnit(u.unit_id)}
                        className="text-[10.5px] font-semibold text-foreground underline hover:text-muted-foreground"
                      >
                        Pilih Target &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 02: PARAMETER NVS & KALIBRASI ADC */}
      {activeSubTab === "CALIBRATION" && (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          {/* Left Column: Piggyback ACK Dispatch Property Table */}
          <Panel
            title="Tabel Properti Dispatch Piggyback ACK (NVS Staged)"
            code="NVS"
            right={
              <span className="num text-[10px] text-muted-foreground">
                Target: {selected.unit_id} ({selected.bay})
              </span>
            }
          >
            <div className="space-y-3.5">
              <div className="rounded-[2px] border border-border bg-background/50 p-3 num text-xs">
                <div className="grid grid-cols-2 gap-2 pb-2.5 border-b border-border">
                  <div>
                    <span className="label-hmi text-[9.5px] text-muted-foreground">Target Node ID</span>
                    <div className="font-bold text-foreground mt-0.5">{selected.unit_id}</div>
                  </div>
                  <div>
                    <span className="label-hmi text-[9.5px] text-muted-foreground">Protokol Pembaruan</span>
                    <div className="text-emerald font-semibold mt-0.5">HTTP 200 JSON Piggyback ACK</div>
                  </div>
                </div>

                <div className="mt-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ambang Voltase Kritis (crit_v):</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.05"
                        value={cfg.crit_v}
                        onChange={(e) => updateConfig(selected.unit_id, { crit_v: parseFloat(e.target.value) || 11.80 })}
                        className="w-20 rounded-[2px] border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground"
                      />
                      <span className="text-[10px] text-muted-foreground">V</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Interval Deep Sleep (sleep_cfg):</span>
                    <select
                      value={cfg.sleep_cfg}
                      onChange={(e) => updateConfig(selected.unit_id, { sleep_cfg: parseInt(e.target.value, 10) || 300 })}
                      className="rounded-[2px] border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                    >
                      <option value="300">300s (5 Menit)</option>
                      <option value="600">600s (10 Menit)</option>
                      <option value="1800">1800s (30 Menit)</option>
                      <option value="21600">21600s (6 Jam)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Debounce Miss Keberadaan:</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 5].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => updateConfig(selected.unit_id, { debounce_cnt: cnt })}
                          className={cn(
                            "rounded-[2px] border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                            cfg.debounce_cnt === cnt
                              ? "border-foreground bg-foreground/15 text-foreground"
                              : "border-border bg-secondary/50 text-muted-foreground hover:border-foreground/50",
                          )}
                        >
                          {cnt}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* JSON Dispatch Raw Preview */}
              <div className="rounded-[2px] border border-border bg-background/40 p-3 num text-[10.5px]">
                <div className="label-hmi text-[9.5px] text-muted-foreground mb-1.5">Queued ACK Payload (JSON)</div>
                <pre className="overflow-x-auto text-foreground/90 font-mono text-[10px] leading-relaxed">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
            </div>
          </Panel>

          {/* Right Column: 4-Point ADC Calibration (SOP C.1) */}
          <Panel
            title="Kalibrasi ADC 4-Titik Pin 34 (SOP C.1 Multimeter)"
            code="OLS"
            right={
              <span className="num text-[10px] text-muted-foreground">
                R² = {fit.rSquared.toFixed(4)}
              </span>
            }
          >
            <div className="space-y-3.5 num text-xs">
              <div className="rounded-[2px] border border-border bg-background/50 p-3 leading-relaxed text-muted-foreground text-[11px]">
                Uji 4 titik tegangan catu daya DC stabil (11.0V s/d 14.4V) menggunakan Digital Multimeter (DMM) terkalibrasi dan bandingkan dengan pembacaan milivolt mentah dari ESP32 Pin 34.
              </div>

              <table className="w-full border-collapse text-left num text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-2.5 font-medium">Titik</th>
                    <th className="py-2 px-2.5 font-medium">Tegangan DMM (V)</th>
                    <th className="py-2 px-2.5 font-medium">ADC Raw (mV)</th>
                    <th className="py-2 px-2.5 text-right font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cal.map((row, i) => {
                    const dmmNum = parseFloat(row.dmm) || 0;
                    const mvNum = parseFloat(row.mv) || 0;
                    const predicted = fit.slope * mvNum + fit.offset;
                    const err = dmmNum > 0 ? (predicted - dmmNum).toFixed(3) : "0.000";
                    return (
                      <tr key={i} className="hover:bg-secondary/20">
                        <td className="py-2 px-2.5 font-semibold text-foreground">Titik #{i + 1}</td>
                        <td className="py-2 px-2.5">
                          <input
                            type="text"
                            value={row.dmm}
                            onChange={(e) => {
                              const next = [...cal];
                              next[i] = { ...next[i]!, dmm: e.target.value };
                              setCal(next);
                            }}
                            className="w-16 rounded-[2px] border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground"
                          />
                        </td>
                        <td className="py-2 px-2.5">
                          <input
                            type="text"
                            value={row.mv}
                            onChange={(e) => {
                              const next = [...cal];
                              next[i] = { ...next[i]!, mv: e.target.value };
                              setCal(next);
                            }}
                            className="w-16 rounded-[2px] border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground"
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

              <div className="rounded-[2px] border border-border bg-background/40 p-3 grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="label-hmi text-[9.5px]">Koefisien Slope (m)</div>
                  <div className="num mt-1 text-sm font-bold text-emerald font-mono">{fit.slope.toFixed(7)}</div>
                </div>
                <div>
                  <div className="label-hmi text-[9.5px]">Offset Koreksi (c)</div>
                  <div className="num mt-1 text-sm font-bold text-emerald font-mono">{fit.offset.toFixed(4)} V</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  updateConfig(selected.unit_id, {
                    cal_slope: fit.slope,
                    cal_offset: fit.offset,
                  });
                }}
                className="w-full flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-foreground px-4 py-2 num text-xs font-semibold uppercase tracking-wider text-background hover:bg-foreground/90 transition-colors"
              >
                <Sliders size={14} />
                <span>Simpan Parameter Kalibrasi ke NVS Flash</span>
              </button>
            </div>
          </Panel>
        </div>
      )}

      {/* SUB-TAB 03: TIKET PEMELIHARAAN & AUDIT */}
      {activeSubTab === "TICKETS" && (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          {/* Shift Handover Maintenance Tickets */}
          <Panel
            title="Tiket Pemeliharaan Baterai & Shift Handover"
            code="TICKETS"
            right={
              <span className="num text-[10px] text-muted-foreground">
                {activeTicketCount} Tiket Aktif
              </span>
            }
          >
            <div className="space-y-2">
              {tickets.map((tk) => {
                const u = units.find((x) => x.unit_id === tk.unit_id);
                return (
                  <div
                    key={tk.id}
                    className="rounded-[2px] border border-border bg-background/40 p-3 transition-colors hover:border-foreground/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-xs">{tk.bay}</span>
                          <span className="text-xs text-foreground/90 font-medium">{tk.unit_id}</span>
                        </div>
                        <div className="num text-[10.5px] text-muted-foreground mt-0.5">
                          Masalah: <strong className="text-foreground">{tk.issue_summary}</strong>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "num inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                          TICKET_STATUS_STYLE[tk.status],
                        )}
                      >
                        {tk.status}
                      </span>
                    </div>

                    <div className="mt-2.5 border-t border-border/60 pt-2 num text-[10.5px] text-muted-foreground">
                      <div>Teknisi: <strong className="text-foreground">{tk.assigned_to}</strong></div>
                      {tk.handover_note && (
                        <div className="mt-0.5 text-foreground/80">Catatan: {tk.handover_note}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Operational Audit Trail */}
          <Panel
            title="Jejak Audit Operasional & Log Sistem"
            code="AUDIT"
            right={
              <div className="flex items-center gap-1.5 num text-[10px] text-muted-foreground">
                <History size={12} />
                <span>{auditLogs.length} Entri</span>
              </div>
            }
          >
            <div className="space-y-2">
              <table className="w-full border-collapse text-left num text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-[9.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-2.5 font-medium">Waktu</th>
                    <th className="py-2 px-2.5 font-medium">Unit</th>
                    <th className="py-2 px-2.5 font-medium">Tipe</th>
                    <th className="py-2 px-2.5 text-right font-medium">Keparahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditLogs.slice(0, 20).map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-2 px-2.5 text-muted-foreground whitespace-nowrap">{log.created_at}</td>
                      <td className="py-2 px-2.5 font-semibold text-foreground whitespace-nowrap">{log.unit_id}</td>
                      <td className="py-2 px-2.5 text-foreground/90">{formatEventTypeLabel(log.event_type)}</td>
                      <td className="py-2 px-2.5 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-[2px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                            SEVERITY_BADGE[log.severity],
                          )}
                        >
                          {log.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
