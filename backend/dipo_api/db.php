<?php
/**
 * ORION Telemetry System - Database Connection, Timezone, Env & CORS Helper
 * Compatible with Cloud Hosting / VPS (.env or environment variables) and local XAMPP / MAMP.
 */

date_default_timezone_set('Asia/Jakarta');

if (
    PHP_SAPI !== 'cli' &&
    isset($_SERVER['SCRIPT_FILENAME']) &&
    realpath((string) $_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)
) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'ERROR', 'message' => 'FORBIDDEN']);
    exit;
}

if (!function_exists('orionEnv')) {
    /**
     * Reads configuration from .env file (cached per request), $_ENV, $_SERVER, or getenv().
     */
    function orionEnv(string $key, ?string $default = null): ?string {
        static $dotenv = null;
        if ($dotenv === null) {
            $dotenv = [];
            $envPath = __DIR__ . '/.env';
            if (is_file($envPath) && is_readable($envPath)) {
                $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if (is_array($lines)) {
                    foreach ($lines as $line) {
                        $trimmed = trim($line);
                        if ($trimmed === '' || $trimmed[0] === '#' || strpos($trimmed, '=') === false) {
                            continue;
                        }
                        list($k, $v) = explode('=', $trimmed, 2);
                        $k = trim($k);
                        $v = trim($v);
                        if (strlen($v) >= 2 && (($v[0] === '"' && $v[strlen($v) - 1] === '"') || ($v[0] === "'" && $v[strlen($v) - 1] === "'"))) {
                            $v = substr($v, 1, -1);
                        }
                        if ($k !== '') {
                            $dotenv[$k] = $v;
                        }
                    }
                }
            }
        }

        if (array_key_exists($key, $dotenv)) {
            return $dotenv[$key];
        }
        if (isset($_ENV[$key])) {
            return (string)$_ENV[$key];
        }
        if (isset($_SERVER[$key])) {
            return (string)$_SERVER[$key];
        }
        $val = getenv($key);
        return ($val !== false) ? (string)$val : $default;
    }
}

// 1. CORS Preflight & Security Headers
$rawOrigin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
$configuredOrigin = trim(orionEnv('CORS_ALLOWED_ORIGIN', '*') ?: '*');

// Strip markdown link formatting if present, e.g. [url](url) -> url
if (preg_match('/\[.*?\]\((.*?)\)/', $configuredOrigin, $matches)) {
    $configuredOrigin = trim($matches[1]);
}

$originClean = '';
if ($rawOrigin !== '') {
    $parsed = parse_url($rawOrigin);
    if (!empty($parsed['scheme']) && !empty($parsed['host'])) {
        $originClean = $parsed['scheme'] . '://' . $parsed['host'] . (!empty($parsed['port']) ? (':' . $parsed['port']) : '');
    }
}

$allowedOrigin = '*';
if ($configuredOrigin === '*' || $configuredOrigin === '') {
    $allowedOrigin = '*';
} elseif ($originClean !== '') {
    $parsedHost = strtolower((string) (parse_url($originClean, PHP_URL_HOST) ?? ''));
    if (
        $parsedHost === 'localhost' ||
        $parsedHost === '127.0.0.1' ||
        $parsedHost === 'oriontelemetry.tech' ||
        str_ends_with($parsedHost, '.oriontelemetry.tech')
    ) {
        $allowedOrigin = $originClean;
    } else {
        $allowedOrigin = $configuredOrigin;
    }
} else {
    $allowedOrigin = $configuredOrigin;
}

header("Access-Control-Allow-Origin: {$allowedOrigin}");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept, X-Orion-Node, X-Burst-Sync, X-Node-Token, Authorization, Cache-Control, Pragma, Origin, X-Requested-With, X-Sync-SSID");
header("Access-Control-Allow-Private-Network: true");
header("Access-Control-Max-Age: 86400"); // 24 hours cache for preflight
if ($allowedOrigin !== '*') {
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
}
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

