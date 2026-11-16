import type { PiggybackConfig, VehicleUnit } from "@/data/mockTelemetry";
import { voltageHistory } from "@/data/mockTelemetry";
import { computeBatteryPrediction, type BatteryHistoryPoint } from "@/lib/battery-analytics";

function escHtml(val: string | number | boolean | null | undefined): string {
  const s = val === null || val === undefined ? "" : String(val);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates an executive, color-coded Microsoft Excel Workbook (.xls) in HTML-Styled
 * Spreadsheet format with 3 sections:
 *   1. Executive Header Banner
 *   2. Executive Fleet Summary Table (Conditional Formatting: #DCFCE7 / #FEF3C7 / #FEE2E2)
 *   3. Chronological Telemetry Logs Table with human-readable headers & critical alert highlights
 */
export function buildFormattedExcelPrettier(
  units: VehicleUnit[],
  configs: Record<string, PiggybackConfig>,
  historyMap: Record<string, Array<BatteryHistoryPoint>>,
  targetUnitId?: string,
): string {
  const isAll = !targetUnitId || targetUnitId.toUpperCase() === "ALL";
  const filteredUnits = isAll
    ? units
    : units.filter((u) => u.unit_id === targetUnitId);
  const filterLabel = isAll ? "ALL FLEET UNITS" : targetUnitId!;
  const exportedAt = new Date().toISOString().replace("T", " ").slice(0, 19);

  const summaryRowsHtml: string[] = [];
  const logRowsHtml: string[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  let logId = 1;

  for (const u of filteredUnits) {
    const t = u.telemetry;
    const critV = configs[u.unit_id]?.crit_v ?? 11.80;
    const hist =
      historyMap[u.unit_id] && historyMap[u.unit_id]!.length >= 2
        ? historyMap[u.unit_id]!
        : voltageHistory(t.v_bat, t.engine_on);

    const pred = computeBatteryPrediction(hist, t.v_bat, critV, t.engine_on, t.rtc_temp_c);
    const pdiPassed =
      t.v_bat >= 12.20 &&
      t.dtc_cnt === 0 &&
      (t.dtc === "NONE" || !t.dtc) &&
      t.shunt_sleep_ua <= 500;

    let rowClass = "row-green";
    if (t.v_bat < 11.80 || (t.dtc !== "NONE" && Boolean(t.dtc))) {
      rowClass = "row-red";
    } else if (t.v_bat < 12.20) {
      rowClass = "row-amber";
    }

    summaryRowsHtml.push(
      `  <tr class="${rowClass}">
    <td>${escHtml(u.unit_id)}</td>
    <td class="center">${escHtml(u.bay)}</td>
    <td>${escHtml(`${u.model} ${u.trim}`)}</td>
    <td>${escHtml(u.vin)}</td>
    <td>${escHtml(u.status_label)}</td>
    <td class="num">${t.v_bat.toFixed(2)} V</td>
    <td>${escHtml(pred.statusText)}</td>
    <td class="num">${t.shunt_sleep_ua} &micro;A</td>
    <td class="center">${escHtml(t.dtc)}</td>
    <td class="center">${pdiPassed ? "PDI PASSED" : "PDI HOLD / ACTION REQUIRED"}</td>
  </tr>`,
    );

    const reversed = hist.slice().reverse();
    reversed.forEach((pt, idx) => {
      const tsEpoch =
        typeof pt.ts === "number" && pt.ts > 0 ? pt.ts : nowSec - idx * 3600;
      const isoTime = new Date(tsEpoch * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
      const seq = Math.max(1, t.boot - idx);
      const vBat = idx === 0 ? t.v_bat : pt.v;
      const adcMv =
        idx === 0 ? t.adc_raw_mv : Math.round((vBat - 0.358) / 0.005412);
      const isCrit = vBat < 11.80 || (idx === 0 && t.crit_alert);
      const logCls = isCrit ? "row-red" : logId % 2 === 0 ? "row-even" : "";
      const engStatus = t.engine_on && idx === 0 ? "RUNNING (WARM-UP)" : "STANDBY (SLEEP)";
      const rpmText = t.engine_on && idx === 0 && t.rpm >= 0 ? String(t.rpm) : "OFF";
      const coolantText = t.engine_on && idx === 0 && t.temp_c > -40 ? `${t.temp_c} C` : "OFF";

      logRowsHtml.push(
        `  <tr${logCls ? ` class="${logCls}"` : ""}>
    <td class="num">${logId++}</td>
    <td>${escHtml(isoTime)}</td>
    <td>${escHtml(u.unit_id)}</td>
    <td class="num">${seq}</td>
    <td class="num">${seq}</td>
    <td class="num">${vBat.toFixed(2)}</td>
    <td class="num">${adcMv}</td>
    <td class="num">${t.rtc_temp_c.toFixed(1)}</td>
    <td class="num">${t.shunt_sleep_ua}</td>
    <td class="center">${engStatus}</td>
    <td class="num">${escHtml(rpmText)}</td>
    <td class="num">${escHtml(coolantText)}</td>
    <td class="center">${escHtml(t.dtc)}</td>
    <td class="num">${t.rssi}</td>
    <td class="num">${u.buffer_used} slots</td>
  </tr>`,
      );
    });
  }

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>ORION Telemetry Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body, table { font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 10pt; color: #0E1116; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #CBD5E1; padding: 6px 10px; vertical-align: middle; }
  .banner-title { background-color: #8E1218; color: #F2EFE9; font-size: 13pt; font-weight: bold; letter-spacing: 0.5px; padding: 10px 12px; border-bottom: 2px solid #E0393E; }
  .banner-sub { background-color: #E0393E; color: #F2EFE9; font-size: 10pt; font-weight: bold; letter-spacing: 0.4px; padding: 6px 12px; }
  .banner-meta { background-color: #0E1116; color: #E8E4DC; font-size: 9.5pt; padding: 6px 12px; }
  .section-hdr { background-color: #1E293B; color: #F2EFE9; font-size: 10.5pt; font-weight: bold; text-transform: uppercase; padding: 7px 10px; }
  .tbl-hdr { background-color: #E2E8F0; color: #0E1116; font-weight: bold; text-align: left; }
  .row-green { background-color: #DCFCE7; color: #166534; }
  .row-amber { background-color: #FEF3C7; color: #92400E; }
  .row-red { background-color: #FEE2E2; color: #991B1B; font-weight: bold; }
  .row-even { background-color: #F8FAFC; color: #0E1116; }
  .num { mso-number-format: "\\@"; text-align: right; font-family: Consolas, monospace; }
  .center { text-align: center; }
</style>
</head>
<body>
<table>
  <tr><td colspan="15" class="banner-title">ORION — ONBOARD REPORTING FOR INVENTORY &amp; OPERATIONAL NOTIFICATIONS</td></tr>
  <tr><td colspan="15" class="banner-sub">STOCK YARD INVENTORY TELEMETRY &amp; BATTERY HEALTH AUDIT REPORT</td></tr>
  <tr><td colspan="15" class="banner-meta">Export Timestamp: ${escHtml(exportedAt)} | Unit Filter: ${escHtml(filterLabel)} | Standard: SOP C.1 &amp; PDI Readiness</td></tr>
  <tr><td colspan="15" style="border:none;height:10px;"></td></tr>
  <tr><td colspan="10" class="section-hdr">1. Executive Fleet Health &amp; PDI Summary</td></tr>
  <tr class="tbl-hdr">
    <th>Unit ID</th>
    <th>Bay</th>
    <th>Model &amp; Trim</th>
    <th>VIN</th>
    <th>Current Status</th>
    <th>Battery (V)</th>
    <th>Drain Rate / TTC Forecast</th>
    <th>Sleep Current (&micro;A)</th>
    <th>Active DTC</th>
    <th>PDI Verdict</th>
  </tr>
${summaryRowsHtml.join("\n")}
  <tr><td colspan="15" style="border:none;height:14px;"></td></tr>
  <tr><td colspan="15" class="section-hdr">2. Chronological Telemetry Logs (Wake-Cycle History)</td></tr>
  <tr class="tbl-hdr">
    <th>Log ID</th>
    <th>Timestamp</th>
    <th>Unit ID</th>
    <th>Seq #</th>
    <th>Boot #</th>
    <th>Battery Voltage (V)</th>
    <th>ADC Pin 34 (mV)</th>
    <th>RTC Die Temp (&deg;C)</th>
    <th>Sleep Current (&micro;A)</th>
    <th>Engine Status</th>
    <th>RPM</th>
    <th>Coolant (&deg;C)</th>
    <th>OBD-II DTC</th>
    <th>Wi-Fi RSSI (dBm)</th>
    <th>Sync Buffer</th>
  </tr>
${logRowsHtml.join("\n")}
</table>
</body>
</html>`;
}

