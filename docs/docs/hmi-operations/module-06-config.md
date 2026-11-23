---
id: module-06-config
title: "Modul 06: Konfigurasi Node & Kalibrasi ADC"
---

# Modul 06: Onboarding Node IoT, Staging NVS & Kalibrasi Multimeter

Modul 06 ([ConfigModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/ConfigModule.tsx)) menjadi pusat pengaturan perangkat keras jarak jauh. Dari sini, administrator atau kepala bengkel mendaftarkan modul ESP32 baru ke mobil, melepas tautan node saat mobil laku terjual, menyetel batas voltase kritis ke NVS flash lewat Piggyback ACK, dan mengkalibrasi pembacaan multimeter (SOP C.1).

## 1. Tiga Sub-Tab Pengaturan di Modul 06

### Sub-Tab 01: Onboarding, Lepas & Pasang Ulang Node

Saat menerima perangkat ORION baru dari perakitan, isi `Unit Node ID` (contoh `MITSUBISHI-STOCK-02`), pilih versi papan (`PCB v1.0` atau `PCB v2.0`), masukkan nomor rangka (`VIN`), model/trim, lokasi bay parkir, ambang voltase kritis, serta interval tidur awal. Setelah disimpan lewat `REGISTER_UNIT`, backend menulis baris baru di `vehicles` dan `node_configs` (`pending_ack = 1`), dan unit tampil berstatus `OFFLINE / Terdaftar (Menunggu Paket Pertama)` sampai paket telemetri fisik pertama tiba.

Ketika sebuah mobil terjual dan peralatannya dicabut untuk dipindah ke unit stok lain, klik **Lepas Node (`UNPAIR_UNIT`)** di direktori node lalu tautkan kembali perangkat keras tersebut melalui **Pasang Ulang Node (`PAIR_UNIT`)**.

### Sub-Tab 02: Parameter NVS, Kalibrasi 4-Titik DMM & Pratinjau ACK

Operator dapat menyetel empat parameter utama yang akan disimpan permanen ke NVS (`orion_nvm`) di ESP32: `crit_v` (`5.1V - 15.9V`), `sleep_cfg` (`300s` hingga `21600s / 6 Hours`), `fast_poll_s` (`5 - 300s`), dan `debounce_cnt` (`1 - 10x`). Untuk kalibrasi **SOP C.1**, masukkan empat angka multimeter dan bacaan mentah `adc_raw_mv`, lalu biarkan `olsCalibration()` menghitung `cal_slope` dan `cal_offset`.

Tombol kirim akan aktif hanya bila hasil perhitungan memenuhi batas aman ($R^2 \ge 0.9900$, `0.001 < slope < 0.02`, dan `-2.0 < offset < +2.0`). Panel terminal JSON di sisi kanan menampilkan persis paket kawat `buildWirePiggybackAck()` beserta status **`ACK Tertunda`** hingga ESP32 menyetor paket berikutnya dan mengambil konfigurasi barunya.

### Sub-Tab 03: Tiket Pemeliharaan & Log Audit Sistem

Berisi seluruh catatan `system_events` yang dapat disaring menurut tingkat keparahan (`INFO`, `PERINGATAN`, `KRITIS`), unit kendaraan, atau kata kunci teks (misalnya `BURST_SYNC` atau `ADC_CALIBRATION`), sekaligus tempat memperbarui status tiket kerja bengkel.

## 2. Pintasan Keyboard Global HMI

| Pintasan / Kontrol | Fungsi Cepat |
| :--- | :--- |
| `Ctrl + K` / `Cmd + K` | Membuka atau menutup Palet Perintah Global (`CommandPaletteModal`) |
| `Alt + 1` s/d `Alt + 6` | Berpindah langsung ke Modul `01` hingga `06` |
| Indikator `LIVE_API` (bilah atas) | Membuka popover pengubah URL server API dan tombol pemicu polling manual |