// Handle preflight OPTIONS request immediately
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// 2. Helper to output JSON cleanly
if (!function_exists('sendJson')) {
    function sendJson($data, int $statusCode = 200): void {
        http_response_code($statusCode);
        header("Content-Type: application/json; charset=utf-8");
        header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
        header("Pragma: no-cache");
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit(0);
    }
}

if (!function_exists('orionSchemaLockFile')) {
    function orionSchemaLockFile(): string {
        return sys_get_temp_dir() . '/orion_schema_v150.ok';
    }
}

if (!function_exists('isOrionSchemaReady')) {
    function isOrionSchemaReady(): bool {
        return is_file(orionSchemaLockFile());
    }
}

if (!function_exists('markOrionSchemaReady')) {
    function markOrionSchemaReady(): void {
        @file_put_contents(orionSchemaLockFile(), (string)time());
    }
}

if (!function_exists('readJsonBody')) {
    function readJsonBody(): array {
        global $TEST_JSON_BODY;
        if (isset($TEST_JSON_BODY) && is_array($TEST_JSON_BODY)) {
            return $TEST_JSON_BODY;
        }
        $rawInput = file_get_contents('php://input');
        if (empty($rawInput) && (PHP_SAPI === 'cli' || empty($_SERVER['REMOTE_ADDR']))) {
            $rawInput = file_get_contents('php://stdin');
        }
        if (empty($rawInput)) {
            sendJson(['error' => 'EMPTY_BODY', 'message' => 'No JSON payload received.'], 400);
        }
        if (strlen($rawInput) > 65536) {
            sendJson(['error' => 'PAYLOAD_TOO_LARGE', 'message' => 'JSON payload exceeds 64 KB limit.'], 413);
        }
        $payload = json_decode($rawInput, true);
        if (!is_array($payload)) {
            sendJson(['error' => 'INVALID_JSON', 'message' => 'Malformed JSON body.'], 400);
        }
        return $payload;
    }
}

if (!function_exists('formatSleepCfgLabel')) {
    function formatSleepCfgLabel(int $seconds): string {
        if ($seconds >= 3600 && $seconds % 3600 === 0) {
            $hrs = (int)($seconds / 3600);
            return $hrs . ($hrs === 1 ? ' Hour' : ' Hours');
        }
        if ($seconds >= 60 && $seconds % 60 === 0) {
            $mins = (int)($seconds / 60);
            return $mins . ($mins === 1 ? ' Minute' : ' Minutes');
        }
        return $seconds . ($seconds === 1 ? ' Second' : ' Seconds');
    }
}

if (!function_exists('parseSleepCfgSeconds')) {
    function parseSleepCfgSeconds($raw, int $default = 300): int {
        if (is_int($raw) || is_float($raw)) {
            return max(10, (int)round((float)$raw));
        }
        if (is_string($raw)) {
            $trimmed = trim($raw);
            if ($trimmed === '') {
                return $default;
            }
            if (ctype_digit($trimmed)) {
                return max(10, (int)$trimmed);
            }
            if (preg_match('/(\d+(?:\.\d+)?)\s*(?:hour|hr|h|jam)/i', $trimmed, $m)) {
                return max(60, (int)round((float)$m[1] * 3600));
            }
            if (preg_match('/(\d+(?:\.\d+)?)\s*(?:min|mnt|m)/i', $trimmed, $m)) {
                return max(10, (int)round((float)$m[1] * 60));
            }
            if (preg_match('/(\d+(?:\.\d+)?)\s*(?:sec|s|detik)/i', $trimmed, $m)) {
                return max(5, (int)round((float)$m[1]));
            }
        }
        return $default;
    }
}

