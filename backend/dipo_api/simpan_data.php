<?php
/**
 * ORION Telemetry System - ESP32 Node Ingest & Piggyback ACK Endpoint (POST)
 * Firmware Contract: v1.5.0 (35 fields: 20 core + 15 Read-Only OBD-II Mode 01/03/07, Dual-Format Single Object or Burst Array)
 * Policy: 100% Read-Only ECU (STRICT_MODE_01_03_07_ONLY_NO_MODE_04)
 * Endpoint: http://localhost/dipo_api/simpan_data.php
 *
 * Implements:
 * 1. X-Node-Token authentication (optional, enabled if NODE_AUTH_TOKEN env is set)
 * 2. X-Orion-Node & X-Burst-Sync header awareness
 * 3. Ingests Single Object {...} OR Burst Ring-Buffer Array [{...}, {...}] (or { records: [...] })
 * 4. Parses string/int sleep_cfg durations safely (e.g. "6 Hours" -> 21600s, 300 -> 300s)
 * 5. Idempotent Insert via INSERT ... ON DUPLICATE KEY UPDATE on UNIQUE (unit_id, boot, seq)
 * 6. Freshness-guarded Live Status update on `vehicles` (updates only if seq or ts_epoch is newer)
 * 7. Returns HTTP 200 with PIGGYBACK_CFG & pending_ack for ESP32 ACK execution
 */

/** @var PDO $pdo */
$pdo = require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['error' => 'METHOD_NOT_ALLOWED', 'message' => 'Use POST method for telemetry ingest.'], 405);
}

// 1. Validasi Token Opsional (jika diset pada server / environment / .env)
$expectedToken = orionEnv('NODE_AUTH_TOKEN');
if ($expectedToken) {
    $incomingToken = $_SERVER['HTTP_X_NODE_TOKEN'] ?? '';
    if (!hash_equals($expectedToken, $incomingToken)) {
        sendJson(['error' => 'UNAUTHORIZED', 'message' => 'Invalid or missing X-Node-Token header.'], 401);
    }
}

// 2. Validasi Header X-Orion-Node agar endpoint publik menolak request kosong/bot sembarangan
$headerNodeId = isset($_SERVER['HTTP_X_ORION_NODE']) ? trim((string)$_SERVER['HTTP_X_ORION_NODE']) : '';
if ($headerNodeId === '' || !preg_match('/^(MITSUBISHI|ORION)-[A-Za-z0-9_-]{2,48}$/i', $headerNodeId)) {
    sendJson([
        'error'   => 'FORBIDDEN_NODE',
        'message' => 'Missing or invalid X-Orion-Node header.',
    ], 403);
}

/**
 * Pastikan seluruh kolom & UNIQUE KEY (unit_id, boot, seq) v1.4.1 tersedia di telemetry_logs
 * dan tabel status live `vehicles`.
 */
function ensureTelemetrySchema(PDO $pdo, bool $force = false): void {
    if (!$force && isOrionSchemaReady()) {
        return;
    }

    try {
        // telemetry_logs columns
        $logCols = [
            'can_ok'      => "ALTER TABLE `telemetry_logs` ADD COLUMN `can_ok` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = TWAI CAN Loopback OK, 0 = CAN Fault' AFTER `shunt_sleep_ua`",
            'buffer_used' => "ALTER TABLE `telemetry_logs` ADD COLUMN `buffer_used` INT NOT NULL DEFAULT 0 AFTER `sleep_cfg`",
        ];
        foreach ($logCols as $col => $ddl) {
            $stmt = $pdo->query("SHOW COLUMNS FROM `telemetry_logs` LIKE '{$col}'");
            if (!$stmt->fetch()) {
                $pdo->exec($ddl);
            }
        }

        $stmtTempCol = $pdo->query("SHOW COLUMNS FROM `telemetry_logs` LIKE 'rtc_temp_c'");
        $tempColInfo = $stmtTempCol->fetch();
        if ($tempColInfo && stripos((string)$tempColInfo['Type'], 'decimal(4,1)') !== false) {
            $pdo->exec("ALTER TABLE `telemetry_logs` MODIFY COLUMN `rtc_temp_c` DECIMAL(5,2) NOT NULL DEFAULT 30.00");
        }

        // Pastikan UNIQUE KEY (unit_id, boot, seq) ada untuk deduplikasi burst sync
        $stmtIdxNew = $pdo->query("SHOW INDEX FROM `telemetry_logs` WHERE Key_name = 'uniq_unit_boot_seq'");
        if (!$stmtIdxNew->fetch()) {
            $stmtIdxOld = $pdo->query("SHOW INDEX FROM `telemetry_logs` WHERE Key_name = 'uniq_unit_seq'");
            if ($stmtIdxOld->fetch()) {
                $pdo->exec("ALTER TABLE `telemetry_logs` DROP INDEX `uniq_unit_seq`");
            }
            $pdo->exec("ALTER TABLE `telemetry_logs` ADD UNIQUE KEY `uniq_unit_boot_seq` (`unit_id`, `boot`, `seq`)");
        }

        // vehicles live status columns
        $vehCols = [
            'online_status' => "ALTER TABLE `vehicles` ADD COLUMN `online_status` VARCHAR(16) NOT NULL DEFAULT 'ONLINE' AFTER `in_yard`",
            'v_bat'         => "ALTER TABLE `vehicles` ADD COLUMN `v_bat` DECIMAL(5,2) NOT NULL DEFAULT 12.60 AFTER `online_status`",
            'adc_raw_mv'    => "ALTER TABLE `vehicles` ADD COLUMN `adc_raw_mv` INT NOT NULL DEFAULT 2260 AFTER `v_bat`",
            'rtc_temp_c'    => "ALTER TABLE `vehicles` ADD COLUMN `rtc_temp_c` DECIMAL(5,2) NOT NULL DEFAULT 30.00 AFTER `adc_raw_mv`",
            'can_ok'        => "ALTER TABLE `vehicles` ADD COLUMN `can_ok` TINYINT(1) NOT NULL DEFAULT 1 AFTER `rtc_temp_c`",
            'rssi'          => "ALTER TABLE `vehicles` ADD COLUMN `rssi` INT NOT NULL DEFAULT -60 AFTER `can_ok`",
            'last_boot'     => "ALTER TABLE `vehicles` ADD COLUMN `last_boot` INT NOT NULL DEFAULT 1 AFTER `buffer_used`",
            'last_seq'      => "ALTER TABLE `vehicles` ADD COLUMN `last_seq` INT NOT NULL DEFAULT 0 AFTER `last_boot`",
            'last_ts_epoch' => "ALTER TABLE `vehicles` ADD COLUMN `last_ts_epoch` BIGINT NOT NULL DEFAULT 0 AFTER `last_seq`",
        ];
        foreach ($vehCols as $col => $ddl) {
            $stmt = $pdo->query("SHOW COLUMNS FROM `vehicles` LIKE '{$col}'");
            if (!$stmt->fetch()) {
                $pdo->exec($ddl);
            }
        }

        // node_configs pending_ack & calibration precision columns
        $stmtAckCol = $pdo->query("SHOW COLUMNS FROM `node_configs` LIKE 'pending_ack'");
        if (!$stmtAckCol->fetch()) {
            $pdo->exec("ALTER TABLE `node_configs` ADD COLUMN `pending_ack` TINYINT(1) NOT NULL DEFAULT 0 AFTER `cal_offset`");
        }
        $stmtSlopeCol = $pdo->query("SHOW COLUMNS FROM `node_configs` LIKE 'cal_slope'");
        $slopeColInfo = $stmtSlopeCol->fetch();
        if ($slopeColInfo && stripos((string)$slopeColInfo['Type'], 'decimal(10,6)') !== false) {
            $pdo->exec("ALTER TABLE `node_configs` MODIFY COLUMN `cal_slope` DECIMAL(10,7) NOT NULL DEFAULT 0.0054120, MODIFY COLUMN `cal_offset` DECIMAL(6,4) NOT NULL DEFAULT 0.3580");
        }
        ensureObd2ReadOnlyColumns($pdo, $force);
        ensureNetZoneAndMovementSchema($pdo, $force);
        markOrionSchemaReady();
    } catch (Exception $ignored) {
        // Jangan gagalkan request jika user DB tidak punya hak DDL
    }
}

