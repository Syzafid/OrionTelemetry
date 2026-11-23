<?php
/**
 * ORION Telemetry System - Two-Way Persistence Endpoint (POST)
 * Endpoint: http://localhost/dipo_api/update_config.php
 *
 * Handles mutations from TelemetryContext.tsx when dataSource === "LIVE_API":
 * 1. ACTION: UPDATE_CONFIG   -> Updates node_configs table + logs to system_events
 * 2. ACTION: TAG_MOVEMENT    -> Updates tag on movement_events table + logs to system_events
 * 3. ACTION: PAIR_UNIT       -> Updates vehicle metadata on vehicles table + logs to system_events
 * 4. ACTION: FLUSH_BUFFER    -> Resets buffer_used on vehicles table + logs to system_events
 * 5. ACTION: DISPATCH_WARMUP -> Marks status_label = Warm-Up Dispatched + logs to system_events
 */

/** @var PDO $pdo */
$pdo = require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['error' => 'METHOD_NOT_ALLOWED', 'message' => 'Use POST method for mutations.'], 405);
}

$payload = readJsonBody();

$action = $payload['action'] ?? null;
if (!$action) {
    sendJson(['error' => 'MISSING_ACTION', 'message' => 'Field action is required.'], 400);
}

/**
 * Helper to invalidate get_data.php 1.5s micro-cache immediately after mutations.
 */
function invalidateOrionDataCache(): void {
    @unlink(sys_get_temp_dir() . '/orion_get_data_cache.json');
}

/**
 * Helper to insert an immutable operational audit trail row into system_events.
 */