// 3. Database Configurations (JAWSDB_URL / CLEARDB_DATABASE_URL / Env / .env with Local XAMPP/MAMP Fallback)
$databaseUrl = orionEnv('JAWSDB_URL')
    ?: orionEnv('JAWSDB_MARIA_URL')
    ?: orionEnv('CLEARDB_DATABASE_URL')
    ?: orionEnv('DATABASE_URL');

$isCloudDatabaseUrl = false;
$hasCustomDbEnv =
    orionEnv('DB_HOST') !== null ||
    orionEnv('DB_USER') !== null ||
    orionEnv('DB_PASS') !== null ||
    orionEnv('DB_NAME') !== null;

$dbHost = orionEnv('DB_HOST', '127.0.0.1') ?: '127.0.0.1';
$dbPort = (int)(orionEnv('DB_PORT', '3306') ?: 3306);
$dbName = orionEnv('DB_NAME', 'dipo_telemetry') ?: 'dipo_telemetry';
$dbUser = orionEnv('DB_USER', 'root') ?: 'root';
$dbPass = orionEnv('DB_PASS', '') ?? '';

if (!empty($databaseUrl)) {
    $parsedUrl = parse_url($databaseUrl);
    if (is_array($parsedUrl) && !empty($parsedUrl['host'])) {
        $dbHost = (string)$parsedUrl['host'];
        $dbPort = isset($parsedUrl['port']) ? (int)$parsedUrl['port'] : 3306;
        $dbUser = isset($parsedUrl['user']) ? rawurldecode((string)$parsedUrl['user']) : $dbUser;
        $dbPass = isset($parsedUrl['pass']) ? rawurldecode((string)$parsedUrl['pass']) : '';
        if (!empty($parsedUrl['path'])) {
            $parsedDbName = ltrim((string)$parsedUrl['path'], '/');
            if ($parsedDbName !== '') {
                $dbName = $parsedDbName;
            }
        }
        $isCloudDatabaseUrl = true;
        $hasCustomDbEnv = true;
    }
}

if ($hasCustomDbEnv) {
    $connectionAttempts = [
        ['host' => $dbHost, 'port' => $dbPort, 'user' => $dbUser, 'pass' => $dbPass],
    ];
    if (!$isCloudDatabaseUrl && strtolower($dbHost) === 'localhost') {
        $connectionAttempts[] = ['host' => '127.0.0.1', 'port' => $dbPort, 'user' => $dbUser, 'pass' => $dbPass];
    }
} else {
    $connectionAttempts = [
        ['host' => '127.0.0.1', 'port' => $dbPort, 'user' => 'root', 'pass' => ''],
        ['host' => 'localhost', 'port' => $dbPort, 'user' => 'root', 'pass' => ''],
        ['host' => '127.0.0.1', 'port' => 8889, 'user' => 'root', 'pass' => 'root'],
        ['host' => '127.0.0.1', 'port' => 3306, 'user' => 'root', 'pass' => 'root'],
    ];
}

$pdo = null;
$lastError = null;
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_PERSISTENT         => !$isCloudDatabaseUrl,
    PDO::ATTR_TIMEOUT            => 4,
];
if (defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
    $options[PDO::MYSQL_ATTR_INIT_COMMAND] = "SET time_zone = '+07:00'";
}

foreach ($connectionAttempts as $conn) {
    try {
        $dsn = "mysql:host={$conn['host']};port={$conn['port']};dbname={$dbName};charset=utf8mb4";
        $pdo = new PDO($dsn, $conn['user'], $conn['pass'], $options);
        if (!defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
            $pdo->exec("SET time_zone = '+07:00'");
        }
        break; // Berhasil terhubung
    } catch (PDOException $e) {
        $lastError = $e->getMessage();
    }
}

if (!$pdo) {
    sendJson([
        'error' => 'DATABASE_CONNECTION_FAILED',
        'message' => "Unable to connect to MySQL database ({$dbHost}:{$dbPort}/{$dbName}).",
        'detail' => $lastError,
        'hint' => 'Periksa JAWSDB_URL / DB_HOST / DB_USER / DB_PASS / DB_NAME pada Config Vars Heroku atau .env server.',
    ], 500);
}

