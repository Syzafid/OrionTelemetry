import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  UNITS,
  EXPANDED_YARD_UNITS,
  MOVEMENT_LOG,
  AUDIT_LOGS,
  INITIAL_TICKETS,
  DEFAULT_CONFIG,
  LIVE_ONLINE_THRESHOLD_SEC,
  applySimState,
  applyTicketTransition,
  type VehicleUnit,
  type SimState,
  type PiggybackConfig,
  type MovementEvent,
  type OperationalTag,
  type AuditLogEntry,
  type AuditSeverity,
  type MaintenanceTicket,
  type TicketStatus,
} from "@/data/mockTelemetry";
import { resolveSafeSelectedUnitId } from "@/lib/fleet-filter";
import { applyRemoteUpdate } from "@/lib/telemetry-sync";

export type ModuleId = "01" | "02" | "03" | "04" | "05" | "06";
export type DataSource = "SIMULATOR" | "LIVE_API";
export type ApiStatus = "SANDBOX" | "CONNECTED" | "FALLBACK_ERROR";
export type FleetScale = 3 | 12;

export const DEFAULT_API_URL = "http://localhost/dipo_api/get_data.php";
export const SNAPSHOT_STORAGE_KEY = "orion_last_snapshot_v1";

const MODULE_PARAM_MAP: Record<string, ModuleId> = {
  "01": "01",
  "1": "01",
  showroom: "01",
  "02": "02",
  "2": "02",
  fleet: "02",
  "03": "03",
  "3": "03",
  warmup: "03",
  "04": "04",
  "4": "04",
  diagnostics: "04",
  obd: "04",
  "05": "05",
  "5": "05",
  presence: "05",
  yard: "05",
  "06": "06",
  "6": "06",
  config: "06",
};

export interface DeepLinkResolution {
  unitId: string | null;
  requires12Scale: boolean;
  moduleId: ModuleId | null;
}

/**
 * Pure parser for URL query parameters (`?unit=MITSUBISHI-STOCK-08&module=fleet`).
 */
export function parseDeepLinkParams(search: string): DeepLinkResolution {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const rawUnit = params.get("unit")?.trim().toUpperCase() ?? "";
  const rawModule = params.get("module")?.trim().toLowerCase() ?? "";

  let unitId: string | null = null;
  let requires12Scale = false;

  if (rawUnit) {
    const matchedIdx = EXPANDED_YARD_UNITS.findIndex(
      (u) => u.unit_id.toUpperCase() === rawUnit || u.bay.toUpperCase() === rawUnit,
    );
    if (matchedIdx >= 0) {
      unitId = EXPANDED_YARD_UNITS[matchedIdx]!.unit_id;
      requires12Scale = matchedIdx >= 3;
    }
  }

  const moduleId: ModuleId | null = MODULE_PARAM_MAP[rawModule] ?? null;

  return { unitId, requires12Scale, moduleId };
}

/** Resolves the write mutation endpoint (`update_config.php`) from a polling endpoint URL. */
export function resolveUpdateEndpointUrl(url: string): string {
  if (/get_(?:data|live_status)\.php/i.test(url)) {
    return url.replace(/get_(?:data|live_status)\.php(\?.*)?$/i, "update_config.php");
  }
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/[^/]*$/, "/update_config.php");
    return u.toString();
  } catch {
    return url.replace(/\/[^/]*$/, "/update_config.php");
  }
}

