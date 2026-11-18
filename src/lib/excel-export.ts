import type {
  AuditLogEntry,
  MaintenanceTicket,
  PiggybackConfig,
  VehicleUnit,
} from "@/data/mockTelemetry";
import { getUnitConnectionState } from "@/data/mockTelemetry";
import {
  applyExportResolutionAndWindow,
  computeBatteryPrediction,
  formatWibTimestamp,
  parseExportTargetUnits,
  resolveExportHistoryPoints,
  resolveExportTimeWindow,
  resolveUnitLastSeenEpoch,
  type BatteryHistoryPoint,
  type ExportFilterConfig,
  type ResolvedExportTimeWindow,
} from "@/lib/battery-analytics";

export interface ExcelExportOptions extends ExportFilterConfig {
  isLiveApi?: boolean;
  tickets?: MaintenanceTicket[];
  auditLogs?: AuditLogEntry[];
}

function isWithinTimeWindow(rawTs: string, windowInfo: ResolvedExportTimeWindow): boolean {
  if (!windowInfo.startWib || !windowInfo.endWib) return true;
  const trimmed = rawTs.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const normalized = trimmed.length === 10 ? `${trimmed} 12:00:00` : trimmed.slice(0, 19);
    return normalized >= windowInfo.startWib && normalized <= windowInfo.endWib;
  }
  const parsedMs = Date.parse(trimmed);
  if (Number.isFinite(parsedMs) && windowInfo.startEpoch !== null && windowInfo.endEpoch !== null) {
    const epochSec = Math.floor(parsedMs / 1000);
    return epochSec >= windowInfo.startEpoch && epochSec <= windowInfo.endEpoch;
  }
  return true;
}

function escXml(val: string | number | boolean | null | undefined): string {
  const raw = val === null || val === undefined ? "" : String(val);
  let safe = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
      safe += raw[i]!;
    }
  }
  return safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlCellString(
  val: string | number | boolean | null | undefined,
  styleId = "DataText",
): string {
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escXml(val)}</Data></Cell>`;
}

function xmlCellNumber(val: number, styleId = "DataNum", decimals = 0): string {
  const safeVal = Number.isFinite(val) ? val : 0;
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${safeVal.toFixed(decimals)}</Data></Cell>`;
}

/**
 * Generates a native 3-Sheet Microsoft Excel 2003+/365 SpreadsheetML (.xls) Workbook
 * with pre-attached AutoFilters, Frozen Headers, and anti-slop industrial formatting:
 *   1. 1_Ringkasan_PDI_Armada (16 columns)
 *   2. 2_Log_Telemetri_OBD (41 columns)
 *   3. 3_Tiket_dan_Audit_Log (9 columns)
 */
