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

// 3. Database Configurations (Env / .env for Hosting with Local XAMPP/MAMP Fallback)
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

if ($hasCustomDbEnv) {
    $connectionAttempts = [
        ['host' => $dbHost, 'port' => $dbPort, 'user' => $dbUser, 'pass' => $dbPass],
    ];
    if (strtolower($dbHost) === 'localhost') {
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
    PDO::ATTR_PERSISTENT         => true,
    PDO::ATTR_TIMEOUT            => 3,
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
        'hint' => 'Periksa DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS pada environment/.env server atau pastikan MySQL XAMPP sudah aktif.',
    ], 500);
}

return $pdo;
