<?php
/**
 * ORION Telemetry System - Live API Polling Endpoint (GET)
 * Endpoint: http://localhost/dipo_api/get_data.php
 * Polled every 3000ms by TelemetryContext.tsx in LIVE_API mode.
 *
 * Implements:
 * 1. Strict Typing matching src/lib/telemetry-sync.ts
 * 2. Timeout & Missed Check-in Detection (3x sleep_cfg debounce)
 * 3. Mass Disconnect Guard (>=66% simultaneous disconnect = Gateway/AP Outage, prevents false DEPARTED)
 * 4. Includes 'configs' (node_configs) and 'movement' (movement_events) for full two-way synchronization
 */

/** @var PDO $pdo */
$pdo = require __DIR__ . '/db.php';

// Single Named Constant ambang batas status online live (Task 2.1)
// Disetel 10 detik untuk mengakomodasi 5 detik siklus kirim nominal ESP32
// ditambah jitter scan WiFi background blocking (14 channel x 250ms = ~3.5 detik).
const ONLINE_THRESHOLD_SEC = 10;

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(['error' => 'METHOD_NOT_ALLOWED', 'message' => 'Use GET method.'], 405);
}

// Micro-cache 1.5s untuk melindungi kuota MySQL JawsDB (3.600 query/jam) dari spam polling frontend
$cacheFile = sys_get_temp_dir() . '/orion_get_data_cache.json';
$cacheTtl = 1.5;
$noCache = isset($_GET['nocache']) && $_GET['nocache'] === '1';
if (!$noCache && is_file($cacheFile) && (microtime(true) - @filemtime($cacheFile)) < $cacheTtl) {
    $cached = @file_get_contents($cacheFile);
    if (!empty($cached)) {
        http_response_code(200);
        header("Content-Type: application/json; charset=utf-8");
        header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
        header("Pragma: no-cache");
        header("X-Orion-Cache: HIT");
        echo $cached;
        exit(0);
    }
}