if (!function_exists('ensureOrionDatabaseInitialized')) {
    /**
     * Auto-migrates production schema and physical hardware unit (`MITSUBISHI-STOCK-01` only)
     * when running against a freshly provisioned database (e.g. Heroku JawsDB MySQL).
     *
     * @return array{migrated: bool, reason: string}
     */
    function ensureOrionDatabaseInitialized(PDO $pdo, bool $force = false): array {
        static $alreadyChecked = false;
        if ($alreadyChecked && !$force) {
            return ['migrated' => false, 'reason' => 'already_checked'];
        }
        $alreadyChecked = true;

        $activeDb = '';
        try {
            $activeDb = (string)($pdo->query("SELECT DATABASE()")->fetchColumn() ?: 'default');
        } catch (Exception $ignored) {
            $activeDb = 'default';
        }
        $initLock = sys_get_temp_dir() . '/orion_init_' . substr(md5($activeDb), 0, 8) . '.ok';
        if (!$force && is_file($initLock)) {
            return ['migrated' => false, 'reason' => 'cached'];
        }

        $needsMigration = false;
        try {
            $hasVehicles = (bool)$pdo->query("SHOW TABLES LIKE 'vehicles'")->fetchColumn();
            $hasLogs = (bool)$pdo->query("SHOW TABLES LIKE 'telemetry_logs'")->fetchColumn();
            $hasConfigs = (bool)$pdo->query("SHOW TABLES LIKE 'node_configs'")->fetchColumn();
            $hasMovements = (bool)$pdo->query("SHOW TABLES LIKE 'movement_events'")->fetchColumn();
            $hasEvents = (bool)$pdo->query("SHOW TABLES LIKE 'system_events'")->fetchColumn();
            $hasTickets = (bool)$pdo->query("SHOW TABLES LIKE 'maintenance_tickets'")->fetchColumn();

            if (!$hasVehicles || !$hasLogs || !$hasConfigs || !$hasMovements || !$hasEvents || !$hasTickets) {
                $needsMigration = true;
            } else {
                $count = (int)$pdo->query("SELECT COUNT(*) FROM `vehicles`")->fetchColumn();
                if ($count === 0) {
                    $needsMigration = true;
                }
            }
        } catch (Exception $e) {
            $needsMigration = true;
        }

        if (!$needsMigration) {
            @file_put_contents($initLock, (string)time());
            return ['migrated' => false, 'reason' => 'schema_present'];
        }

        $schemaCandidates = [
            __DIR__ . '/schema_production.sql',
            dirname(__DIR__, 3) . '/backend/dipo_api/schema_production.sql',
        ];
        $schemaFile = null;
        foreach ($schemaCandidates as $candidate) {
            if (is_file($candidate) && is_readable($candidate)) {
                $schemaFile = $candidate;
                break;
            }
        }
        if ($schemaFile === null) {
            return ['migrated' => false, 'reason' => 'missing_schema_production_sql'];
        }

        $sql = (string)file_get_contents($schemaFile);
        $lines = preg_split('/\R/', $sql) ?: [];
        $filtered = [];
        foreach ($lines as $line) {
            $trimmed = ltrim($line);
            if ($trimmed === '' || strncmp($trimmed, '--', 2) === 0 || $trimmed[0] === '#') {
                continue;
            }
            $filtered[] = $line;
        }
        $cleanSql = implode("\n", $filtered);
        $statements = preg_split('/;\s*(?:\r?\n|$)/', $cleanSql) ?: [];

        foreach ($statements as $stmtSql) {
            $stmtSql = trim($stmtSql);
            if ($stmtSql !== '') {
                $pdo->exec($stmtSql);
            }
        }

        @file_put_contents($initLock, (string)time());
        markOrionSchemaReady();
        ensureObd2ReadOnlyColumns($pdo, $force);
        ensureNetZoneAndMovementSchema($pdo, $force);
        return ['migrated' => true, 'reason' => 'executed_schema_production'];
    }
}


