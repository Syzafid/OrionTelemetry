-- ==============================================================================
-- ORION Production Schema & Initial Seed Data (JawsDB MySQL / Cloud Hosting Compatible)
-- No CREATE DATABASE / USE statement; safe & idempotent (CREATE IF NOT EXISTS + INSERT IGNORE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE: vehicles
-- Menyimpan metadata unit kendaraan dan status presence fisik di stock yard
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vehicles` (
  `unit_id` VARCHAR(64) NOT NULL,
  `bay` VARCHAR(16) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `trim` VARCHAR(64) NOT NULL,
  `vin` VARCHAR(32) NOT NULL,
  `color` VARCHAR(32) NOT NULL,
  `status_label` VARCHAR(64) NOT NULL DEFAULT 'Standby (Deep Sleep)',
  `state` ENUM('STANDBY', 'WARMUP', 'CRITICAL', 'DEPARTED') NOT NULL DEFAULT 'STANDBY',
  `in_yard` TINYINT(1) NOT NULL DEFAULT 1,
  `online_status` VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
  `v_bat` DECIMAL(5,2) NOT NULL DEFAULT 12.60,
  `adc_raw_mv` INT NOT NULL DEFAULT 2260,
  `rtc_temp_c` DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  `can_ok` TINYINT(1) NOT NULL DEFAULT 1,
  `rssi` INT NOT NULL DEFAULT -60,
  `net_zone` VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
  `sync_ssid` VARCHAR(32) NOT NULL DEFAULT '',
  `net_zone_boot` INT UNSIGNED NOT NULL DEFAULT 0,
  `net_zone_seq` INT UNSIGNED NOT NULL DEFAULT 0,
  `net_zone_ts` INT UNSIGNED NOT NULL DEFAULT 0,
  `buffer_used` INT NOT NULL DEFAULT 0,
  `last_boot` INT NOT NULL DEFAULT 1,
  `last_seq` INT NOT NULL DEFAULT 0,
  `last_ts_epoch` BIGINT NOT NULL DEFAULT 0,
  `speed_kmh` SMALLINT NOT NULL DEFAULT 0,
  `iat_c` SMALLINT NOT NULL DEFAULT 0,
  `map_kpa` SMALLINT NOT NULL DEFAULT 0,
  `load_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `tps_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `ign_deg` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `maf_gs` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `run_time_s` INT UNSIGNED NOT NULL DEFAULT 0,
  `fuel_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `fuel_rate_lh` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `o2_v` DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  `stft_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `mil_on` TINYINT(1) NOT NULL DEFAULT 0,
  `ecu_v` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `dist_clr_km` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_seen` DATETIME NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`unit_id`),
  KEY `idx_bay` (`bay`),
  KEY `idx_state` (`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. TABLE: telemetry_logs
-- Menyimpan log telemetri wake-cycle dari node ESP32 OBD-II (v1.4.1)
-- Dilengkapi UNIQUE KEY (unit_id, seq) untuk deduplikasi burst upload RTC buffer
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `telemetry_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `unit_id` VARCHAR(64) NOT NULL,
  `seq` INT NOT NULL,
  `boot` INT NOT NULL DEFAULT 1,
  `ts_epoch` BIGINT NOT NULL DEFAULT 0,
  `v_bat` DECIMAL(5,2) NOT NULL,
  `adc_raw_mv` INT NOT NULL,
  `rtc_temp_c` DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  `shunt_sleep_ua` INT NOT NULL DEFAULT 0,
  `can_ok` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = TWAI CAN Loopback OK, 0 = CAN Fault',
  `net_zone` VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
  `zone_exit_epoch` INT UNSIGNED NOT NULL DEFAULT 0,
  `sync_ssid` VARCHAR(32) NOT NULL DEFAULT '',
  `engine_on` TINYINT(1) NOT NULL DEFAULT 0,
  `crit_alert` TINYINT(1) NOT NULL DEFAULT 0,
  `rpm` INT NOT NULL DEFAULT -1,
  `temp_c` INT NOT NULL DEFAULT -99,
  `dtc_cnt` INT NOT NULL DEFAULT 0,
  `dtc` VARCHAR(32) NOT NULL DEFAULT 'NONE',
  `rssi` INT NOT NULL DEFAULT -60,
  `sleep_cfg` INT NOT NULL DEFAULT 300,
  `buffer_used` INT NOT NULL DEFAULT 0,
  `active_ms` INT NOT NULL DEFAULT 0,
  `daily_mah` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `speed_kmh` SMALLINT NOT NULL DEFAULT 0,
  `iat_c` SMALLINT NOT NULL DEFAULT 0,
  `map_kpa` SMALLINT NOT NULL DEFAULT 0,
  `load_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `tps_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `ign_deg` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `maf_gs` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `run_time_s` INT UNSIGNED NOT NULL DEFAULT 0,
  `fuel_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `fuel_rate_lh` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `o2_v` DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  `stft_pct` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `mil_on` TINYINT(1) NOT NULL DEFAULT 0,
  `ecu_v` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `dist_clr_km` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_unit_boot_seq` (`unit_id`, `boot`, `seq`),
  KEY `idx_unit_created` (`unit_id`, `created_at`),
  CONSTRAINT `fk_telemetry_vehicles`
    FOREIGN KEY (`unit_id`) REFERENCES `vehicles` (`unit_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. TABLE: node_configs
-- Menyimpan parameter konfigurasi remote node ESP32 (Modul 05)
-- Diambil saat node mengirim POST dan dibalas via JSON Piggyback ACK
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `node_configs` (
  `unit_id` VARCHAR(64) NOT NULL,
  `sleep_cfg` INT NOT NULL DEFAULT 300,
  `fast_poll_s` INT NOT NULL DEFAULT 10,
  `crit_v` DECIMAL(4,2) NOT NULL DEFAULT 11.80,
  `debounce_cnt` INT NOT NULL DEFAULT 3,
  `cal_slope` DECIMAL(10,7) NOT NULL DEFAULT 0.0054120,
  `cal_offset` DECIMAL(6,4) NOT NULL DEFAULT 0.3580,
  `pending_ack` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`unit_id`),
  CONSTRAINT `fk_config_vehicles`
    FOREIGN KEY (`unit_id`) REFERENCES `vehicles` (`unit_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. TABLE: movement_events
-- Menyimpan riwayat pergerakan / keberadaan kendaraan keluar-masuk stock yard
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `movement_events` (
  `id` VARCHAR(32) NOT NULL,
  `unit_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(24) NOT NULL DEFAULT 'EXIT_YARD',
  `from_zone` VARCHAR(24) NOT NULL DEFAULT 'YARD',
  `to_zone` VARCHAR(24) NOT NULL DEFAULT 'OFFLINE',
  `event_epoch` INT UNSIGNED NOT NULL DEFAULT 0,
  `boot_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `seq_no` INT UNSIGNED NOT NULL DEFAULT 0,
  `v_bat` DECIMAL(5,2) NOT NULL DEFAULT 12.60,
  `rpm` INT NOT NULL DEFAULT 0,
  `speed_kmh` SMALLINT NOT NULL DEFAULT 0,
  `departed` DATETIME NOT NULL,
  `returned` DATETIME NULL,
  `away_min` INT NULL,
  `debounce_hits` INT NOT NULL DEFAULT 3,
  `tag` ENUM('Test Drive', 'PDI Workshop', 'Detailing', 'Customer Delivery') NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_mv_unit_boot_seq_type` (`unit_id`, `boot_id`, `seq_no`, `event_type`),
  KEY `idx_unit_departed` (`unit_id`, `departed`),
  CONSTRAINT `fk_movement_vehicles`
    FOREIGN KEY (`unit_id`) REFERENCES `vehicles` (`unit_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. TABLE: system_events
-- Menyimpan jejak audit operasional permanen (Kalibrasi ADC, Dispatch, Flush, DTC)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unit_id` VARCHAR(32) NOT NULL,
  `event_type` VARCHAR(32) NOT NULL,
  `severity` ENUM('INFO', 'WARN', 'CRITICAL') NOT NULL DEFAULT 'INFO',
  `message` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_event_unit_created` (`unit_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. TABLE: maintenance_tickets
-- Menyimpan tiket penugasan teknisi lapangan & serah-terima shift (Shift Handover)
-- ------------------------------------------------------------------------------
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
  UNIQUE KEY `uniq_ticket_unit` (`unit_id`),
  CONSTRAINT `fk_ticket_vehicles`
    FOREIGN KEY (`unit_id`) REFERENCES `vehicles` (`unit_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- SEED DATA (PHYSICAL HARDWARE NODE: MITSUBISHI-STOCK-01 ONLY)
-- ==============================================================================

-- 1. Seed Vehicles (1 Physical Hardware Unit: MITSUBISHI-STOCK-01)
INSERT IGNORE INTO `vehicles` (`unit_id`, `bay`, `model`, `trim`, `vin`, `color`, `status_label`, `state`, `in_yard`, `online_status`, `v_bat`, `adc_raw_mv`, `rtc_temp_c`, `can_ok`, `rssi`, `buffer_used`, `last_boot`, `last_seq`, `last_ts_epoch`, `last_seen`)
VALUES
  ('MITSUBISHI-STOCK-01', 'A-01', 'PAJERO SPORT', 'DAKAR 4x4', 'MMBGUKS10RH004121', 'Graphite Grey', 'Standby (Deep Sleep)', 'STANDBY', 1, 'ONLINE', 12.60, 2262, 31.20, 1, -44, 3, 41, 41, UNIX_TIMESTAMP(), NOW());

-- 2. Seed Node Configs (1 Physical Hardware Unit: MITSUBISHI-STOCK-01)
INSERT IGNORE INTO `node_configs` (`unit_id`, `sleep_cfg`, `fast_poll_s`, `crit_v`, `debounce_cnt`, `cal_slope`, `cal_offset`, `pending_ack`)
VALUES
  ('MITSUBISHI-STOCK-01', 300, 10, 11.80, 3, 0.005412, 0.069, 0);

-- 3. Seed Telemetry Logs (Historical Timeline for MITSUBISHI-STOCK-01)
INSERT IGNORE INTO `telemetry_logs`
  (`unit_id`, `seq`, `boot`, `ts_epoch`, `v_bat`, `adc_raw_mv`, `rtc_temp_c`, `shunt_sleep_ua`, `engine_on`, `crit_alert`, `rpm`, `temp_c`, `dtc_cnt`, `dtc`, `rssi`, `sleep_cfg`, `active_ms`, `daily_mah`, `created_at`)
VALUES
  ('MITSUBISHI-STOCK-01', 33, 33, UNIX_TIMESTAMP() - 28800, 12.74, 2288, 29.5, 410, 0, 0, -1, -99, 0, 'NONE', -46, 300, 1520, 1.20, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-01', 34, 34, UNIX_TIMESTAMP() - 25200, 12.71, 2282, 29.8, 410, 0, 0, -1, -99, 0, 'NONE', -45, 300, 1540, 1.80, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-01', 35, 35, UNIX_TIMESTAMP() - 21600, 12.68, 2277, 30.1, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1560, 2.45, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-01', 36, 36, UNIX_TIMESTAMP() - 18000, 12.66, 2273, 30.4, 410, 0, 0, -1, -99, 0, 'NONE', -45, 300, 1580, 3.10, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-01', 37, 37, UNIX_TIMESTAMP() - 14400, 12.64, 2269, 30.8, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1600, 3.80, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-01', 38, 38, UNIX_TIMESTAMP() - 10800, 12.63, 2267, 31.0, 410, 0, 0, -1, -99, 0, 'NONE', -43, 300, 1610, 4.45, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-01', 39, 39, UNIX_TIMESTAMP() - 7200,  12.62, 2265, 31.1, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1610, 5.10, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-01', 40, 40, UNIX_TIMESTAMP() - 3600,  12.61, 2263, 31.2, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1612, 5.75, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-01', 41, 41, UNIX_TIMESTAMP(),         12.60, 2262, 31.2, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1613, 5.95, NOW());

-- 4. Seed Movement Events (MITSUBISHI-STOCK-01 Only)
INSERT IGNORE INTO `movement_events` (`id`, `unit_id`, `event_type`, `from_zone`, `to_zone`, `event_epoch`, `boot_id`, `seq_no`, `departed`, `returned`, `away_min`, `debounce_hits`, `tag`)
VALUES
  ('EV-0418', 'MITSUBISHI-STOCK-01', 'EXIT_YARD', 'YARD', 'OFFLINE', UNIX_TIMESTAMP('2026-10-14 15:10:51'), 1, 418, '2026-10-14 15:10:51', '2026-10-14 16:02:17', 51,   3, 'PDI Workshop'),
  ('EV-0415', 'MITSUBISHI-STOCK-01', 'EXIT_YARD', 'YARD', 'OFFLINE', UNIX_TIMESTAMP('2026-10-12 08:30:00'), 1, 415, '2026-10-12 08:30:00', '2026-10-12 10:15:44', 105,  3, 'Customer Delivery');

-- 5. Seed System Audit Events (MITSUBISHI-STOCK-01 Only)
INSERT IGNORE INTO `system_events` (`id`, `unit_id`, `event_type`, `severity`, `message`, `created_at`)
VALUES
  (1, 'MITSUBISHI-STOCK-01', 'ADC_CALIBRATION', 'INFO', 'SOP C.1 4-point OLS calibration applied (slope=0.005412, offset=0.069)', DATE_SUB(NOW(), INTERVAL 8 HOUR));

-- 6. Seed Maintenance Tickets (Empty by default for single physical unit MITSUBISHI-STOCK-01)