try {
    // 1. Ambil seluruh unit kendaraan + selisih detik last_seen langsung via TIMESTAMPDIFF SQL
    $stmtVehicles = $pdo->query("
        SELECT *, TIMESTAMPDIFF(SECOND, `last_seen`, NOW()) AS `last_seen_sec`
        FROM `vehicles`
        ORDER BY `unit_id` ASC
    ");
    $vehicles = $stmtVehicles->fetchAll();

    if (empty($vehicles)) {
        sendJson(['units' => [], 'configs' => (object)[], 'movement' => [], 'movement_events' => []]);
    }

    $totalVehicles = count($vehicles);
    $timedOutUnits = [];
    $now = time();

    // 2. Ambil 24 log terakhir per unit sekaligus log terbaru (rn = 1) dalam 1 bulk query
    $latestLogs = [];
    $historyMap = [];
    foreach ($vehicles as $v) {
        $historyMap[$v['unit_id']] = [];
    }
    $rawHistoryByUnit = [];
    try {
        $stmtBulkLogs = $pdo->query("
            SELECT *,
                   DATE_FORMAT(`created_at`, '%H:%i:%s') AS `t`,
                   UNIX_TIMESTAMP(`created_at`) AS `created_ts`
            FROM (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY `unit_id` ORDER BY `created_at` DESC, `id` DESC) AS `rn`
                FROM `telemetry_logs`
            ) ranked
            WHERE `rn` <= 24
            ORDER BY `unit_id` ASC, `rn` DESC
        ");
        foreach ($stmtBulkLogs->fetchAll() as $r) {
            $uid = $r['unit_id'];
            $rawHistoryByUnit[$uid][] = $r;
            if ((int)$r['rn'] === 1) {
                $latestLogs[$uid] = $r;
            }
        }
    } catch (Exception $e) {
        $stmtHist = $pdo->prepare("
            SELECT *,
                   DATE_FORMAT(`created_at`, '%H:%i:%s') AS `t`,
                   UNIX_TIMESTAMP(`created_at`) AS `created_ts`
            FROM `telemetry_logs`
            WHERE `unit_id` = :uid
            ORDER BY `created_at` DESC, `id` DESC
            LIMIT 24
        ");
        foreach ($vehicles as $v) {
            $uid = $v['unit_id'];
            $stmtHist->execute([':uid' => $uid]);
            $rows = $stmtHist->fetchAll();
            if (!empty($rows)) {
                $latestLogs[$uid] = $rows[0];
                $rawHistoryByUnit[$uid] = array_reverse($rows);
            } else {
                $rawHistoryByUnit[$uid] = [];
            }
        }
    }
    foreach ($rawHistoryByUnit as $uid => $rows) {
        $count = count($rows);
        $lastTs = 0;
        $points = [];
        foreach ($rows as $idx => $r) {
            $rawTs = isset($r['ts_epoch']) ? (int)$r['ts_epoch'] : 0;
            $createdTs = isset($r['created_ts']) ? (int)$r['created_ts'] : 0;
            $ts = $rawTs > 0 ? $rawTs : ($createdTs > 0 ? $createdTs : ($now - ($count - $idx) * 300));
            if ($ts <= $lastTs) {
                $ts = $lastTs + 1;
            }
            $lastTs = $ts;
            $points[] = [
                't'  => (string)$r['t'],
                'v'  => (float)$r['v_bat'],
                'ts' => $ts,
            ];
        }
        $historyMap[$uid] = $points;
    }

    // 3. Evaluasi kondisi timeout per unit untuk Mass Disconnect Guard
    $unitsData = [];
    foreach ($vehicles as $v) {
        $uid = $v['unit_id'];
        $log = $latestLogs[$uid] ?? null;

        // Ambil interval sleep (detik), default 300s, dengan batas minimum aman 900s (15 menit)
        $sleepCfg = $log ? max(300, (int)$log['sleep_cfg']) : 300;
        $timeoutThreshold = max(900, $sleepCfg * 3); // 3x missed check-in (min 15 menit)

        $lastSeenSec = ($v['last_seen'] !== null && $v['last_seen_sec'] !== null)
            ? max(0, (int)$v['last_seen_sec'])
            : 999999;

        // Hanya evaluasi timeout AP untuk node yang pernah check-in hardware aktif (seq >= 500)
        // agar 11 unit seed statis tidak memicu false-positive Mass Disconnect Guard
        $hasHardwareCheckin = (int)($v['last_seq'] ?? 0) >= 500;
        $isTimedOut = $hasHardwareCheckin && ($lastSeenSec > $timeoutThreshold);
        if ($isTimedOut) {
            $timedOutUnits[] = $uid;
        }

        $unitsData[] = [
            'vehicle' => $v,
            'log' => $log,
            'lastSeenSec' => $lastSeenSec,
            'isTimedOut' => $isTimedOut,
        ];
    }

    // 4. Logika Mass Disconnect Guard:
    // Jika >= 66% kendaraan timeout bersamaan, asumsikan Gateway/AP Gudang mati/restart.
    // Jangan tandai kendaraan sebagai DEPARTED (bukan keluar gudang).
    $timedOutRatio = $totalVehicles > 0 ? (count($timedOutUnits) / $totalVehicles) : 0;
    $isMassDisconnect = ($timedOutRatio >= 0.66 && count($timedOutUnits) >= 2);

    $formattedUnits = [];

    foreach ($unitsData as $item) {
        $v = $item['vehicle'];
        $log = $item['log'];
        $isTimedOut = $item['isTimedOut'];

        // Tentukan state dan status label secara dinamis
        $state = $v['state'];
        $statusLabel = $v['status_label'];
        $inYard = (bool)$v['in_yard'];

        if ($isMassDisconnect) {
            // Guard aktif: pertahankan status unit di gudang, beri indikasi proteksi
            if ($isTimedOut) {
                $statusLabel = 'AP Link Down (Guard Active)';
                $inYard = true;
            }
        } elseif ($isTimedOut) {
            // Disconnect individual: kendaraan benar-benar keluar dari coverage AP gudang
            $state = 'DEPARTED';
            $statusLabel = 'Out of Yard (Test Drive)';
            $inYard = false;
        }

        // Susun objek telemetry dengan casting tipe data eksplisit (Numbers, Booleans, Strings)
        // Sesuai eksak dengan whitelist NUM_KEYS, BOOL_KEYS, STR_KEYS di telemetry-sync.ts
        $hasVehLiveSeq = isset($v['last_seq']) && (int)$v['last_seq'] > 0;
        $resolvedNetZone = (string)($v['net_zone'] ?? ($log['net_zone'] ?? 'UNKNOWN'));
        $resolvedSyncSsid = (string)($v['sync_ssid'] ?? ($log['sync_ssid'] ?? ''));

        if ($log) {
            $telemetry = [
                'unit_id'         => (string)$v['unit_id'],
                'seq'             => $hasVehLiveSeq ? (int)$v['last_seq'] : (int)$log['seq'],
                'boot'            => $hasVehLiveSeq && isset($v['last_boot']) ? (int)$v['last_boot'] : (int)$log['boot'],
                'ts_epoch'        => $hasVehLiveSeq && isset($v['last_ts_epoch']) ? (int)$v['last_ts_epoch'] : (int)$log['ts_epoch'],
                'v_bat'           => $hasVehLiveSeq && isset($v['v_bat']) ? (float)$v['v_bat'] : (float)$log['v_bat'],
                'engine_on'       => (bool)$log['engine_on'],
                'crit_alert'      => (bool)$log['crit_alert'],
                'can_ok'          => $hasVehLiveSeq && isset($v['can_ok']) ? (bool)$v['can_ok'] : (isset($log['can_ok']) ? (bool)$log['can_ok'] : true),
                'net_zone'        => (string)($log['net_zone'] ?? $resolvedNetZone),
                'zone_exit_epoch' => (int)($log['zone_exit_epoch'] ?? 0),
                'sync_ssid'       => (string)($log['sync_ssid'] ?? $resolvedSyncSsid),
                'rpm'             => (int)$log['rpm'],
                'temp_c'          => (int)$log['temp_c'],
                'dtc_cnt'         => (int)$log['dtc_cnt'],
                'dtc'             => (string)$log['dtc'],
                'rssi'            => ($inYard || $resolvedNetZone === 'TECH_HOTSPOT') ? ($hasVehLiveSeq && isset($v['rssi']) ? (int)$v['rssi'] : (int)$log['rssi']) : -127,
                'sleep_cfg'       => (int)$log['sleep_cfg'],
                'active_ms'       => (int)$log['active_ms'],
                'daily_mah'       => (float)$log['daily_mah'],
                'rtc_temp_c'      => $hasVehLiveSeq && isset($v['rtc_temp_c']) ? (float)$v['rtc_temp_c'] : (float)$log['rtc_temp_c'],
                'adc_raw_mv'      => $hasVehLiveSeq && isset($v['adc_raw_mv']) ? (int)$v['adc_raw_mv'] : (int)$log['adc_raw_mv'],
                'shunt_sleep_ua'  => (int)$log['shunt_sleep_ua'],
                // 15 Parameter OBD-II Read-Only (Mode 0x01 / Mode 0x03 / 0x07)
                'speed_kmh'       => $hasVehLiveSeq && isset($v['speed_kmh']) ? (int)$v['speed_kmh'] : (int)($log['speed_kmh'] ?? 0),
                'iat_c'           => $hasVehLiveSeq && isset($v['iat_c']) ? (int)$v['iat_c'] : (int)($log['iat_c'] ?? 0),
                'map_kpa'         => $hasVehLiveSeq && isset($v['map_kpa']) ? (int)$v['map_kpa'] : (int)($log['map_kpa'] ?? 0),
                'load_pct'        => $hasVehLiveSeq && isset($v['load_pct']) ? (float)$v['load_pct'] : (float)($log['load_pct'] ?? 0.0),
                'tps_pct'         => $hasVehLiveSeq && isset($v['tps_pct']) ? (float)$v['tps_pct'] : (float)($log['tps_pct'] ?? 0.0),
                'ign_deg'         => $hasVehLiveSeq && isset($v['ign_deg']) ? (float)$v['ign_deg'] : (float)($log['ign_deg'] ?? 0.0),
                'maf_gs'          => $hasVehLiveSeq && isset($v['maf_gs']) ? (float)$v['maf_gs'] : (float)($log['maf_gs'] ?? 0.0),
                'run_time_s'      => $hasVehLiveSeq && isset($v['run_time_s']) ? (int)$v['run_time_s'] : (int)($log['run_time_s'] ?? 0),
                'fuel_pct'        => $hasVehLiveSeq && isset($v['fuel_pct']) ? (float)$v['fuel_pct'] : (float)($log['fuel_pct'] ?? 74.5),
                'fuel_rate_lh'    => $hasVehLiveSeq && isset($v['fuel_rate_lh']) ? (float)$v['fuel_rate_lh'] : (float)($log['fuel_rate_lh'] ?? 0.0),
                'o2_v'            => $hasVehLiveSeq && isset($v['o2_v']) ? (float)$v['o2_v'] : (float)($log['o2_v'] ?? 0.0),
                'stft_pct'        => $hasVehLiveSeq && isset($v['stft_pct']) ? (float)$v['stft_pct'] : (float)($log['stft_pct'] ?? 0.0),
                'mil_on'          => $hasVehLiveSeq && isset($v['mil_on']) ? (bool)$v['mil_on'] : !empty($log['mil_on']),
                'ecu_v'           => $hasVehLiveSeq && isset($v['ecu_v']) ? (float)$v['ecu_v'] : (float)($log['ecu_v'] ?? 0.0),
                'dist_clr_km'     => $hasVehLiveSeq && isset($v['dist_clr_km']) ? (int)$v['dist_clr_km'] : (int)($log['dist_clr_km'] ?? 1420),
            ];
        } else {
            // Fallback nominal jika belum ada log masuk
            $telemetry = [
                'unit_id'         => (string)$v['unit_id'],
                'seq'             => (int)($v['last_seq'] ?? 1),
                'boot'            => (int)($v['last_boot'] ?? 1),
                'ts_epoch'        => (int)($v['last_ts_epoch'] ?? 0),
                'v_bat'           => 12.60,
                'engine_on'       => false,
                'crit_alert'      => false,
                'can_ok'          => true,
                'net_zone'        => $resolvedNetZone,
                'zone_exit_epoch' => 0,
                'sync_ssid'       => $resolvedSyncSsid,
                'rpm'             => 0,
                'temp_c'          => 0,
                'dtc_cnt'         => 0,
                'dtc'             => 'NONE',
                'rssi'            => -50,
                'sleep_cfg'       => 300,
                'active_ms'       => 1500,
                'daily_mah'       => 5.0,
                'rtc_temp_c'      => 30.0,
                'adc_raw_mv'      => 2260,
                'shunt_sleep_ua'  => 410,
                // 15 Parameter OBD-II Read-Only Fallback
                'speed_kmh'       => 0,
                'iat_c'           => 0,
                'map_kpa'         => 0,
                'load_pct'        => 0.0,
                'tps_pct'         => 0.0,
                'ign_deg'         => 0.0,
                'maf_gs'          => 0.0,
                'run_time_s'      => 0,
                'fuel_pct'        => 74.5,
                'fuel_rate_lh'    => 0.0,
                'o2_v'            => 0.0,
                'stft_pct'        => 0.0,
                'mil_on'          => false,
                'ecu_v'           => 0.0,
                'dist_clr_km'     => 1420,
            ];
        }

        $isLiveOnline = ($item['lastSeenSec'] <= ONLINE_THRESHOLD_SEC) && ($inYard || $resolvedNetZone === 'TECH_HOTSPOT');
        $onlineStatus = $isLiveOnline ? 'ONLINE' : 'OFFLINE';
        if ($isLiveOnline) {
            $connectionBadge = ($resolvedNetZone === 'TECH_HOTSPOT') ? 'LIVE / TECH HOTSPOT' : 'LIVE / ONLINE';
        } else {
            $connectionBadge = $inYard ? 'OFFLINE / DEEP SLEEP' : 'OFFLINE / OUT OF YARD';
        }

        $formattedUnits[] = [
            'unit_id'              => (string)$v['unit_id'],
            'bay'                  => (string)$v['bay'],
            'model'                => (string)$v['model'],
            'trim'                 => (string)$v['trim'],
            'vin'                  => (string)$v['vin'],
            'color'                => (string)$v['color'],
            'status_label'         => (string)$statusLabel,
            'state'                => (string)$state,
            'in_yard'              => (bool)$inYard,
            'net_zone'             => $resolvedNetZone,
            'sync_ssid'            => $resolvedSyncSsid,
            'online_status'        => $onlineStatus,
            'last_seen_sec'        => (int)$item['lastSeenSec'],
            'last_seen'            => $v['last_seen'] ? (string)$v['last_seen'] : null,
            'connection_badge'     => $connectionBadge,
            'online_threshold_sec' => ONLINE_THRESHOLD_SEC,
            'buffer_used'          => (int)$v['buffer_used'],
            'telemetry'            => $telemetry,
        ];
    }

    // 5. Query node_configs untuk sinkronisasi dua arah Modul 05
    $stmtConfigs = $pdo->query("SELECT * FROM `node_configs`");
    $configsMap = [];
    foreach ($stmtConfigs->fetchAll() as $c) {
        $configsMap[$c['unit_id']] = [
            'unit_id'      => (string)$c['unit_id'],
            'sleep_cfg'    => (int)$c['sleep_cfg'],
            'fast_poll_s'  => (int)$c['fast_poll_s'],
            'crit_v'       => (float)$c['crit_v'],
            'debounce_cnt' => (int)$c['debounce_cnt'],
            'cal_slope'    => (float)$c['cal_slope'],
            'cal_offset'   => (float)$c['cal_offset'],
            'pending_ack'  => !empty($c['pending_ack']),
        ];
    }

    // 6. Query movement_events untuk sinkronisasi dua arah Modul 04 (termasuk transisi 4-zona)
    try {
        $stmtMovements = $pdo->query("SELECT * FROM `movement_events` ORDER BY `event_epoch` DESC, `departed` DESC, `id` DESC LIMIT 50");
    } catch (Exception $e) {
        $stmtMovements = $pdo->query("SELECT * FROM `movement_events` ORDER BY `departed` DESC LIMIT 50");
    }
    $movementsList = [];
    foreach ($stmtMovements->fetchAll() as $m) {
        $movementsList[] = [
            'id'            => (string)$m['id'],
            'unit_id'       => (string)$m['unit_id'],
            'event_type'    => (string)($m['event_type'] ?? 'EXIT_YARD'),
            'from_zone'     => (string)($m['from_zone'] ?? 'YARD'),
            'to_zone'       => (string)($m['to_zone'] ?? 'OFFLINE'),
            'event_epoch'   => isset($m['event_epoch']) ? (int)$m['event_epoch'] : 0,
            'boot_id'       => isset($m['boot_id']) ? (int)$m['boot_id'] : 1,
            'seq_no'        => isset($m['seq_no']) ? (int)$m['seq_no'] : 0,
            'v_bat'         => isset($m['v_bat']) ? (float)$m['v_bat'] : 12.60,
            'rpm'           => isset($m['rpm']) ? (int)$m['rpm'] : 0,
            'speed_kmh'     => isset($m['speed_kmh']) ? (int)$m['speed_kmh'] : 0,
            'departed'      => (string)$m['departed'],
            'returned'      => $m['returned'] ? (string)$m['returned'] : null,
            'away_min'      => $m['away_min'] !== null ? (int)$m['away_min'] : null,
            'debounce_hits' => (int)$m['debounce_hits'],
            'tag'           => $m['tag'] ? (string)$m['tag'] : null,
            'created_at'    => isset($m['created_at']) ? (string)$m['created_at'] : null,
        ];
    }

    // 7. Query 15 baris terakhir system_events untuk Operational Audit Trail
    $auditLogsList = [];
    try {
        $stmtAudit = $pdo->query("SELECT * FROM `system_events` ORDER BY `id` DESC LIMIT 15");
        foreach ($stmtAudit->fetchAll() as $ev) {
            $auditLogsList[] = [
                'id'         => (int)$ev['id'],
                'unit_id'    => (string)$ev['unit_id'],
                'event_type' => (string)$ev['event_type'],
                'severity'   => (string)$ev['severity'],
                'message'    => (string)$ev['message'],
                'created_at' => (string)$ev['created_at'],
            ];
        }
    } catch (Exception $ignored) {
        // Fallback kosong jika tabel belum ter-migrasi
    }

    // 9. Query maintenance_tickets untuk Shift Handover Workflow
    $ticketsList = [];
    try {
        $stmtTickets = $pdo->query("SELECT * FROM `maintenance_tickets` ORDER BY `id` ASC");
        foreach ($stmtTickets->fetchAll() as $tk) {
            $ticketsList[] = [
                'id'            => (int)$tk['id'],
                'ticket_code'   => (string)$tk['ticket_code'],
                'unit_id'       => (string)$tk['unit_id'],
                'bay'           => (string)$tk['bay'],
                'issue_summary' => (string)$tk['issue_summary'],
                'status'        => (string)$tk['status'],
                'assigned_to'   => $tk['assigned_to'] ? (string)$tk['assigned_to'] : 'Unassigned',
                'handover_note' => $tk['handover_note'] ? (string)$tk['handover_note'] : '',
                'updated_at'    => (string)$tk['updated_at'],
            ];
        }
    } catch (Exception $ignored) {
        // Fallback kosong jika tabel belum ter-migrasi
    }

    $finalPayload = [
        'status'                => 'OK',
        'timestamp'             => date('c'),
        'online_threshold_sec'  => ONLINE_THRESHOLD_SEC,
        'mass_disconnect_guard' => $isMassDisconnect,
        'units'                 => $formattedUnits,
        'configs'               => $configsMap,
        'movement'              => $movementsList,
        'movement_events'       => $movementsList,
        'history'               => $historyMap,
        'audit_logs'            => $auditLogsList,
        'tickets'               => $ticketsList,
    ];

    @file_put_contents($cacheFile, json_encode($finalPayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    sendJson($finalPayload);

} catch (Exception $e) {
    sendJson([
        'error' => 'SERVER_QUERY_ERROR',
        'message' => $e->getMessage(),
    ], 500);
}