// Schema checks are performed during migration (migrate.php). Bypassed in hot ingest path to protect JawsDB query quota.
if (isset($_GET['migrate']) && $_GET['migrate'] === '1') {
    ensureTelemetrySchema($pdo, true);
}

// 3. Baca Headers ESP32 v1.4.1 / v1.6.0 & Body Payload JSON
$isBurstHeader = isset($_SERVER['HTTP_X_BURST_SYNC']) && strtolower(trim((string)$_SERVER['HTTP_X_BURST_SYNC'])) === 'true';
$headerSyncSsid = sanitizeSyncSsid((string)($_SERVER['HTTP_X_SYNC_SSID'] ?? ''));

$payload = readJsonBody();

// Deteksi Dual-Format JSON (Single Object {...}, Array Burst [{...}, {...}], atau { records: [...] })
$records = [];
$topUnitId = isset($payload['unit_id']) ? trim((string)$payload['unit_id']) : ($headerNodeId !== '' ? $headerNodeId : null);

if (isset($payload['records']) && is_array($payload['records'])) {
    $records = $payload['records'];
} elseif (isset($payload['unit_id'])) {
    $records = [$payload];
} elseif (isset($payload[0]) && is_array($payload[0])) {
    $records = $payload;
} else {
    $records = [$payload];
}

if (count($records) > 50) {
    sendJson(['error' => 'BATCH_TOO_LARGE', 'message' => 'Maximum 50 records allowed per burst sync request.'], 400);
}

// Normalisasi semua record valid sebelum transaksi database
$normalized = [];
foreach ($records as $r) {
    if (!is_array($r)) {
        continue;
    }
    $unitId = trim((string)($r['unit_id'] ?? $topUnitId ?? ''));
    if ($unitId === '') {
        continue;
    }
    if (strcasecmp($unitId, $headerNodeId) !== 0) {
        sendJson([
            'error'   => 'NODE_MISMATCH',
            'message' => 'Payload unit_id does not match X-Orion-Node header.',
        ], 403);
    }
    $seq = isset($r['seq']) ? (int)$r['seq'] : (isset($r['boot']) ? (int)$r['boot'] : 1);
    $recSyncSsid = (isset($r['sync_ssid']) && is_string($r['sync_ssid']) && trim($r['sync_ssid']) !== '')
        ? sanitizeSyncSsid($r['sync_ssid'])
        : $headerSyncSsid;

    $normalized[] = [
        'unit_id'         => $unitId,
        'seq'             => $seq,
        'boot'            => (int)($r['boot'] ?? 1),
        'ts_epoch'        => (int)($r['ts_epoch'] ?? time()),
        'v_bat'           => round((float)($r['v_bat'] ?? 12.0), 2),
        'adc_raw_mv'      => (int)($r['adc_raw_mv'] ?? 2150),
        'rtc_temp_c'      => round((float)($r['rtc_temp_c'] ?? 30.0), 2),
        'shunt_sleep_ua'  => (int)($r['shunt_sleep_ua'] ?? 0),
        'can_ok'          => (!isset($r['can_ok']) || !empty($r['can_ok'])) ? 1 : 0,
        'net_zone'        => normalizeOrionNetZone($r['net_zone'] ?? 'UNKNOWN'),
        'zone_exit_epoch' => isset($r['zone_exit_epoch']) ? max(0, (int)$r['zone_exit_epoch']) : 0,
        'sync_ssid'       => $recSyncSsid,
        'engine_on'       => !empty($r['engine_on']) ? 1 : 0,
        'crit_alert'      => !empty($r['crit_alert']) ? 1 : 0,
        'rpm'             => (int)($r['rpm'] ?? 0),
        'temp_c'          => (int)($r['temp_c'] ?? 0),
        'dtc_cnt'         => (int)($r['dtc_cnt'] ?? 0),
        'dtc'             => (string)($r['dtc'] ?? 'NONE'),
        'rssi'            => (int)($r['rssi'] ?? -60),
        'sleep_cfg'       => parseSleepCfgSeconds($r['sleep_cfg'] ?? 300),
        'buffer_used'     => isset($r['buffer_used']) ? (int)$r['buffer_used'] : (isset($payload['buffer_used']) ? (int)$payload['buffer_used'] : 0),
        'active_ms'       => (int)($r['active_ms'] ?? 1500),
        'daily_mah'       => round((float)($r['daily_mah'] ?? 0.0), 2),
        // 15 Parameter OBD-II Read-Only (Mode 0x01 / Mode 0x03 / 0x07)
        'speed_kmh'       => max(0, min(255, (int)($r['speed_kmh'] ?? 0))),
        'iat_c'           => max(-40, min(215, (int)($r['iat_c'] ?? 0))),
        'map_kpa'         => max(0, min(255, (int)($r['map_kpa'] ?? 0))),
        'load_pct'        => round((float)($r['load_pct'] ?? 0.0), 1),
        'tps_pct'         => round((float)($r['tps_pct'] ?? 0.0), 1),
        'ign_deg'         => round((float)($r['ign_deg'] ?? 0.0), 1),
        'maf_gs'          => round((float)($r['maf_gs'] ?? 0.0), 2),
        'run_time_s'      => max(0, (int)($r['run_time_s'] ?? 0)),
        'fuel_pct'        => round((float)($r['fuel_pct'] ?? 0.0), 1),
        'fuel_rate_lh'    => round((float)($r['fuel_rate_lh'] ?? 0.0), 2),
        'o2_v'            => round((float)($r['o2_v'] ?? 0.0), 2),
        'stft_pct'        => round((float)($r['stft_pct'] ?? 0.0), 1),
        'mil_on'          => !empty($r['mil_on']) ? 1 : 0,
        'ecu_v'           => round((float)($r['ecu_v'] ?? 0.0), 2),
        'dist_clr_km'     => max(0, (int)($r['dist_clr_km'] ?? 0)),
    ];
}