if (!function_exists('purgeOrionDummyUnits')) {
    /**
     * Purges legacy dummy vehicles and related records (e.g. STOCK-02 .. STOCK-12)
     * from database tables (`vehicles`, `node_configs`, `telemetry_logs`, `movement_events`,
     * `system_events`, `maintenance_tickets`), ensuring only the single physical
     * hardware node `MITSUBISHI-STOCK-01` remains in production.
     *
     * @param PDO $pdo
     * @param string $keepUnitId Default 'MITSUBISHI-STOCK-01'
     * @return array{target_node: string, deleted: array<string, int|string>, seeded_vehicle?: int, seeded_config?: int}
     */
    function purgeOrionDummyUnits(PDO $pdo, string $keepUnitId = 'MITSUBISHI-STOCK-01'): array {
        $result = [
            'target_node' => $keepUnitId,
            'deleted'     => [],
        ];

        // Safest cascade deletion order: child tables first, then parent tables
        $tables = [
            'telemetry_logs',
            'movement_events',
            'system_events',
            'maintenance_tickets',
            'node_configs',
            'vehicles',
        ];

        foreach ($tables as $tbl) {
            try {
                $hasTable = (bool)$pdo->query("SHOW TABLES LIKE '{$tbl}'")->fetchColumn();
                if ($hasTable) {
                    $stmt = $pdo->prepare("DELETE FROM `{$tbl}` WHERE `unit_id` != ?");
                    $stmt->execute([$keepUnitId]);
                    $result['deleted'][$tbl] = $stmt->rowCount();
                } else {
                    $result['deleted'][$tbl] = 0;
                }
            } catch (Exception $e) {
                $result['deleted'][$tbl] = 'error: ' . $e->getMessage();
            }
        }

        // Ensure the single physical hardware unit exists in `vehicles`
        try {
            $hasVehStmt = $pdo->prepare("SELECT COUNT(*) FROM `vehicles` WHERE `unit_id` = ?");
            $hasVehStmt->execute([$keepUnitId]);
            if ((int)$hasVehStmt->fetchColumn() === 0) {
                $stmtInsertVeh = $pdo->prepare("
                    INSERT INTO `vehicles` 
                      (`unit_id`, `bay`, `model`, `trim`, `vin`, `color`, `status_label`, `state`, `in_yard`, `online_status`, `v_bat`, `adc_raw_mv`, `rtc_temp_c`, `can_ok`, `rssi`, `buffer_used`, `last_boot`, `last_seq`, `last_ts_epoch`, `last_seen`)
                    VALUES
                      (?, 'A-01', 'PAJERO SPORT', 'DAKAR 4x4', 'MMBGUKS10RH004121', 'Graphite Grey', 'Standby (Deep Sleep)', 'STANDBY', 1, 'ONLINE', 12.60, 2262, 31.20, 1, -44, 3, 41, 41, UNIX_TIMESTAMP(), NOW())
                ");
                $stmtInsertVeh->execute([$keepUnitId]);
                $result['seeded_vehicle'] = 1;
            }
        } catch (Exception $e) {
            $result['seeded_vehicle_error'] = $e->getMessage();
        }

        // Ensure the single physical hardware unit exists in `node_configs`
        try {
            $hasCfgStmt = $pdo->prepare("SELECT COUNT(*) FROM `node_configs` WHERE `unit_id` = ?");
            $hasCfgStmt->execute([$keepUnitId]);
            if ((int)$hasCfgStmt->fetchColumn() === 0) {
                $stmtInsertCfg = $pdo->prepare("
                    INSERT INTO `node_configs` 
                      (`unit_id`, `sleep_cfg`, `fast_poll_s`, `crit_v`, `debounce_cnt`, `cal_slope`, `cal_offset`, `pending_ack`)
                    VALUES
                      (?, 300, 10, 11.80, 3, 0.005412, 0.069, 0)
                ");
                $stmtInsertCfg->execute([$keepUnitId]);
                $result['seeded_config'] = 1;
            }
        } catch (Exception $e) {
            $result['seeded_config_error'] = $e->getMessage();
        }

        return $result;
    }
}

if (!function_exists('orionObd2ColumnDefinitions')) {
    /**
     * Canonical list of the 15 Read-Only OBD-II v1.5.0 telemetry columns.
     *
     * @return array<string, string>
     */
    function orionObd2ColumnDefinitions(): array {
        return [
            'speed_kmh'    => "SMALLINT NOT NULL DEFAULT 0 COMMENT 'OBD-II Mode 01 PID 0x0D Vehicle Speed (km/h)'",
            'iat_c'        => "SMALLINT NOT NULL DEFAULT 0 COMMENT 'OBD-II Mode 01 PID 0x0F Intake Air Temp (C)'",
            'map_kpa'      => "SMALLINT NOT NULL DEFAULT 0 COMMENT 'OBD-II Mode 01 PID 0x0B Manifold Absolute Pressure (kPa)'",
            'load_pct'     => "DECIMAL(5,1) NOT NULL DEFAULT 0.0 COMMENT 'OBD-II Mode 01 PID 0x04 Engine Load (%)'",
            'tps_pct'      => "DECIMAL(5,1) NOT NULL DEFAULT 0.0 COMMENT 'OBD-II Mode 01 PID 0x11 Throttle Position (%)'",
            'ign_deg'      => "DECIMAL(5,1) NOT NULL DEFAULT 0.0 COMMENT 'OBD-II Mode 01 PID 0x0E Ignition Timing Advance (deg)'",
            'maf_gs'       => "DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT 'OBD-II Mode 01 PID 0x10 Mass Air Flow (g/s)'",
            'run_time_s'   => "INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'OBD-II Mode 01 PID 0x1F Engine Run Time (s)'",
            'fuel_pct'     => "DECIMAL(5,1) NOT NULL DEFAULT 0.0 COMMENT 'OBD-II Mode 01 PID 0x2F Fuel Tank Level (%)'",
            'fuel_rate_lh' => "DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'OBD-II Mode 01 PID 0x5E / MAF Fuel Rate (L/h)'",
            'o2_v'         => "DECIMAL(4,2) NOT NULL DEFAULT 0.00 COMMENT 'OBD-II Mode 01 PID 0x14 O2 Sensor Voltage (V)'",
            'stft_pct'     => "DECIMAL(5,1) NOT NULL DEFAULT 0.0 COMMENT 'OBD-II Mode 01 PID 0x06 Short Term Fuel Trim (%)'",
            'mil_on'       => "TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'OBD-II Mode 01 PID 0x01 Bit A7 MIL Check Engine Status (Read-Only)'",
            'ecu_v'        => "DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'OBD-II Mode 01 PID 0x42 Control Module Voltage (V)'",
            'dist_clr_km'  => "INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'OBD-II Mode 01 PID 0x31 Distance Since Codes Cleared (km)'",
        ];
    }
}

if (!function_exists('ensureObd2ReadOnlyColumns')) {
    /**
     * Idempotently ensures the 15 Read-Only OBD-II columns exist on both
     * `telemetry_logs` and `vehicles` (plus compatibility view `vehicle_units`).
     *
     * @return array{added: string[], verified: string[], view_ready: bool}
     */
    function ensureObd2ReadOnlyColumns(PDO $pdo, bool $force = false): array {
        $activeDb = '';
        try {
            $activeDb = (string)($pdo->query("SELECT DATABASE()")->fetchColumn() ?: 'default');
        } catch (Exception $ignored) {
            $activeDb = 'default';
        }
        $lockFile = sys_get_temp_dir() . '/orion_obd2_cols_' . substr(md5($activeDb), 0, 8) . '.ok';

        $columns = orionObd2ColumnDefinitions();
        $added = [];
        $verified = [];
        $viewReady = false;

        if (!$force && is_file($lockFile)) {
            foreach (['telemetry_logs', 'vehicles'] as $table) {
                foreach (array_keys($columns) as $col) {
                    $verified[] = "{$table}.{$col}";
                }
            }
            return ['added' => $added, 'verified' => $verified, 'view_ready' => true];
        }

        foreach (['telemetry_logs', 'vehicles'] as $table) {
            $existing = [];
            $stmtCols = $pdo->query("SHOW COLUMNS FROM `{$table}`");
            foreach ($stmtCols->fetchAll() as $row) {
                if (!empty($row['Field'])) {
                    $existing[(string)$row['Field']] = true;
                }
            }

            foreach ($columns as $col => $ddl) {
                if (!isset($existing[$col])) {
                    $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` {$ddl}");
                    $added[] = "{$table}.{$col}";
                }
                $verified[] = "{$table}.{$col}";
            }
        }

        try {
            $pdo->exec("CREATE OR REPLACE VIEW `vehicle_units` AS SELECT * FROM `vehicles`");
            $viewReady = true;
        } catch (Exception $ignored) {
            $viewReady = false;
        }

        @file_put_contents($lockFile, (string)time());
        return ['added' => $added, 'verified' => $verified, 'view_ready' => $viewReady];
    }
}

if (!function_exists('sanitizeSyncSsid')) {
    /**
     * Strips non-printable ASCII characters and caps X-Sync-SSID at 32 characters.
     */
    function sanitizeSyncSsid(string $raw): string {
        $clean = preg_replace('/[^\x20-\x7E]/', '', $raw);
        $clean = trim($clean ?? '');
        return substr($clean, 0, 32);
    }
}

if (!function_exists('normalizeOrionNetZone')) {
    /**
     * Validates and normalizes incoming net_zone values to the 4-state contract.
     */
    function normalizeOrionNetZone($raw): string {
        if (!is_string($raw) && !is_numeric($raw)) {
            return 'UNKNOWN';
        }
        $z = strtoupper(trim((string)$raw));
        if (in_array($z, ['YARD', 'TECH_HOTSPOT', 'OFFLINE', 'UNKNOWN'], true)) {
            return $z;
        }
        return 'UNKNOWN';
    }
}

if (!function_exists('ensureNetZoneAndMovementSchema')) {
    /**
     * Idempotently ensures ORION v1.6.0 net_zone / sync_ssid / zone_exit_epoch columns
     * on `telemetry_logs` and `vehicles`, extended transition columns + idempotency unique key
     * on `movement_events`, and refreshes the `vehicle_units` compatibility view.
     *
     * @return array{added: string[], verified: string[], unique_index: string, view_ready: bool}
     */
    function ensureNetZoneAndMovementSchema(PDO $pdo, bool $force = false): array {
        $activeDb = '';
        try {
            $activeDb = (string)($pdo->query("SELECT DATABASE()")->fetchColumn() ?: 'default');
        } catch (Exception $ignored) {
            $activeDb = 'default';
        }
        $lockFile = sys_get_temp_dir() . '/orion_netzone_v161_' . substr(md5($activeDb), 0, 8) . '.ok';

        $tableColumnDefs = [
            'telemetry_logs' => [
                'net_zone'        => "VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN'",
                'zone_exit_epoch' => "INT UNSIGNED NOT NULL DEFAULT 0",
                'sync_ssid'       => "VARCHAR(32) NOT NULL DEFAULT ''",
            ],
            'vehicles' => [
                'net_zone'      => "VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN'",
                'sync_ssid'     => "VARCHAR(32) NOT NULL DEFAULT ''",
                'net_zone_boot' => "INT UNSIGNED NOT NULL DEFAULT 0",
                'net_zone_seq'  => "INT UNSIGNED NOT NULL DEFAULT 0",
                'net_zone_ts'   => "INT UNSIGNED NOT NULL DEFAULT 0",
            ],
            'movement_events' => [
                'unit_id'    => "VARCHAR(64) NOT NULL DEFAULT 'MITSUBISHI-STOCK-01'",
                'event_type' => "VARCHAR(24) NOT NULL DEFAULT 'EXIT_YARD'",
                'from_zone'  => "VARCHAR(24) NOT NULL DEFAULT 'YARD'",
                'to_zone'    => "VARCHAR(24) NOT NULL DEFAULT 'OFFLINE'",
                'event_epoch'=> "INT UNSIGNED NOT NULL DEFAULT 0",
                'boot_id'    => "INT UNSIGNED NOT NULL DEFAULT 1",
                'seq_no'     => "INT UNSIGNED NOT NULL DEFAULT 0",
                'v_bat'      => "DECIMAL(5,2) NOT NULL DEFAULT 12.60",
                'rpm'        => "INT NOT NULL DEFAULT 0",
                'speed_kmh'  => "SMALLINT NOT NULL DEFAULT 0",
                'created_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            ],
        ];

        $added = [];
        $verified = [];
        $viewReady = false;

        if (!$force && is_file($lockFile)) {
            foreach ($tableColumnDefs as $tbl => $cols) {
                foreach (array_keys($cols) as $col) {
                    $verified[] = "{$tbl}.{$col}";
                }
            }
            return [
                'added'        => $added,
                'verified'     => $verified,
                'unique_index' => 'uniq_mv_unit_boot_seq_type',
                'view_ready'   => true,
            ];
        }

        foreach ($tableColumnDefs as $table => $cols) {
            $existing = [];
            $stmtCols = $pdo->query("SHOW COLUMNS FROM `{$table}`");
            foreach ($stmtCols->fetchAll() as $row) {
                if (!empty($row['Field'])) {
                    $existing[(string)$row['Field']] = true;
                }
            }

            foreach ($cols as $col => $ddl) {
                if (!isset($existing[$col])) {
                    $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` {$ddl}");
                    $added[] = "{$table}.{$col}";
                }
                $verified[] = "{$table}.{$col}";
            }
        }

        // Prevent duplicate (unit_id, boot_id, seq_no, event_type) across legacy seeded movement_events rows
        $pdo->exec("
            UPDATE `movement_events`
            SET `seq_no` = (CRC32(`id`) % 900) + 1,
                `event_epoch` = IF(`event_epoch` = 0 AND `departed` IS NOT NULL, UNIX_TIMESTAMP(`departed`), `event_epoch`)
            WHERE `seq_no` = 0
        ");

        $stmtIdx = $pdo->query("SHOW INDEX FROM `movement_events` WHERE Key_name = 'uniq_mv_unit_boot_seq_type'");
        if (!$stmtIdx->fetch()) {
            $pdo->exec("ALTER TABLE `movement_events` ADD UNIQUE KEY `uniq_mv_unit_boot_seq_type` (`unit_id`, `boot_id`, `seq_no`, `event_type`)");
            $added[] = 'movement_events.UNIQUE(uniq_mv_unit_boot_seq_type)';
        }

        try {
            $pdo->exec("CREATE OR REPLACE VIEW `vehicle_units` AS SELECT * FROM `vehicles`");
            $viewReady = true;
        } catch (Exception $ignored) {
            $viewReady = false;
        }

        @file_put_contents($lockFile, (string)time());
        return [
            'added'        => $added,
            'verified'     => $verified,
            'unique_index' => 'uniq_mv_unit_boot_seq_type',
            'view_ready'   => $viewReady,
        ];
    }
}

return $pdo;
