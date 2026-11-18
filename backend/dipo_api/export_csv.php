<?php
/**
 * ORION Telemetry System - Configurable CSV Log Exporter (GET)
 * Endpoint: http://localhost/dipo_api/export_csv.php?unit_id=ALL&period=DAILY&date=2026-11-18&resolution=RAW&limit=0
 *
 * Exports telemetry_logs rows directly from MySQL in standard RFC 4180 CSV format (39 columns)
 * with support for period filtering (DAILY, 7_DAYS, MONTHLY, YEARLY, CUSTOM, ALL_TIME)
 * and aggregation resolution (RAW, HOURLY, DAILY_SUMMARY).
 */

/** @var PDO $pdo */
$pdo = require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(['error' => 'METHOD_NOT_ALLOWED', 'message' => 'Use GET method.'], 405);
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
        $unitIdForFile = 'ALL_FLEET';
    } elseif (count($selectedIds) === 1) {
        $unitIdForFile = $selectedIds[0];
    } else {
        $unitIdForFile = 'FILTERED_' . count($selectedIds) . 'UNITS';
    }

    // Period & Resolution parameters (Asia/Jakarta WIB set in db.php)
    $rawPeriod = strtoupper(trim((string)($_GET['period'] ?? 'ALL_TIME')));
    $allowedPeriods = ['DAILY', '7_DAYS', 'MONTHLY', 'YEARLY', 'CUSTOM', 'ALL_TIME'];
    $period = in_array($rawPeriod, $allowedPeriods, true) ? $rawPeriod : 'ALL_TIME';

    $rawResolution = strtoupper(trim((string)($_GET['resolution'] ?? 'RAW')));
    $allowedRes = ['RAW', 'HOURLY', 'DAILY_SUMMARY'];
    $resolution = in_array($rawResolution, $allowedRes, true) ? $rawResolution : 'RAW';

    $startDt = null;
    $endDt = null;
    $fileSlug = 'ALL_TIME';

    if ($period === 'DAILY') {
        $rawDate = trim((string)($_GET['date'] ?? ''));
        $d = preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawDate) ? $rawDate : date('Y-m-d');
        $startDt = "{$d} 00:00:00";
        $endDt = "{$d} 23:59:59";
        $fileSlug = "HARIAN_{$d}";
    } elseif ($period === '7_DAYS') {
        $startD = date('Y-m-d', strtotime('-6 days'));
        $endD = date('Y-m-d');
        $startDt = "{$startD} 00:00:00";
        $endDt = "{$endD} 23:59:59";
        $fileSlug = "7HARI_{$endD}";
    } elseif ($period === 'MONTHLY') {
        $rawMonth = trim((string)($_GET['month'] ?? ''));
        $ym = preg_match('/^\d{4}-\d{2}$/', $rawMonth) ? $rawMonth : date('Y-m');
        $lastDay = date('Y-m-t', strtotime("{$ym}-01"));
        $startDt = "{$ym}-01 00:00:00";
        $endDt = "{$lastDay} 23:59:59";
        $fileSlug = "BULANAN_{$ym}";
    } elseif ($period === 'YEARLY') {
        $rawYear = trim((string)($_GET['year'] ?? ''));
        $y = preg_match('/^\d{4}$/', $rawYear) ? $rawYear : date('Y');
        $startDt = "{$y}-01-01 00:00:00";
        $endDt = "{$y}-12-31 23:59:59";
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
        $fileSlug = "RENTANG_{$s}_{$e}";
    }

    $rawLimit = isset($_GET['limit']) ? (int)$_GET['limit'] : 0;
    if ($rawLimit <= 0) {
        $limit = ($period !== 'ALL_TIME') ? 50000 : 10000;
    } else {
        $limit = max(1, min(50000, $rawLimit));
    }

    $date = date('Ymd_His');
    $filename = "ORION_TELEMETRY_{$unitIdForFile}_{$fileSlug}_{$date}.csv";

    header("Content-Type: text/csv; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"{$filename}\"");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Pragma: no-cache");

    $columns = [
        'id',
        'unit_id',
        'seq',
        'boot',
        'ts_epoch',
        'created_at',
        'v_bat',
        'adc_raw_mv',
        'rtc_temp_c',
        'shunt_sleep_ua',
        'engine_on',
        'crit_alert',
        'rpm',
        'temp_c',
        'dtc_cnt',
        'dtc',
        'rssi',
        'sleep_cfg',
        'buffer_used',
        'can_ok',
        'net_zone',
        'sync_ssid',
        'active_ms',
        'daily_mah',
        'speed_kmh',
        'iat_c',
        'map_kpa',
        'load_pct',
        'tps_pct',
        'ign_deg',
        'maf_gs',
        'run_time_s',
        'fuel_pct',
        'fuel_rate_lh',
        'o2_v',
        'stft_pct',
        'mil_on',
        'ecu_v',
        'dist_clr_km',
    ];

    $whereClauses = [];
    $params = [];
    if (!$isAll) {
        $placeholders = implode(', ', array_fill(0, count($selectedIds), '?'));
        $whereClauses[] = "`unit_id` IN ({$placeholders})";
        foreach ($selectedIds as $uid) {
            $params[] = [$uid, PDO::PARAM_STR];
        }
    }
    if ($startDt !== null && $endDt !== null) {
        $whereClauses[] = "`created_at` BETWEEN ? AND ?";
        $params[] = [$startDt, PDO::PARAM_STR];
        $params[] = [$endDt, PDO::PARAM_STR];
    }
    $whereSql = empty($whereClauses) ? '' : ('WHERE ' . implode(' AND ', $whereClauses));

    if ($resolution === 'HOURLY' || $resolution === 'DAILY_SUMMARY') {
        $bucketExpr = $resolution === 'HOURLY'
            ? "DATE_FORMAT(`created_at`, '%Y-%m-%d %H:00:00')"
            : "DATE_FORMAT(`created_at`, '%Y-%m-%d')";

        $sql = "
            SELECT
                MAX(`id`) AS `id`,
                `unit_id`,
                MAX(`seq`) AS `seq`,
                MAX(`boot`) AS `boot`,
                MAX(`ts_epoch`) AS `ts_epoch`,
                {$bucketExpr} AS `created_at`,
                ROUND(AVG(`v_bat`), 2) AS `v_bat`,
                ROUND(AVG(`adc_raw_mv`)) AS `adc_raw_mv`,
                ROUND(AVG(`rtc_temp_c`), 1) AS `rtc_temp_c`,
                ROUND(AVG(`shunt_sleep_ua`)) AS `shunt_sleep_ua`,
                MAX(`engine_on`) AS `engine_on`,
                MAX(`crit_alert`) AS `crit_alert`,
                ROUND(AVG(CASE WHEN `rpm` >= 0 THEN `rpm` ELSE 0 END)) AS `rpm`,
                ROUND(AVG(CASE WHEN `temp_c` > -40 THEN `temp_c` ELSE 0 END)) AS `temp_c`,
                MAX(`dtc_cnt`) AS `dtc_cnt`,
                COALESCE(NULLIF(MAX(NULLIF(`dtc`, 'NONE')), ''), 'NONE') AS `dtc`,
                ROUND(AVG(`rssi`)) AS `rssi`,
                MAX(`sleep_cfg`) AS `sleep_cfg`,
                MAX(`buffer_used`) AS `buffer_used`,
                MIN(COALESCE(`can_ok`, 1)) AS `can_ok`,
                MAX(COALESCE(`net_zone`, 'YARD')) AS `net_zone`,
                MAX(COALESCE(`sync_ssid`, '')) AS `sync_ssid`,
                ROUND(AVG(`active_ms`)) AS `active_ms`,
                ROUND(MAX(`daily_mah`), 2) AS `daily_mah`,
                MAX(COALESCE(`speed_kmh`, 0)) AS `speed_kmh`,
                ROUND(AVG(COALESCE(`iat_c`, 0))) AS `iat_c`,
                ROUND(AVG(COALESCE(`map_kpa`, 0))) AS `map_kpa`,
                ROUND(AVG(COALESCE(`load_pct`, 0)), 1) AS `load_pct`,
                ROUND(AVG(COALESCE(`tps_pct`, 0)), 1) AS `tps_pct`,
                ROUND(AVG(COALESCE(`ign_deg`, 0)), 1) AS `ign_deg`,
                ROUND(AVG(COALESCE(`maf_gs`, 0)), 2) AS `maf_gs`,
                MAX(COALESCE(`run_time_s`, 0)) AS `run_time_s`,
                ROUND(AVG(COALESCE(`fuel_pct`, 0)), 1) AS `fuel_pct`,
                ROUND(AVG(COALESCE(`fuel_rate_lh`, 0)), 2) AS `fuel_rate_lh`,
                ROUND(AVG(COALESCE(`o2_v`, 0)), 2) AS `o2_v`,
                ROUND(AVG(COALESCE(`stft_pct`, 0)), 1) AS `stft_pct`,
                MAX(COALESCE(`mil_on`, 0)) AS `mil_on`,
                ROUND(AVG(COALESCE(`ecu_v`, 0)), 2) AS `ecu_v`,
                MAX(COALESCE(`dist_clr_km`, 0)) AS `dist_clr_km`
            FROM `telemetry_logs`
            {$whereSql}
            GROUP BY `unit_id`, {$bucketExpr}
            ORDER BY MAX(`id`) DESC
            LIMIT ?
        ";
    } else {
        $selectExpressions = [];
        foreach ($columns as $col) {
            if ($col === 'net_zone') {
                $selectExpressions[] = "COALESCE(`net_zone`, 'YARD') AS `net_zone`";
            } elseif ($col === 'sync_ssid') {
                $selectExpressions[] = "COALESCE(`sync_ssid`, '') AS `sync_ssid`";
            } else {
                $selectExpressions[] = "`{$col}`";
            }
        }
        $selectCols = implode(', ', $selectExpressions);
        $sql = "
            SELECT {$selectCols}
            FROM `telemetry_logs`
            {$whereSql}
            ORDER BY `id` DESC
            LIMIT ?
        ";
    }

    $stmt = $pdo->prepare($sql);
    $pos = 1;
    foreach ($params as $p) {
        $stmt->bindValue($pos++, $p[0], $p[1]);
    }
    $stmt->bindValue($pos, $limit, PDO::PARAM_INT);
    $stmt->execute();

    $out = fopen('php://output', 'w');
    if ($out === false) {
        throw new RuntimeException('Unable to open php://output stream.');
    }

    fputcsv($out, $columns, ',', '"', '');

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $line = [];
        foreach ($columns as $col) {
            $line[] = $row[$col] ?? '';
        }
        fputcsv($out, $line, ',', '"', '');
    }

    fclose($out);
    exit(0);
} catch (Exception $e) {
    sendJson([
        'error' => 'CSV_EXPORT_ERROR',
        'message' => $e->getMessage(),
    ], 500);
}
