---
id: module-06-config
title: "Modul 06: Konfigurasi Node & Kalibrasi ADC"
---

# Modul 06: Onboarding Node IoT, Staging NVS & Kalibrasi Multimeter

Modul 06 ([ConfigModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/ConfigModule.tsx)) menyediakan antarmuka kendali dua arah penuh antara operator bengkel dan NVS internal tiap unit ESP32 melalui 3 sub-tab:

## 1. Sub-Tab `01`: Onboarding & Pairing IoT (`REGISTER_UNIT` / `PAIR_UNIT` / `UNPAIR_UNIT`)

- **Registrasi Node Baru**: memilih `Unit Node ID` (contoh `MITSUBISHI-STOCK-02`), versi divider PCB (`PCB v1.0` vs `PCB v2.0`), nomor rangka (`VIN`), model/trim, lokasi bay, ambang voltase kritis, dan interval sleep awal. Unit tersimpan di tabel `vehicles` dan `node_configs` dengan `pending_ack = 1` dan berstatus jujur `OFFLINE / Menunggu Paket Pertama` hingga paket telemetri riil masuk.
- **Direktori Node (Lepas & Pasang Ulang)**: ketika kendaraan terjual, operator mengklik **Lepas Node (`UNPAIR_UNIT`)** untuk melepas penautan dan dapat mengikat ulang node perangkat keras yang sama ke kendaraan stok berikutnya lewat **Pasang Ulang Node (`PAIR_UNIT`)**.

## 2. Sub-Tab `02`: Parameter NVS, Kalibrasi OLS 4-Titik & JSON Terminal

- **Staging Parameter NVS (`UPDATE_CONFIG`)**: menyetel `crit_v` (`5.1V - 15.9V`), `sleep_cfg` (`300s` s/d `21600s` / `6 Hours`), `fast_poll_s` (`5 - 300s`), dan `debounce_cnt` (`1 - 10x`). Perubahan langsung memperbarui terminal pratinjau payload kawat `buildWirePiggybackAck()` dengan status `ACK Tertunda`.
- **Kalibrasi Multimeter SOP C.1**: menghitung `cal_slope` dan `cal_offset` secara langsung dari 4 titik pengukuran DMM menggunakan fungsi `olsCalibration()`. Koefisien hanya dapat dikirim jika lolos batas aman ($R^2 \ge 0.9900$, $0.001 < m < 0.02$, $-2.0 < c < +2.0$).

## 3. Sub-Tab `03`: Tiket Pemeliharaan & Audit Log Sistem

Menampilkan jejak peristiwa sistem (`system_events`) dengan filter tingkat keparahan (`INFO`, `PERINGATAN`, `KRITIS`), filter khusus unit aktif, pencarian teks, serta manajemen tiket perawatan (`maintenance_tickets`).

## 4. Pintasan Keyboard Global HMI

| Pintasan | Fungsi |
| :--- | :--- |
| `Ctrl + K` / `Cmd + K` | Membuka / menutup **Palet Perintah Global** (`CommandPaletteModal`) |
| `Alt + 1` s/d `Alt + 6` | Berpindah langsung ke Modul `01` s/d `06` |
| Indikator `LIVE_API` (TopNav) | Popover pengganti endpoint URL API & pemicu polling manual |
