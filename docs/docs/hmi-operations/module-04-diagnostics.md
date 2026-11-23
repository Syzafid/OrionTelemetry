---
id: module-04-diagnostics
title: "Modul 04: Diagnostik OBD-II CAN Bus"
---

# Modul 04: Diagnostik Mesin & OBD-II Read-Only

Modul 04 ([DiagnosticsModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/DiagnosticsModule.tsx)) menyajikan pembacaan lengkap komputer mesin (ECU ISO 15765-4 500 kbps) dan hasil diagnosa kelistrikan papan ORION dengan prinsip **100% Read-Only**. Layar ini tidak menyediakan tombol penghapusan kode gangguan (`Mode 0x04`) supaya catatan pabrikan kendaraan stok tetap aman dan garansi tidak terganggu.

## 1. Tiga Tab Pemeriksaan di Modul 04

### Tab 01: Telemetri Mesin & Gauge Analog

Menampilkan dua jarum gauge SVG `270 derajat` untuk putaran mesin (`RPM`) dan suhu air radiator (`Coolant C`). Batas zona merah pada gauge berubah otomatis mengikuti spesifikasi model kendaraan dari [vehicle-topology.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/vehicle-topology.ts) (maksimal `7.000 RPM` untuk unit bensin seperti Xforce/Xpander dan `5.000 RPM` untuk unit diesel seperti Pajero Sport/Triton). Di bawah gauge tersedia grafik tren ganda RPM vs Coolant serta kartu seluruh **15 Parameter Live PID Mode `0x01`** (termasuk perkiraan liter sisa bahan bakar dari kapasitas tangki OEM mobil).

### Tab 02: Pembacaan Fault Code (Mode `0x03` Aktif / `0x07` Placeholder)

Menampilkan status lampu **MIL (*Check Engine*)**, jarak tempuh sejak kode kerusakan terakhir dihapus oleh bengkel resmi (`dist_clr_km`), serta daftar kode gangguan aktif dari `Mode 0x03` (*Stored DTC*, seperti `P0133`) beserta keterangan komponen bermasalah. Untuk *Pending DTC* (`Mode 0x07`), antarmuka menampilkan status resmi `Belum Dipoling (FW v1.6.0)` hingga fungsi `pollRealEcuObd2()` di firmware ditambahkan permintaan query tambahan.

### Tab 03: Diagnostik Fisik Jalur Kabel (`W-01` s/d `W-08`)

Menampilkan kesehatan delapan jalur fisik pada papan PCB ORION v2.0: tegangan masuk `12V (W-01)`, acuan ground & buck `3.3V (W-02/W-03)`, pulsa `40 ms` pembagi `GPIO27 (W-04)`, bacaan millivolt `GPIO34 (W-05)`, catu daya CAN `GPIO26 (W-06)`, status loopback `WCMCU-230 (W-07)`, dan suhu RTC `DS3231SN (W-08)`.

## 2. Langkah Kerja Pemeriksaan Masalah Kendaraan

1. Pilih unit kendaraan di bilah armada atau lewat kotak pilih unit.
2. Saat teknisi menghidupkan mobil, buka **Tab 01** untuk memastikan idle RPM stabil, suhu kerja coolant naik wajar, dan suplai ECU (`PID 0x42`) seimbang dengan bacaan aki.
3. Buka **Tab 02** guna mencatat kode gangguan (`DTC`) yang mungkin muncul saat mobil dipanaskan; bila muncul kode aktif, tindak lanjuti tiket perawatan di Modul 02 atau hubungi teknisi bersertifikat dengan scanner resmi diler.
4. Jika muncul peringatan `CAN Fault` saat mesin mati, buka **Tab 03** lalu cek baris `W-06` dan `W-07` untuk memastikan apakah masalahnya berasal dari modul transceiver `WCMCU-230` (`can_ok = false`) atau semata karena kunci kontak mobil sedang mati (`STANDBY`).

## 3. Mode Simulator vs Mode Live MySQL

Ketika mobil standby dan mode **`LIVE_API`** aktif, grafik tren hanya memuat titik nyata dari database (nol RPM dan nol suhu coolant jika mesin memang mati), berbeda dengan mode Simulator yang menyediakan kurva pemanasan contoh.
