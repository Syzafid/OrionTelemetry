<?php
/**
 * ORION Telemetry System - Formatted Excel Report Generator (GET)
 * Endpoint: http://localhost/dipo_api/export_excel.php?unit_id=MITSUBISHI-STOCK-01&limit=250
 *
 * Generates a styled Microsoft Excel Workbook (.xls) containing:
 * 1. Executive Header Banner (ORION Crimson #8E1218 / #E0393E & Cream #F2EFE9)
 * 2. Executive Fleet Summary Table with Conditional Formatting (Green / Amber / Red)
 * 3. Chronological Telemetry Logs Table with human-readable headers & critical alert highlights
 */

/** @var PDO $pdo */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(['error' => 'METHOD_NOT_ALLOWED', 'message' => 'Use GET method.'], 405);
}

function escXml(string $val): string {
    return htmlspecialchars($val, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

/**
 * Computes OLS slope (mV/h) and Time-to-Critical (TTC) in PHP for the Executive Fleet Summary.
 *
 * @param array<int, array<string, mixed>> $chronologicalLogs
 */
function computePhpBatteryForecast(array $chronologicalLogs, float $currentV, float $critV, bool $engineOn): string {
    if ($currentV <= $critV) {
        return 'Critical Now (0.0h)';
    }

    $n = count($chronologicalLogs);
    $slopeVPerHour = 0.0;

    if ($n >= 2) {
        $firstTs = (int)($chronologicalLogs[0]['ts'] ?? 0);
        $lastTs  = (int)($chronologicalLogs[$n - 1]['ts'] ?? 0);
        $useReal = ($firstTs > 0 && ($lastTs - $firstTs) >= 60);

        $xs = [];
        $ys = [];
        $sumX = 0.0;
        $sumY = 0.0;

        foreach ($chronologicalLogs as $i => $pt) {
            $x = $useReal ? (((int)$pt['ts'] - $firstTs) / 3600.0) : (float)$i;
            $y = (float)$pt['v'];
            $xs[] = $x;
            $ys[] = $y;
            $sumX += $x;
            $sumY += $y;
        }

        $mx = $sumX / $n;
        $my = $sumY / $n;
        $sxy = 0.0;
        $sxx = 0.0;

        for ($i = 0; $i < $n; $i++) {
            $dx = $xs[$i] - $mx;
            $dy = $ys[$i] - $my;
            $sxy += $dx * $dy;
            $sxx += $dx * $dx;
        }

        if ($sxx > 1e-12) {
            $slopeVPerHour = $sxy / $sxx;
        }
    }

    $slopeMv = (int)round($slopeVPerHour * 1000);

    if ($engineOn || $slopeVPerHour > 0.002) {
        $label = $slopeMv > 0 ? "+{$slopeMv} mV/h" : 'Alternator Active';
        return "Charging ({$label})";
    }

    if ($slopeVPerHour < -0.002) {
        $ttc = round(($currentV - $critV) / abs($slopeVPerHour), 1);
        return sprintf('Est. Critical in %.1fh (%d mV/h)', max(0.1, $ttc), $slopeMv);
    }

    return 'Stable (> 72h Safe)';
}

try {
    $rawUnit = isset($_GET['unit_id']) ? trim((string)$_GET['unit_id']) : '';
    $isAll = ($rawUnit === '' || strtoupper($rawUnit) === 'ALL');
    $unitFilterLabel = $isAll ? 'ALL FLEET UNITS' : $rawUnit;
    $unitIdForFile = $isAll ? 'ALL_FLEET' : preg_replace('/[^A-Za-z0-9_-]/', '_', $rawUnit);

    $rawLimit = isset($_GET['limit']) ? (int)$_GET['limit'] : 250;
    $limit = max(1, min(2000, $rawLimit));

    $dateFile = date('Ymd_His');
    $dateHuman = date('Y-m-d H:i:s');
    $filename = "ORION_TELEMETRY_REPORT_{$unitIdForFile}_{$dateFile}.xls";

    header("Content-Type: application/vnd.ms-excel; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"{$filename}\"");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Pragma: no-cache");

    // 1. Fetch vehicles
    if ($isAll) {
        $stmtV = $pdo->query("SELECT * FROM `vehicles` ORDER BY `unit_id` ASC");
    } else {
        $stmtV = $pdo->prepare("SELECT * FROM `vehicles` WHERE `unit_id` = :uid ORDER BY `unit_id` ASC");
        $stmtV->execute([':uid' => $rawUnit]);
    }
    $vehicles = $stmtV->fetchAll();

    // 2. Fetch node_configs
    $configs = [];
    foreach ($pdo->query("SELECT * FROM `node_configs`")->fetchAll() as $c) {
        $configs[$c['unit_id']] = $c;
    }

    // 3. Fetch latest log & 24-point history per unit
    $stmtHist = $pdo->prepare("
        SELECT `v_bat`, `ts_epoch`, UNIX_TIMESTAMP(`created_at`) AS `created_ts`
        FROM `telemetry_logs`
        WHERE `unit_id` = :uid
        ORDER BY `id` DESC
        LIMIT 24
    ");
    $stmtLatest = $pdo->prepare("
        SELECT * FROM `telemetry_logs`
        WHERE `unit_id` = :uid
        ORDER BY `id` DESC
        LIMIT 1
    ");

    $summaryRows = [];
    foreach ($vehicles as $v) {
        $uid = $v['unit_id'];
        $stmtLatest->execute([':uid' => $uid]);
        $latest = $stmtLatest->fetch() ?: [
            'v_bat' => 12.60,
            'shunt_sleep_ua' => 410,
            'dtc' => 'NONE',
            'dtc_cnt' => 0,
            'engine_on' => 0,
        ];

        $stmtHist->execute([':uid' => $uid]);
        $histRaw = array_reverse($stmtHist->fetchAll());
        $histPts = [];
        $lastTs = 0;
        foreach ($histRaw as $r) {
            $ts = (int)$r['ts_epoch'] > 0 ? (int)$r['ts_epoch'] : (int)$r['created_ts'];
            if ($ts <= $lastTs) {
                $ts = $lastTs + 1;
            }
            $lastTs = $ts;
            $histPts[] = ['v' => (float)$r['v_bat'], 'ts' => $ts];
        }

        $critV = isset($configs[$uid]) ? (float)$configs[$uid]['crit_v'] : 11.80;
        $vBat = (float)$latest['v_bat'];
        $dtc = (string)$latest['dtc'];
        $dtcCnt = (int)$latest['dtc_cnt'];
        $sleepUa = (int)$latest['shunt_sleep_ua'];
        $engineOn = (bool)$latest['engine_on'];

        $forecast = computePhpBatteryForecast($histPts, $vBat, $critV, $engineOn);
        $pdiPassed = ($vBat >= 12.20 && $dtcCnt === 0 && ($dtc === 'NONE' || $dtc === '') && $sleepUa <= 500);

        $tone = 'green';
        if ($vBat < 11.80 || ($dtc !== 'NONE' && $dtc !== '')) {
            $tone = 'red';
        } elseif ($vBat < 12.20) {
            $tone = 'amber';
        }

        $summaryRows[] = [
            'unit_id'       => (string)$uid,
            'bay'           => (string)$v['bay'],
            'model_trim'    => trim($v['model'] . ' ' . $v['trim']),
            'vin'           => (string)$v['vin'],
            'status_label'  => (string)$v['status_label'],
            'v_bat'         => number_format($vBat, 2, '.', ''),
            'forecast'      => $forecast,
            'sleep_ua'      => $sleepUa,
            'dtc'           => $dtc,
            'pdi_verdict'   => $pdiPassed ? 'PDI PASSED' : 'PDI HOLD / ACTION REQUIRED',
            'tone'          => $tone,
        ];
    }

    // 4. Fetch chronological telemetry logs
    if ($isAll) {
        $stmtLogs = $pdo->prepare("
            SELECT l.*, v.`buffer_used`
            FROM `telemetry_logs` l
            LEFT JOIN `vehicles` v ON v.`unit_id` = l.`unit_id`
            ORDER BY l.`id` DESC
            LIMIT :limit
        ");
        $stmtLogs->bindValue(':limit', $limit, PDO::PARAM_INT);
    } else {
        $stmtLogs = $pdo->prepare("
            SELECT l.*, v.`buffer_used`
            FROM `telemetry_logs` l
            LEFT JOIN `vehicles` v ON v.`unit_id` = l.`unit_id`
            WHERE l.`unit_id` = :uid
            ORDER BY l.`id` DESC
            LIMIT :limit
        ");
        $stmtLogs->bindValue(':uid', $rawUnit, PDO::PARAM_STR);
        $stmtLogs->bindValue(':limit', $limit, PDO::PARAM_INT);
    }
    $stmtLogs->execute();
    $logRows = $stmtLogs->fetchAll();

    // 5. Render HTML-Styled Excel Workbook compatible with Microsoft Excel 2007-365
    echo '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' . "\n";
    echo '<head>' . "\n";
    echo '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />' . "\n";
    echo '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>ORION Telemetry Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' . "\n";
    echo '<style>
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
        .num { mso-number-format: "\@"; text-align: right; font-family: Consolas, monospace; }
        .center { text-align: center; }
    </style>' . "\n";
    echo '</head><body>' . "\n";

    // BAGIAN 1: HEADER BANNER
    echo '<table>' . "\n";
    echo '  <tr><td colspan="15" class="banner-title">ORION — ONBOARD REPORTING FOR INVENTORY &amp; OPERATIONAL NOTIFICATIONS</td></tr>' . "\n";
    echo '  <tr><td colspan="15" class="banner-sub">STOCK YARD INVENTORY TELEMETRY &amp; BATTERY HEALTH AUDIT REPORT</td></tr>' . "\n";
    echo '  <tr><td colspan="15" class="banner-meta">Export Timestamp: ' . escXml($dateHuman) . ' | Unit Filter: ' . escXml($unitFilterLabel) . ' | Max Rows: ' . (int)$limit . ' | Standard: SOP C.1 &amp; PDI Readiness</td></tr>' . "\n";
    echo '  <tr><td colspan="15" style="border:none;height:10px;"></td></tr>' . "\n";

    // BAGIAN 2: EXECUTIVE FLEET SUMMARY
    echo '  <tr><td colspan="10" class="section-hdr">1. Executive Fleet Health &amp; PDI Summary</td></tr>' . "\n";
    echo '  <tr class="tbl-hdr">
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
    </tr>' . "\n";

    foreach ($summaryRows as $s) {
        $cls = $s['tone'] === 'red' ? 'row-red' : ($s['tone'] === 'amber' ? 'row-amber' : 'row-green');
        echo '  <tr class="' . $cls . '">
            <td>' . escXml($s['unit_id']) . '</td>
            <td class="center">' . escXml($s['bay']) . '</td>
            <td>' . escXml($s['model_trim']) . '</td>
            <td>' . escXml($s['vin']) . '</td>
            <td>' . escXml($s['status_label']) . '</td>
            <td class="num">' . escXml($s['v_bat']) . ' V</td>
            <td>' . escXml($s['forecast']) . '</td>
            <td class="num">' . (int)$s['sleep_ua'] . ' &micro;A</td>
            <td class="center">' . escXml($s['dtc']) . '</td>
            <td class="center">' . escXml($s['pdi_verdict']) . '</td>
        </tr>' . "\n";
    }

    echo '  <tr><td colspan="15" style="border:none;height:14px;"></td></tr>' . "\n";

    // BAGIAN 3: CHRONOLOGICAL TELEMETRY LOGS
    echo '  <tr><td colspan="15" class="section-hdr">2. Chronological Telemetry Logs (Wake-Cycle History)</td></tr>' . "\n";
    echo '  <tr class="tbl-hdr">
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
    </tr>' . "\n";

    foreach ($logRows as $idx => $r) {
        $isCrit = ((int)$r['crit_alert'] === 1) || ((float)$r['v_bat'] < 11.80);
        $rowCls = $isCrit ? 'row-red' : (($idx % 2 === 1) ? 'row-even' : '');
        $engStatus = ((int)$r['engine_on'] === 1) ? 'RUNNING (WARM-UP)' : 'STANDBY (SLEEP)';
        $rpmText = ((int)$r['rpm'] >= 0) ? (string)(int)$r['rpm'] : 'OFF';
        $tempText = ((int)$r['temp_c'] > -40) ? ((int)$r['temp_c'] . ' C') : 'OFF';
        $bufText = isset($r['buffer_used']) ? ((int)$r['buffer_used'] . ' slots') : '0 slots';

        echo '  <tr' . ($rowCls ? ' class="' . $rowCls . '"' : '') . '>
            <td class="num">' . (int)$r['id'] . '</td>
            <td>' . escXml((string)$r['created_at']) . '</td>
            <td>' . escXml((string)$r['unit_id']) . '</td>
            <td class="num">' . (int)$r['seq'] . '</td>
            <td class="num">' . (int)$r['boot'] . '</td>
            <td class="num">' . number_format((float)$r['v_bat'], 2, '.', '') . '</td>
            <td class="num">' . (int)$r['adc_raw_mv'] . '</td>
            <td class="num">' . number_format((float)$r['rtc_temp_c'], 1, '.', '') . '</td>
            <td class="num">' . (int)$r['shunt_sleep_ua'] . '</td>
            <td class="center">' . $engStatus . '</td>
            <td class="num">' . escXml($rpmText) . '</td>
            <td class="num">' . escXml($tempText) . '</td>
            <td class="center">' . escXml((string)$r['dtc']) . '</td>
            <td class="num">' . (int)$r['rssi'] . '</td>
            <td class="num">' . escXml($bufText) . '</td>
        </tr>' . "\n";
    }

    echo '</table>' . "\n";
    echo '</body></html>';
    exit(0);
} catch (Exception $e) {
    sendJson([
        'error' => 'EXCEL_EXPORT_ERROR',
        'message' => $e->getMessage(),
    ], 500);
}