interface Ctx {
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;
  units: VehicleUnit[];
  allUnits: VehicleUnit[];
  fleetScale: FleetScale;
  setFleetScale: (scale: FleetScale) => void;
  selectedId: string;
  selected: VehicleUnit;
  selectUnit: (id: string) => void;
  simulate: (s: SimState) => void;
  configs: Record<string, PiggybackConfig>;
  updateConfig: (id: string, patch: Partial<PiggybackConfig>) => void;
  injectDtc: (id: string, code: string | null) => void;
  flushBuffer: (id: string) => void;
  simulateBurstSync: (id: string) => void;
  dispatchWarmup: (id: string) => void;
  history: Record<string, Array<{ t: string; v: number; ts?: number }>>;
  movement: MovementEvent[];
  auditLogs: AuditLogEntry[];
  tickets: MaintenanceTicket[];
  updateTicketStatus: (
    unitId: string,
    status: TicketStatus,
    assignedTo?: string,
    handoverNote?: string,
  ) => void;
  tagMovement: (evId: string, tag: OperationalTag) => void;
  pairUnit: (oldId: string, data: { vin: string; model: string; color: string; bay: string }) => void;
  registerUnit: (data: {
    unit_id: string;
    vin: string;
    model: string;
    trim?: string;
    color: string;
    bay: string;
    crit_v?: number;
    sleep_cfg?: number;
  }) => void;
  unpairUnit: (id: string) => void;
  unpaired: string[];
  dataSource: DataSource;
  setDataSource: (mode: DataSource) => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  apiStatus: ApiStatus;
  lastSyncTime: string | null;
  lastSyncedAt: string | null;
  isOfflineSnapshot: boolean;
  pollNow: () => void;
}

