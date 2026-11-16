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
  `departed` DATETIME NOT NULL,
  `returned` DATETIME NULL,
  `away_min` INT NULL,
  `debounce_hits` INT NOT NULL DEFAULT 3,
  `tag` ENUM('Test Drive', 'PDI Workshop', 'Detailing', 'Customer Delivery') NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
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
-- SEED DATA (DATA AWAL READY-TO-USE: 12 ARMADA STOCK YARD)
-- ==============================================================================

-- 1. Seed Vehicles (12 Units: STOCK-01 s/d STOCK-12)
INSERT IGNORE INTO `vehicles` (`unit_id`, `bay`, `model`, `trim`, `vin`, `color`, `status_label`, `state`, `in_yard`, `online_status`, `v_bat`, `adc_raw_mv`, `rtc_temp_c`, `can_ok`, `rssi`, `buffer_used`, `last_boot`, `last_seq`, `last_ts_epoch`, `last_seen`)
VALUES
  ('MITSUBISHI-STOCK-01', 'A-01', 'PAJERO SPORT',  'DAKAR 4x4',          'MMBGUKS10RH004121', 'Graphite Grey',    'Standby (Deep Sleep)',      'STANDBY',  1, 'ONLINE',  12.60, 2262, 31.20, 1, -44,  3,  41,  41, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-02', 'A-04', 'XFORCE',        'ULTIMATE CVT',       'MMBXFUJ40SH000877', 'Energetic Yellow',  'Low Battery Warning',       'STANDBY',  1, 'ONLINE',  12.18, 2184, 32.00, 1, -52,  6, 112, 112, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-03', 'B-02', 'XPANDER CROSS', 'ELITE',              'MK2NCXTARRJ012550', 'Quartz White',      'Critical Battery Drain',    'CRITICAL', 1, 'ONLINE',  11.65, 2086, 33.40, 1, -48, 17,  41,  41, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-04', 'A-02', 'TRITON',        'HDX 4x4 MT',         'MMBJNKL10RH009214', 'White Diamond',     'Critical Drain & ECU DTC',  'CRITICAL', 1, 'ONLINE',  11.72, 2099, 32.80, 1, -55, 11,  88,  88, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-05', 'A-03', 'L300',          'EURO 4 CAB CHASSIS', 'MHML300P0RJ003410', 'Jet Black',         'Standby (Deep Sleep)',      'STANDBY',  1, 'ONLINE',  12.68, 2277, 30.40, 1, -42,  0,  29,  29, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-06', 'B-01', 'PAJERO SPORT',  'EXCEED 4x2 AT',      'MMBGUKS30RH007612', 'Sterling Silver',   'Engine Warm-up Active',     'WARMUP',   1, 'ONLINE',  14.18, 2554, 36.20, 1, -41,  0,  64,  64, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-07', 'B-03', 'XPANDER',       'ULTIMATE CVT',       'MK2NCXPARRJ018823', 'Blade Silver',      'Low Battery Warning',       'STANDBY',  1, 'ONLINE',  12.12, 2173, 32.10, 1, -58,  4,  95,  95, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-08', 'B-04', 'XFORCE',        'EXCEED CVT',         'MMBXFUJ20SH001944', 'Red Metallic',      'Out of Yard (Test Drive)',  'DEPARTED', 0, 'OFFLINE', 12.48, 2240, 33.90, 1, -127, 34, 53,  53, 1778000000, DATE_SUB(NOW(), INTERVAL 45 MINUTE)),
  ('MITSUBISHI-STOCK-09', 'C-01', 'TRITON',        'ATHLETE 4x4 AT',     'MMBJNKL60RH005531', 'Impulse Blue',      'Standby (Deep Sleep)',      'STANDBY',  1, 'ONLINE',  12.64, 2269, 31.00, 1, -49,  1,  37,  37, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-10', 'C-02', 'XPANDER CROSS', 'MT',                 'MK2NCXTM0RJ014209', 'Green Bronze',      'Critical Battery Drain',    'CRITICAL', 1, 'ONLINE',  11.58, 2073, 33.70, 1, -63, 26, 119, 119, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-11', 'C-03', 'PAJERO SPORT',  'DAKAR ULTIMATE',     'MMBGUKS50RH008390', 'Deep Bronze',       'Low Battery Warning',       'STANDBY',  1, 'ONLINE',  12.06, 2162, 31.80, 1, -59,  8,  77,  77, 1778000000, NOW()),
  ('MITSUBISHI-STOCK-12', 'C-04', 'L300',          'BOX ALUMINIUM',      'MHML300B0RJ006188', 'Polar White',       'Out of Yard (PDI Workshop)','DEPARTED', 0, 'OFFLINE', 12.54, 2251, 32.50, 1, -127, 14, 46,  46, 1778000000, DATE_SUB(NOW(), INTERVAL 70 MINUTE));

-- 2. Seed Node Configs (12 Units)
INSERT IGNORE INTO `node_configs` (`unit_id`, `sleep_cfg`, `fast_poll_s`, `crit_v`, `debounce_cnt`, `cal_slope`, `cal_offset`, `pending_ack`)
VALUES
  ('MITSUBISHI-STOCK-01', 300, 10, 11.80, 3, 0.005412, 0.069, 0),
  ('MITSUBISHI-STOCK-02', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-03', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-04', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-05', 600, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-06', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-07', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-08', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-09', 600, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-10', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-11', 300, 10, 11.80, 3, 0.005412, 0.358, 0),
  ('MITSUBISHI-STOCK-12', 300, 10, 11.80, 3, 0.005412, 0.358, 0);

-- 3. Seed Telemetry Logs (Historical Timeline & Current State for 12 Units)
INSERT IGNORE INTO `telemetry_logs`
  (`unit_id`, `seq`, `boot`, `ts_epoch`, `v_bat`, `adc_raw_mv`, `rtc_temp_c`, `shunt_sleep_ua`, `engine_on`, `crit_alert`, `rpm`, `temp_c`, `dtc_cnt`, `dtc`, `rssi`, `sleep_cfg`, `active_ms`, `daily_mah`, `created_at`)
VALUES
  -- UNIT 01: PAJERO SPORT (Healthy Standby, 12.60V)
  ('MITSUBISHI-STOCK-01', 33, 33, UNIX_TIMESTAMP() - 28800, 12.74, 2288, 29.5, 410, 0, 0, -1, -99, 0, 'NONE', -46, 300, 1520, 1.20, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-01', 34, 34, UNIX_TIMESTAMP() - 25200, 12.71, 2282, 29.8, 410, 0, 0, -1, -99, 0, 'NONE', -45, 300, 1540, 1.80, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-01', 35, 35, UNIX_TIMESTAMP() - 21600, 12.68, 2277, 30.1, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1560, 2.45, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-01', 36, 36, UNIX_TIMESTAMP() - 18000, 12.66, 2273, 30.4, 410, 0, 0, -1, -99, 0, 'NONE', -45, 300, 1580, 3.10, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-01', 37, 37, UNIX_TIMESTAMP() - 14400, 12.64, 2269, 30.8, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1600, 3.80, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-01', 38, 38, UNIX_TIMESTAMP() - 10800, 12.63, 2267, 31.0, 410, 0, 0, -1, -99, 0, 'NONE', -43, 300, 1610, 4.45, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-01', 39, 39, UNIX_TIMESTAMP() - 7200,  12.62, 2265, 31.1, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1610, 5.10, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-01', 40, 40, UNIX_TIMESTAMP() - 3600,  12.61, 2263, 31.2, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1612, 5.75, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-01', 41, 41, UNIX_TIMESTAMP(),         12.60, 2262, 31.2, 410, 0, 0, -1, -99, 0, 'NONE', -44, 300, 1613, 5.95, NOW()),

  -- UNIT 02: XFORCE (Low Battery Warning, 12.18V)
  ('MITSUBISHI-STOCK-02', 104, 104, UNIX_TIMESTAMP() - 28800, 12.42, 2228, 30.1, 440, 0, 0, -1, -99, 0, 'NONE', -50, 300, 1420, 1.40, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-02', 105, 105, UNIX_TIMESTAMP() - 25200, 12.38, 2221, 30.5, 440, 0, 0, -1, -99, 0, 'NONE', -51, 300, 1435, 2.10, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-02', 106, 106, UNIX_TIMESTAMP() - 21600, 12.35, 2215, 30.9, 440, 0, 0, -1, -99, 0, 'NONE', -52, 300, 1450, 2.80, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-02', 107, 107, UNIX_TIMESTAMP() - 18000, 12.31, 2208, 31.2, 440, 0, 0, -1, -99, 0, 'NONE', -52, 300, 1460, 3.50, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-02', 108, 108, UNIX_TIMESTAMP() - 14400, 12.28, 2202, 31.5, 440, 0, 0, -1, -99, 0, 'NONE', -53, 300, 1470, 4.20, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-02', 109, 109, UNIX_TIMESTAMP() - 10800, 12.25, 2197, 31.7, 440, 0, 0, -1, -99, 0, 'NONE', -51, 300, 1475, 4.90, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-02', 110, 110, UNIX_TIMESTAMP() - 7200,  12.22, 2191, 31.9, 440, 0, 0, -1, -99, 0, 'NONE', -52, 300, 1480, 5.60, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-02', 111, 111, UNIX_TIMESTAMP() - 3600,  12.20, 2187, 32.0, 440, 0, 0, -1, -99, 0, 'NONE', -52, 300, 1485, 6.20, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-02', 112, 112, UNIX_TIMESTAMP(),         12.18, 2184, 32.0, 440, 0, 0, -1, -99, 0, 'NONE', -52, 300, 1488, 6.41, NOW()),

  -- UNIT 03: XPANDER CROSS (Critical Drain, 11.65V)
  ('MITSUBISHI-STOCK-03', 33, 33, UNIX_TIMESTAMP() - 28800, 11.95, 2142, 31.0, 490, 0, 0, -1, -99, 0, 'NONE', -47, 300, 1650, 1.30, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-03', 34, 34, UNIX_TIMESTAMP() - 25200, 11.90, 2132, 31.5, 490, 0, 0, -1, -99, 0, 'NONE', -47, 300, 1660, 1.95, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-03', 35, 35, UNIX_TIMESTAMP() - 21600, 11.85, 2123, 32.0, 490, 0, 0, -1, -99, 0, 'NONE', -48, 300, 1675, 2.60, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-03', 36, 36, UNIX_TIMESTAMP() - 18000, 11.81, 2116, 32.4, 490, 0, 0, -1, -99, 0, 'NONE', -48, 300, 1680, 3.25, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-03', 37, 37, UNIX_TIMESTAMP() - 14400, 11.77, 2108, 32.8, 490, 0, 1, -1, -99, 0, 'NONE', -49, 300, 1690, 3.90, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-03', 38, 38, UNIX_TIMESTAMP() - 10800, 11.73, 2101, 33.0, 490, 0, 1, -1, -99, 0, 'NONE', -48, 300, 1695, 4.50, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-03', 39, 39, UNIX_TIMESTAMP() - 7200,  11.70, 2095, 33.2, 490, 0, 1, -1, -99, 0, 'NONE', -48, 300, 1700, 5.10, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-03', 40, 40, UNIX_TIMESTAMP() - 3600,  11.67, 2090, 33.3, 490, 0, 1, -1, -99, 0, 'NONE', -49, 300, 1700, 5.50, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-03', 41, 41, UNIX_TIMESTAMP(),         11.65, 2086, 33.4, 490, 0, 1, -1, -99, 0, 'NONE', -48, 300, 1702, 5.71, NOW()),

  -- UNIT 04: TRITON (Critical Drain & ECU DTC, 11.72V, DTC P0133)
  ('MITSUBISHI-STOCK-04', 80, 80, UNIX_TIMESTAMP() - 28800, 12.08, 2165, 31.0, 520, 0, 0, -1, -99, 0, 'NONE', -55, 300, 1620, 1.60, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-04', 81, 81, UNIX_TIMESTAMP() - 25200, 12.03, 2156, 31.2, 520, 0, 0, -1, -99, 0, 'NONE', -55, 300, 1630, 2.30, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-04', 82, 82, UNIX_TIMESTAMP() - 21600, 11.98, 2147, 31.5, 520, 0, 0, -1, -99, 0, 'NONE', -54, 300, 1640, 3.00, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-04', 83, 83, UNIX_TIMESTAMP() - 18000, 11.92, 2136, 31.8, 520, 0, 0, -1, -99, 0, 'NONE', -55, 300, 1650, 3.70, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-04', 84, 84, UNIX_TIMESTAMP() - 14400, 11.86, 2125, 32.1, 520, 0, 0, -1, -99, 1, 'P0133', -55, 300, 1660, 4.45, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-04', 85, 85, UNIX_TIMESTAMP() - 10800, 11.81, 2116, 32.3, 520, 0, 0, -1, -99, 1, 'P0133', -54, 300, 1665, 5.15, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-04', 86, 86, UNIX_TIMESTAMP() - 7200,  11.77, 2108, 32.5, 520, 0, 1, -1, -99, 1, 'P0133', -55, 300, 1670, 5.80, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-04', 87, 87, UNIX_TIMESTAMP() - 3600,  11.74, 2103, 32.7, 520, 0, 1, -1, -99, 1, 'P0133', -55, 300, 1675, 6.40, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-04', 88, 88, UNIX_TIMESTAMP(),         11.72, 2099, 32.8, 520, 0, 1, -1, -99, 1, 'P0133', -55, 300, 1680, 6.82, NOW()),

  -- UNIT 05: L300 (Standby Deep Sleep, 12.68V, sleep_cfg 600)
  ('MITSUBISHI-STOCK-05', 21, 21, UNIX_TIMESTAMP() - 28800, 12.72, 2284, 29.8, 380, 0, 0, -1, -99, 0, 'NONE', -42, 600, 1390, 1.10, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-05', 22, 22, UNIX_TIMESTAMP() - 25200, 12.71, 2282, 29.9, 380, 0, 0, -1, -99, 0, 'NONE', -42, 600, 1395, 1.60, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-05', 23, 23, UNIX_TIMESTAMP() - 21600, 12.70, 2280, 30.0, 380, 0, 0, -1, -99, 0, 'NONE', -41, 600, 1400, 2.15, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-05', 24, 24, UNIX_TIMESTAMP() - 18000, 12.70, 2280, 30.1, 380, 0, 0, -1, -99, 0, 'NONE', -42, 600, 1400, 2.70, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-05', 25, 25, UNIX_TIMESTAMP() - 14400, 12.69, 2279, 30.2, 380, 0, 0, -1, -99, 0, 'NONE', -42, 600, 1405, 3.25, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-05', 26, 26, UNIX_TIMESTAMP() - 10800, 12.69, 2279, 30.3, 380, 0, 0, -1, -99, 0, 'NONE', -43, 600, 1405, 3.80, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-05', 27, 27, UNIX_TIMESTAMP() - 7200,  12.68, 2277, 30.3, 380, 0, 0, -1, -99, 0, 'NONE', -42, 600, 1410, 4.30, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-05', 28, 28, UNIX_TIMESTAMP() - 3600,  12.68, 2277, 30.4, 380, 0, 0, -1, -99, 0, 'NONE', -42, 600, 1410, 4.65, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-05', 29, 29, UNIX_TIMESTAMP(),         12.68, 2277, 30.4, 380, 0, 0, -1, -99, 0, 'NONE', -42, 600, 1410, 4.85, NOW()),

  -- UNIT 06: PAJERO SPORT (Warmup Active, 14.18V, Engine ON)
  ('MITSUBISHI-STOCK-06', 56, 56, UNIX_TIMESTAMP() - 28800, 12.45, 2234, 30.0, 420, 0, 0, -1,  -99, 0, 'NONE', -45, 300, 1500,   1.30, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-06', 57, 57, UNIX_TIMESTAMP() - 25200, 12.44, 2232, 30.2, 420, 0, 0, -1,  -99, 0, 'NONE', -44, 300, 1510,   1.90, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-06', 58, 58, UNIX_TIMESTAMP() - 21600, 12.43, 2230, 30.5, 420, 0, 0, -1,  -99, 0, 'NONE', -44, 300, 1515,   2.50, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-06', 59, 59, UNIX_TIMESTAMP() - 18000, 12.42, 2228, 30.8, 420, 0, 0, -1,  -99, 0, 'NONE', -43, 300, 1520,   3.10, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-06', 60, 60, UNIX_TIMESTAMP() - 14400, 12.41, 2226, 31.0, 420, 0, 0, -1,  -99, 0, 'NONE', -42, 300, 1530,   3.70, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-06', 61, 61, UNIX_TIMESTAMP() - 10800, 12.40, 2225, 31.2, 420, 0, 0, -1,  -99, 0, 'NONE', -43, 300, 1535,   4.30, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-06', 62, 62, UNIX_TIMESTAMP() - 7200,  12.40, 2225, 31.5, 420, 0, 0, -1,  -99, 0, 'NONE', -42, 300, 1540,   4.85, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-06', 63, 63, UNIX_TIMESTAMP() - 3600,  13.85, 2492, 34.0, 0,   1, 0, 1150, 68,  0, 'NONE', -41, 300, 60000,  5.15, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-06', 64, 64, UNIX_TIMESTAMP(),         14.18, 2554, 36.2, 0,   1, 0, 860,  84,  0, 'NONE', -41, 300, 245000, 5.40, NOW()),

  -- UNIT 07: XPANDER (Low Battery Warning, 12.12V)
  ('MITSUBISHI-STOCK-07', 87, 87, UNIX_TIMESTAMP() - 28800, 12.32, 2210, 30.5, 455, 0, 0, -1, -99, 0, 'NONE', -57, 300, 1490, 1.45, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-07', 88, 88, UNIX_TIMESTAMP() - 25200, 12.29, 2204, 30.8, 455, 0, 0, -1, -99, 0, 'NONE', -57, 300, 1500, 2.15, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-07', 89, 89, UNIX_TIMESTAMP() - 21600, 12.26, 2199, 31.0, 455, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1505, 2.85, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-07', 90, 90, UNIX_TIMESTAMP() - 18000, 12.23, 2193, 31.3, 455, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1510, 3.55, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-07', 91, 91, UNIX_TIMESTAMP() - 14400, 12.20, 2187, 31.5, 455, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1515, 4.25, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-07', 92, 92, UNIX_TIMESTAMP() - 10800, 12.17, 2182, 31.7, 455, 0, 0, -1, -99, 0, 'NONE', -57, 300, 1520, 4.95, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-07', 93, 93, UNIX_TIMESTAMP() - 7200,  12.15, 2178, 31.9, 455, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1525, 5.60, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-07', 94, 94, UNIX_TIMESTAMP() - 3600,  12.13, 2175, 32.0, 455, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1528, 6.20, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-07', 95, 95, UNIX_TIMESTAMP(),         12.12, 2173, 32.1, 455, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1530, 6.55, NOW()),

  -- UNIT 08: XFORCE (Departed / Test Drive, 12.48V, RSSI -127)
  ('MITSUBISHI-STOCK-08', 45, 45, UNIX_TIMESTAMP() - 28800, 12.58, 2258, 31.2, 415, 0, 0, -1, -99, 0, 'NONE', -46, 300, 1550, 1.25, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-08', 46, 46, UNIX_TIMESTAMP() - 25200, 12.56, 2254, 31.5, 415, 0, 0, -1, -99, 0, 'NONE', -47, 300, 1555, 1.85, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-08', 47, 47, UNIX_TIMESTAMP() - 21600, 12.55, 2252, 31.9, 415, 0, 0, -1, -99, 0, 'NONE', -48, 300, 1560, 2.50, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-08', 48, 48, UNIX_TIMESTAMP() - 18000, 12.53, 2249, 32.2, 415, 0, 0, -1, -99, 0, 'NONE', -47, 300, 1565, 3.15, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-08', 49, 49, UNIX_TIMESTAMP() - 14400, 12.52, 2247, 32.6, 415, 0, 0, -1, -99, 0, 'NONE', -48, 300, 1570, 3.80, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-08', 50, 50, UNIX_TIMESTAMP() - 10800, 12.51, 2245, 33.0, 415, 0, 0, -1, -99, 0, 'NONE', -49, 300, 1575, 4.45, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-08', 51, 51, UNIX_TIMESTAMP() - 7200,  12.50, 2243, 33.3, 415, 0, 0, -1, -99, 0, 'NONE', -49, 300, 1580, 5.10, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-08', 52, 52, UNIX_TIMESTAMP() - 3600,  12.49, 2241, 33.6, 415, 0, 0, -1, -99, 0, 'NONE', -127, 300, 1585, 5.55, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-08', 53, 53, UNIX_TIMESTAMP(),         12.48, 2240, 33.9, 415, 0, 0, -1, -99, 0, 'NONE', -127, 300, 1590, 5.80, NOW()),

  -- UNIT 09: TRITON (Standby Deep Sleep, 12.64V, sleep_cfg 600)
  ('MITSUBISHI-STOCK-09', 29, 29, UNIX_TIMESTAMP() - 28800, 12.70, 2280, 30.1, 395, 0, 0, -1, -99, 0, 'NONE', -48, 600, 1440, 1.15, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-09', 30, 30, UNIX_TIMESTAMP() - 25200, 12.69, 2278, 30.2, 395, 0, 0, -1, -99, 0, 'NONE', -48, 600, 1445, 1.70, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-09', 31, 31, UNIX_TIMESTAMP() - 21600, 12.68, 2276, 30.4, 395, 0, 0, -1, -99, 0, 'NONE', -49, 600, 1450, 2.25, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-09', 32, 32, UNIX_TIMESTAMP() - 18000, 12.67, 2274, 30.5, 395, 0, 0, -1, -99, 0, 'NONE', -48, 600, 1455, 2.80, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-09', 33, 33, UNIX_TIMESTAMP() - 14400, 12.66, 2273, 30.7, 395, 0, 0, -1, -99, 0, 'NONE', -49, 600, 1460, 3.40, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-09', 34, 34, UNIX_TIMESTAMP() - 10800, 12.66, 2273, 30.8, 395, 0, 0, -1, -99, 0, 'NONE', -49, 600, 1465, 3.95, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-09', 35, 35, UNIX_TIMESTAMP() - 7200,  12.65, 2271, 30.9, 395, 0, 0, -1, -99, 0, 'NONE', -49, 600, 1470, 4.50, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-09', 36, 36, UNIX_TIMESTAMP() - 3600,  12.65, 2271, 31.0, 395, 0, 0, -1, -99, 0, 'NONE', -49, 600, 1472, 4.90, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-09', 37, 37, UNIX_TIMESTAMP(),         12.64, 2269, 31.0, 395, 0, 0, -1, -99, 0, 'NONE', -49, 600, 1475, 5.12, NOW()),

  -- UNIT 10: XPANDER CROSS (Critical Drain, 11.58V, DTC P0115)
  ('MITSUBISHI-STOCK-10', 111, 111, UNIX_TIMESTAMP() - 28800, 11.92, 2136, 31.5, 540, 0, 0, -1, -99, 0, 'NONE', -61, 300, 1680, 1.80, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-10', 112, 112, UNIX_TIMESTAMP() - 25200, 11.87, 2127, 31.8, 540, 0, 0, -1, -99, 0, 'NONE', -62, 300, 1690, 2.55, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-10', 113, 113, UNIX_TIMESTAMP() - 21600, 11.82, 2117, 32.2, 540, 0, 0, -1, -99, 0, 'NONE', -62, 300, 1700, 3.30, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-10', 114, 114, UNIX_TIMESTAMP() - 18000, 11.77, 2108, 32.5, 540, 0, 1, -1, -99, 1, 'P0115', -63, 300, 1710, 4.10, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-10', 115, 115, UNIX_TIMESTAMP() - 14400, 11.72, 2099, 32.9, 540, 0, 1, -1, -99, 1, 'P0115', -63, 300, 1715, 4.90, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-10', 116, 116, UNIX_TIMESTAMP() - 10800, 11.68, 2091, 33.1, 540, 0, 1, -1, -99, 1, 'P0115', -62, 300, 1720, 5.65, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-10', 117, 117, UNIX_TIMESTAMP() - 7200,  11.64, 2084, 33.4, 540, 0, 1, -1, -99, 1, 'P0115', -63, 300, 1728, 6.30, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-10', 118, 118, UNIX_TIMESTAMP() - 3600,  11.61, 2078, 33.6, 540, 0, 1, -1, -99, 1, 'P0115', -63, 300, 1734, 6.80, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-10', 119, 119, UNIX_TIMESTAMP(),         11.58, 2073, 33.7, 540, 0, 1, -1, -99, 1, 'P0115', -63, 300, 1740, 7.15, NOW()),

  -- UNIT 11: PAJERO SPORT (Low Battery Warning, 12.06V)
  ('MITSUBISHI-STOCK-11', 69, 69, UNIX_TIMESTAMP() - 28800, 12.28, 2202, 30.6, 465, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1510, 1.50, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-11', 70, 70, UNIX_TIMESTAMP() - 25200, 12.24, 2195, 30.9, 465, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1520, 2.20, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-11', 71, 71, UNIX_TIMESTAMP() - 21600, 12.21, 2189, 31.1, 465, 0, 0, -1, -99, 0, 'NONE', -59, 300, 1528, 2.95, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-11', 72, 72, UNIX_TIMESTAMP() - 18000, 12.18, 2184, 31.3, 465, 0, 0, -1, -99, 0, 'NONE', -58, 300, 1535, 3.70, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-11', 73, 73, UNIX_TIMESTAMP() - 14400, 12.15, 2178, 31.4, 465, 0, 0, -1, -99, 0, 'NONE', -59, 300, 1542, 4.45, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-11', 74, 74, UNIX_TIMESTAMP() - 10800, 12.12, 2173, 31.6, 465, 0, 0, -1, -99, 0, 'NONE', -59, 300, 1548, 5.15, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-11', 75, 75, UNIX_TIMESTAMP() - 7200,  12.10, 2169, 31.7, 465, 0, 0, -1, -99, 0, 'NONE', -60, 300, 1554, 5.80, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-11', 76, 76, UNIX_TIMESTAMP() - 3600,  12.08, 2165, 31.8, 465, 0, 0, -1, -99, 0, 'NONE', -59, 300, 1558, 6.35, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-11', 77, 77, UNIX_TIMESTAMP(),         12.06, 2162, 31.8, 465, 0, 0, -1, -99, 0, 'NONE', -59, 300, 1560, 6.68, NOW()),

  -- UNIT 12: L300 (Departed / PDI Workshop, 12.54V, RSSI -127)
  ('MITSUBISHI-STOCK-12', 38, 38, UNIX_TIMESTAMP() - 28800, 12.62, 2265, 31.0, 405, 0, 0, -1, -99, 0, 'NONE', -47, 300, 1470, 1.20, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  ('MITSUBISHI-STOCK-12', 39, 39, UNIX_TIMESTAMP() - 25200, 12.60, 2262, 31.2, 405, 0, 0, -1, -99, 0, 'NONE', -47, 300, 1478, 1.75, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
  ('MITSUBISHI-STOCK-12', 40, 40, UNIX_TIMESTAMP() - 21600, 12.59, 2260, 31.5, 405, 0, 0, -1, -99, 0, 'NONE', -48, 300, 1485, 2.35, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  ('MITSUBISHI-STOCK-12', 41, 41, UNIX_TIMESTAMP() - 18000, 12.58, 2258, 31.8, 405, 0, 0, -1, -99, 0, 'NONE', -47, 300, 1490, 2.95, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  ('MITSUBISHI-STOCK-12', 42, 42, UNIX_TIMESTAMP() - 14400, 12.57, 2256, 32.0, 405, 0, 0, -1, -99, 0, 'NONE', -48, 300, 1495, 3.55, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  ('MITSUBISHI-STOCK-12', 43, 43, UNIX_TIMESTAMP() - 10800, 12.56, 2254, 32.2, 405, 0, 0, -1, -99, 0, 'NONE', -49, 300, 1500, 4.15, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
  ('MITSUBISHI-STOCK-12', 44, 44, UNIX_TIMESTAMP() - 7200,  12.55, 2252, 32.3, 405, 0, 0, -1, -99, 0, 'NONE', -48, 300, 1502, 4.70, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('MITSUBISHI-STOCK-12', 45, 45, UNIX_TIMESTAMP() - 3600,  12.55, 2252, 32.4, 405, 0, 0, -1, -99, 0, 'NONE', -127, 300, 1504, 5.10, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('MITSUBISHI-STOCK-12', 46, 46, UNIX_TIMESTAMP(),         12.54, 2251, 32.5, 405, 0, 0, -1, -99, 0, 'NONE', -127, 300, 1505, 5.32, NOW());

-- 4. Seed Movement Events
INSERT IGNORE INTO `movement_events` (`id`, `unit_id`, `departed`, `returned`, `away_min`, `debounce_hits`, `tag`)
VALUES
  ('EV-0421', 'MITSUBISHI-STOCK-08', '2026-10-15 11:15:22', NULL,                  NULL, 3, 'Test Drive'),
  ('EV-0420', 'MITSUBISHI-STOCK-12', '2026-10-15 10:55:10', NULL,                  NULL, 3, 'PDI Workshop'),
  ('EV-0419', 'MITSUBISHI-STOCK-03', '2026-10-15 10:42:08', NULL,                  NULL, 3, 'Test Drive'),
  ('EV-0418', 'MITSUBISHI-STOCK-01', '2026-10-14 15:10:51', '2026-10-14 16:02:17', 51,   3, 'PDI Workshop'),
  ('EV-0417', 'MITSUBISHI-STOCK-02', '2026-10-14 09:05:33', '2026-10-14 11:47:02', 161,  3, 'Detailing'),
  ('EV-0416', 'MITSUBISHI-STOCK-03', '2026-10-13 13:21:40', '2026-10-13 13:58:12', 36,   3, NULL),
  ('EV-0415', 'MITSUBISHI-STOCK-01', '2026-10-12 08:30:00', '2026-10-12 10:15:44', 105,  3, 'Customer Delivery');

-- 5. Seed System Audit Events
INSERT IGNORE INTO `system_events` (`id`, `unit_id`, `event_type`, `severity`, `message`, `created_at`)
VALUES
  (1, 'MITSUBISHI-STOCK-01', 'ADC_CALIBRATION',   'INFO',     'SOP C.1 4-point OLS calibration applied (slope=0.005412, offset=0.358)',     DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  (2, 'MITSUBISHI-STOCK-02', 'LOW_BATTERY_WARN',  'WARN',     'Open-circuit voltage dropped below 12.20V PDI threshold (12.18V)',            DATE_SUB(NOW(), INTERVAL 6 HOUR)),
  (3, 'MITSUBISHI-STOCK-03', 'CRITICAL_DRAIN',    'CRITICAL', 'Critical battery alert triggered at 11.65V (shunt sleep current 490 uA)',    DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  (4, 'MITSUBISHI-STOCK-03', 'WARMUP_DISPATCH',   'INFO',     'Operator queued priority 10-minute alternator warm-up inspection',            DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  (5, 'MITSUBISHI-STOCK-04', 'DTC_ALERT',         'WARN',     'Diagnostic trouble code P0133 (O2 Sensor Circuit Slow Response) reported',    DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  (6, 'MITSUBISHI-STOCK-10', 'DTC_ALERT',         'WARN',     'Diagnostic trouble code P0115 (Engine Coolant Temperature Circuit) reported', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  (7, 'MITSUBISHI-STOCK-10', 'CRITICAL_DRAIN',    'CRITICAL', 'Critical battery alert triggered at 11.58V (shunt sleep current 540 uA)',    DATE_SUB(NOW(), INTERVAL 1 HOUR));

-- 6. Seed Maintenance Tickets (Shift Handover Workflow)
INSERT IGNORE INTO `maintenance_tickets` (`id`, `ticket_code`, `unit_id`, `bay`, `issue_summary`, `status`, `assigned_to`, `handover_note`, `updated_at`)
VALUES
  (1, 'TKT-0401', 'MITSUBISHI-STOCK-03', 'B-02', 'Critical battery drain (11.65V) & 490 uA sleep draw',          'OPEN',        'R. Pratama (Shift A)', 'Queued for priority 10-min alternator warm-up',               NOW()),
  (2, 'TKT-0402', 'MITSUBISHI-STOCK-04', 'A-02', 'Critical drain (11.72V) + ECU DTC P0133 O2 slow response',     'IN_PROGRESS', 'D. Kusuma (PDI Tech)', 'Connected MUT-III scanner; verifying O2 heater harness',      NOW()),
  (3, 'TKT-0403', 'MITSUBISHI-STOCK-10', 'C-02', 'Deep sulfation risk (11.58V) + DTC P0115 coolant temp circuit','OPEN',        'Unassigned',           'Needs portable jump-pack & ECT connector check at Bay C-02',  NOW()),
  (4, 'TKT-0404', 'MITSUBISHI-STOCK-02', 'A-04', 'Low battery warning (12.18V) before customer PDI',             'RESOLVED',    'A. Wijaya (Shift B)',  'Top-up charge completed; resting OCV verified stable',        DATE_SUB(NOW(), INTERVAL 3 HOUR));
