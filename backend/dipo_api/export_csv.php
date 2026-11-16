<?php
/**
 * ORION Telemetry System - Native CSV Log Exporter (GET)
 * Endpoint: http://localhost/dipo_api/export_csv.php?unit_id=MITSUBISHI-STOCK-01&limit=500
 *
 * Exports telemetry_logs rows directly from MySQL in standard RFC 4180 CSV format.
 */

/** @var PDO $pdo */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(['error' => 'METHOD_NOT_ALLOWED', 'message' => 'Use GET method.'], 405);
}

try {
    $rawUnit = isset($_GET['unit_id']) ? trim((string)$_GET['unit_id']) : '';
    $isAll = ($rawUnit === '' || strtoupper($rawUnit) === 'ALL');
    $unitIdForFile = $isAll ? 'ALL' : preg_replace('/[^A-Za-z0-9_-]/', '_', $rawUnit);

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
        'active_ms',
        'daily_mah',
    ];

    if ($isAll) {
        $sql = "
            SELECT `id`, `unit_id`, `seq`, `boot`, `ts_epoch`, `created_at`,
                   `v_bat`, `adc_raw_mv`, `rtc_temp_c`, `shunt_sleep_ua`,
                   `engine_on`, `crit_alert`, `rpm`, `temp_c`, `dtc_cnt`, `dtc`,
                   `rssi`, `sleep_cfg`, `active_ms`, `daily_mah`
            FROM `telemetry_logs`
            ORDER BY `id` DESC
            LIMIT :limit
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    } else {
        $sql = "
            SELECT `id`, `unit_id`, `seq`, `boot`, `ts_epoch`, `created_at`,
                   `v_bat`, `adc_raw_mv`, `rtc_temp_c`, `shunt_sleep_ua`,
                   `engine_on`, `crit_alert`, `rpm`, `temp_c`, `dtc_cnt`, `dtc`,
                   `rssi`, `sleep_cfg`, `active_ms`, `daily_mah`
            FROM `telemetry_logs`
            WHERE `unit_id` = :unit_id
            ORDER BY `id` DESC
            LIMIT :limit
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':unit_id', $rawUnit, PDO::PARAM_STR);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
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