if (empty($normalized)) {
    sendJson(['error' => 'NO_RECORDS', 'message' => 'No valid records with unit_id found in payload.'], 400);
}

// WAJIB urutkan array rekaman di memori PHP secara kronologis perangkat (boot ASC, seq ASC, ts_epoch ASC)
usort($normalized, static function (array $a, array $b): int {
    if ($a['boot'] !== $b['boot']) {
        return $a['boot'] <=> $b['boot'];
    }
    if ($a['seq'] !== $b['seq']) {
        return $a['seq'] <=> $b['seq'];
    }
    return $a['ts_epoch'] <=> $b['ts_epoch'];
});

$isBurstSync = $isBurstHeader || count($normalized) > 1;

// 3. Idempotent Insert ke `telemetry_logs` menggunakan ON DUPLICATE KEY UPDATE
// Berbasis UNIQUE KEY (`unit_id`, `boot`, `seq`) sehingga Burst Sync retry tidak menciptakan baris duplikat
$sqlInsertLog = "
    INSERT INTO `telemetry_logs` (
        `unit_id`, `seq`, `boot`, `ts_epoch`, `v_bat`, `adc_raw_mv`, `rtc_temp_c`,
        `shunt_sleep_ua`, `can_ok`, `net_zone`, `zone_exit_epoch`, `sync_ssid`,
        `engine_on`, `crit_alert`, `rpm`, `temp_c`, `dtc_cnt`,
        `dtc`, `rssi`, `sleep_cfg`, `buffer_used`, `active_ms`, `daily_mah`,
        `speed_kmh`, `iat_c`, `map_kpa`, `load_pct`, `tps_pct`, `ign_deg`, `maf_gs`, `run_time_s`,
        `fuel_pct`, `fuel_rate_lh`, `o2_v`, `stft_pct`, `mil_on`, `ecu_v`, `dist_clr_km`,
        `created_at`
    ) VALUES (
        :unit_id, :seq, :boot, :ts_epoch, :v_bat, :adc_raw_mv, :rtc_temp_c,
        :shunt_sleep_ua, :can_ok, :net_zone, :zone_exit_epoch, :sync_ssid,
        :engine_on, :crit_alert, :rpm, :temp_c, :dtc_cnt,
        :dtc, :rssi, :sleep_cfg, :buffer_used, :active_ms, :daily_mah,
        :speed_kmh, :iat_c, :map_kpa, :load_pct, :tps_pct, :ign_deg, :maf_gs, :run_time_s,
        :fuel_pct, :fuel_rate_lh, :o2_v, :stft_pct, :mil_on, :ecu_v, :dist_clr_km,
        NOW()
    )
    ON DUPLICATE KEY UPDATE
        `ts_epoch`        = VALUES(`ts_epoch`),
        `v_bat`           = VALUES(`v_bat`),
        `adc_raw_mv`      = VALUES(`adc_raw_mv`),
        `rtc_temp_c`      = VALUES(`rtc_temp_c`),
        `shunt_sleep_ua`  = VALUES(`shunt_sleep_ua`),
        `can_ok`          = VALUES(`can_ok`),
        `net_zone`        = VALUES(`net_zone`),
        `zone_exit_epoch` = VALUES(`zone_exit_epoch`),
        `sync_ssid`       = VALUES(`sync_ssid`),
        `engine_on`       = VALUES(`engine_on`),
        `crit_alert`      = VALUES(`crit_alert`),
        `rpm`             = VALUES(`rpm`),
        `temp_c`          = VALUES(`temp_c`),
        `dtc_cnt`         = VALUES(`dtc_cnt`),
        `dtc`             = VALUES(`dtc`),
        `rssi`            = VALUES(`rssi`),
        `sleep_cfg`       = VALUES(`sleep_cfg`),
        `buffer_used`     = VALUES(`buffer_used`),
        `active_ms`       = VALUES(`active_ms`),
        `daily_mah`       = VALUES(`daily_mah`),
        `speed_kmh`       = VALUES(`speed_kmh`),
        `iat_c`           = VALUES(`iat_c`),
        `map_kpa`         = VALUES(`map_kpa`),
        `load_pct`        = VALUES(`load_pct`),
        `tps_pct`         = VALUES(`tps_pct`),
        `ign_deg`         = VALUES(`ign_deg`),
        `maf_gs`          = VALUES(`maf_gs`),
        `run_time_s`      = VALUES(`run_time_s`),
        `fuel_pct`        = VALUES(`fuel_pct`),
        `fuel_rate_lh`    = VALUES(`fuel_rate_lh`),
        `o2_v`            = VALUES(`o2_v`),
        `stft_pct`        = VALUES(`stft_pct`),
        `mil_on`          = VALUES(`mil_on`),
        `ecu_v`           = VALUES(`ecu_v`),
        `dist_clr_km`     = VALUES(`dist_clr_km`),
        `created_at`      = NOW()
