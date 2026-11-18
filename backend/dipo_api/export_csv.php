<?php
/**
 * ORION Telemetry System - Native CSV Log Exporter (GET)
 * Endpoint: http://localhost/dipo_api/export_csv.php?unit_id=MITSUBISHI-STOCK-01&limit=500
 *
 * Exports telemetry_logs rows directly from MySQL in standard RFC 4180 CSV format.
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
        $unitIdForFile = 'ALL';
    } elseif (count($selectedIds) === 1) {
        $unitIdForFile = $selectedIds[0];
    } else {
        $unitIdForFile = 'FILTERED_' . count($selectedIds) . 'UNITS';
    }

    $rawLimit = isset($_GET['limit']) ? (int)$_GET['limit'] : 500;
    $limit = max(1, min(5000, $rawLimit));

    $date = date('Ymd_His');
    $filename = "ORION_TELEMETRY_{$unitIdForFile}_{$date}.csv";

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

    if ($isAll) {
        $sql = "
            SELECT {$selectCols}
            FROM `telemetry_logs`
            ORDER BY `id` DESC
            LIMIT ?
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    } else {
        $placeholders = implode(', ', array_fill(0, count($selectedIds), '?'));
        $sql = "
            SELECT {$selectCols}
            FROM `telemetry_logs`
            WHERE `unit_id` IN ({$placeholders})
            ORDER BY `id` DESC
            LIMIT ?
        ";
        $stmt = $pdo->prepare($sql);
        $pos = 1;
        foreach ($selectedIds as $uid) {
            $stmt->bindValue($pos++, $uid, PDO::PARAM_STR);
        }
        $stmt->bindValue($pos, $limit, PDO::PARAM_INT);
    }

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