export function buildFormattedExcelPrettier(
  units: VehicleUnit[],
  configs: Record<string, PiggybackConfig>,
  historyMap: Record<string, Array<BatteryHistoryPoint>>,
  targetUnitId: string = "ALL",
  options?: ExcelExportOptions,
): string {
  const isLiveApi = Boolean(options?.isLiveApi);
  const { filteredUnits, isAll, filterLabel } = parseExportTargetUnits(units, targetUnitId);
  const targetIdSet = new Set(filteredUnits.map((u) => u.unit_id));

  const nowSec = Math.floor(Date.now() / 1000);
  const windowInfo = resolveExportTimeWindow(options, nowSec);
  const exportedAt = formatWibTimestamp(nowSec);
  const createdIso = `${new Date(nowSec * 1000).toISOString().slice(0, 19)}Z`;

  const bayMap = new Map<string, string>();
  const s1Rows: string[] = [];
  const s2Rows: string[] = [];
  let logId = 1;

  for (const u of filteredUnits) {
    bayMap.set(u.unit_id, u.bay);
    const t = u.telemetry;
    const critV = configs[u.unit_id]?.crit_v ?? 11.8;
    const calSlope = configs[u.unit_id]?.cal_slope || 0.005412;
    const calOffset = configs[u.unit_id]?.cal_offset ?? 0.069;

    const hist = resolveExportHistoryPoints(u, historyMap, isLiveApi, nowSec);
    const pred = computeBatteryPrediction(hist, t.v_bat, critV, t.engine_on, t.rtc_temp_c);
    const effectiveSlopeVPerHour =
      pred.slopeVPerHour < -0.002 && t.rtc_temp_c > 30 && pred.thermalFactor > 1
        ? pred.slopeVPerHour * pred.thermalFactor
        : pred.slopeVPerHour;
    const slopeVPerDay = Number((effectiveSlopeVPerHour * 24).toFixed(3));

    const conn = getUnitConnectionState(u, isLiveApi);
    const netZone = (t.net_zone || u.net_zone || (u.in_yard ? "YARD" : "OFFLINE")).trim();
    const syncSsid = (t.sync_ssid || u.sync_ssid || "").trim();
    const wifiLabel = syncSsid ? `${netZone} / ${syncSsid}` : netZone;
    const lastSeenStr =
      u.last_seen && u.last_seen.trim()
        ? u.last_seen
        : formatWibTimestamp(resolveUnitLastSeenEpoch(u, nowSec));

    const canOk = t.can_ok !== false;
    const pdiPassed =
      t.v_bat >= 12.2 &&
      t.dtc_cnt === 0 &&
      (t.dtc === "NONE" || !t.dtc) &&
      t.shunt_sleep_ua <= 500 &&
      canOk;

    let pdiStyle = "StatusPass";
    if (t.v_bat < critV || (t.dtc !== "NONE" && Boolean(t.dtc)) || !canOk) {
      pdiStyle = "StatusCrit";
    } else if (!pdiPassed || t.v_bat < 12.2) {
      pdiStyle = "StatusWarn";
    }

    const dtcCanText =
      (t.dtc !== "NONE" && Boolean(t.dtc)) || t.dtc_cnt > 0
        ? `${t.dtc} (${t.dtc_cnt}) · ${canOk ? "CAN OK" : "CAN FAULT"}`
        : canOk
          ? "NONE · CAN OK (500 kbps)"
          : "NONE · CAN FAULT";
    const dtcStyle =
      !canOk || t.dtc_cnt > 0 || (t.dtc !== "NONE" && Boolean(t.dtc)) ? "StatusCrit" : "StatusPass";

    s1Rows.push(
      `   <Row ss:Height="20">
    ${xmlCellString(u.bay, "DataCenter")}
    ${xmlCellString(u.unit_id, "DataText")}
    ${xmlCellString(`${u.model} ${u.trim}`, "DataText")}
    ${xmlCellString(conn.badgeText, conn.isOnline ? "StatusPass" : "StatusMuted")}
    ${xmlCellString(lastSeenStr, "DataCenter")}
    ${xmlCellString(wifiLabel, "DataText")}
    ${xmlCellNumber(t.v_bat, "DataDec2", 2)}
    ${xmlCellNumber(pred.compensatedV25, "DataDec2", 2)}
    ${xmlCellNumber(pred.tempCompensatedSocPct, "DataNum", 0)}
    ${xmlCellNumber(t.rtc_temp_c, "DataDec1", 1)}
    ${xmlCellNumber(pred.thermalFactor, "DataDec2", 2)}
    ${xmlCellNumber(t.shunt_sleep_ua, "DataNum", 0)}
    ${xmlCellNumber(slopeVPerDay, "DataDec3", 3)}
    ${xmlCellString(pred.statusText, pdiStyle)}
    ${xmlCellString(dtcCanText, dtcStyle)}
    ${xmlCellString(pdiPassed ? "PDI PASSED" : "PDI HOLD / ACTION REQUIRED", pdiStyle)}
   </Row>`,
    );

    const baseEpoch = resolveUnitLastSeenEpoch(u, nowSec);
    const reversed = applyExportResolutionAndWindow(hist, windowInfo, baseEpoch);
    const latestEpochInHist =
      hist.length > 0 && typeof hist[hist.length - 1]!.ts === "number"
        ? (hist[hist.length - 1]!.ts as number)
        : baseEpoch;
    const baseSeq = typeof t.seq === "number" && t.seq > 0 ? t.seq : t.boot;

    reversed.forEach((pt, idx) => {
      const tsEpoch = pt.ts;
      const isLatestSnapshot = idx === 0 && Math.abs(tsEpoch - latestEpochInHist) <= 3600;
      const timeStr =
        isLatestSnapshot && isLiveApi && u.last_seen && windowInfo.resolution === "RAW"
          ? u.last_seen
          : formatWibTimestamp(tsEpoch);
      const seq = Math.max(1, baseSeq - idx);
      const vBat = isLatestSnapshot && windowInfo.resolution === "RAW" ? t.v_bat : pt.v;
      const isCrit = vBat < critV || (isLatestSnapshot && t.crit_alert);
      const isEngineOn = Boolean(t.engine_on && isLatestSnapshot);
      const engStatus = isEngineOn ? "RUNNING (WARM-UP)" : "STANDBY (SLEEP)";
      const milOn = Boolean(t.mil_on && isLatestSnapshot);

      const adcCell =
        isLatestSnapshot && windowInfo.resolution === "RAW"
          ? xmlCellNumber(t.adc_raw_mv, "DataNum", 0)
          : isLiveApi
            ? xmlCellString("-", "DataCenter")
            : xmlCellNumber(Math.round((vBat - calOffset) / calSlope), "DataNum", 0);

      s2Rows.push(
        `   <Row ss:Height="19">
    ${xmlCellNumber(logId++, "DataNum", 0)}
    ${xmlCellString(timeStr, "DataCenter")}
    ${xmlCellNumber(tsEpoch, "DataNum", 0)}
    ${xmlCellString(u.unit_id, isCrit ? "StatusCrit" : "DataText")}
    ${xmlCellNumber(seq, "DataNum", 0)}
    ${xmlCellNumber(t.boot, "DataNum", 0)}
    ${xmlCellNumber(vBat, isCrit ? "StatusCrit" : "DataDec2", 2)}
    ${adcCell}
    ${xmlCellNumber(calSlope, "DataDec6", 6)}
    ${xmlCellNumber(calOffset, "DataDec3", 3)}
    ${xmlCellNumber(t.rtc_temp_c, "DataDec1", 1)}
    ${xmlCellNumber(t.shunt_sleep_ua, "DataNum", 0)}
    ${xmlCellString(engStatus, isEngineOn ? "StatusPass" : "DataCenter")}
    ${xmlCellString(isCrit ? "CRITICAL" : "NORMAL", isCrit ? "StatusCrit" : "DataCenter")}
    ${xmlCellNumber(isEngineOn ? Math.max(0, t.rpm) : 0, "DataNum", 0)}
    ${xmlCellNumber(isEngineOn && t.temp_c > -40 ? t.temp_c : 0, "DataNum", 0)}
    ${xmlCellNumber(t.dtc_cnt, "DataNum", 0)}
    ${xmlCellString(t.dtc, t.dtc !== "NONE" && Boolean(t.dtc) ? "StatusCrit" : "DataCenter")}
    ${xmlCellNumber(t.rssi, "DataNum", 0)}
    ${xmlCellNumber(t.sleep_cfg, "DataNum", 0)}
    ${xmlCellNumber(u.buffer_used, "DataNum", 0)}
    ${xmlCellString(canOk ? "OK (TWAI 500k)" : "CAN FAULT", canOk ? "StatusPass" : "StatusCrit")}
    ${xmlCellString(netZone, "DataCenter")}
    ${xmlCellString(syncSsid, "DataText")}
    ${xmlCellNumber(t.active_ms, "DataNum", 0)}
    ${xmlCellNumber(t.daily_mah, "DataDec2", 2)}
    ${xmlCellNumber(t.speed_kmh ?? 0, "DataNum", 0)}
    ${xmlCellNumber(t.iat_c ?? 0, "DataNum", 0)}
    ${xmlCellNumber(t.map_kpa ?? 0, "DataNum", 0)}
    ${xmlCellNumber(t.load_pct ?? 0, "DataDec1", 1)}
    ${xmlCellNumber(t.tps_pct ?? 0, "DataDec1", 1)}
    ${xmlCellNumber(t.ign_deg ?? 0, "DataDec1", 1)}
    ${xmlCellNumber(t.maf_gs ?? 0, "DataDec2", 2)}
    ${xmlCellNumber(t.run_time_s ?? 0, "DataNum", 0)}
    ${xmlCellNumber(t.fuel_pct ?? 0, "DataDec1", 1)}
    ${xmlCellNumber(t.fuel_rate_lh ?? 0, "DataDec2", 2)}
    ${xmlCellNumber(t.o2_v ?? 0, "DataDec2", 2)}
    ${xmlCellNumber(t.stft_pct ?? 0, "DataDec1", 1)}
    ${xmlCellString(milOn ? "MIL ON" : "OFF", milOn ? "StatusCrit" : "DataCenter")}
    ${xmlCellNumber(t.ecu_v ?? 0, "DataDec2", 2)}
    ${xmlCellNumber(t.dist_clr_km ?? 0, "DataNum", 0)}
   </Row>`,
      );
    });
  }

  const s3Rows: string[] = [];
  const rawTickets = options?.tickets ?? [];
  const rawAudit = options?.auditLogs ?? [];

  for (const tk of rawTickets) {
    if (!isAll && !targetIdSet.has(tk.unit_id)) continue;
    if (!isWithinTimeWindow(tk.updated_at, windowInfo)) continue;
    const prio = tk.status === "OPEN" ? "HIGH" : tk.status === "IN_PROGRESS" ? "MEDIUM" : "NORMAL";
    const toneStyle =
      tk.status === "OPEN"
        ? "StatusCrit"
        : tk.status === "IN_PROGRESS"
          ? "StatusWarn"
          : "StatusPass";
    const detail = tk.handover_note
      ? `${tk.issue_summary} | Handover: ${tk.handover_note}`
      : tk.issue_summary;

    s3Rows.push(
      `   <Row ss:Height="20">
    ${xmlCellString("TIKET", "DataCenter")}
    ${xmlCellString(tk.ticket_code, "DataCenter")}
    ${xmlCellString(tk.updated_at, "DataCenter")}
    ${xmlCellString(tk.unit_id, "DataText")}
    ${xmlCellString(tk.bay, "DataCenter")}
    ${xmlCellString(prio, toneStyle)}
    ${xmlCellString(tk.status, toneStyle)}
    ${xmlCellString(tk.assigned_to || "Unassigned", "DataText")}
    ${xmlCellString(detail, "DataText")}
   </Row>`,
    );
  }

  for (const ev of rawAudit) {
    if (!isAll && !targetIdSet.has(ev.unit_id)) continue;
    if (!isWithinTimeWindow(ev.created_at, windowInfo)) continue;
    const toneStyle =
      ev.severity === "CRITICAL"
        ? "StatusCrit"
        : ev.severity === "WARN"
          ? "StatusWarn"
          : "StatusPass";
    const refId = `EVT-${String(ev.id).padStart(4, "0")}`;

    s3Rows.push(
      `   <Row ss:Height="20">
    ${xmlCellString("AUDIT", "DataCenter")}
    ${xmlCellString(refId, "DataCenter")}
    ${xmlCellString(ev.created_at, "DataCenter")}
    ${xmlCellString(ev.unit_id, "DataText")}
    ${xmlCellString(bayMap.get(ev.unit_id) ?? "-", "DataCenter")}
    ${xmlCellString(ev.severity, toneStyle)}
    ${xmlCellString(ev.event_type, toneStyle)}
    ${xmlCellString("ORION System / Operator", "DataText")}
    ${xmlCellString(ev.message, "DataText")}
   </Row>`,
    );
  }

  const s1Cols = [
    "Lokasi Bay",
    "Unit ID",
    "Model & Trim",
    "Status Koneksi",
    "Sinkronisasi Terakhir (WIB)",
    "Zona & SSID Wi-Fi",
    "V_Bat Aktual (V)",
    "V_OCV Komp 25C (V)",
    "Estimasi SOC (%)",
    "Suhu RTC (C)",
    "Faktor Arrhenius (x)",
    "Arus Sleep (uA)",
    "Laju Kuras OLS (V/Hari)",
    "Estimasi Habis / TTC",
    "Status DTC & CAN",
    "Keputusan PDI",
  ];
  const s1Widths = [68, 130, 148, 135, 135, 132, 90, 102, 85, 80, 96, 88, 105, 168, 132, 178];

  const s2Cols = [
    "No",
    "Timestamp (WIB)",
    "Epoch (s)",
    "Unit ID",
    "Seq #",
    "Boot #",
    "V_Bat (V)",
    "ADC Raw (mV)",
    "Slope (m)",
    "Offset (c)",
    "RTC Temp (C)",
    "Sleep Current (uA)",
    "Engine Status",
    "Crit Alert",
    "RPM",
    "Coolant (C)",
    "DTC Count",
    "Active DTC",
    "RSSI (dBm)",
    "Sleep Config",
    "Buffer Used",
    "CAN Health",
    "Net Zone",
    "Sync SSID",
    "Active (ms)",
    "Daily (mAh)",
    "Speed (km/h)",
    "IAT (C)",
    "MAP (kPa)",
    "Load (%)",
    "TPS (%)",
    "Ign Timing (deg)",
    "MAF (g/s)",
    "Run Time (s)",
    "Fuel Level (%)",
    "Fuel Rate (L/h)",
    "O2 Sensor (V)",
    "STFT (%)",
    "MIL Status",
    "ECU Voltage (V)",
    "Dist Clr (km)",
  ];

  const s3Cols = [
    "Kategori Rekaman",
    "ID Referensi",
    "Waktu Kejadian (WIB)",
    "Unit ID",
    "Lokasi Bay",
    "Prioritas / Severity",
    "Status",
    "Teknisi / Aktor",
    "Rincian Tindakan & Catatan Diagnostik",
  ];
  const s3Widths = [96, 96, 132, 132, 76, 98, 128, 145, 360];

  const s1Body =
    s1Rows.length > 0
      ? s1Rows.join("\n")
      : `   <Row ss:Height="20">${xmlCellString("-", "DataCenter")}${xmlCellString("TIDAK ADA UNIT TERDAFTAR", "StatusMuted")}${Array.from({ length: 14 }, () => xmlCellString("-", "DataCenter")).join("")}</Row>`;
  const s1RowCount = 4 + Math.max(1, s1Rows.length);

  const s2Body =
    s2Rows.length > 0
      ? s2Rows.join("\n")
      : `   <Row ss:Height="20">${xmlCellNumber(0, "DataNum", 0)}${xmlCellString("BELUM ADA LOG TELEMETRI TERCATAT", "StatusMuted")}${Array.from({ length: 39 }, () => xmlCellString("-", "DataCenter")).join("")}</Row>`;
  const s2RowCount = 4 + Math.max(1, s2Rows.length);

  const s3Body =
    s3Rows.length > 0
      ? s3Rows.join("\n")
      : `   <Row ss:Height="20">
    ${xmlCellString("INFO", "StatusMuted")}
    ${xmlCellString("-", "DataCenter")}
    ${xmlCellString(exportedAt, "DataCenter")}
    ${xmlCellString("-", "DataCenter")}
    ${xmlCellString("-", "DataCenter")}
    ${xmlCellString("INFO", "StatusMuted")}
    ${xmlCellString("KOSONG", "StatusMuted")}
    ${xmlCellString("ORION System", "DataText")}
    ${xmlCellString("BELUM ADA TIKET / LOG AUDIT TERCATAT DI DATABASE", "DataText")}
   </Row>`;
  const s3RowCount = 4 + Math.max(1, s3Rows.length);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>ORION Telemetry &amp; PDI Health Workbook</Title>
  <Author>ORION Stock Yard Telemetry</Author>
  <Created>${escXml(createdIso)}</Created>
 </DocumentProperties>
 <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
  <ProtectStructure>False</ProtectStructure>
  <ProtectWindows>False</ProtectWindows>
 </ExcelWorkbook>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Borders/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/><Interior/><NumberFormat/><Protection/></Style>
  <Style ss:ID="BannerTitle"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F172A" ss:Pattern="Solid"/></Style>
  <Style ss:ID="BannerMeta"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#334155"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="SectionHdr"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style>
  <Style ss:ID="TblHdr"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E293B" ss:Pattern="Solid"/></Style>
  <Style ss:ID="DataText"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#0F172A"/></Style>
  <Style ss:ID="DataCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#0F172A"/></Style>
  <Style ss:ID="DataNum"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="DataDec1"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.0"/></Style>
  <Style ss:ID="DataDec2"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.00"/></Style>
  <Style ss:ID="DataDec3"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.000"/></Style>
  <Style ss:ID="DataDec6"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.000000"/></Style>
  <Style ss:ID="StatusPass"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#166534"/><Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/></Style>
  <Style ss:ID="StatusWarn"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#92400E"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style>
  <Style ss:ID="StatusCrit"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#991B1B"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style>
  <Style ss:ID="StatusMuted"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#475569"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="1_Ringkasan_PDI_Armada">
  <Table ss:ExpandedColumnCount="16" ss:ExpandedRowCount="${s1RowCount}" x:FullColumns="1" x:FullRows="1">
${s1Widths.map((w) => `   <Column ss:AutoFitWidth="0" ss:Width="${w}"/>`).join("\n")}
   <Row ss:Height="26"><Cell ss:MergeAcross="15" ss:StyleID="BannerTitle"><Data ss:Type="String">ORION TELEMETRI &amp; DIGITAL TWIN DIPO STOCK YARD - LAPORAN EKSEKUTIF PDI &amp; KESEHATAN BATERAI</Data></Cell></Row>
   <Row ss:Height="20"><Cell ss:MergeAcross="15" ss:StyleID="BannerMeta"><Data ss:Type="String">${escXml(`Waktu Ekspor (WIB): ${exportedAt} | Cakupan Filter: ${filterLabel} | Periode: ${windowInfo.periodLabel} | Resolusi: ${windowInfo.resolutionLabel} | Total Unit: ${filteredUnits.length}`)}</Data></Cell></Row>
   <Row ss:Height="20"><Cell ss:MergeAcross="15" ss:StyleID="SectionHdr"><Data ss:Type="String">1. Ringkasan Eksekutif Kesehatan Baterai, Kompensasi Termal 25C, &amp; Kesiapan PDI Armada</Data></Cell></Row>
   <Row ss:Height="26">
${s1Cols.map((hdr) => `    ${xmlCellString(hdr, "TblHdr")}`).join("\n")}
   </Row>
${s1Body}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R4C1:R${s1RowCount}C16" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>
 </Worksheet>
 <Worksheet ss:Name="2_Log_Telemetri_OBD">
  <Table ss:ExpandedColumnCount="41" ss:ExpandedRowCount="${s2RowCount}" x:FullColumns="1" x:FullRows="1">
${s2Cols.map((_, idx) => `   <Column ss:AutoFitWidth="0" ss:Width="${idx === 1 || idx === 3 ? 132 : idx === 12 || idx === 23 ? 116 : 82}"/>`).join("\n")}
   <Row ss:Height="26"><Cell ss:MergeAcross="40" ss:StyleID="BannerTitle"><Data ss:Type="String">ORION TELEMETRI - LOG KRONOLOGIS WAKE-CYCLE &amp; 15 PARAMETER OBD-II (READ-ONLY MODE 01/03)</Data></Cell></Row>
   <Row ss:Height="20"><Cell ss:MergeAcross="40" ss:StyleID="BannerMeta"><Data ss:Type="String">${escXml(`Waktu Ekspor (WIB): ${exportedAt} | Cakupan Filter: ${filterLabel} | Periode: ${windowInfo.periodLabel} | Resolusi: ${windowInfo.resolutionLabel} | Jumlah Baris Log: ${s2Rows.length}`)}</Data></Cell></Row>
   <Row ss:Height="20"><Cell ss:MergeAcross="40" ss:StyleID="SectionHdr"><Data ss:Type="String">2. Log Kronologis Siklus Bangun Telemetri &amp; Parameter ECU OBD-II Mode 01/03</Data></Cell></Row>
   <Row ss:Height="26">
${s2Cols.map((hdr) => `    ${xmlCellString(hdr, "TblHdr")}`).join("\n")}
   </Row>
${s2Body}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R4C1:R${s2RowCount}C41" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>
 </Worksheet>
 <Worksheet ss:Name="3_Tiket_dan_Audit_Log">
  <Table ss:ExpandedColumnCount="9" ss:ExpandedRowCount="${s3RowCount}" x:FullColumns="1" x:FullRows="1">
${s3Widths.map((w) => `   <Column ss:AutoFitWidth="0" ss:Width="${w}"/>`).join("\n")}
   <Row ss:Height="26"><Cell ss:MergeAcross="8" ss:StyleID="BannerTitle"><Data ss:Type="String">ORION TELEMETRI - REKAMAN TIKET PEMELIHARAAN &amp; JEJAK AUDIT OPERASIONAL</Data></Cell></Row>
   <Row ss:Height="20"><Cell ss:MergeAcross="8" ss:StyleID="BannerMeta"><Data ss:Type="String">${escXml(`Waktu Ekspor (WIB): ${exportedAt} | Cakupan Filter: ${filterLabel} | Periode: ${windowInfo.periodLabel} | Resolusi: ${windowInfo.resolutionLabel} | Total Rekaman: ${s3Rows.length}`)}</Data></Cell></Row>
   <Row ss:Height="20"><Cell ss:MergeAcross="8" ss:StyleID="SectionHdr"><Data ss:Type="String">3. Rekaman Tiket Pemeliharaan (Shift Handover) &amp; Log Audit Operasional</Data></Cell></Row>
   <Row ss:Height="26">
${s3Cols.map((hdr) => `    ${xmlCellString(hdr, "TblHdr")}`).join("\n")}
   </Row>
${s3Body}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>
  </WorksheetOptions>
  <AutoFilter x:Range="R4C1:R${s3RowCount}C9" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>
 </Worksheet>
</Workbook>`;
}
