<?php
/**
 * ORION Telemetry System - Database Connection, Timezone, Env & CORS Helper
 * Compatible with Cloud Hosting / VPS (.env or environment variables) and local XAMPP / MAMP.
 */

date_default_timezone_set('Asia/Jakarta');

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
$allowedOrigin = orionEnv('CORS_ALLOWED_ORIGIN', '*') ?: '*';
header("Access-Control-Allow-Origin: {$allowedOrigin}");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept, X-Orion-Node, X-Burst-Sync, X-Node-Token, Authorization, Cache-Control, Pragma, Origin, X-Requested-With");
header("Access-Control-Allow-Private-Network: true");
header("Access-Control-Max-Age: 86400"); // 24 hours cache for preflight
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

// Handle preflight OPTIONS request immediately
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// 2. Helper to output JSON cleanly
function sendJson($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header("Content-Type: application/json; charset=utf-8");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Pragma: no-cache");
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit(0);
}

if (!function_exists('orionSchemaLockFile')) {
    function orionSchemaLockFile(): string {
        return sys_get_temp_dir() . '/orion_schema_v143.ok';
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
        $rawInput = file_get_contents('php://input');
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
     * Auto-migrates production schema and initial seed data (`MITSUBISHI-STOCK-01`..`12`)
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

        $schemaFile = __DIR__ . '/schema_production.sql';
        if (!is_file($schemaFile) || !is_readable($schemaFile)) {
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
        return ['migrated' => true, 'reason' => 'executed_schema_production'];
    }
}

try {
    ensureOrionDatabaseInitialized($pdo);
} catch (Exception $ignored) {
    // Non-blocking fallback so partial DB grants do not abort requests
}

return $pdo;