";

// CATATAN ARSITEKTUR IDEMPOTENSI (TASK 2.1):
// Kunci idempotensi (boot_id, seq_no, event_type) pada tabel movement_events
// mengasumsikan nomor seq selalu monoton naik pada boot_id yang sama.
// Jika perangkat di-flash ulang / NVS di-reset sehingga seq kembali ke 0 pada boot_id yang sama,
// potensi tabrakan kunci adalah batasan desain yang diterima sesuai spesifikasi ORION v1.6.

$sqlUpsertMovement = "
    INSERT INTO `movement_events` (
        `id`, `unit_id`, `event_type`, `from_zone`, `to_zone`, `event_epoch`,
        `boot_id`, `seq_no`, `v_bat`, `rpm`, `speed_kmh`,
        `departed`, `returned`, `away_min`, `debounce_hits`, `tag`, `created_at`
    ) VALUES (
        :id, :unit_id, :event_type, :from_zone, :to_zone, :event_epoch,
        :boot_id, :seq_no, :v_bat, :rpm, :speed_kmh,
        :departed, :returned, :away_min, :debounce_hits, :tag, NOW()
    )
    ON DUPLICATE KEY UPDATE
        `event_epoch` = VALUES(`event_epoch`),
        `from_zone`   = VALUES(`from_zone`),
        `to_zone`     = VALUES(`to_zone`),
        `v_bat`       = VALUES(`v_bat`),
        `rpm`         = VALUES(`rpm`),
        `speed_kmh`   = VALUES(`speed_kmh`)
";

$stmtInsert = $pdo->prepare($sqlInsertLog);
$stmtMove = $pdo->prepare($sqlUpsertMovement);

$primaryUnitId = $normalized[0]['unit_id'];
$latestRecord = null;
$insertedCount = 0;
$statusUpdated = false;
$validZones = ['YARD', 'TECH_HOTSPOT', 'OFFLINE'];

$pdo->beginTransaction();

