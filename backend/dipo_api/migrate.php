<?php
/**
 * ORION Telemetry System - Production Schema & Seed Verification Endpoint
 * Endpoint: https://oriontelemetry.tech/dipo_api/migrate.php
 *
 * Ensures all 6 core tables (`vehicles`, `telemetry_logs`, `node_configs`,
 * `movement_events`, `system_events`, `maintenance_tickets`) and initial seed rows
 * (including `MITSUBISHI-STOCK-01`) exist on JawsDB MySQL / local MySQL.
 */

/** @var PDO $pdo */
$pdo = require __DIR__ . '/db.php';

try {
    $initResult = ensureOrionDatabaseInitialized($pdo, true);
    $dbNameRow = $pdo->query("SELECT DATABASE() AS `db`, @@session.time_zone AS `tz`")->fetch();

    $counts = [];
    foreach (['vehicles', 'node_configs', 'telemetry_logs', 'movement_events', 'system_events', 'maintenance_tickets'] as $tbl) {
        try {
            $counts[$tbl] = (int)$pdo->query("SELECT COUNT(*) FROM `{$tbl}`")->fetchColumn();
        } catch (Exception $e) {
            $counts[$tbl] = null;
        }
    }

    sendJson([
        'status'    => 'OK',
        'database'  => $dbNameRow['db'] ?? null,
        'time_zone' => $dbNameRow['tz'] ?? null,
        'php_tz'    => date_default_timezone_get(),
        'migrated'  => $initResult['migrated'] ?? false,
        'tables'    => $counts,
    ]);
} catch (Exception $e) {
    sendJson([
        'error'   => 'MIGRATION_FAILED',
        'message' => $e->getMessage(),
    ], 500);
}
