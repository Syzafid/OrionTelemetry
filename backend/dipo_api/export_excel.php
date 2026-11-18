<?php
/**
 * ORION Telemetry System - 3-Sheet SpreadsheetML Excel Workbook Generator (GET)
 * Endpoint: http://localhost/dipo_api/export_excel.php?unit_id=MITSUBISHI-STOCK-01&limit=250
 *
 * Generates a native 3-Worksheet Microsoft Excel 2003+/365 SpreadsheetML (.xls) Workbook with
 * pre-attached AutoFilters and Frozen Headers:
 *   1. 1_Ringkasan_PDI_Armada (16 columns: OCV 25C Compensation, Arrhenius Factor, OLS TTC & PDI Verdict)
 *   2. 2_Log_Telemetri_OBD (41 columns: Wake-Cycle Core Telemetry + Node Calibration + 15 Read-Only OBD-II PIDs)
 *   3. 3_Tiket_dan_Audit_Log (9 columns: Maintenance Shift Handover Tickets + Operational Audit Trail)
 */

/** @var PDO $pdo */
$pdo = require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(['error' => 'METHOD_NOT_ALLOWED', 'message' => 'Use GET method.'], 405);
}

const EXCEL_ONLINE_THRESHOLD_SEC = 10;

function escXml(string $val): string {
    $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $val) ?? '';
    return htmlspecialchars($clean, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function xmlCellString($val, string $styleId = 'DataText'): string {
    return '<Cell ss:StyleID="' . $styleId . '"><Data ss:Type="String">' . escXml((string)$val) . '</Data></Cell>';
}

function xmlCellNumber(float $val, string $styleId = 'DataNum', int $decimals = 0): string {
    $formatted = number_format($val, $decimals, '.', '');
    return '<Cell ss:StyleID="' . $styleId . '"><Data ss:Type="Number">' . $formatted . '</Data></Cell>';
}

/**
 * Computes Ordinary Least Squares (OLS) drain rate, 25C compensated OCV/SOC,
 * Arrhenius thermal penalty, and Time-to-Critical (TTC) matching src/lib/battery-analytics.ts.
 *
 * @param array<int, array<string, mixed>> $chronologicalLogs
 * @return array{
 *   slope_v_hour: float,
 *   slope_mv_hour: int,
 *   slope_v_day: float,
 *   ttc_hours: float|null,
 *   status: string,
 *   tone: string,
 *   compensated_v25: float,
 *   soc_percent: int,
 *   thermal_factor: float
 * }
 */
function computePhpBatteryForecast(
    array $chronologicalLogs,
    float $currentV,
    float $critV,
    bool $engineOn,
    float $rtcTempC = 25.0
): array {
    // 6-cell Lead-Acid 25C compensation (-0.018 V/C) matching computeBatteryPrediction()
    $compensatedV25 = round($currentV + 0.018 * (25.0 - $rtcTempC), 2);
    $socPercent = ($engineOn || $currentV >= 13.5)
        ? 100
        : (int)round(max(0.0, min(100.0, (($compensatedV25 - 11.6) / (12.7 - 11.6)) * 100.0)));
    $thermalFactor = $rtcTempC > 25.0
        ? round(pow(2.0, max(0.0, $rtcTempC - 25.0) / 10.0), 2)
        : 1.0;

    $n = count($chronologicalLogs);
    $rawSlopeVPerHour = 0.0;

    if ($n >= 2) {
        $allHaveTs = true;
        foreach ($chronologicalLogs as $pt) {
            if ((int)($pt['ts'] ?? 0) <= 0) {
                $allHaveTs = false;
                break;
            }
        }
        $firstTs = $allHaveTs ? (int)$chronologicalLogs[0]['ts'] : 0;
        $lastTs = $allHaveTs ? (int)$chronologicalLogs[$n - 1]['ts'] : 0;
        $useReal = ($allHaveTs && ($lastTs - $firstTs) >= 60);

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
            $rawSlopeVPerHour = $sxy / $sxx;
        }
    }

    $slopeMvPerHour = (int)round($rawSlopeVPerHour * 1000);
    $effectiveSlopeVPerHour = ($rawSlopeVPerHour < -0.002 && $rtcTempC > 30.0 && $thermalFactor > 1.0)
        ? ($rawSlopeVPerHour * $thermalFactor)
        : $rawSlopeVPerHour;
    $slopeVPerDay = round($effectiveSlopeVPerHour * 24.0, 3);

    if ($currentV <= $critV) {
        return [
            'slope_v_hour'    => $rawSlopeVPerHour,
            'slope_mv_hour'   => $slopeMvPerHour,
            'slope_v_day'     => $slopeVPerDay,
            'ttc_hours'       => 0.0,
            'status'          => 'Critical Now (0.0h)',
            'tone'            => 'crimson',
            'compensated_v25' => $compensatedV25,
            'soc_percent'     => $socPercent,
            'thermal_factor'  => $thermalFactor,
        ];
    }

    if ($engineOn || $rawSlopeVPerHour > 0.002) {
        $label = $slopeMvPerHour > 0 ? "+{$slopeMvPerHour} mV/h" : 'Alternator Active';
        return [
            'slope_v_hour'    => $rawSlopeVPerHour,
            'slope_mv_hour'   => $slopeMvPerHour,
            'slope_v_day'     => $slopeVPerDay,
            'ttc_hours'       => null,
            'status'          => "Charging ({$label})",
            'tone'            => 'emerald',
            'compensated_v25' => $compensatedV25,
            'soc_percent'     => $socPercent,
            'thermal_factor'  => $thermalFactor,
        ];
    }

    if ($rawSlopeVPerHour < -0.002) {
        $baseRawTtc = ($currentV - $critV) / abs($rawSlopeVPerHour);
        $adjustedRawTtc = ($rtcTempC > 30.0 && $thermalFactor > 1.0)
            ? ($baseRawTtc / $thermalFactor)
            : $baseRawTtc;
        $ttcHours = round(max(0.1, $adjustedRawTtc), 1);
        $tone = $ttcHours <= 12.0 ? 'crimson' : ($ttcHours <= 36.0 ? 'amber' : 'emerald');
        return [
            'slope_v_hour'    => $rawSlopeVPerHour,
            'slope_mv_hour'   => $slopeMvPerHour,
            'slope_v_day'     => $slopeVPerDay,
            'ttc_hours'       => $ttcHours,
            'status'          => sprintf('Est. Critical in %.1fh (%d mV/h)', $ttcHours, $slopeMvPerHour),
            'tone'            => $tone,
            'compensated_v25' => $compensatedV25,
            'soc_percent'     => $socPercent,
            'thermal_factor'  => $thermalFactor,
        ];
    }

    return [
        'slope_v_hour'    => $rawSlopeVPerHour,
        'slope_mv_hour'   => $slopeMvPerHour,
        'slope_v_day'     => $slopeVPerDay,
        'ttc_hours'       => null,
        'status'          => 'Stable (> 72h Safe)',
        'tone'            => 'emerald',
        'compensated_v25' => $compensatedV25,
        'soc_percent'     => $socPercent,
        'thermal_factor'  => $thermalFactor,
    ];
}

