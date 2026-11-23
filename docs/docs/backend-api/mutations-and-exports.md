---
id: mutations-and-exports
title: Mutasi Dua Arah & Generator Ekspor
---

# Mutasi Konfigurasi (`update_config.php`) & Generator Ekspor Laporan

## 1. Endpoint Mutasi Dua Arah (`POST /dipo_api/update_config.php`)

Seluruh tindakan operator di HMI pada mode `LIVE_API` diteruskan ke [update_config.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/update_config.php) dalam format JSON `{ "action": "<NAMA_AKSI>", ... }`. Setiap mutasi membatalkan micro-cache (`invalidateOrionDataCache()`) dan mencatat jejak audit ke `system_events`.

| Nilai `action` | Asal Modul HMI | Efek Basis Data MySQL |
| :--- | :--- | :--- |
| `UPDATE_CONFIG` | Modul 06 (NVS & Kalibrasi OLS) | Upsert `node_configs` (`sleep_cfg`, `fast_poll_s`, `crit_v`, `debounce_cnt`, `cal_slope`, `cal_offset`) + set `pending_ack = 1`; mencatat `ADC_CALIBRATION` atau `CONFIG_UPDATE`. |
| `REGISTER_UNIT` / `PAIR_UNIT` | Modul 06 (Onboarding & Re-Pair) | Mendaftarkan/memperbarui metadata `vehicles` (status awal `OFFLINE / Terdaftar (Menunggu Paket Pertama)`) dan mengantrekan konfigurasi awal di `node_configs` (`pending_ack = 1`). |
| `UNPAIR_UNIT` | Modul 06 (Lepas Node) | Memperbarui `vehicles.status_label = 'Node Terlepas (Menunggu Re-Pair)'` dan mencatat `NODE_UNPAIRED` (`WARN`) ke `system_events`. |
| `TAG_MOVEMENT` | Modul 05 (Presensi & Log) | Menyimpan tag operasional (`Test Drive`, `PDI Workshop`, `Detailing`, `Customer Delivery`) ke baris `movement_events` keluar maupun masuk pasangannya (`paired_id`). |
| `FLUSH_BUFFER` | Modul 05 (Reset Antrean) | Mereset indikator `vehicles.buffer_used = 0` setelah verifikasi sinkronisasi operator (`BUFFER_FLUSH`). |
| `DISPATCH_WARMUP` | Modul 03 (Antrean Pemanasan) | Menyetel `vehicles.status_label = 'Warm-Up Dispatched'` dan mencatat `WARMUP_DISPATCH` (`WARN`) ke `system_events`. |
| `UPDATE_TICKET` | Modul 02 & Modul 06 | Upsert tiket serah-terima di `maintenance_tickets` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `assigned_to`, `handover_note`) + log `TICKET_HANDOVER`. |

## 2. Generator Ekspor Laporan CSV (`export_csv.php`)

Endpoint **`GET /dipo_api/export_csv.php`** ([export_csv.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/export_csv.php)) menghasilkan berkas CSV standar RFC 4180 berisi **39 kolom** telemetri & OBD-II (`telemetry_logs`). Mendukung parameter filter:
- `unit_id`: `ALL` atau daftar ID dipisahkan koma (`MITSUBISHI-STOCK-01,MITSUBISHI-STOCK-02`)
- `period`: `DAILY` (`date=YYYY-MM-DD`), `7_DAYS`, `MONTHLY` (`month=YYYY-MM`), `YEARLY` (`year=YYYY`), `CUSTOM` (`start_date` s/d `end_date`), `ALL_TIME`
- `resolution`: `RAW` (data mentah wake-cycle), `HOURLY` (agregasi rata-rata/maksimum per jam), atau `DAILY_SUMMARY` (ringkasan harian)
- `limit`: maksimal `50.000` baris untuk periode terfilter (`10.000` default untuk `ALL_TIME`).

## 3. Generator Excel 3-Worksheet (`export_excel.php`)

Endpoint **`GET /dipo_api/export_excel.php`** ([export_excel.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/export_excel.php)) menghasilkan buku kerja native **Microsoft Excel SpreadsheetML (`.xls`)** dengan `AutoFilter` dan header beku (*Frozen Panes*) terdiri atas 3 sheet:

1. **`1_Ringkasan_PDI_Armada` (16 Kolom)**: Ringkasan per unit kendaraan lengkap dengan kompensasi tegangan $V_{25}$, estimasi SOC%, faktor termal Arrhenius, laju pengurasan `mV/jam`, estimasi TTC, serta status kelulusan PDI.
2. **`2_Log_Telemetri_OBD` (41 Kolom)**: Riwayat wake-cycle termasuk seluruh 15 PID OBD-II Read-Only serta koefisien kalibrasi `cal_slope` dan `cal_offset`.
3. **`3_Tiket_dan_Audit_Log` (9 Kolom)**: Konsolidasi tiket pemeliharaan aktif dan jejak audit operasional sistem.