const TelemetryContext = createContext<Ctx | null>(null);

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [activeModule, setActiveModule] = useState<ModuleId>("01");
  const [allUnits, setAllUnits] = useState<VehicleUnit[]>(() =>
    EXPANDED_YARD_UNITS.map((u) => ({ ...u, telemetry: { ...u.telemetry } })),
  );
  const [fleetScale, setFleetScaleState] = useState<FleetScale>(12);
  const [selectedId, setSelectedId] = useState(UNITS[0]!.unit_id);
  const [configs, setConfigs] = useState<Record<string, PiggybackConfig>>(() =>
    Object.fromEntries(EXPANDED_YARD_UNITS.map((u) => [u.unit_id, DEFAULT_CONFIG(u.unit_id)])),
  );
  const [history, setHistory] = useState<Record<string, Array<{ t: string; v: number; ts?: number }>>>({});
  const [movement, setMovement] = useState<MovementEvent[]>(() => MOVEMENT_LOG.map((m) => ({ ...m })));
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => AUDIT_LOGS.map((a) => ({ ...a })));
  const [tickets, setTickets] = useState<MaintenanceTicket[]>(() => INITIAL_TICKETS.map((t) => ({ ...t })));
  const [unpaired, setUnpaired] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("SIMULATOR");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("SANDBOX");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [liveUnitIds, setLiveUnitIds] = useState<string[]>(["MITSUBISHI-STOCK-01"]);
  const [isOfflineSnapshot, setIsOfflineSnapshot] = useState<boolean>(false);
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  // Client-side URL Deep-Link Receiver, LAN Host Auto-Detect & Snapshot Timestamp hydration
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const host = window.location.hostname;
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        const port = window.location.port;
        const isDevPort = port === "8080" || port === "5173" || port === "3000";
        const baseOrigin = isDevPort ? `${protocol}//${host}` : window.location.origin;
        setApiUrl((prev) =>
          prev === DEFAULT_API_URL ? `${baseOrigin}/dipo_api/get_data.php` : prev,
        );
        if (protocol === "https:" || host.endsWith(".tech") || host.endsWith(".herokuapp.com")) {
          setDataSource("LIVE_API");
        }
      }

      const resolved = parseDeepLinkParams(window.location.search);
      if (resolved.requires12Scale) {
        setFleetScaleState(12);
      }
      if (resolved.unitId) {
        setSelectedId(resolved.unitId);
      }
      if (resolved.moduleId) {
        setActiveModule(resolved.moduleId);
      }
    } catch {
      // Ignore malformed search params
    }

    try {
      const rawSnap = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
      if (rawSnap) {
        const parsed = JSON.parse(rawSnap) as { lastSyncedAt?: string };
        if (typeof parsed?.lastSyncedAt === "string") {
          setLastSyncedAt(parsed.lastSyncedAt);
        }
      }
    } catch {
      // Ignore storage access errors in private/restricted browsers
    }
  }, []);

  const units = useMemo<VehicleUnit[]>(() => {
    if (dataSource === "LIVE_API") {
      const liveList = allUnits.filter((u) => liveUnitIds.includes(u.unit_id));
      return liveList.length > 0 ? liveList : allUnits.slice(0, 1);
    }
    return fleetScale === 3 ? allUnits.slice(0, 3) : allUnits;
  }, [allUnits, fleetScale, dataSource, liveUnitIds]);

  const setFleetScale = useCallback(
    (scale: FleetScale) => {
      setFleetScaleState(scale);
      if (scale === 3) {
        setSelectedId((prevId) => resolveSafeSelectedUnitId(allUnits.slice(0, 3), prevId));
      }
    },
    [allUnits],
  );

  const selectUnit = useCallback(
    (id: string) => {
      const idx = allUnits.findIndex((u) => u.unit_id === id);
      if (idx >= 3) {
        setFleetScaleState(12);
      }
      setSelectedId(id);
    },
    [allUnits],
  );

  const appendLocalAudit = useCallback(
    (unit_id: string, event_type: string, severity: AuditSeverity, message: string) => {
      const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
      setAuditLogs((prev) => {
        const nextId = (prev[0]?.id ?? 0) + 1;
        return [{ id: nextId, unit_id, event_type, severity, message, created_at: nowStr }, ...prev].slice(0, 15);
      });
    },
    [],
  );

  const sendMutation = useCallback(async (action: string, data: Record<string, unknown>) => {
    if (dataSource !== "LIVE_API") return;
    try {
      const targetUrl = resolveUpdateEndpointUrl(apiUrl);
      await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
      void pollRef.current?.();
    } catch {
      // Silent fallback for background sync to avoid breaking UI
    }
  }, [dataSource, apiUrl]);

  const patchUnit = useCallback((id: string, fn: (u: VehicleUnit) => VehicleUnit) => {
    setAllUnits((us) => {
      const idx = us.findIndex((u) => u.unit_id === id);
      if (idx < 0) return us;
      const updated = fn(us[idx]!);
      if (updated === us[idx]) return us;
      const next = us.slice();
      next[idx] = updated;
      return next;
    });
  }, []);

  const safeSelectedId = useMemo(
    () => resolveSafeSelectedUnitId(units, selectedId),
    [units, selectedId],
  );

  const simulate = useCallback(
    (s: SimState) => patchUnit(safeSelectedId, (u) => applySimState(u, s)),
    [patchUnit, safeSelectedId],
  );

  const updateConfig = useCallback(
    (id: string, patch: Partial<PiggybackConfig>) => {
      setConfigs((c) => ({ ...c, [id]: { ...(c[id] ?? DEFAULT_CONFIG(id)), ...patch } }));
      if (patch.sleep_cfg)
        patchUnit(id, (u) => ({ ...u, telemetry: { ...u.telemetry, sleep_cfg: patch.sleep_cfg! } }));
      if (patch.cal_slope !== undefined || patch.cal_offset !== undefined) {
        appendLocalAudit(
          id,
          "ADC_CALIBRATION",
          "INFO",
          `ADC OLS calibration updated (slope=${patch.cal_slope ?? "unchanged"}, offset=${patch.cal_offset ?? "unchanged"})`,
        );
      } else {
        appendLocalAudit(
          id,
          "CONFIG_UPDATE",
          "INFO",
          `Node config staged for next wake (${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")})`,
        );
      }
      void sendMutation("UPDATE_CONFIG", { unit_id: id, ...patch });
    },
    [patchUnit, appendLocalAudit, sendMutation],
  );

  const injectDtc = useCallback(
    (id: string, code: string | null) => {
      patchUnit(id, (u) => ({
        ...u,
        telemetry: {
          ...u.telemetry,
          dtc: code ?? "NONE",
          dtc_cnt: code ? 1 : 0,
          mil_on: Boolean(code),
        },
      }));
      if (code) {
        appendLocalAudit(id, "DTC_ALERT", "CRITICAL", `OBD-II Mode 03 read-only diagnostic fault code ${code} detected`);
      } else {
        appendLocalAudit(id, "DTC_SANDBOX_PREVIEW", "INFO", "Sandbox Mode 03 read preview restored to nominal (100% Read-Only ECU policy)");
      }
    },
    [patchUnit, appendLocalAudit],
  );

  const flushBuffer = useCallback(
    (id: string) => {
      patchUnit(id, (u) => ({ ...u, buffer_used: 0 }));
      appendLocalAudit(id, "BUFFER_FLUSH", "INFO", "Operator cleared offline sync badge and acknowledged burst buffer");
      void sendMutation("FLUSH_BUFFER", { unit_id: id });
    },
    [patchUnit, appendLocalAudit, sendMutation],
  );

  const simulateBurstSync = useCallback(
    (id: string) => {
      patchUnit(id, (u) => ({
        ...u,
        buffer_used: 28,
        telemetry: { ...u.telemetry, boot: u.telemetry.boot + 1 },
      }));
      appendLocalAudit(
        id,
        "BURST_SYNC_SIM",
        "WARN",
        "Simulated 28-record burst upload (20 RTC SRAM + 8 LittleFS Flash Spillover)",
      );
    },
    [patchUnit, appendLocalAudit],
  );

  const dispatchWarmup = useCallback(
    (id: string) => {
      patchUnit(id, (u) => ({ ...u, status_label: "Warm-Up Dispatched" }));
      appendLocalAudit(id, "WARMUP_DISPATCH", "WARN", "Operator dispatched staff for 10-min engine alternator warm-up");
      void sendMutation("DISPATCH_WARMUP", { unit_id: id });
    },
    [patchUnit, appendLocalAudit, sendMutation],
  );

  const updateTicketStatus = useCallback(
    (unitId: string, status: TicketStatus, assignedTo?: string, handoverNote?: string) => {
      const targetUnit = allUnits.find((u) => u.unit_id === unitId) ?? allUnits[0]!;
      setTickets((prev) =>
        applyTicketTransition(prev, targetUnit, status, assignedTo, handoverNote),
      );
      const sev: AuditSeverity =
        status === "RESOLVED" ? "INFO" : status === "IN_PROGRESS" ? "WARN" : "CRITICAL";
      const assigneeText = assignedTo?.trim() || "On-Duty Technician";
      appendLocalAudit(
        unitId,
        "TICKET_HANDOVER",
        sev,
        `Maintenance ticket set to ${status} (Assignee: ${assigneeText})${handoverNote ? ` - ${handoverNote}` : ""}`,
      );
      void sendMutation("UPDATE_TICKET", {
        unit_id: unitId,
        bay: targetUnit.bay,
        issue_summary: targetUnit.status_label,
        status,
        assigned_to: assignedTo,
        handover_note: handoverNote,
      });
    },
    [allUnits, appendLocalAudit, sendMutation],
  );

  const tagMovement = useCallback(
    (evId: string, tag: OperationalTag) => {
      setMovement((m) => m.map((e) => (e.id === evId ? { ...e, tag } : e)));
      appendLocalAudit("YARD-GATEWAY", "MOVEMENT_TAG", "INFO", `Movement event ${evId} tagged as ${tag}`);
      void sendMutation("TAG_MOVEMENT", { id: evId, tag });
    },
    [appendLocalAudit, sendMutation],
  );

  const unpairUnit = useCallback(
    (id: string) => {
      setUnpaired((p) => (p.includes(id) ? p : [...p, id]));
      appendLocalAudit(id, "NODE_UNPAIRED", "WARN", "Vehicle sold / detached from OBD-II telemetry node");
    },
    [appendLocalAudit],
  );

  const pairUnit = useCallback(
    (oldId: string, d: { vin: string; model: string; color: string; bay: string }) => {
      patchUnit(oldId, (u) => {
        const parts = d.model.toUpperCase().split(" ");
        return {
          ...u,
          vin: d.vin.toUpperCase(),
          color: d.color,
          bay: d.bay.toUpperCase(),
          model: parts.slice(0, 2).join(" ") || u.model,
          trim: parts.slice(2).join(" ") || "NEW ARRIVAL",
          buffer_used: 0,
          telemetry: { ...u.telemetry, boot: 1 },
        };
      });
      setUnpaired((p) => p.filter((x) => x !== oldId));
      appendLocalAudit(
        oldId,
        "NODE_PAIRED",
        "INFO",
        `Node paired to VIN ${d.vin.toUpperCase()} (${d.model.toUpperCase()}, Bay ${d.bay.toUpperCase()})`,
      );
      void sendMutation("PAIR_UNIT", { unit_id: oldId, ...d });
    },
    [patchUnit, appendLocalAudit, sendMutation],
  );

  const registerUnit = useCallback(
    (d: {
      unit_id: string;
      vin: string;
      model: string;
      trim?: string;
      color: string;
      bay: string;
      crit_v?: number;
      sleep_cfg?: number;
    }) => {
      const newId = d.unit_id.trim().toUpperCase();
      const newBay = d.bay.trim().toUpperCase();
      const newVin = d.vin.trim().toUpperCase();
      const newModel = d.model.trim().toUpperCase();
      const newTrim = (d.trim?.trim() || "STANDARD").toUpperCase();

      setLiveUnitIds((prev) => (prev.includes(newId) ? prev : [...prev, newId]));

      setAllUnits((prev) => {
        const existingIdx = prev.findIndex((u) => u.unit_id === newId);
        const newUnit: VehicleUnit = {
          unit_id: newId,
          bay: newBay,
          model: newModel,
          trim: newTrim,
          vin: newVin,
          color: d.color,
          status_label: "Registered (Standby)",
          state: "STANDBY",
          in_yard: true,
          online_status: "ONLINE",
          buffer_used: 0,
          telemetry: {
            unit_id: newId,
            v_bat: 12.60,
            adc_raw_mv: 2260,
            rtc_temp_c: 30.0,
            shunt_sleep_ua: 380,
            can_ok: true,
            engine_on: false,
            crit_alert: false,
            rpm: 0,
            temp_c: 32,
            dtc_cnt: 0,
            dtc: "NONE",
            rssi: -65,
            sleep_cfg: d.sleep_cfg || 300,
            active_ms: 0,
            daily_mah: 0,
            seq: 1,
            boot: 1,
            ts_epoch: Math.floor(Date.now() / 1000),
            speed_kmh: 0,
            iat_c: 30,
            map_kpa: 101,
            load_pct: 0,
            tps_pct: 0,
            ign_deg: 5,
            maf_gs: 0,
            run_time_s: 0,
            fuel_pct: 100,
            fuel_rate_lh: 0,
            o2_v: 0.45,
            stft_pct: 0,
            mil_on: false,
            ecu_v: 12.60,
            dist_clr_km: 0,
          },
        };
        if (existingIdx >= 0) {
          const next = prev.slice();
          next[existingIdx] = { ...next[existingIdx]!, ...newUnit };
          return next;
        }
        return [...prev, newUnit];
      });

      if (d.crit_v) {
        setConfigs((c) => ({
          ...c,
          [newId]: {
            ...(c[newId] ?? DEFAULT_CONFIG(newId)),
            crit_v: d.crit_v!,
            sleep_cfg: d.sleep_cfg || 300,
          },
        }));
      }

      appendLocalAudit(
        newId,
        "NODE_REGISTERED",
        "INFO",
        `New node ${newId} registered and paired to ${newModel} ${newTrim} (VIN: ${newVin}, Bay: ${newBay})`,
      );

      void sendMutation("REGISTER_UNIT", { ...d, unit_id: newId });
      setSelectedId(newId);
    },
    [appendLocalAudit, sendMutation],
  );

  const selected = units.find((u) => u.unit_id === safeSelectedId) ?? units[0]!;

  const selectedIdRef = useRef(safeSelectedId);
  selectedIdRef.current = safeSelectedId;
  const isPollingRef = useRef(false);
  const sectionHashesRef = useRef<{
    configs?: string;
    movement?: string;
    history?: string;
    audit?: string;
    tickets?: string;
  }>({});
  const lastSnapshotWriteRef = useRef(0);

  /** Client-side only: fetch the Dipo API with anti-cache timestamp and 1500ms abort timeout, merge safely. */
  const poll = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const cacheBustUrl = `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}_t=${Date.now()}`;
      const res = await fetch(cacheBustUrl, {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();

      let latestMergedUnits: VehicleUnit[] | null = null;
      setAllUnits((us) => {
        const merged = applyRemoteUpdate(us, json, selectedIdRef.current);
        latestMergedUnits = merged;
        return merged;
      });

      if (json && typeof json === "object" && !Array.isArray(json)) {
        const obj = json as Record<string, unknown>;
        if (Array.isArray(obj["units"])) {
          const remoteIds = (obj["units"] as Array<{ unit_id?: string }>).map((u) => u.unit_id).filter(Boolean) as string[];
          if (remoteIds.length > 0) {
            setLiveUnitIds(remoteIds);
          }
        }
        const hasSectionChanged = (
          key: "configs" | "movement" | "history" | "audit" | "tickets",
          data: unknown,
        ): boolean => {
          const nextHash = JSON.stringify(data);
          if (nextHash === sectionHashesRef.current[key]) return false;
          sectionHashesRef.current[key] = nextHash;
          return true;
        };

        if (
          obj["configs"] &&
          typeof obj["configs"] === "object" &&
          !Array.isArray(obj["configs"]) &&
          hasSectionChanged("configs", obj["configs"])
        ) {
          const remoteConfigs = obj["configs"] as Record<string, PiggybackConfig>;
          setConfigs((prev) => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(remoteConfigs)) {
              if (v && typeof v === "object") {
                next[k] = { ...(prev[k] ?? DEFAULT_CONFIG(k)), ...v };
              }
            }
            return next;
          });
        }
        if (Array.isArray(obj["movement"]) && hasSectionChanged("movement", obj["movement"])) {
          setMovement(obj["movement"] as MovementEvent[]);
        }
        if (
          obj["history"] &&
          typeof obj["history"] === "object" &&
          !Array.isArray(obj["history"]) &&
          hasSectionChanged("history", obj["history"])
        ) {
          setHistory(obj["history"] as Record<string, Array<{ t: string; v: number; ts?: number }>>);
        }
        if (
          Array.isArray(obj["audit_logs"]) &&
          obj["audit_logs"].length > 0 &&
          hasSectionChanged("audit", obj["audit_logs"])
        ) {
          setAuditLogs(obj["audit_logs"] as AuditLogEntry[]);
        }
        if (
          Array.isArray(obj["tickets"]) &&
          obj["tickets"].length > 0 &&
          hasSectionChanged("tickets", obj["tickets"])
        ) {
          setTickets(obj["tickets"] as MaintenanceTicket[]);
        }
      }

      const nowTimeStr = new Date().toLocaleTimeString("en-GB", { hour12: false });
      const nowIsoStr = new Date().toISOString().replace("T", " ").slice(0, 19);

      setApiStatus("CONNECTED");
      setIsOfflineSnapshot(false);
      setLastSyncTime(nowTimeStr);
      setLastSyncedAt(nowIsoStr);

      if (typeof window !== "undefined" && Date.now() - lastSnapshotWriteRef.current >= 5000) {
        lastSnapshotWriteRef.current = Date.now();
        try {
          window.localStorage.setItem(
            SNAPSHOT_STORAGE_KEY,
            JSON.stringify({
              units: latestMergedUnits,
              lastSyncedAt: nowIsoStr,
            }),
          );
        } catch {
          // Ignore quota exceeded
        }
      }
    } catch (err) {
      console.error("[TelemetryContext] Poll error:", err);
      setApiStatus("FALLBACK_ERROR");
      setIsOfflineSnapshot(true);

      if (typeof window !== "undefined") {
        try {
          const rawSnap = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
          if (rawSnap) {
            const parsed = JSON.parse(rawSnap) as {
              units?: VehicleUnit[];
              lastSyncedAt?: string;
            };
            if (typeof parsed.lastSyncedAt === "string") {
              setLastSyncedAt(parsed.lastSyncedAt);
            }
            if (Array.isArray(parsed.units) && parsed.units.length > 0) {
              setAllUnits((us) => applyRemoteUpdate(us, { units: parsed.units }, selectedIdRef.current));
            }
          }
        } catch {
          // Ignore JSON parse or storage error
        }
      }
    } finally {
      clearTimeout(timer);
      isPollingRef.current = false;
    }
  }, [apiUrl]);

  pollRef.current = poll;

  const pollNow = useCallback(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    if (dataSource !== "LIVE_API") {
      setApiStatus("SANDBOX");
      setIsOfflineSnapshot(false);
      return;
    }

    void poll();

    const id = setInterval(() => {
      void poll();
    }, 750);

    const tickerId = setInterval(() => {
      setAllUnits((us) => {
        let next: VehicleUnit[] | null = null;
        for (let i = 0; i < us.length; i++) {
          const u = us[i]!;
          if (typeof u.last_seen_sec !== "number" || !Number.isFinite(u.last_seen_sec)) {
            continue;
          }
          const isSettledOffline =
            u.last_seen_sec > 60 &&
            u.online_status === "OFFLINE" &&
            u.connection_badge === "OFFLINE / DEEP SLEEP";
          if (isSettledOffline) {
            continue;
          }
          const nextSec = u.last_seen_sec + 1;
          const isOnline = nextSec <= LIVE_ONLINE_THRESHOLD_SEC && u.in_yard;
          if (!next) next = us.slice();
          next[i] = {
            ...u,
            last_seen_sec: nextSec,
            online_status: isOnline ? "ONLINE" : "OFFLINE",
            connection_badge: isOnline ? "LIVE / ONLINE" : "OFFLINE / DEEP SLEEP",
          };
        }
        return next ?? us;
      });
    }, 1000);

    const onFocus = () => {
      void poll();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(id);
      clearInterval(tickerId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dataSource, apiUrl, poll]);

  const value = useMemo<Ctx>(
    () => ({
      activeModule,
      setActiveModule,
      units,
      allUnits,
      fleetScale,
      setFleetScale,
      selectedId: safeSelectedId,
      selected,
      selectUnit,
      simulate,
      configs,
      updateConfig,
      injectDtc,
      flushBuffer,
      simulateBurstSync,
      dispatchWarmup,
      history,
      movement,
      auditLogs,
      tickets,
      updateTicketStatus,
      tagMovement,
      pairUnit,
      registerUnit,
      unpairUnit,
      unpaired,
      dataSource,
      setDataSource,
      apiUrl,
      setApiUrl,
      apiStatus,
      lastSyncTime,
      lastSyncedAt,
      isOfflineSnapshot,
      pollNow,
    }),
    [
      activeModule,
      units,
      allUnits,
      fleetScale,
      setFleetScale,
      safeSelectedId,
      selected,
      selectUnit,
      simulate,
      configs,
      updateConfig,
      injectDtc,
      flushBuffer,
      simulateBurstSync,
      dispatchWarmup,
      history,
      movement,
      auditLogs,
      tickets,
      updateTicketStatus,
      tagMovement,
      pairUnit,
      registerUnit,
      unpairUnit,
      unpaired,
      dataSource,
      apiUrl,
      apiStatus,
      lastSyncTime,
      lastSyncedAt,
      isOfflineSnapshot,
      pollNow,
    ],
  );

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry() {
  const c = useContext(TelemetryContext);
  if (!c) throw new Error("useTelemetry must be used inside TelemetryProvider");
  return c;
}