try {
    ensureObd2ReadOnlyColumns($pdo);
    ensureNetZoneAndMovementSchema($pdo);

    $rawUnit = isset($_GET['unit_id']) ? trim((string)$_GET['unit_id']) : '';
    $isAll = ($rawUnit === '' || strtoupper($rawUnit) === 'ALL');
    $selectedIds = [];
    if (!$isAll) {
        $rawIds = array_values(array_filter(array_map('trim', explode(',', $rawUnit)), static fn($id) => $id !== ''));
        foreach ($rawIds as $id) {
            $cleanId = preg_replace('/[^A-Za-z0-9_-]/', '', $id);
            if ($cleanId !== '' && strtoupper($cleanId) !== 'ALL') {
                $selectedIds[] = $cleanId;
            }
        }
        $selectedIds = array_values(array_unique($selectedIds));
        if (empty($selectedIds)) {
            $isAll = true;
        }
    }

    if ($isAll) {
        $unitFilterLabel = 'SELURUH ARMADA';
        $unitIdForFile = 'ALL_FLEET';
    } elseif (count($selectedIds) === 1) {
        $unitFilterLabel = $selectedIds[0];
        $unitIdForFile = $selectedIds[0];
    } else {
        $unitFilterLabel = count($selectedIds) . ' UNIT (' . implode(', ', $selectedIds) . ')';
        $unitIdForFile = 'FILTERED_' . count($selectedIds) . 'UNITS';
    }

    // Period & Resolution parameters (Asia/Jakarta WIB set in db.php)
    $rawPeriod = strtoupper(trim((string)($_GET['period'] ?? 'ALL_TIME')));
    $allowedPeriods = ['DAILY', '7_DAYS', 'MONTHLY', 'YEARLY', 'CUSTOM', 'ALL_TIME'];
    $period = in_array($rawPeriod, $allowedPeriods, true) ? $rawPeriod : 'ALL_TIME';

    $rawResolution = strtoupper(trim((string)($_GET['resolution'] ?? 'RAW')));
    $allowedRes = ['RAW', 'HOURLY', 'DAILY_SUMMARY'];
    $resolution = in_array($rawResolution, $allowedRes, true) ? $rawResolution : 'RAW';

    $resolutionLabels = [
        'RAW'           => 'DATA MENTAH (RAW)',
        'HOURLY'        => 'RINGKASAN PER JAM',
        'DAILY_SUMMARY' => 'RINGKASAN PER HARI',
    ];
    $resolutionLabel = $resolutionLabels[$resolution];

    $startDt = null;
    $endDt = null;
    $periodLabel = 'SELURUH RIWAYAT';
    $fileSlug = 'ALL_TIME';

    if ($period === 'DAILY') {
        $rawDate = trim((string)($_GET['date'] ?? ''));
        $d = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawDate) ? $rawDate : date('Y-m-d');
        $startDt = "{$d} 00:00:00";
        $endDt = "{$d} 23:59:59";
        $periodLabel = "HARIAN ({$d})";
        $fileSlug = "HARIAN_{$d}";
    } elseif ($period === '7_DAYS') {
        $startD = date('Y-m-d', strtotime('-6 days'));
        $endD = date('Y-m-d');
        $startDt = "{$startD} 00:00:00";
        $endDt = "{$endD} 23:59:59";
        $periodLabel = "7 HARI TERAKHIR ({$startD} s/d {$endD})";
        $fileSlug = "7HARI_{$endD}";
    } elseif ($period === 'MONTHLY') {
        $rawMonth = trim((string)($_GET['month'] ?? ''));
        $ym = preg_match('/^\d{4}-\d{2}$/', $rawMonth) ? $rawMonth : date('Y-m');
        $lastDay = date('Y-m-t', strtotime("{$ym}-01"));
        $startDt = "{$ym}-01 00:00:00";
        $endDt = "{$lastDay} 23:59:59";
        $periodLabel = "BULANAN ({$ym})";
        $fileSlug = "BULANAN_{$ym}";
    } elseif ($period === 'YEARLY') {
        $rawYear = trim((string)($_GET['year'] ?? ''));
        $y = preg_match('/^\d{4}$/', $rawYear) ? $rawYear : date('Y');
        $startDt = "{$y}-01-01 00:00:00";
        $endDt = "{$y}-12-31 23:59:59";
        $periodLabel = "TAHUNAN ({$y})";
        $fileSlug = "TAHUNAN_{$y}";
    } elseif ($period === 'CUSTOM') {
        $rawStart = trim((string)($_GET['start_date'] ?? ''));
        $rawEnd = trim((string)($_GET['end_date'] ?? ''));
        $s = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawStart) ? $rawStart : date('Y-m-d');
        $e = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawEnd) ? $rawEnd : $s;
        if ($e < $s) {
            $tmp = $s;
            $s = $e;
            $e = $tmp;
        }
        $startDt = "{$s} 00:00:00";
        $endDt = "{$e} 23:59:59";
        $periodLabel = "RENTANG ({$s} s/d {$e})";
        $fileSlug = "RENTANG_{$s}_{$e}";
    }

    $rawLimit = isset($_GET['limit']) ? (int)$_GET['limit'] : 0;
    if ($rawLimit <= 0) {
        $limit = ($period !== 'ALL_TIME') ? 10000 : 2500;
    } else {
        $limit = max(1, min(10000, $rawLimit));
    }

    $dateFile = date('Ymd_His');
    $dateHuman = date('Y-m-d H:i:s');
    $filename = "ORION_TELEMETRY_REPORT_{$unitIdForFile}_{$fileSlug}_{$dateFile}.xls";

    header("Content-Type: application/vnd.ms-excel; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"{$filename}\"");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Pragma: no-cache");

    // 1. Fetch vehicles with real SQL TIMESTAMPDIFF last_seen_sec
    if ($isAll) {
        $stmtV = $pdo->query("
            SELECT *, TIMESTAMPDIFF(SECOND, `last_seen`, NOW()) AS `last_seen_sec`
            FROM `vehicles`
            ORDER BY `bay` ASC, `unit_id` ASC
        ");
    } else {
        $placeholders = implode(', ', array_fill(0, count($selectedIds), '?'));
        $stmtV = $pdo->prepare("
            SELECT *, TIMESTAMPDIFF(SECOND, `last_seen`, NOW()) AS `last_seen_sec`
            FROM `vehicles`
            WHERE `unit_id` IN ({$placeholders})
            ORDER BY `bay` ASC, `unit_id` ASC
        ");
        foreach ($selectedIds as $idx => $uid) {
            $stmtV->bindValue($idx + 1, $uid, PDO::PARAM_STR);
        }
        $stmtV->execute();
    }
    $vehicles = $stmtV->fetchAll();

    // 2. Fetch node_configs
    $configs = [];
    foreach ($pdo->query("SELECT * FROM `node_configs`")->fetchAll() as $c) {
        $configs[(string)$c['unit_id']] = $c;
    }

    // 3. Prepare log queries per vehicle for Sheet 1 summary
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

    $bayMap = [];
    $summaryRows = [];

    foreach ($vehicles as $v) {
        $uid = (string)$v['unit_id'];
        $bayMap[$uid] = (string)$v['bay'];

        $stmtLatest->execute([':uid' => $uid]);
        $latest = $stmtLatest->fetch();
        $hasLog = is_array($latest);

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
        $vBat = $hasLog ? (float)$latest['v_bat'] : (isset($v['v_bat']) ? (float)$v['v_bat'] : 0.0);
        $rtcTempC = $hasLog ? (float)$latest['rtc_temp_c'] : (isset($v['rtc_temp_c']) ? (float)$v['rtc_temp_c'] : 25.0);
        $dtc = $hasLog ? (string)$latest['dtc'] : 'BELUM ADA LOG';
        $dtcCnt = $hasLog ? (int)$latest['dtc_cnt'] : 0;
        $sleepUa = $hasLog ? (int)$latest['shunt_sleep_ua'] : 0;
        $engineOn = $hasLog ? ((int)$latest['engine_on'] === 1) : false;
        $canOk = $hasLog
            ? (isset($latest['can_ok']) ? ((int)$latest['can_ok'] === 1) : true)
            : (isset($v['can_ok']) ? ((int)$v['can_ok'] === 1) : true);

        $inYard = !empty($v['in_yard']);
        $netZone = (string)($latest['net_zone'] ?? ($v['net_zone'] ?? 'UNKNOWN'));
        $syncSsid = trim((string)($latest['sync_ssid'] ?? ($v['sync_ssid'] ?? '')));
        $wifiLabel = $syncSsid !== '' ? ($netZone . ' / ' . $syncSsid) : $netZone;

        $lastSeenSec = $v['last_seen_sec'] !== null ? (int)$v['last_seen_sec'] : 999999;
        $isLiveOnline = ($lastSeenSec <= EXCEL_ONLINE_THRESHOLD_SEC) && ($inYard || $netZone === 'TECH_HOTSPOT');
        if ($isLiveOnline) {
            $connectionBadge = ($netZone === 'TECH_HOTSPOT') ? 'LIVE / TECH HOTSPOT' : 'LIVE / ONLINE';
        } else {
            $connectionBadge = $inYard ? 'OFFLINE / DEEP SLEEP' : 'OFFLINE / OUT OF YARD';
        }
        $lastSeenStr = !empty($v['last_seen']) ? (string)$v['last_seen'] : 'BELUM SINKRON';

        $pred = computePhpBatteryForecast($histPts, $vBat, $critV, $engineOn, $rtcTempC);

        $dtcCanText = !$hasLog
            ? 'BELUM ADA LOG'
            : (($dtc !== 'NONE' && $dtc !== '') || $dtcCnt > 0
                ? ($dtc . ' (' . $dtcCnt . ') · ' . ($canOk ? 'CAN OK' : 'CAN FAULT'))
                : ($canOk ? 'NONE · CAN OK (500 kbps)' : 'NONE · CAN FAULT'));

        if (!$hasLog) {
            $pdiVerdict = 'PDI HOLD (BELUM ADA LOG)';
            $pdiTone = 'warn';
            $forecastText = 'Menunggu Log Pertama';
        } else {
            $pdiPassed = ($vBat >= 12.20 && $dtcCnt === 0 && ($dtc === 'NONE' || $dtc === '') && $sleepUa <= 500 && $canOk);
            $pdiVerdict = $pdiPassed ? 'PDI PASSED' : 'PDI HOLD / ACTION REQUIRED';
            if ($vBat < $critV || ($dtc !== 'NONE' && $dtc !== '') || !$canOk) {
                $pdiTone = 'crit';
            } elseif (!$pdiPassed || $vBat < 12.20) {
                $pdiTone = 'warn';
            } else {
                $pdiTone = 'pass';
            }
            $forecastText = $pred['status'];
        }

        $summaryRows[] = [
            'bay'             => (string)$v['bay'],
            'unit_id'         => $uid,
            'model_trim'      => trim($v['model'] . ' ' . $v['trim']),
            'connection'      => $connectionBadge,
            'is_online'       => $isLiveOnline,
            'last_seen'       => $lastSeenStr,
            'wifi_label'      => $wifiLabel,
            'v_bat'           => $vBat,
            'compensated_v25' => $pred['compensated_v25'],
            'soc_percent'     => $pred['soc_percent'],
            'rtc_temp_c'      => $rtcTempC,
            'thermal_factor'  => $pred['thermal_factor'],
            'sleep_ua'        => $sleepUa,
            'slope_v_day'     => $pred['slope_v_day'],
            'forecast'        => $forecastText,
            'dtc_can'         => $dtcCanText,
            'pdi_verdict'     => $pdiVerdict,
            'pdi_tone'        => $pdiTone,
            'has_log'         => $hasLog,
        ];
    }

    // 4. Fetch chronological telemetry logs for Sheet 2 (supports period BETWEEN & RAW / HOURLY / DAILY_SUMMARY)
    $logWhere = [];
    $logParams = [];
    if (!$isAll) {
        $placeholders = implode(', ', array_fill(0, count($selectedIds), '?'));
        $logWhere[] = "l.`unit_id` IN ({$placeholders})";
        foreach ($selectedIds as $uid) {
            $logParams[] = [$uid, PDO::PARAM_STR];
        }
    }
    if ($startDt !== null && $endDt !== null) {
        $logWhere[] = "l.`created_at` BETWEEN ? AND ?";
        $logParams[] = [$startDt, PDO::PARAM_STR];
        $logParams[] = [$endDt, PDO::PARAM_STR];
    }
    $logWhereSql = empty($logWhere) ? '' : ('WHERE ' . implode(' AND ', $logWhere));

    if ($resolution === 'HOURLY' || $resolution === 'DAILY_SUMMARY') {
        $bucketExpr = $resolution === 'HOURLY'
            ? "DATE_FORMAT(l.`created_at`, '%Y-%m-%d %H:00:00')"
            : "DATE_FORMAT(l.`created_at`, '%Y-%m-%d')";

        $logSql = "
            SELECT
                l.`unit_id`,
                {$bucketExpr} AS `created_at`,
                MAX(l.`ts_epoch`) AS `ts_epoch`,
                MAX(l.`seq`) AS `seq`,
                MAX(l.`boot`) AS `boot`,
                ROUND(AVG(l.`v_bat`), 2) AS `v_bat`,
                ROUND(AVG(l.`adc_raw_mv`)) AS `adc_raw_mv`,
                ROUND(AVG(l.`rtc_temp_c`), 1) AS `rtc_temp_c`,
                ROUND(AVG(l.`shunt_sleep_ua`)) AS `shunt_sleep_ua`,
                MAX(l.`engine_on`) AS `engine_on`,
                MAX(l.`crit_alert`) AS `crit_alert`,
                ROUND(AVG(CASE WHEN l.`rpm` >= 0 THEN l.`rpm` ELSE 0 END)) AS `rpm`,
                ROUND(AVG(CASE WHEN l.`temp_c` > -40 THEN l.`temp_c` ELSE 0 END)) AS `temp_c`,
                MAX(l.`dtc_cnt`) AS `dtc_cnt`,
                COALESCE(NULLIF(MAX(NULLIF(l.`dtc`, 'NONE')), ''), 'NONE') AS `dtc`,
                ROUND(AVG(l.`rssi`)) AS `rssi`,
                MAX(l.`sleep_cfg`) AS `sleep_cfg`,
                MAX(COALESCE(l.`buffer_used`, v.`buffer_used`, 0)) AS `resolved_buffer_used`,
                MIN(COALESCE(l.`can_ok`, 1)) AS `can_ok`,
                MAX(COALESCE(l.`net_zone`, 'YARD')) AS `net_zone`,
                MAX(COALESCE(l.`sync_ssid`, '')) AS `sync_ssid`,
                ROUND(AVG(l.`active_ms`)) AS `active_ms`,
                ROUND(MAX(l.`daily_mah`), 2) AS `daily_mah`,
                MAX(COALESCE(l.`speed_kmh`, 0)) AS `speed_kmh`,
                ROUND(AVG(COALESCE(l.`iat_c`, 0))) AS `iat_c`,
                ROUND(AVG(COALESCE(l.`map_kpa`, 0))) AS `map_kpa`,
                ROUND(AVG(COALESCE(l.`load_pct`, 0)), 1) AS `load_pct`,
                ROUND(AVG(COALESCE(l.`tps_pct`, 0)), 1) AS `tps_pct`,
                ROUND(AVG(COALESCE(l.`ign_deg`, 0)), 1) AS `ign_deg`,
                ROUND(AVG(COALESCE(l.`maf_gs`, 0)), 2) AS `maf_gs`,
                MAX(COALESCE(l.`run_time_s`, 0)) AS `run_time_s`,
                ROUND(AVG(COALESCE(l.`fuel_pct`, 0)), 1) AS `fuel_pct`,
                ROUND(AVG(COALESCE(l.`fuel_rate_lh`, 0)), 2) AS `fuel_rate_lh`,
                ROUND(AVG(COALESCE(l.`o2_v`, 0)), 2) AS `o2_v`,
                ROUND(AVG(COALESCE(l.`stft_pct`, 0)), 1) AS `stft_pct`,
                MAX(COALESCE(l.`mil_on`, 0)) AS `mil_on`,
                ROUND(AVG(COALESCE(l.`ecu_v`, 0)), 2) AS `ecu_v`,
                MAX(COALESCE(l.`dist_clr_km`, 0)) AS `dist_clr_km`
            FROM `telemetry_logs` l
            LEFT JOIN `vehicles` v ON v.`unit_id` = l.`unit_id`
            {$logWhereSql}
            GROUP BY l.`unit_id`, {$bucketExpr}
            ORDER BY MAX(l.`id`) DESC
            LIMIT ?
        ";
    } else {
        $logSql = "
            SELECT l.*, COALESCE(l.`buffer_used`, v.`buffer_used`, 0) AS `resolved_buffer_used`
            FROM `telemetry_logs` l
            LEFT JOIN `vehicles` v ON v.`unit_id` = l.`unit_id`
            {$logWhereSql}
            ORDER BY l.`id` DESC
            LIMIT ?
        ";
    }

    $stmtLogs = $pdo->prepare($logSql);
    $pos = 1;
    foreach ($logParams as $p) {
        $stmtLogs->bindValue($pos++, $p[0], $p[1]);
    }
    $stmtLogs->bindValue($pos, $limit, PDO::PARAM_INT);
    $stmtLogs->execute();
    $logRows = $stmtLogs->fetchAll();

    // 5. Fetch maintenance_tickets & system_events for Sheet 3 (respects unit & time window filter)
    $ticketRows = [];
    try {
        $tkWhere = [];
        $tkParams = [];
        if (!$isAll) {
            $placeholders = implode(', ', array_fill(0, count($selectedIds), '?'));
            $tkWhere[] = "`unit_id` IN ({$placeholders})";
            foreach ($selectedIds as $uid) {
                $tkParams[] = [$uid, PDO::PARAM_STR];
            }
        }
        if ($startDt !== null && $endDt !== null) {
            $tkWhere[] = "`updated_at` BETWEEN ? AND ?";
            $tkParams[] = [$startDt, PDO::PARAM_STR];
            $tkParams[] = [$endDt, PDO::PARAM_STR];
        }
        $tkWhereSql = empty($tkWhere) ? '' : ('WHERE ' . implode(' AND ', $tkWhere));
        $stmtTk = $pdo->prepare("SELECT * FROM `maintenance_tickets` {$tkWhereSql} ORDER BY `id` DESC LIMIT 500");
        $pos = 1;
        foreach ($tkParams as $p) {
            $stmtTk->bindValue($pos++, $p[0], $p[1]);
        }
        $stmtTk->execute();
        $ticketRows = $stmtTk->fetchAll();
    } catch (Exception $ignored) {
        $ticketRows = [];
    }

    $auditRows = [];
    try {
        $audWhere = [];
        $audParams = [];
        if (!$isAll) {
            $placeholders = implode(', ', array_fill(0, count($selectedIds), '?'));
            $audWhere[] = "`unit_id` IN ({$placeholders})";
            foreach ($selectedIds as $uid) {
                $audParams[] = [$uid, PDO::PARAM_STR];
            }
        }
        if ($startDt !== null && $endDt !== null) {
            $audWhere[] = "`created_at` BETWEEN ? AND ?";
            $audParams[] = [$startDt, PDO::PARAM_STR];
            $audParams[] = [$endDt, PDO::PARAM_STR];
        }
        $audWhereSql = empty($audWhere) ? '' : ('WHERE ' . implode(' AND ', $audWhere));
        $stmtAud = $pdo->prepare("SELECT * FROM `system_events` {$audWhereSql} ORDER BY `id` DESC LIMIT 500");
        $pos = 1;
        foreach ($audParams as $p) {
            $stmtAud->bindValue($pos++, $p[0], $p[1]);
        }
        $stmtAud->execute();
        $auditRows = $stmtAud->fetchAll();
    } catch (Exception $ignored) {
        $auditRows = [];
    }

    $sheet3Records = [];
    foreach ($ticketRows as $tk) {
        $st = strtoupper((string)$tk['status']);
        $prio = $st === 'OPEN' ? 'HIGH' : ($st === 'IN_PROGRESS' ? 'MEDIUM' : 'NORMAL');
        $note = trim((string)($tk['handover_note'] ?? ''));
        $detail = (string)$tk['issue_summary'] . ($note !== '' ? ' | Handover: ' . $note : '');
        $sheet3Records[] = [
            'category' => 'TIKET',
            'ref_id'   => (string)$tk['ticket_code'],
            'time'     => (string)$tk['updated_at'],
            'unit_id'  => (string)$tk['unit_id'],
            'bay'      => (string)$tk['bay'],
            'priority' => $prio,
            'status'   => $st,
            'actor'    => !empty($tk['assigned_to']) ? (string)$tk['assigned_to'] : 'Unassigned',
            'detail'   => $detail,
            'tone'     => $st === 'OPEN' ? 'crit' : ($st === 'IN_PROGRESS' ? 'warn' : 'pass'),
        ];
    }
    foreach ($auditRows as $ev) {
        $sev = strtoupper((string)$ev['severity']);
        $uid = (string)$ev['unit_id'];
        $sheet3Records[] = [
            'category' => 'AUDIT',
            'ref_id'   => 'EVT-' . str_pad((string)$ev['id'], 4, '0', STR_PAD_LEFT),
            'time'     => (string)$ev['created_at'],
            'unit_id'  => $uid,
            'bay'      => $bayMap[$uid] ?? '-',
            'priority' => $sev,
            'status'   => (string)$ev['event_type'],
            'actor'    => 'ORION System / Operator',
            'detail'   => (string)$ev['message'],
            'tone'     => $sev === 'CRITICAL' ? 'crit' : ($sev === 'WARN' ? 'warn' : 'pass'),
        ];
    }

    // 6. Emit 3-Sheet SpreadsheetML XML Workbook
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<?mso-application progid="Excel.Sheet"?>' . "\n";
    echo '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' . "\n";
    echo ' xmlns:o="urn:schemas-microsoft-com:office:office"' . "\n";
    echo ' xmlns:x="urn:schemas-microsoft-com:office:excel"' . "\n";
    echo ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"' . "\n";
    echo ' xmlns:html="http://www.w3.org/TR/REC-html40">' . "\n";
    echo ' <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">' . "\n";
    echo '  <Title>ORION Telemetry &amp; PDI Health Workbook</Title>' . "\n";
    echo '  <Author>ORION Stock Yard Telemetry</Author>' . "\n";
    echo '  <Created>' . escXml(date('Y-m-d\TH:i:s\Z')) . '</Created>' . "\n";
    echo ' </DocumentProperties>' . "\n";
    echo ' <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">' . "\n";
    echo '  <ProtectStructure>False</ProtectStructure>' . "\n";
    echo '  <ProtectWindows>False</ProtectWindows>' . "\n";
    echo ' </ExcelWorkbook>' . "\n";

    // Styles (Anti-Slop Industrial Slate Palette)
    echo ' <Styles>' . "\n";
    echo '  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Borders/><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/><Interior/><NumberFormat/><Protection/></Style>' . "\n";
    echo '  <Style ss:ID="BannerTitle"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F172A" ss:Pattern="Solid"/></Style>' . "\n";
    echo '  <Style ss:ID="BannerMeta"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#334155"/><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>' . "\n";
    echo '  <Style ss:ID="SectionHdr"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style>' . "\n";
    echo '  <Style ss:ID="TblHdr"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E293B" ss:Pattern="Solid"/></Style>' . "\n";
    echo '  <Style ss:ID="DataText"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#0F172A"/></Style>' . "\n";
    echo '  <Style ss:ID="DataCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#0F172A"/></Style>' . "\n";
    echo '  <Style ss:ID="DataNum"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0"/></Style>' . "\n";
    echo '  <Style ss:ID="DataDec1"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.0"/></Style>' . "\n";
    echo '  <Style ss:ID="DataDec2"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.00"/></Style>' . "\n";
    echo '  <Style ss:ID="DataDec3"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.000"/></Style>' . "\n";
    echo '  <Style ss:ID="DataDec6"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Consolas" ss:Size="9.5" ss:Color="#0F172A"/><NumberFormat ss:Format="0.000000"/></Style>' . "\n";
    echo '  <Style ss:ID="StatusPass"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#166534"/><Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/></Style>' . "\n";
    echo '  <Style ss:ID="StatusWarn"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#92400E"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style>' . "\n";
    echo '  <Style ss:ID="StatusCrit"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Bold="1" ss:Color="#991B1B"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style>' . "\n";
    echo '  <Style ss:ID="StatusMuted"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Calibri" ss:Size="9.5" ss:Color="#475569"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/></Style>' . "\n";
    echo ' </Styles>' . "\n";

    // =========================================================================
    // WORKSHEET 1: 1_Ringkasan_PDI_Armada (16 Columns)
    // =========================================================================
    $s1ColWidths = [68, 130, 148, 135, 135, 132, 90, 102, 85, 80, 96, 88, 105, 168, 132, 178];
    $s1Headers = [
        'Lokasi Bay',
        'Unit ID',
        'Model & Trim',
        'Status Koneksi',
        'Sinkronisasi Terakhir (WIB)',
        'Zona & SSID Wi-Fi',
        'V_Bat Aktual (V)',
        'V_OCV Komp 25C (V)',
        'Estimasi SOC (%)',
        'Suhu RTC (C)',
        'Faktor Arrhenius (x)',
        'Arus Sleep (uA)',
        'Laju Kuras OLS (V/Hari)',
        'Estimasi Habis / TTC',
        'Status DTC & CAN',
        'Keputusan PDI',
    ];
    $s1RowCount = 4 + max(1, count($summaryRows));

    echo ' <Worksheet ss:Name="1_Ringkasan_PDI_Armada">' . "\n";
    echo '  <Table ss:ExpandedColumnCount="16" ss:ExpandedRowCount="' . $s1RowCount . '" x:FullColumns="1" x:FullRows="1">' . "\n";
    foreach ($s1ColWidths as $w) {
        echo '   <Column ss:AutoFitWidth="0" ss:Width="' . $w . '"/>' . "\n";
    }
    echo '   <Row ss:Height="26"><Cell ss:MergeAcross="15" ss:StyleID="BannerTitle"><Data ss:Type="String">ORION TELEMETRI &amp; DIGITAL TWIN DIPO STOCK YARD - LAPORAN EKSEKUTIF PDI &amp; KESEHATAN BATERAI</Data></Cell></Row>' . "\n";
    echo '   <Row ss:Height="20"><Cell ss:MergeAcross="15" ss:StyleID="BannerMeta"><Data ss:Type="String">'
        . escXml("Waktu Ekspor (WIB): {$dateHuman} | Cakupan Filter: {$unitFilterLabel} | Periode: {$periodLabel} | Resolusi: {$resolutionLabel} | Total Unit: " . count($summaryRows))
        . '</Data></Cell></Row>' . "\n";
    echo '   <Row ss:Height="20"><Cell ss:MergeAcross="15" ss:StyleID="SectionHdr"><Data ss:Type="String">1. Ringkasan Eksekutif Kesehatan Baterai, Kompensasi Termal 25C, &amp; Kesiapan PDI Armada</Data></Cell></Row>' . "\n";

    echo '   <Row ss:Height="26">' . "\n";
    foreach ($s1Headers as $hdr) {
        echo '    ' . xmlCellString($hdr, 'TblHdr') . "\n";
    }
    echo '   </Row>' . "\n";

    if (empty($summaryRows)) {
        echo '   <Row ss:Height="20">';
        echo xmlCellString('-', 'DataCenter');
        echo xmlCellString('TIDAK ADA UNIT TERDAFTAR', 'StatusMuted');
        for ($i = 2; $i < 16; $i++) {
            echo xmlCellString('-', 'DataCenter');
        }
        echo '</Row>' . "\n";
    } else {
        foreach ($summaryRows as $s) {
            $connStyle = $s['is_online'] ? 'StatusPass' : 'StatusMuted';
            $pdiStyle = $s['pdi_tone'] === 'crit' ? 'StatusCrit' : ($s['pdi_tone'] === 'warn' ? 'StatusWarn' : 'StatusPass');
            $dtcStyle = (strpos($s['dtc_can'], 'FAULT') !== false || ($s['has_log'] && strpos($s['dtc_can'], 'NONE') !== 0))
                ? 'StatusCrit'
                : ($s['has_log'] ? 'StatusPass' : 'StatusMuted');

            echo '   <Row ss:Height="20">' . "\n";
            echo '    ' . xmlCellString($s['bay'], 'DataCenter') . "\n";
            echo '    ' . xmlCellString($s['unit_id'], 'DataText') . "\n";
            echo '    ' . xmlCellString($s['model_trim'], 'DataText') . "\n";
            echo '    ' . xmlCellString($s['connection'], $connStyle) . "\n";
            echo '    ' . xmlCellString($s['last_seen'], 'DataCenter') . "\n";
            echo '    ' . xmlCellString($s['wifi_label'], 'DataText') . "\n";
            echo '    ' . xmlCellNumber($s['v_bat'], 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber($s['compensated_v25'], 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)$s['soc_percent'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber($s['rtc_temp_c'], 'DataDec1', 1) . "\n";
            echo '    ' . xmlCellNumber($s['thermal_factor'], 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)$s['sleep_ua'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber($s['slope_v_day'], 'DataDec3', 3) . "\n";
            echo '    ' . xmlCellString($s['forecast'], $pdiStyle) . "\n";
            echo '    ' . xmlCellString($s['dtc_can'], $dtcStyle) . "\n";
            echo '    ' . xmlCellString($s['pdi_verdict'], $pdiStyle) . "\n";
            echo '   </Row>' . "\n";
        }
    }
    echo '  </Table>' . "\n";
    echo '  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' . "\n";
    echo '   <Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>' . "\n";
    echo '  </WorksheetOptions>' . "\n";
    echo '  <AutoFilter x:Range="R4C1:R' . $s1RowCount . 'C16" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>' . "\n";
    echo ' </Worksheet>' . "\n";

    // =========================================================================
    // WORKSHEET 2: 2_Log_Telemetri_OBD (41 Columns)
    // =========================================================================
    $s2Headers = [
        'No', 'Timestamp (WIB)', 'Epoch (s)', 'Unit ID', 'Seq #', 'Boot #',
        'V_Bat (V)', 'ADC Raw (mV)', 'Slope (m)', 'Offset (c)', 'RTC Temp (C)', 'Sleep Current (uA)',
        'Engine Status', 'Crit Alert', 'RPM', 'Coolant (C)', 'DTC Count', 'Active DTC',
        'RSSI (dBm)', 'Sleep Config', 'Buffer Used', 'CAN Health', 'Net Zone', 'Sync SSID',
        'Active (ms)', 'Daily (mAh)', 'Speed (km/h)', 'IAT (C)', 'MAP (kPa)', 'Load (%)',
        'TPS (%)', 'Ign Timing (deg)', 'MAF (g/s)', 'Run Time (s)', 'Fuel Level (%)', 'Fuel Rate (L/h)',
        'O2 Sensor (V)', 'STFT (%)', 'MIL Status', 'ECU Voltage (V)', 'Dist Clr (km)',
    ];
    $s2RowCount = 4 + max(1, count($logRows));

    echo ' <Worksheet ss:Name="2_Log_Telemetri_OBD">' . "\n";
    echo '  <Table ss:ExpandedColumnCount="41" ss:ExpandedRowCount="' . $s2RowCount . '" x:FullColumns="1" x:FullRows="1">' . "\n";
    foreach ($s2Headers as $idx => $hdr) {
        $colWidth = ($idx === 1 || $idx === 3) ? 132 : (($idx === 12 || $idx === 23) ? 116 : 82);
        echo '   <Column ss:AutoFitWidth="0" ss:Width="' . $colWidth . '"/>' . "\n";
    }
    echo '   <Row ss:Height="26"><Cell ss:MergeAcross="40" ss:StyleID="BannerTitle"><Data ss:Type="String">ORION TELEMETRI - LOG KRONOLOGIS WAKE-CYCLE &amp; 15 PARAMETER OBD-II (READ-ONLY MODE 01/03)</Data></Cell></Row>' . "\n";
    echo '   <Row ss:Height="20"><Cell ss:MergeAcross="40" ss:StyleID="BannerMeta"><Data ss:Type="String">'
        . escXml("Waktu Ekspor (WIB): {$dateHuman} | Cakupan Filter: {$unitFilterLabel} | Periode: {$periodLabel} | Resolusi: {$resolutionLabel} | Jumlah Baris Log: " . count($logRows))
        . '</Data></Cell></Row>' . "\n";
    echo '   <Row ss:Height="20"><Cell ss:MergeAcross="40" ss:StyleID="SectionHdr"><Data ss:Type="String">2. Log Kronologis Siklus Bangun Telemetri &amp; Parameter ECU OBD-II Mode 01/03</Data></Cell></Row>' . "\n";

    echo '   <Row ss:Height="26">' . "\n";
    foreach ($s2Headers as $hdr) {
        echo '    ' . xmlCellString($hdr, 'TblHdr') . "\n";
    }
    echo '   </Row>' . "\n";

    if (empty($logRows)) {
        echo '   <Row ss:Height="20">';
        echo xmlCellNumber(0, 'DataNum', 0);
        echo xmlCellString('BELUM ADA LOG TELEMETRI TERCATAT DI DATABASE', 'StatusMuted');
        for ($i = 2; $i < 41; $i++) {
            echo xmlCellString('-', 'DataCenter');
        }
        echo '</Row>' . "\n";
    } else {
        foreach ($logRows as $idx => $r) {
            $uid = (string)$r['unit_id'];
            $critV = isset($configs[$uid]) ? (float)$configs[$uid]['crit_v'] : 11.80;
            $calSlope = isset($configs[$uid]) ? (float)$configs[$uid]['cal_slope'] : 0.005412;
            $calOffset = isset($configs[$uid]) ? (float)$configs[$uid]['cal_offset'] : 0.069;

            $isCrit = ((int)$r['crit_alert'] === 1) || ((float)$r['v_bat'] < $critV);
            $isEngineOn = ((int)$r['engine_on'] === 1);
            $engStatus = $isEngineOn ? 'RUNNING (WARM-UP)' : 'STANDBY (SLEEP)';
            $canOk = isset($r['can_ok']) ? ((int)$r['can_ok'] === 1) : true;
            $milOn = !empty($r['mil_on']);

            echo '   <Row ss:Height="19">' . "\n";
            echo '    ' . xmlCellNumber((float)($idx + 1), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellString((string)$r['created_at'], 'DataCenter') . "\n";
            echo '    ' . xmlCellNumber((float)($r['ts_epoch'] ?? 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellString($uid, $isCrit ? 'StatusCrit' : 'DataText') . "\n";
            echo '    ' . xmlCellNumber((float)$r['seq'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)$r['boot'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)$r['v_bat'], $isCrit ? 'StatusCrit' : 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)$r['adc_raw_mv'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber($calSlope, 'DataDec6', 6) . "\n";
            echo '    ' . xmlCellNumber($calOffset, 'DataDec3', 3) . "\n";
            echo '    ' . xmlCellNumber((float)$r['rtc_temp_c'], 'DataDec1', 1) . "\n";
            echo '    ' . xmlCellNumber((float)$r['shunt_sleep_ua'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellString($engStatus, $isEngineOn ? 'StatusPass' : 'DataCenter') . "\n";
            echo '    ' . xmlCellString($isCrit ? 'CRITICAL' : 'NORMAL', $isCrit ? 'StatusCrit' : 'DataCenter') . "\n";
            echo '    ' . xmlCellNumber((float)($isEngineOn ? max(0, (int)($r['rpm'] ?? 0)) : 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)($isEngineOn && (int)($r['temp_c'] ?? -99) > -40 ? (int)$r['temp_c'] : 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)($r['dtc_cnt'] ?? 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellString((string)($r['dtc'] ?? 'NONE'), ((string)($r['dtc'] ?? 'NONE') !== 'NONE' && (string)$r['dtc'] !== '') ? 'StatusCrit' : 'DataCenter') . "\n";
            echo '    ' . xmlCellNumber((float)$r['rssi'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)$r['sleep_cfg'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)($r['resolved_buffer_used'] ?? 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellString($canOk ? 'OK (TWAI 500k)' : 'CAN FAULT', $canOk ? 'StatusPass' : 'StatusCrit') . "\n";
            echo '    ' . xmlCellString((string)($r['net_zone'] ?? 'YARD'), 'DataCenter') . "\n";
            echo '    ' . xmlCellString((string)($r['sync_ssid'] ?? ''), 'DataText') . "\n";
            echo '    ' . xmlCellNumber((float)$r['active_ms'], 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)$r['daily_mah'], 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)($r['speed_kmh'] ?? 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)($r['iat_c'] ?? 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)($r['map_kpa'] ?? 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)($r['load_pct'] ?? 0), 'DataDec1', 1) . "\n";
            echo '    ' . xmlCellNumber((float)($r['tps_pct'] ?? 0), 'DataDec1', 1) . "\n";
            echo '    ' . xmlCellNumber((float)($r['ign_deg'] ?? 0), 'DataDec1', 1) . "\n";
            echo '    ' . xmlCellNumber((float)($r['maf_gs'] ?? 0), 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)($r['run_time_s'] ?? 0), 'DataNum', 0) . "\n";
            echo '    ' . xmlCellNumber((float)($r['fuel_pct'] ?? 0), 'DataDec1', 1) . "\n";
            echo '    ' . xmlCellNumber((float)($r['fuel_rate_lh'] ?? 0), 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)($r['o2_v'] ?? 0), 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)($r['stft_pct'] ?? 0), 'DataDec1', 1) . "\n";
            echo '    ' . xmlCellString($milOn ? 'MIL ON' : 'OFF', $milOn ? 'StatusCrit' : 'DataCenter') . "\n";
            echo '    ' . xmlCellNumber((float)($r['ecu_v'] ?? 0), 'DataDec2', 2) . "\n";
            echo '    ' . xmlCellNumber((float)($r['dist_clr_km'] ?? 0), 'DataNum', 0) . "\n";
            echo '   </Row>' . "\n";
        }
    }
    echo '  </Table>' . "\n";
    echo '  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' . "\n";
    echo '   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>' . "\n";
    echo '  </WorksheetOptions>' . "\n";
    echo '  <AutoFilter x:Range="R4C1:R' . $s2RowCount . 'C41" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>' . "\n";
    echo ' </Worksheet>' . "\n";

    // =========================================================================
    // WORKSHEET 3: 3_Tiket_dan_Audit_Log (9 Columns)
    // =========================================================================
    $s3ColWidths = [96, 96, 132, 132, 76, 98, 128, 145, 360];
    $s3Headers = [
        'Kategori Rekaman',
        'ID Referensi',
        'Waktu Kejadian (WIB)',
        'Unit ID',
        'Lokasi Bay',
        'Prioritas / Severity',
        'Status',
        'Teknisi / Aktor',
        'Rincian Tindakan & Catatan Diagnostik',
    ];
    $s3RowCount = 4 + max(1, count($sheet3Records));

    echo ' <Worksheet ss:Name="3_Tiket_dan_Audit_Log">' . "\n";
    echo '  <Table ss:ExpandedColumnCount="9" ss:ExpandedRowCount="' . $s3RowCount . '" x:FullColumns="1" x:FullRows="1">' . "\n";
    foreach ($s3ColWidths as $w) {
        echo '   <Column ss:AutoFitWidth="0" ss:Width="' . $w . '"/>' . "\n";
    }
    echo '   <Row ss:Height="26"><Cell ss:MergeAcross="8" ss:StyleID="BannerTitle"><Data ss:Type="String">ORION TELEMETRI - REKAMAN TIKET PEMELIHARAAN &amp; JEJAK AUDIT OPERASIONAL</Data></Cell></Row>' . "\n";
    echo '   <Row ss:Height="20"><Cell ss:MergeAcross="8" ss:StyleID="BannerMeta"><Data ss:Type="String">'
        . escXml("Waktu Ekspor (WIB): {$dateHuman} | Cakupan Filter: {$unitFilterLabel} | Periode: {$periodLabel} | Resolusi: {$resolutionLabel} | Total Rekaman: " . count($sheet3Records))
        . '</Data></Cell></Row>' . "\n";
    echo '   <Row ss:Height="20"><Cell ss:MergeAcross="8" ss:StyleID="SectionHdr"><Data ss:Type="String">3. Rekaman Tiket Pemeliharaan (Shift Handover) &amp; Log Audit Operasional</Data></Cell></Row>' . "\n";

    echo '   <Row ss:Height="26">' . "\n";
    foreach ($s3Headers as $hdr) {
        echo '    ' . xmlCellString($hdr, 'TblHdr') . "\n";
    }
    echo '   </Row>' . "\n";

    if (empty($sheet3Records)) {
        echo '   <Row ss:Height="20">' . "\n";
        echo '    ' . xmlCellString('INFO', 'StatusMuted') . "\n";
        echo '    ' . xmlCellString('-', 'DataCenter') . "\n";
        echo '    ' . xmlCellString($dateHuman, 'DataCenter') . "\n";
        echo '    ' . xmlCellString('-', 'DataCenter') . "\n";
        echo '    ' . xmlCellString('-', 'DataCenter') . "\n";
        echo '    ' . xmlCellString('INFO', 'StatusMuted') . "\n";
        echo '    ' . xmlCellString('KOSONG', 'StatusMuted') . "\n";
        echo '    ' . xmlCellString('ORION System', 'DataText') . "\n";
        echo '    ' . xmlCellString('BELUM ADA TIKET / LOG AUDIT TERCATAT DI DATABASE', 'DataText') . "\n";
        echo '   </Row>' . "\n";
    } else {
        foreach ($sheet3Records as $rec) {
            $toneStyle = $rec['tone'] === 'crit' ? 'StatusCrit' : ($rec['tone'] === 'warn' ? 'StatusWarn' : 'StatusPass');
            echo '   <Row ss:Height="20">' . "\n";
            echo '    ' . xmlCellString($rec['category'], 'DataCenter') . "\n";
            echo '    ' . xmlCellString($rec['ref_id'], 'DataCenter') . "\n";
            echo '    ' . xmlCellString($rec['time'], 'DataCenter') . "\n";
            echo '    ' . xmlCellString($rec['unit_id'], 'DataText') . "\n";
            echo '    ' . xmlCellString($rec['bay'], 'DataCenter') . "\n";
            echo '    ' . xmlCellString($rec['priority'], $toneStyle) . "\n";
            echo '    ' . xmlCellString($rec['status'], $toneStyle) . "\n";
            echo '    ' . xmlCellString($rec['actor'], 'DataText') . "\n";
            echo '    ' . xmlCellString($rec['detail'], 'DataText') . "\n";
            echo '   </Row>' . "\n";
        }
    }
    echo '  </Table>' . "\n";
    echo '  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' . "\n";
    echo '   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane>' . "\n";
    echo '  </WorksheetOptions>' . "\n";
    echo '  <AutoFilter x:Range="R4C1:R' . $s3RowCount . 'C9" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>' . "\n";
    echo ' </Worksheet>' . "\n";
    echo '</Workbook>' . "\n";
    exit(0);
} catch (Exception $e) {
    sendJson([
        'error' => 'EXCEL_EXPORT_ERROR',
        'message' => $e->getMessage(),
    ], 500);
}
