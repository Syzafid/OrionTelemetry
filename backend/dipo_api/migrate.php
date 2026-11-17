<?php
/**
 * ORION Telemetry System - Production Schema, OBD-II & Dummy Purge Migration Endpoint
 * Endpoint: https://oriontelemetry.tech/dipo_api/migrate.php
 * Parameter: ?purge_dummy=1 (or executed automatically on migration)
 *
 * Ensures all 6 core tables (`vehicles`, `telemetry_logs`, `node_configs`,
 * `movement_events`, `system_events`, `maintenance_tickets`), compatibility view
 * `vehicle_units`, the 15 Read-Only OBD-II columns (Mode 0x01 / 0x03 / 0x07 only),
 * and purges all legacy dummy units (unit_id != 'MITSUBISHI-STOCK-01') so that
 * strictly 1 physical hardware node (`MITSUBISHI-STOCK-01`) exists in production JawsDB MySQL.
 */

/** @var PDO $pdo */
$pdo = require __DIR__ . '/db.php';

try {
    // 1. Initialize schema and ensure only MITSUBISHI-STOCK-01 is seeded
    $initResult = ensureOrionDatabaseInitialized($pdo, true);

    // 2. Ensure Read-Only OBD-II columns exist on telemetry_logs & vehicles
    $obdMigration = ensureObd2ReadOnlyColumns($pdo, true);

    // 2b. Ensure ORION v1.6.0 net_zone, sync_ssid, zone_exit_epoch, and movement_events schema
    $netZoneMigration = ensureNetZoneAndMovementSchema($pdo, true);

    // 3. Purge all legacy dummy seed records (STOCK-02 .. STOCK-12)
    // Runs automatically upon hitting migrate.php, with explicit tracking if ?purge_dummy=1 is provided
    if (!empty($_SERVER['QUERY_STRING']) && empty($_GET)) {
        parse_str((string)$_SERVER['QUERY_STRING'], $_GET);
    }
    $purgeParamProvided = isset($_GET['purge_dummy']) || isset($_GET['purge']);
    $purgeResult = purgeOrionDummyUnits($pdo, 'MITSUBISHI-STOCK-01');

    $dbNameRow = $pdo->query("SELECT DATABASE() AS `db`, @@session.time_zone AS `tz`")->fetch();

    $counts = [];
    foreach (['vehicles', 'node_configs', 'telemetry_logs', 'movement_events', 'system_events', 'maintenance_tickets'] as $tbl) {
        try {
            $counts[$tbl] = (int)$pdo->query("SELECT COUNT(*) FROM `{$tbl}`")->fetchColumn();
        } catch (Exception $e) {
            $counts[$tbl] = null;
        }
    }

    // Active units in vehicles table for immediate confirmation
    $activeUnits = [];
    try {
        $stmtUnits = $pdo->query("SELECT `unit_id`, `model`, `trim`, `vin`, `v_bat`, `online_status`, `net_zone`, `sync_ssid` FROM `vehicles` ORDER BY `unit_id` ASC");
        $activeUnits = $stmtUnits->fetchAll();
    } catch (Exception $ignored) {
        $activeUnits = [];
    }

    sendJson([
        'status'               => 'OK',
        'database'             => $dbNameRow['db'] ?? null,
        'time_zone'            => $dbNameRow['tz'] ?? null,
        'php_tz'               => date_default_timezone_get(),
        'migrated'             => $initResult['migrated'] ?? false,
        'obd2_readonly_policy' => 'STRICT_MODE_01_03_07_ONLY_NO_MODE_04',
        'vehicle_units_view'   => ($obdMigration['view_ready'] && $netZoneMigration['view_ready']),
        'obd2_columns_added'   => $obdMigration['added'],
        'obd2_columns_count'   => count($obdMigration['verified']),
        'obd2_columns_verified'=> $obdMigration['verified'],
        'net_zone_schema'      => $netZoneMigration,
        'purge_dummy'          => [
            'executed'         => true,
            'mode'             => $purgeParamProvided ? 'explicit_param_purge_dummy' : 'auto_migration_purge',
            'target_node'      => 'MITSUBISHI-STOCK-01',
            'deleted_rows'     => $purgeResult['deleted'] ?? [],
            'status'           => 'SUCCESS',
        ],
        'tables'               => $counts,
        'active_units'         => $activeUnits,
    ]);
} catch (Exception $e) {
    sendJson([
        'error'   => 'MIGRATION_FAILED',
        'message' => $e->getMessage(),
    ], 500);
}
