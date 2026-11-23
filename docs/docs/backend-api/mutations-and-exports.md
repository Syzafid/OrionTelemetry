---
id: mutations-and-exports
title: Mutasi Dua Arah & Generator Ekspor
---

# Mutasi Konfigurasi (`update_config.php`) & Generator Ekspor Laporan

## 1. Mengirim Perintah dari HMI ke Database (`update_config.php`)

Pada mode `LIVE_API`, setiap kali operator mengubah setelan di layar HMI, browser mengirim JSON ke `POST /dipo_api/update_config.php` ([update_config.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/update_config.php)) dengan kunci `"action"`. Setiap eksekusi yang sukses langsung menghapus cache `get_data.php` dan menulis catatan ke tabel audit `system_events`.

| Nilai `action` | Dari Modul HMI | Perubahan di Basis Data MySQL |
| :--- | :--- | :--- |
| `UPDATE_CONFIG` | Modul 06 (NVS & Kalibrasi OLS) | Menyimpan `sleep_cfg`, `fast_poll_s`, `crit_v`, `debounce_cnt`, `cal_slope`, `cal_offset` ke `node_configs` dengan `pending_ack = 1`; mencatat `ADC_CALIBRATION` atau `CONFIG_UPDATE`. |
| `REGISTER_UNIT` / `PAIR_UNIT` | Modul 06 (Onboarding & Pasang Ulang) | Mendaftarkan metadata `vehicles` dengan status awal `OFFLINE / Terdaftar (Menunggu Paket Pertama)` serta mengantrekan setelan awal `pending_ack = 1`. |
| `UNPAIR_UNIT` | Modul 06 (Lepas Node) | Memperbarui `vehicles.status_label` menjadi `'Node Terlepas (Menunggu Re-Pair)'` dan mencatat `NODE_UNPAIRED` (`WARN`). |
| `TAG_MOVEMENT` | Modul 05 (Presensi & Log) | Mengisi kolom `tag` (`Test Drive`, `PDI Workshop`, `Detailing`, `Customer Delivery`) pada baris `movement_events` keluar beserta baris masuk pasangannya (`paired_id`). |
| `FLUSH_BUFFER` | Modul 05 (Reset Antrean) | Mereset indikator antrean `vehicles.buffer_used = 0` sesudah operator memverifikasi sinkronisasi dan mencatat `BUFFER_FLUSH`. |
| `DISPATCH_WARMUP` | Modul 03 (Antrean Pemanasan) | Menyetel `vehicles.status_label = 'Warm-Up Dispatched'` dan mencatat `WARMUP_DISPATCH` (`WARN`). |
| `UPDATE_TICKET` | Modul 02 & Modul 06 | Menyimpan atau memperbarui tiket di `maintenance_tickets` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `assigned_to`, `handover_note`) beserta audit `TICKET_HANDOVER`. |

### Contoh Payload Mutasi ke `update_config.php`

Contoh saat operator menyetel ambang kritis dan kalibrasi OLS untuk `MITSUBISHI-STOCK-01`:

```json
{
  "action": "UPDATE_CONFIG",
  "unit_id": "MITSUBISHI-STOCK-01",
  "sleep_cfg": 3600,
  "fast_poll_s": 10,
  "crit_v": 11.85,
  "debounce_cnt": 3,
  "cal_slope": 0.0047037,
  "cal_offset": 0.16
}
```

Contoh saat operator di Modul 03 menugaskan teknisi lapangan untuk memanaskan mesin kendaraan:

```json
{
  "action": "DISPATCH_WARMUP",
  "unit_id": "MITSUBISHI-STOCK-01"
}
```

## 2. Generator Ekspor CSV (`export_csv.php`)

Endpoint `GET /dipo_api/export_csv.php` ([export_csv.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/export_csv.php)) menghasilkan berkas CSV berstandar RFC 4180 sebanyak **39 kolom** data telemetri dan OBD-II dari `telemetry_logs`. Operator bisa menyaring hasilnya lewat parameter URL:

1. `unit_id`: pilih `ALL` atau sebutkan daftar ID dipisah koma (misal `MITSUBISHI-STOCK-01,MITSUBISHI-STOCK-02`).
2. `period`: `DAILY` (ditambah `date=YYYY-MM-DD`), `7_DAYS`, `MONTHLY` (`month=YYYY-MM`), `YEARLY` (`year=YYYY`), `CUSTOM` (`start_date` s/d `end_date`), atau `ALL_TIME`.
3. `resolution`: `RAW` untuk data mentah tiap bangun, `HOURLY` untuk rata-rata dan puncak per jam, atau `DAILY_SUMMARY` untuk ringkasan harian.
4. `limit`: maksimal `50.000` baris bila memakai rentang tanggal (`10.000` default saat memilih `ALL_TIME`).

## 3. Generator Buku Kerja Excel 3-Sheet (`export_excel.php`)

Endpoint `GET /dipo_api/export_excel.php` ([export_excel.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/export_excel.php)) membuat file native Microsoft Excel SpreadsheetML (`.xls`) lengkap dengan baris judul beku (*Frozen Panes*) dan tombol saring otomatis (*AutoFilter*) yang terdiri atas tiga sheet terpisah:

1. **`1_Ringkasan_PDI_Armada` (`16` Kolom)**: berisi ringkasan kesehatan tiap kendaraan, tegangan terkoreksi suhu $V_{25}$, persentase muatan (`SOC%`), faktor percepatan suhu Arrhenius, laju penurunan `mV/jam`, estimasi waktu kritis (`TTC`), dan status lulus/gagal PDI.
2. **`2_Log_Telemetri_OBD` (`41` Kolom)**: berisi riwayat mentah atau teragregasi lengkap dengan seluruh 15 parameter PID OBD-II Read-Only serta nilai `cal_slope` dan `cal_offset` aktif saat sampel diambil.
3. **`3_Tiket_dan_Audit_Log` (`9` Kolom)**: menggabungkan status tiket perawatan yang masih terbuka maupun terselesaikan bersama jejak audit `system_events`.