function recordSystemEvent(PDO $pdo, string $unitId, string $eventType, string $severity, string $message): void {
    try {
        if (!isOrionSchemaReady()) {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `system_events` (
                  `id` INT AUTO_INCREMENT PRIMARY KEY,
                  `unit_id` VARCHAR(32) NOT NULL,
                  `event_type` VARCHAR(32) NOT NULL,
                  `severity` ENUM('INFO', 'WARN', 'CRITICAL') NOT NULL DEFAULT 'INFO',
                  `message` VARCHAR(255) NOT NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  KEY `idx_event_unit_created` (`unit_id`, `created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        }
        $stmt = $pdo->prepare("
            INSERT INTO `system_events` (`unit_id`, `event_type`, `severity`, `message`)
            VALUES (:uid, :etype, :sev, :msg)
        ");
        $stmt->execute([
            ':uid'   => substr($unitId, 0, 32),
            ':etype' => substr($eventType, 0, 32),
            ':sev'   => in_array($severity, ['INFO', 'WARN', 'CRITICAL'], true) ? $severity : 'INFO',
            ':msg'   => substr($message, 0, 255),
        ]);
    } catch (Exception $ignored) {
        // Non-blocking audit logging
    }
}

try {
    switch ($action) {
        // ----------------------------------------------------------------------
        // ACTION 1: UPDATE_CONFIG (Modul 05 / Calibrator SOP C.1)
        // ----------------------------------------------------------------------
        case 'UPDATE_CONFIG':
            $unitId = $payload['unit_id'] ?? null;
            if (!$unitId) {
                sendJson(['error' => 'MISSING_UNIT_ID', 'message' => 'unit_id is required for UPDATE_CONFIG.'], 400);
            }

            // Auto-ensure kolom pending_ack & presisi cal_slope/cal_offset di node_configs (dilewati jika skema sudah terverifikasi)
            try {
                if (!isOrionSchemaReady()) {
                    $stmtAckCol = $pdo->query("SHOW COLUMNS FROM `node_configs` LIKE 'pending_ack'");
                    if (!$stmtAckCol->fetch()) {
                        $pdo->exec("ALTER TABLE `node_configs` ADD COLUMN `pending_ack` TINYINT(1) NOT NULL DEFAULT 0 AFTER `cal_offset`");
                    }
                    $pdo->exec("ALTER TABLE `node_configs` MODIFY COLUMN `cal_slope` DECIMAL(10,7) NOT NULL DEFAULT 0.0054120, MODIFY COLUMN `cal_offset` DECIMAL(6,4) NOT NULL DEFAULT 0.0690");
                }
            } catch (Exception $ignored) {
                // Non-blocking schema check
            }

            $stmtCur = $pdo->prepare("SELECT * FROM `node_configs` WHERE `unit_id` = :uid");
            $stmtCur->execute([':uid' => $unitId]);
            $cur = $stmtCur->fetch();

            $defaultSleep = $cur ? (int)$cur['sleep_cfg'] : 300;
            $sleepCfg = isset($payload['sleep_cfg'])
                ? parseSleepCfgSeconds($payload['sleep_cfg'], $defaultSleep)
                : $defaultSleep;

            $fastPollRaw = isset($payload['fast_poll_s']) ? (int)$payload['fast_poll_s'] : ($cur ? (int)$cur['fast_poll_s'] : 10);
            $fastPollS   = max(5, min(300, $fastPollRaw));
            $critV       = isset($payload['crit_v']) ? (float)$payload['crit_v'] : ($cur ? (float)$cur['crit_v'] : 11.80);
            $debounceRaw = isset($payload['debounce_cnt']) ? (int)$payload['debounce_cnt'] : ($cur ? (int)$cur['debounce_cnt'] : 3);
            $debounceCnt = max(1, min(10, $debounceRaw));
            $calSlope    = isset($payload['cal_slope'])
                ? (float)$payload['cal_slope']
                : (isset($payload['slope_m']) ? (float)$payload['slope_m'] : ($cur ? (float)$cur['cal_slope'] : 0.005412));
            $calOffset   = isset($payload['cal_offset'])
                ? (float)$payload['cal_offset']
                : (isset($payload['offset_c']) ? (float)$payload['offset_c'] : ($cur ? (float)$cur['cal_offset'] : 0.069));

            if (!is_finite($critV) || $critV <= 5.0 || $critV >= 16.0) {
                sendJson(['error' => 'INVALID_CRIT_V', 'message' => 'crit_v must be between 5.0V and 16.0V.'], 400);
            }
            if (!is_finite($calSlope) || $calSlope <= 0.001 || $calSlope >= 0.02) {
                sendJson(['error' => 'INVALID_CAL_SLOPE', 'message' => 'cal_slope must be between 0.001 and 0.02.'], 400);
            }
            if (!is_finite($calOffset) || $calOffset <= -2.0 || $calOffset >= 2.0) {
                sendJson(['error' => 'INVALID_CAL_OFFSET', 'message' => 'cal_offset must be between -2.0V and 2.0V.'], 400);
            }

            $sqlUpsert = "
                INSERT INTO `node_configs` (`unit_id`, `sleep_cfg`, `fast_poll_s`, `crit_v`, `debounce_cnt`, `cal_slope`, `cal_offset`, `pending_ack`)
                VALUES (:uid, :sleep_cfg, :fast_poll_s, :crit_v, :debounce_cnt, :cal_slope, :cal_offset, 1)
                ON DUPLICATE KEY UPDATE
                    `sleep_cfg`    = VALUES(`sleep_cfg`),
                    `fast_poll_s`  = VALUES(`fast_poll_s`),
                    `crit_v`       = VALUES(`crit_v`),
                    `debounce_cnt` = VALUES(`debounce_cnt`),
                    `cal_slope`    = VALUES(`cal_slope`),
                    `cal_offset`   = VALUES(`cal_offset`),
                    `pending_ack`  = 1,
                    `updated_at`   = NOW()
            ";
            $stmtUpsert = $pdo->prepare($sqlUpsert);
            $stmtUpsert->execute([
                ':uid'          => $unitId,
                ':sleep_cfg'    => $sleepCfg,
                ':fast_poll_s'  => $fastPollS,
                ':crit_v'       => $critV,
                ':debounce_cnt' => $debounceCnt,
                ':cal_slope'    => $calSlope,
                ':cal_offset'   => $calOffset,
            ]);

            if (isset($payload['cal_slope']) || isset($payload['cal_offset']) || isset($payload['slope_m']) || isset($payload['offset_c'])) {
                $auditMsg = sprintf('ADC OLS calibration staged (slope=%.7f, offset=%.4f, pending_ack=1)', $calSlope, $calOffset);
                recordSystemEvent($pdo, (string)$unitId, 'ADC_CALIBRATION', 'INFO', $auditMsg);
            } else {
                $auditMsg = sprintf('Node config staged for next wake (sleep=%ds, crit_v=%.2fV, debounce=%dx, pending_ack=1)', $sleepCfg, $critV, $debounceCnt);
                recordSystemEvent($pdo, (string)$unitId, 'CONFIG_UPDATE', 'INFO', $auditMsg);
            }

            invalidateOrionDataCache();
            sendJson([
                'status'  => 'OK',
                'action'  => 'UPDATE_CONFIG',
                'unit_id' => $unitId,
                'config'  => [
                    'unit_id'      => $unitId,
                    'sleep_cfg'    => $sleepCfg,
                    'fast_poll_s'  => $fastPollS,
                    'crit_v'       => $critV,
                    'debounce_cnt' => $debounceCnt,
                    'cal_slope'    => $calSlope,
                    'cal_offset'   => $calOffset,
                    'pending_ack'  => true,
                ],
            ]);
            break;

        // ----------------------------------------------------------------------
        // ACTION 2: TAG_MOVEMENT (Modul 05 - Yard Presence Operational Tag)
        // ----------------------------------------------------------------------
        case 'TAG_MOVEMENT':
            $eventId  = $payload['id'] ?? ($payload['evId'] ?? null);
            $pairedId = $payload['paired_id'] ?? null;
            $tag = isset($payload['tag']) && $payload['tag'] !== '' ? (string)$payload['tag'] : null;

            if (!$eventId) {
                sendJson(['error' => 'MISSING_EVENT_ID', 'message' => 'id is required for TAG_MOVEMENT.'], 400);
            }

            $stmtTag = $pdo->prepare("UPDATE `movement_events` SET `tag` = :tag WHERE `id` = :id");
            $stmtTag->execute([
                ':tag' => $tag,
                ':id'  => $eventId,
            ]);
            if ($pairedId && $pairedId !== $eventId) {
                $stmtTag->execute([
                    ':tag' => $tag,
                    ':id'  => $pairedId,
                ]);
            }

            recordSystemEvent($pdo, 'YARD-GATEWAY', 'MOVEMENT_TAG', 'INFO', "Movement event {$eventId} tagged as " . ($tag ?? 'UNTAGGED'));

            invalidateOrionDataCache();
            sendJson([
                'status'    => 'OK',
                'action'    => 'TAG_MOVEMENT',
                'event_id'  => $eventId,
                'paired_id' => $pairedId,
                'tag'       => $tag,
            ]);
            break;

        // ----------------------------------------------------------------------
        // ACTION 3: PAIR_UNIT / REGISTER_UNIT (IoT Node Onboarding & ECU Linking)
        // ----------------------------------------------------------------------
        case 'REGISTER_UNIT':
        case 'PAIR_UNIT':
            $unitId = strtoupper(trim($payload['unit_id'] ?? ($payload['oldId'] ?? '')));
            if (!$unitId) {
                sendJson(['error' => 'MISSING_UNIT_ID', 'message' => 'unit_id is required.'], 400);
            }

            $vin = strtoupper(trim($payload['vin'] ?? ''));
            $modelRaw = strtoupper(trim($payload['model'] ?? 'MITSUBISHI NEW'));
            $trimExplicit = strtoupper(trim((string)($payload['trim'] ?? '')));
            $color = trim($payload['color'] ?? 'White Diamond');
            $bay = strtoupper(trim($payload['bay'] ?? 'A-01'));
            $critVRaw = isset($payload['crit_v']) ? (float)$payload['crit_v'] : 11.80;
            $critV = (is_finite($critVRaw) && $critVRaw > 5.0 && $critVRaw < 16.0) ? $critVRaw : 11.80;
            $sleepCfg = isset($payload['sleep_cfg'])
                ? parseSleepCfgSeconds($payload['sleep_cfg'], 300)
                : 300;

            $pcbVersion = (string)($payload['pcb_version'] ?? '1');
            $defaultSlope  = ($pcbVersion === '2') ? 0.0047037 : 0.0054118;
            $defaultOffset = ($pcbVersion === '2') ? 0.1600    : 0.0690;

            $calSlope = isset($payload['cal_slope']) ? (float)$payload['cal_slope'] : $defaultSlope;
            if (!is_finite($calSlope) || $calSlope <= 0.001 || $calSlope >= 0.02) {
                $calSlope = $defaultSlope;
            }
            $calOffset = isset($payload['cal_offset']) ? (float)$payload['cal_offset'] : $defaultOffset;
            if (!is_finite($calOffset) || $calOffset <= -2.0 || $calOffset >= 2.0) {
                $calOffset = $defaultOffset;
            }

            if ($trimExplicit !== '') {
                $model = $modelRaw !== '' ? $modelRaw : 'NEW MODEL';
                $trim  = $trimExplicit;
            } else {
                $parts = explode(' ', $modelRaw);
                $model = count($parts) >= 2 ? implode(' ', array_slice($parts, 0, 2)) : ($modelRaw ?: 'NEW MODEL');
                $trim  = count($parts) > 2 ? implode(' ', array_slice($parts, 2)) : 'NEW ARRIVAL';
            }

            // 1. Insert or update vehicles record (never fabricate ONLINE / 12.60V before first ESP32 packet)
            $stmtVeh = $pdo->prepare("
                INSERT INTO `vehicles` (
                    `unit_id`, `bay`, `model`, `trim`, `vin`, `color`,
                    `v_bat`, `status_label`, `state`, `in_yard`, `online_status`, `last_seen`
                ) VALUES (
                    :uid, :bay, :model, :trim, :vin, :color,
                    0.00, 'Terdaftar (Menunggu Paket Pertama)', 'STANDBY', 1, 'OFFLINE', NULL
                )
                ON DUPLICATE KEY UPDATE
                    `bay` = VALUES(`bay`),
                    `model` = VALUES(`model`),
                    `trim` = VALUES(`trim`),
                    `vin` = VALUES(`vin`),
                    `color` = VALUES(`color`),
                    `updated_at` = NOW()
            ");
            $stmtVeh->execute([
                ':uid'   => $unitId,
                ':bay'   => $bay,
                ':model' => $model,
                ':trim'  => $trim,
                ':vin'   => $vin,
                ':color' => $color,
            ]);

            // 2. Insert or update node_configs record with resolved PCB calibration & pending_ack = 1
            $stmtCfg = $pdo->prepare("
                INSERT INTO `node_configs` (
                    `unit_id`, `crit_v`, `sleep_cfg`, `cal_slope`, `cal_offset`, `pending_ack`
                ) VALUES (
                    :uid, :crit_v, :sleep_cfg, :cal_slope, :cal_offset, 1
                )
                ON DUPLICATE KEY UPDATE
                    `crit_v`      = VALUES(`crit_v`),
                    `sleep_cfg`   = VALUES(`sleep_cfg`),
                    `cal_slope`   = VALUES(`cal_slope`),
                    `cal_offset`  = VALUES(`cal_offset`),
                    `pending_ack` = 1,
                    `updated_at`  = NOW()
            ");
            $stmtCfg->execute([
                ':uid'        => $unitId,
                ':crit_v'     => $critV,
                ':sleep_cfg'  => $sleepCfg,
                ':cal_slope'  => $calSlope,
                ':cal_offset' => $calOffset,
            ]);

            recordSystemEvent($pdo, (string)$unitId, 'NODE_REGISTERED', 'INFO', "Node {$unitId} registered & paired to {$model} {$trim} (VIN: {$vin}, Bay: {$bay}, PCB v{$pcbVersion})");

            invalidateOrionDataCache();
            sendJson([
                'status'  => 'OK',
                'action'  => $action,
                'unit_id' => $unitId,
                'vehicle' => [
                    'vin'   => $vin,
                    'model' => $model,
                    'trim'  => $trim,
                    'color' => $color,
                    'bay'   => $bay,
                ],
                'config'  => [
                    'unit_id'     => $unitId,
                    'crit_v'      => $critV,
                    'sleep_cfg'   => $sleepCfg,
                    'cal_slope'   => $calSlope,
                    'cal_offset'  => $calOffset,
                    'pending_ack' => true,
                ],
                'message' => "Node {$unitId} successfully onboarded and registered."
            ]);
            break;

        // ----------------------------------------------------------------------
        // ACTION 3b: UNPAIR_UNIT (Modul 06 - Detach Vehicle from OBD-II Node)
        // ----------------------------------------------------------------------
        case 'UNPAIR_UNIT':
            $unitId = strtoupper(trim((string)($payload['unit_id'] ?? '')));
            if (!$unitId) {
                sendJson(['error' => 'MISSING_UNIT_ID', 'message' => 'unit_id is required for UNPAIR_UNIT.'], 400);
            }

            $stmtUnpair = $pdo->prepare("UPDATE `vehicles` SET `status_label` = 'Node Terlepas (Menunggu Re-Pair)', `updated_at` = NOW() WHERE `unit_id` = :uid");
            $stmtUnpair->execute([':uid' => $unitId]);

            recordSystemEvent($pdo, (string)$unitId, 'NODE_UNPAIRED', 'WARN', 'Vehicle sold / detached from OBD-II telemetry node');

            invalidateOrionDataCache();
            sendJson([
                'status'       => 'OK',
                'action'       => 'UNPAIR_UNIT',
                'unit_id'      => $unitId,
                'status_label' => 'Node Terlepas (Menunggu Re-Pair)',
            ]);
            break;

        // ----------------------------------------------------------------------
        // ACTION 4: FLUSH_BUFFER (Modul 04 - Yard Presence Offline Buffer Flush)
        // ----------------------------------------------------------------------
        case 'FLUSH_BUFFER':
            $unitId = $payload['unit_id'] ?? null;
            if (!$unitId) {
                sendJson(['error' => 'MISSING_UNIT_ID', 'message' => 'unit_id is required for FLUSH_BUFFER.'], 400);
            }

            $stmtFlush = $pdo->prepare("UPDATE `vehicles` SET `buffer_used` = 0, `updated_at` = NOW() WHERE `unit_id` = :uid");
            $stmtFlush->execute([':uid' => $unitId]);

            recordSystemEvent($pdo, (string)$unitId, 'BUFFER_FLUSH', 'INFO', 'Operator cleared offline sync badge and acknowledged burst buffer');

            invalidateOrionDataCache();
            sendJson([
                'status'      => 'OK',
                'action'      => 'FLUSH_BUFFER',
                'unit_id'     => $unitId,
                'buffer_used' => 0,
            ]);
            break;

        // ----------------------------------------------------------------------
        // ACTION 5: DISPATCH_WARMUP (Modul 02 - Warm-Up Queue Staff Dispatch)
        // ----------------------------------------------------------------------
        case 'DISPATCH_WARMUP':
            $unitId = $payload['unit_id'] ?? null;
            if (!$unitId) {
                sendJson(['error' => 'MISSING_UNIT_ID', 'message' => 'unit_id is required for DISPATCH_WARMUP.'], 400);
            }

            $stmtWarmup = $pdo->prepare("UPDATE `vehicles` SET `status_label` = 'Warm-Up Dispatched', `updated_at` = NOW() WHERE `unit_id` = :uid");
            $stmtWarmup->execute([':uid' => $unitId]);

            recordSystemEvent($pdo, (string)$unitId, 'WARMUP_DISPATCH', 'WARN', 'Operator dispatched staff for 10-min engine alternator warm-up');

            invalidateOrionDataCache();
            sendJson([
                'status'       => 'OK',
                'action'       => 'DISPATCH_WARMUP',
                'unit_id'      => $unitId,
                'status_label' => 'Warm-Up Dispatched',
            ]);
            break;

        // ----------------------------------------------------------------------
        // ACTION 6: UPDATE_TICKET (Modul 02 & 05 - Shift Handover & Ticket Workflow)
        // ----------------------------------------------------------------------
        case 'UPDATE_TICKET':
            $unitId = $payload['unit_id'] ?? null;
            if (!$unitId) {
                sendJson(['error' => 'MISSING_UNIT_ID', 'message' => 'unit_id is required for UPDATE_TICKET.'], 400);
            }

            if (!isOrionSchemaReady()) {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS `maintenance_tickets` (
                      `id` INT AUTO_INCREMENT PRIMARY KEY,
                      `ticket_code` VARCHAR(16) NOT NULL,
                      `unit_id` VARCHAR(64) NOT NULL,
                      `bay` VARCHAR(16) NOT NULL,
                      `issue_summary` VARCHAR(128) NOT NULL,
                      `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
                      `assigned_to` VARCHAR(64) NULL,
                      `handover_note` VARCHAR(255) NULL,
                      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                      UNIQUE KEY `uniq_ticket_unit` (`unit_id`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                ");
            }

            $statusRaw = strtoupper(trim((string)($payload['status'] ?? 'OPEN')));
            $status = in_array($statusRaw, ['OPEN', 'IN_PROGRESS', 'RESOLVED'], true) ? $statusRaw : 'OPEN';
            $assignedTo = trim((string)($payload['assigned_to'] ?? 'Field Tech'));
            $handoverNote = trim((string)($payload['handover_note'] ?? ''));

            // Lookup vehicle bay & fallback issue summary if creating/updating a ticket
            $stmtVeh = $pdo->prepare("SELECT `bay`, `status_label` FROM `vehicles` WHERE `unit_id` = :uid");
            $stmtVeh->execute([':uid' => $unitId]);
            $vehRow = $stmtVeh->fetch();
            $bay = $vehRow ? (string)$vehRow['bay'] : 'A-01';
            $explicitIssue = trim((string)($payload['issue_summary'] ?? ''));
            $issueSummary = $explicitIssue !== ''
                ? substr($explicitIssue, 0, 128)
                : ($vehRow ? (string)$vehRow['status_label'] : 'Verifikasi PDI & kesehatan baterai');
            $ticketCode = 'TKT-' . substr(preg_replace('/[^0-9]/', '', (string)$unitId) ?: '0400', -2) . '99';

            $stmtTicket = $pdo->prepare("
                INSERT INTO `maintenance_tickets` (`ticket_code`, `unit_id`, `bay`, `issue_summary`, `status`, `assigned_to`, `handover_note`)
                VALUES (:tcode, :uid, :bay, :issue, :status, :assigned, :note)
                ON DUPLICATE KEY UPDATE
                    `issue_summary` = VALUES(`issue_summary`),
                    `status`        = VALUES(`status`),
                    `assigned_to`   = VALUES(`assigned_to`),
                    `handover_note` = VALUES(`handover_note`),
                    `updated_at`    = NOW()
            ");
            $stmtTicket->execute([
                ':tcode'    => $ticketCode,
                ':uid'      => $unitId,
                ':bay'      => $bay,
                ':issue'    => $issueSummary,
                ':status'   => $status,
                ':assigned' => $assignedTo,
                ':note'     => $handoverNote,
            ]);

            $auditSeverity = $status === 'RESOLVED' ? 'INFO' : 'WARN';
            $auditMessage = sprintf('Shift ticket %s (%s): %s', $status, $assignedTo, $handoverNote ?: 'Status updated');
            recordSystemEvent($pdo, (string)$unitId, 'TICKET_HANDOVER', $auditSeverity, $auditMessage);

            invalidateOrionDataCache();
            sendJson([
                'status'  => 'OK',
                'action'  => 'UPDATE_TICKET',
                'unit_id' => $unitId,
                'ticket'  => [
                    'unit_id'       => $unitId,
                    'issue_summary' => $issueSummary,
                    'status'        => $status,
                    'assigned_to'   => $assignedTo,
                    'handover_note' => $handoverNote,
                    'updated_at'    => date('Y-m-d H:i:s'),
                ],
            ]);
            break;

        default:
            sendJson(['error' => 'UNKNOWN_ACTION', 'message' => "Action '{$action}' is not supported."], 400);
            break;
    }

} catch (Exception $e) {
    sendJson([
        'error'   => 'MUTATION_FAILED',
        'action'  => $action,
        'message' => $e->getMessage(),
    ], 500);
}