try {
    // Kunci baris kendaraan sebelum evaluasi state machine agar transisi atomik & bebas race-condition
    $stmtVeh = $pdo->prepare("
        SELECT `buffer_used`, `last_boot`, `last_seq`, `last_ts_epoch`, `net_zone`, `sync_ssid`,
               `net_zone_boot`, `net_zone_seq`, `net_zone_ts`
        FROM `vehicles`
        WHERE `unit_id` = :uid
        FOR UPDATE
    ");
    $stmtVeh->execute([':uid' => $primaryUnitId]);
    $vehRow = $stmtVeh->fetch();

    $curBoot     = $vehRow ? (int)$vehRow['last_boot'] : 0;
    $curSeq      = $vehRow ? (int)$vehRow['last_seq'] : 0;
    $curTs       = $vehRow ? (int)$vehRow['last_ts_epoch'] : 0;
    $curZoneBoot = $vehRow ? (int)($vehRow['net_zone_boot'] ?? 0) : 0;
    $curZoneSeq  = $vehRow ? (int)($vehRow['net_zone_seq'] ?? 0) : 0;
    $curZoneTs   = $vehRow ? (int)($vehRow['net_zone_ts'] ?? 0) : 0;

    // Prepared statements untuk State Machine Transisi Lintas-Batch & Batch Terlambat (Task 2.1)
    // 1. Query predecessor terdekat di telemetry_logs dengan urutan (boot, seq, ts_epoch) lebih kecil dan net_zone valid
    $stmtPred = $pdo->prepare("
        SELECT `net_zone`, `boot`, `seq`, `ts_epoch`
        FROM `telemetry_logs`
        WHERE `unit_id` = :uid
          AND `net_zone` IN ('YARD', 'TECH_HOTSPOT', 'OFFLINE')
          AND (
            `boot` < :b1
            OR (`boot` = :b2 AND `seq` < :s1)
            OR (`boot` = :b3 AND `seq` = :s2 AND `ts_epoch` < :ts1)
          )
        ORDER BY `boot` DESC, `seq` DESC, `ts_epoch` DESC, `id` DESC
        LIMIT 1
    ");

    // 2. Query successor terdekat di telemetry_logs dengan urutan lebih besar.
    // Desain State Machine Transisi Lintas-Batch:
    // Event pergerakan pada suatu record hanya bergantung secara deterministik pada transisi zona
    // dari pendahulu langsungnya ($sFrom) ke zona record itu sendiri ($sTo).
    // Ketika record baru disisipkan, satu-satunya record lain yang relasi pendahulunya berubah adalah
    // penerus langsung terdekatnya (immediate successor). Record setelah penerus tersebut tetap memiliki
    // pendahulu yang sama dan tidak terpengaruh, sehingga re-evaluasi pada LIMIT 1 penerus adalah cukup dan lengkap.
    $stmtSucc = $pdo->prepare("
        SELECT `id`, `unit_id`, `net_zone`, `boot`, `seq`, `ts_epoch`, `zone_exit_epoch`, `v_bat`, `rpm`, `speed_kmh`
        FROM `telemetry_logs`
        WHERE `unit_id` = :uid
          AND `net_zone` IN ('YARD', 'TECH_HOTSPOT', 'OFFLINE')
          AND (
            `boot` > :b1
            OR (`boot` = :b2 AND `seq` > :s1)
            OR (`boot` = :b3 AND `seq` = :s2 AND `ts_epoch` > :ts1)
          )
        ORDER BY `boot` ASC, `seq` ASC, `ts_epoch` ASC, `id` ASC
        LIMIT 1
    ");

    // 3. Cleanup statement untuk menghapus event yang usang akibat disisipkannya batch terlambat
    $stmtDelMove = $pdo->prepare("
        DELETE FROM `movement_events`
        WHERE `unit_id` = :uid
          AND `boot_id` = :b
          AND `seq_no` = :s
    ");

    $stmtDelMoveType = $pdo->prepare("
        DELETE FROM `movement_events`
        WHERE `unit_id` = :uid
          AND `boot_id` = :b
          AND `seq_no` = :s
          AND `event_type` = :etype
    ");

    $newestValidZoneRec = null;
    $prevContiguousUnit = null;
    $prevContiguousBoot = null;
    $prevContiguousSeq  = null;
    $prevContiguousZone = null;
    $totalNormalized = count($normalized);

    foreach ($normalized as $recIdx => $rec) {
        $primaryUnitId = $rec['unit_id'];
        $latestRecord = $rec;

        // Simpan ke telemetry_logs tanpa pernah menghapus/mengubah rekaman sebelumnya
        $stmtInsert->execute([
            ':unit_id'         => $rec['unit_id'],
            ':seq'             => $rec['seq'],
            ':boot'            => $rec['boot'],
            ':ts_epoch'        => $rec['ts_epoch'],
            ':v_bat'           => $rec['v_bat'],
            ':adc_raw_mv'      => $rec['adc_raw_mv'],
            ':rtc_temp_c'      => $rec['rtc_temp_c'],
            ':shunt_sleep_ua'  => $rec['shunt_sleep_ua'],
            ':can_ok'          => $rec['can_ok'],
            ':net_zone'        => $rec['net_zone'],
            ':zone_exit_epoch' => $rec['zone_exit_epoch'],
            ':sync_ssid'       => $rec['sync_ssid'],
            ':engine_on'       => $rec['engine_on'],
            ':crit_alert'      => $rec['crit_alert'],
            ':rpm'             => $rec['rpm'],
            ':temp_c'          => $rec['temp_c'],
            ':dtc_cnt'         => $rec['dtc_cnt'],
            ':dtc'             => $rec['dtc'],
            ':rssi'            => $rec['rssi'],
            ':sleep_cfg'       => $rec['sleep_cfg'],
            ':buffer_used'     => $rec['buffer_used'],
            ':active_ms'       => $rec['active_ms'],
            ':daily_mah'       => $rec['daily_mah'],
            ':speed_kmh'       => $rec['speed_kmh'],
            ':iat_c'           => $rec['iat_c'],
            ':map_kpa'         => $rec['map_kpa'],
            ':load_pct'        => $rec['load_pct'],
            ':tps_pct'         => $rec['tps_pct'],
            ':ign_deg'         => $rec['ign_deg'],
            ':maf_gs'          => $rec['maf_gs'],
            ':run_time_s'      => $rec['run_time_s'],
            ':fuel_pct'        => $rec['fuel_pct'],
            ':fuel_rate_lh'    => $rec['fuel_rate_lh'],
            ':o2_v'            => $rec['o2_v'],
            ':stft_pct'        => $rec['stft_pct'],
            ':mil_on'          => $rec['mil_on'],
            ':ecu_v'           => $rec['ecu_v'],
            ':dist_clr_km'     => $rec['dist_clr_km'],
        ]);

        $z = $rec['net_zone'];
        if (in_array($z, $validZones, true)) {
            $newestValidZoneRec = $rec;

            // 1. Evaluasi transisi $rec terhadap PREDECESSOR (hindari query berulang pada urutan sekuensial dalam batch)
            if (
                $prevContiguousZone !== null
                && $prevContiguousUnit === $rec['unit_id']
                && (int)$rec['boot'] === $prevContiguousBoot
                && (int)$rec['seq'] === ($prevContiguousSeq + 1)
            ) {
                $fromZone = $prevContiguousZone;
            } else {
                $stmtPred->execute([
                    ':uid' => $rec['unit_id'],
                    ':b1'  => (int)$rec['boot'],
                    ':b2'  => (int)$rec['boot'],
                    ':s1'  => (int)$rec['seq'],
                    ':b3'  => (int)$rec['boot'],
                    ':s2'  => (int)$rec['seq'],
                    ':ts1' => (int)$rec['ts_epoch'],
                ]);
                $predRow = $stmtPred->fetch();
                $fromZone = ($predRow && in_array((string)$predRow['net_zone'], $validZones, true))
                    ? (string)$predRow['net_zone']
                    : null;
            }

            $prevContiguousUnit = $rec['unit_id'];
            $prevContiguousBoot = (int)$rec['boot'];
            $prevContiguousSeq  = (int)$rec['seq'];
            $prevContiguousZone = $z;

            if ($fromZone !== null && $fromZone !== $z) {
                $toZone = $z;

                if ($fromZone === 'YARD' && ($toZone === 'TECH_HOTSPOT' || $toZone === 'OFFLINE')) {
                    $exitEpoch = ($rec['zone_exit_epoch'] > 0
                        && $rec['zone_exit_epoch'] <= $rec['ts_epoch']
                        && ($rec['ts_epoch'] - $rec['zone_exit_epoch']) <= 620)
                        ? (int)$rec['zone_exit_epoch']
                        : (int)$rec['ts_epoch'];

                    $evId = sprintf('MV-%s-%d-%d-OUT', substr(md5($rec['unit_id']), 0, 6), $rec['boot'], $rec['seq']);
                    $stmtMove->execute([
                        ':id'            => $evId,
                        ':unit_id'       => $rec['unit_id'],
                        ':event_type'    => 'EXIT_YARD',
                        ':from_zone'     => 'YARD',
                        ':to_zone'       => $toZone,
                        ':event_epoch'   => $exitEpoch,
                        ':boot_id'       => $rec['boot'],
                        ':seq_no'        => $rec['seq'],
                        ':v_bat'         => $rec['v_bat'],
                        ':rpm'           => max(0, $rec['rpm']),
                        ':speed_kmh'     => $rec['speed_kmh'],
                        ':departed'      => date('Y-m-d H:i:s', max(1, $exitEpoch)),
                        ':returned'      => null,
                        ':away_min'      => null,
                        ':debounce_hits' => 3,
                        ':tag'           => 'Test Drive',
                    ]);
                } elseif (($fromZone === 'TECH_HOTSPOT' || $fromZone === 'OFFLINE') && $toZone === 'YARD') {
                    $enterEpoch = (int)$rec['ts_epoch'];
                    $evId = sprintf('MV-%s-%d-%d-IN', substr(md5($rec['unit_id']), 0, 6), $rec['boot'], $rec['seq']);
                    $stmtMove->execute([
                        ':id'            => $evId,
                        ':unit_id'       => $rec['unit_id'],
                        ':event_type'    => 'ENTER_YARD',
                        ':from_zone'     => $fromZone,
                        ':to_zone'       => 'YARD',
                        ':event_epoch'   => $enterEpoch,
                        ':boot_id'       => $rec['boot'],
                        ':seq_no'        => $rec['seq'],
                        ':v_bat'         => $rec['v_bat'],
                        ':rpm'           => max(0, $rec['rpm']),
                        ':speed_kmh'     => $rec['speed_kmh'],
                        ':departed'      => date('Y-m-d H:i:s', max(1, $enterEpoch)),
                        ':returned'      => date('Y-m-d H:i:s', max(1, $enterEpoch)),
                        ':away_min'      => null,
                        ':debounce_hits' => 2,
                        ':tag'           => 'Test Drive',
                    ]);
                }
            }

            // 2. Re-evaluasi SUCCESSOR hanya untuk sisipan historis di luar urutan sekuensial dalam batch
            $isHistoricalInsert = ((int)$rec['boot'] < $curBoot)
                || ((int)$rec['boot'] === $curBoot && (int)$rec['seq'] < $curSeq);
            $nextRec = ($recIdx + 1 < $totalNormalized) ? $normalized[$recIdx + 1] : null;
            $hasContiguousNextInBatch = $nextRec !== null
                && $nextRec['unit_id'] === $rec['unit_id']
                && (int)$nextRec['boot'] === (int)$rec['boot']
                && (int)$nextRec['seq'] === ((int)$rec['seq'] + 1)
                && in_array($nextRec['net_zone'], $validZones, true);

            if ($isHistoricalInsert && !$hasContiguousNextInBatch) {
                $stmtSucc->execute([
                    ':uid' => $rec['unit_id'],
                    ':b1'  => (int)$rec['boot'],
                    ':b2'  => (int)$rec['boot'],
                    ':s1'  => (int)$rec['seq'],
                    ':b3'  => (int)$rec['boot'],
                    ':s2'  => (int)$rec['seq'],
                    ':ts1' => (int)$rec['ts_epoch'],
                ]);
                $succRow = $stmtSucc->fetch();
            } else {
                $succRow = false;
            }

            if ($succRow && in_array((string)$succRow['net_zone'], $validZones, true)) {
                $stmtPred->execute([
                    ':uid' => $succRow['unit_id'],
                    ':b1'  => (int)$succRow['boot'],
                    ':b2'  => (int)$succRow['boot'],
                    ':s1'  => (int)$succRow['seq'],
                    ':b3'  => (int)$succRow['boot'],
                    ':s2'  => (int)$succRow['seq'],
                    ':ts1' => (int)$succRow['ts_epoch'],
                ]);
                $succPredRow = $stmtPred->fetch();

                if ($succPredRow && in_array((string)$succPredRow['net_zone'], $validZones, true)) {
                    $sFrom = (string)$succPredRow['net_zone'];
                    $sTo   = (string)$succRow['net_zone'];

                    if ($sFrom === 'YARD' && ($sTo === 'TECH_HOTSPOT' || $sTo === 'OFFLINE')) {
                        $sExitEpoch = ($succRow['zone_exit_epoch'] > 0
                            && $succRow['zone_exit_epoch'] <= $succRow['ts_epoch']
                            && ($succRow['ts_epoch'] - $succRow['zone_exit_epoch']) <= 620)
                            ? (int)$succRow['zone_exit_epoch']
                            : (int)$succRow['ts_epoch'];

                        $sEvId = sprintf('MV-%s-%d-%d-OUT', substr(md5($succRow['unit_id']), 0, 6), $succRow['boot'], $succRow['seq']);
                        $stmtMove->execute([
                            ':id'            => $sEvId,
                            ':unit_id'       => $succRow['unit_id'],
                            ':event_type'    => 'EXIT_YARD',
                            ':from_zone'     => 'YARD',
                            ':to_zone'       => $sTo,
                            ':event_epoch'   => $sExitEpoch,
                            ':boot_id'       => $succRow['boot'],
                            ':seq_no'        => $succRow['seq'],
                            ':v_bat'         => $succRow['v_bat'],
                            ':rpm'           => max(0, (int)$succRow['rpm']),
                            ':speed_kmh'     => (int)$succRow['speed_kmh'],
                            ':departed'      => date('Y-m-d H:i:s', max(1, $sExitEpoch)),
                            ':returned'      => null,
                            ':away_min'      => null,
                            ':debounce_hits' => 3,
                            ':tag'           => 'Test Drive',
                        ]);
                        $stmtDelMoveType->execute([
                            ':uid'   => $succRow['unit_id'],
                            ':b'     => $succRow['boot'],
                            ':s'     => $succRow['seq'],
                            ':etype' => 'ENTER_YARD',
                        ]);
                    } elseif (($sFrom === 'TECH_HOTSPOT' || $sFrom === 'OFFLINE') && $sTo === 'YARD') {
                        $sEnterEpoch = (int)$succRow['ts_epoch'];
                        $sEvId = sprintf('MV-%s-%d-%d-IN', substr(md5($succRow['unit_id']), 0, 6), $succRow['boot'], $succRow['seq']);
                        $stmtMove->execute([
                            ':id'            => $sEvId,
                            ':unit_id'       => $succRow['unit_id'],
                            ':event_type'    => 'ENTER_YARD',
                            ':from_zone'     => $sFrom,
                            ':to_zone'       => 'YARD',
                            ':event_epoch'   => $sEnterEpoch,
                            ':boot_id'       => $succRow['boot'],
                            ':seq_no'        => $succRow['seq'],
                            ':v_bat'         => $succRow['v_bat'],
                            ':rpm'           => max(0, (int)$succRow['rpm']),
                            ':speed_kmh'     => (int)$succRow['speed_kmh'],
                            ':departed'      => date('Y-m-d H:i:s', max(1, $sEnterEpoch)),
                            ':returned'      => date('Y-m-d H:i:s', max(1, $sEnterEpoch)),
                            ':away_min'      => null,
                            ':debounce_hits' => 2,
                            ':tag'           => 'Test Drive',
                        ]);
                        $stmtDelMoveType->execute([
                            ':uid'   => $succRow['unit_id'],
                            ':b'     => $succRow['boot'],
                            ':s'     => $succRow['seq'],
                            ':etype' => 'EXIT_YARD',
                        ]);
                    } else {
                        // Tidak ada transisi antara sFrom dan sTo -> hapus event yang sebelumnya mungkin tercatat
                        $stmtDelMove->execute([
                            ':uid' => $succRow['unit_id'],
                            ':b'   => $succRow['boot'],
                            ':s'   => $succRow['seq'],
                        ]);
                    }
                }
            }
        }

        $insertedCount++;
    }

    // 4. Perbarui tabel status live `vehicles` dengan proteksi urutan monoton
    if ($primaryUnitId && $latestRecord) {
        $newestBatchRec = end($normalized);
        $incBoot = (int)$newestBatchRec['boot'];
        $incSeq  = (int)$newestBatchRec['seq'];
        $incTs   = (int)$newestBatchRec['ts_epoch'];

        // Cek pembaruan metrik telemetri (hanya jika lebih baru atau paket live non-burst)
        if (!$isBurstSync) {
            $isNewerTelemetry = true;
        } else {
            $isNewerTelemetry = ($incBoot > $curBoot)
                || ($incBoot === $curBoot && $incSeq > $curSeq)
                || ($incBoot === $curBoot && $incSeq === $curSeq && $incTs > $curTs)
                || ($curBoot === 0 && $curSeq === 0 && $curTs === 0);
        }

        // Cek pembaruan zona jaringan (hanya jika record net_zone lebih baru dari net_zone_boot/seq/ts)
        $shouldUpdateZone = false;
        if ($newestValidZoneRec) {
            $nzBoot = (int)$newestValidZoneRec['boot'];
            $nzSeq  = (int)$newestValidZoneRec['seq'];
            $nzTs   = (int)$newestValidZoneRec['ts_epoch'];
            $shouldUpdateZone = ($nzBoot > $curZoneBoot)
                || ($nzBoot === $curZoneBoot && $nzSeq > $curZoneSeq)
                || ($nzBoot === $curZoneBoot && $nzSeq === $curZoneSeq && $nzTs > $curZoneTs)
                || ($curZoneBoot === 0 && $curZoneSeq === 0 && $curZoneTs === 0);
        }

        if ($shouldUpdateZone) {
            $targetZone      = (string)$newestValidZoneRec['net_zone'];
            $targetSyncSsid  = ($newestValidZoneRec['sync_ssid'] !== '') ? (string)$newestValidZoneRec['sync_ssid'] : (string)($vehRow['sync_ssid'] ?? '');
            $targetInYard    = ($targetZone === 'TECH_HOTSPOT' || $targetZone === 'OFFLINE') ? 0 : 1;
            $targetZoneBoot  = (int)$newestValidZoneRec['boot'];
            $targetZoneSeq   = (int)$newestValidZoneRec['seq'];
            $targetZoneTs    = (int)$newestValidZoneRec['ts_epoch'];
        } else {
            $targetZone      = $vehRow ? (string)($vehRow['net_zone'] ?? 'UNKNOWN') : 'UNKNOWN';
            $targetSyncSsid  = $vehRow ? (string)($vehRow['sync_ssid'] ?? '') : '';
            $targetInYard    = $vehRow ? (int)($vehRow['in_yard'] ?? 1) : 1;
            $targetZoneBoot  = $curZoneBoot;
            $targetZoneSeq   = $curZoneSeq;
            $targetZoneTs    = $curZoneTs;
        }

        if ($isNewerTelemetry) {
            $vBat = (float)$newestBatchRec['v_bat'];
            $engineOn = $newestBatchRec['engine_on'] === 1;
            $critAlert = $newestBatchRec['crit_alert'] === 1;
            $canOk = $newestBatchRec['can_ok'] === 1;

            // Ambil threshold batas kritis dari node_configs
            $stmtCfg = $pdo->prepare("SELECT `crit_v` FROM `node_configs` WHERE `unit_id` = :uid");
            $stmtCfg->execute([':uid' => $primaryUnitId]);
            $cfgRow = $stmtCfg->fetch();
            $critV = $cfgRow ? (float)$cfgRow['crit_v'] : 11.80;

            // State Machine evaluasi
            if ($critAlert || $vBat < $critV) {
                $newState = 'CRITICAL';
                $newStatusLabel = 'Critical Battery Drain';
            } elseif ($engineOn) {
                $newState = 'WARMUP';
                $newStatusLabel = 'Alternator Charging';
            } elseif (!$canOk) {
                $newState = 'STANDBY';
                $newStatusLabel = 'CAN Loopback Fault';
            } elseif ($vBat < 12.20) {
                $newState = 'STANDBY';
                $newStatusLabel = 'Low Battery Warning';
            } else {
                $newState = 'STANDBY';
                $newStatusLabel = 'Standby (Deep Sleep)';
            }

            // Kelola Burst Sync Badge (`buffer_used`) langsung dari nilai aktual firmware
            $rawBuf = (int)$newestBatchRec['buffer_used'];
            $bufferUsed = max(0, min(5000, $rawBuf));

            $sqlUpdateVehicle = "
                UPDATE `vehicles`
                SET
                    `state`          = :state,
                    `status_label`   = :status_label,
                    `in_yard`        = :in_yard,
                    `online_status`  = 'ONLINE',
                    `v_bat`          = :v_bat,
                    `adc_raw_mv`     = :adc_raw_mv,
                    `rtc_temp_c`     = :rtc_temp_c,
                    `can_ok`         = :can_ok,
                    `rssi`           = :rssi,
                    `net_zone`       = :net_zone,
                    `sync_ssid`      = :sync_ssid,
                    `net_zone_boot`  = :net_zone_boot,
                    `net_zone_seq`   = :net_zone_seq,
                    `net_zone_ts`    = :net_zone_ts,
                    `buffer_used`    = :buffer_used,
                    `last_boot`      = :last_boot,
                    `last_seq`       = :last_seq,
                    `last_ts_epoch`  = :last_ts_epoch,
                    `speed_kmh`      = :speed_kmh,
                    `iat_c`          = :iat_c,
                    `map_kpa`        = :map_kpa,
                    `load_pct`       = :load_pct,
                    `tps_pct`        = :tps_pct,
                    `ign_deg`        = :ign_deg,
                    `maf_gs`         = :maf_gs,
                    `run_time_s`     = :run_time_s,
                    `fuel_pct`       = :fuel_pct,
                    `fuel_rate_lh`   = :fuel_rate_lh,
                    `o2_v`           = :o2_v,
                    `stft_pct`       = :stft_pct,
                    `mil_on`         = :mil_on,
                    `ecu_v`          = :ecu_v,
                    `dist_clr_km`    = :dist_clr_km,
                    `last_seen`      = NOW()
                WHERE `unit_id` = :uid
            ";
            $stmtUpdateVeh = $pdo->prepare($sqlUpdateVehicle);
            $stmtUpdateVeh->execute([
                ':state'          => $newState,
                ':status_label'   => $newStatusLabel,
                ':in_yard'        => $targetInYard,
                ':v_bat'          => $newestBatchRec['v_bat'],
                ':adc_raw_mv'     => $newestBatchRec['adc_raw_mv'],
                ':rtc_temp_c'     => $newestBatchRec['rtc_temp_c'],
                ':can_ok'         => $newestBatchRec['can_ok'],
                ':rssi'           => $newestBatchRec['rssi'],
                ':net_zone'       => $targetZone,
                ':sync_ssid'      => $targetSyncSsid,
                ':net_zone_boot'  => $targetZoneBoot,
                ':net_zone_seq'   => $targetZoneSeq,
                ':net_zone_ts'    => $targetZoneTs,
                ':buffer_used'    => $bufferUsed,
                ':last_boot'      => $newestBatchRec['boot'],
                ':last_seq'       => $newestBatchRec['seq'],
                ':last_ts_epoch'  => $newestBatchRec['ts_epoch'],
                ':speed_kmh'      => $newestBatchRec['speed_kmh'],
                ':iat_c'          => $newestBatchRec['iat_c'],
                ':map_kpa'        => $newestBatchRec['map_kpa'],
                ':load_pct'       => $newestBatchRec['load_pct'],
                ':tps_pct'        => $newestBatchRec['tps_pct'],
                ':ign_deg'        => $newestBatchRec['ign_deg'],
                ':maf_gs'         => $newestBatchRec['maf_gs'],
                ':run_time_s'     => $newestBatchRec['run_time_s'],
                ':fuel_pct'       => $newestBatchRec['fuel_pct'],
                ':fuel_rate_lh'   => $newestBatchRec['fuel_rate_lh'],
                ':o2_v'           => $newestBatchRec['o2_v'],
                ':stft_pct'       => $newestBatchRec['stft_pct'],
                ':mil_on'         => $newestBatchRec['mil_on'],
                ':ecu_v'          => $newestBatchRec['ecu_v'],
                ':dist_clr_km'    => $newestBatchRec['dist_clr_km'],
                ':uid'            => $primaryUnitId,
            ]);

            $statusUpdated = true;
        } elseif ($shouldUpdateZone) {
            $stmtUpdateZoneOnly = $pdo->prepare("
                UPDATE `vehicles`
                SET `net_zone`      = :net_zone,
                    `sync_ssid`     = :sync_ssid,
                    `in_yard`       = :in_yard,
                    `net_zone_boot` = :net_zone_boot,
                    `net_zone_seq`  = :net_zone_seq,
                    `net_zone_ts`   = :net_zone_ts
                WHERE `unit_id` = :uid
            ");
            $stmtUpdateZoneOnly->execute([
                ':net_zone'      => $targetZone,
                ':sync_ssid'     => $targetSyncSsid,
                ':in_yard'       => $targetInYard,
                ':net_zone_boot' => $targetZoneBoot,
                ':net_zone_seq'  => $targetZoneSeq,
                ':net_zone_ts'   => $targetZoneTs,
                ':uid'           => $primaryUnitId,
            ]);
            $statusUpdated = true;
        }

        // Catat audit trail saat terjadi Burst Sync offline
        if ($isBurstSync) {
            $stmtAudit = $pdo->prepare("
                INSERT INTO `system_events` (`unit_id`, `event_type`, `severity`, `message`, `created_at`)
                VALUES (:uid, 'BURST_SYNC', 'INFO', :msg, NOW())
            ");
            $stmtAudit->execute([
                ':uid' => $primaryUnitId,
                ':msg' => "Burst sync ingested {$insertedCount} offline record(s) from Two-Tier RTC/Flash buffer (seq up to #{$incSeq}).",
            ]);
        }
    }

    $pdo->commit();
    @unlink(sys_get_temp_dir() . '/orion_get_data_cache.json');

} catch (Exception $e) {
    $pdo->rollBack();
    sendJson([
        'error' => 'TRANSACTION_FAILED',
        'message' => $e->getMessage(),
    ], 500);
}

// 5. Cek flag one-shot pending_ack di `node_configs` untuk Piggyback ACK (Firmware v1.4.1)
$piggybackConfig = null;
if ($primaryUnitId) {
    $stmtAckCfg = $pdo->prepare("SELECT * FROM `node_configs` WHERE `unit_id` = :uid");
    $stmtAckCfg->execute([':uid' => $primaryUnitId]);
    $piggybackConfig = $stmtAckCfg->fetch();
}

$hasPendingAck = $piggybackConfig && !empty($piggybackConfig['pending_ack']);

if ($hasPendingAck) {
    // Tandai pending_ack = 0 segera setelah diambil agar konfigurasi tidak dikirim berulang-ulang
    $stmtClearAck = $pdo->prepare("UPDATE `node_configs` SET `pending_ack` = 0 WHERE `unit_id` = :uid");
    $stmtClearAck->execute([':uid' => $primaryUnitId]);

    $responsePayload = [
        'status'      => 'ok',
        'saved'       => $insertedCount,
        'pending_ack' => true,
        'crit_v'      => round((float)$piggybackConfig['crit_v'], 2),
        'slope_m'     => round((float)$piggybackConfig['cal_slope'], 7),
        'offset_c'    => round((float)$piggybackConfig['cal_offset'], 4),
        'sleep_cfg'   => formatSleepCfgLabel((int)$piggybackConfig['sleep_cfg']),
    ];
} else {
    $responsePayload = [
        'status'      => 'ok',
        'saved'       => $insertedCount,
        'pending_ack' => false,
    ];
}

// Output compact JSON (tanpa spasi setelah ':') agar ESP32 indexOf("\"pending_ack\":true") selalu akurat
http_response_code(200);
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
echo json_encode($responsePayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
exit(0);
