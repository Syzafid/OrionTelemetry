---
id: obd2-can-protocol
title: Protokol OBD-II CAN Bus 100% Read-Only
---

# Protokol OBD-II CAN Bus (ISO 15765-4 500 kbps)

ORION menerapkan kebijakan mutlak **100% Read-Only ECU (`STRICT_MODE_01_03_07_ONLY_NO_MODE_04`)**. Node telemetri tidak pernah diizinkan mengirim perintah penghapusan kode gangguan (`Mode 0x04`), penulisan memori, atau kendali aktuator ke jaringan CAN kendaraan stok diler.

## 1. Penegakan Read-Only di Level Driver Firmware

Fungsi inti `queryObdPid(mode, pid, ...)` di [sketch_oct16aa.ino](file:///d:/magang/v1/pixel-twin-workbench/firmware/sketch_oct16aa/sketch_oct16aa.ino) melakukan penjagaan awal sebelum menyusun frame TWAI ke ID broadcast `0x7DF`:

```cpp
if (mode != 0x01 && mode != 0x03 && mode != 0x07) {
  return false;
}
```

Hanya single-frame response ISO 15765-4 pada range identifier `0x7E8` s/d `0x7EF` dengan Service ID balasan `mode + 0x40` yang diterima dan di-decode.

## 2. Daftar 15 Parameter Live PID (Mode `0x01`) + Mode `0x03` DTC

| Mode & PID | Field Telemetri | Rumus Dekoding ECU | Keterangan / Fallback |
| :--- | :--- | :--- | :--- |
| `0x01 0x01` | `mil_on`, `dtc_cnt` | `A & 0x80` (MIL), `A & 0x7F` (jumlah DTC) | Status lampu Check Engine & hitungan DTC. |
| `0x01 0x0C` | `rpm` | `(256*A + B) / 4` | Putaran mesin (`RPM`). |
| `0x01 0x05` | `temp_c` | `A - 40` | Suhu air pendingin mesin (`C`). |
| `0x01 0x0D` | `speed_kmh` | `A` | Kecepatan kendaraan (`km/h`). |
| `0x01 0x0F` | `iat_c` | `A - 40` | Suhu udara masuk intake (`C`). |
| `0x01 0x0B` | `map_kpa` | `A` | Tekanan absolut manifold intake (`kPa`). |
| `0x01 0x04` | `load_pct` | `(A * 100) / 255` | Beban mesin terhitung (`%`). |
| `0x01 0x11` | `tps_pct` | `(A * 100) / 255` | Posisi pedal/katup throttle (`%`). |
| `0x01 0x0E` | `ign_deg` | `(A / 2) - 64` | Sudut pemajuan pengapian (`deg`). |
| `0x01 0x10` | `maf_gs` | `(256*A + B) / 100` | Laju aliran massa udara (`g/s`). |
| `0x01 0x1F` | `run_time_s` | `(A << 8) \| B` | Durasi mesin menyala sejak start (`detik`). |
| `0x01 0x2F` | `fuel_pct` | `(A * 100) / 255` | Level tangki bahan bakar (`%`). |
| `0x01 0x5E` | `fuel_rate_lh` | `(256*A + B) * 0.05` | Laju konsumsi BBM (`L/h`); fallback dari MAF `(maf_gs * 3600) / (14.7 * 740)` bila ECU tidak mendukung PID `0x5E`. |
| `0x01 0x14` | `o2_v` | `A / 200` | Tegangan sensor O2 Bank 1 (`V`). |
| `0x01 0x06` | `stft_pct` | `(A - 128) * (100 / 128)` | *Short Term Fuel Trim* Bank 1 (`%`). |
| `0x01 0x42` | `ecu_v` | `(256*A + B) / 1000` | Tegangan internal ECU (`V`); fallback ke `v_bat` jika tidak tersedia. |
| `0x01 0x31` | `dist_clr_km` | `(A << 8) \| B` | Jarak tempuh sejak DTC terakhir dihapus (`km`). |
| `0x03` | `dtc` | `decodeObdDtcBytes(b1, b2)` | Mengonversi 2 byte biner menjadi prefix standar `P/C/B/U` (contoh `P0133`). |

## 3. Validasi Fisik CAN Transceiver (`runCanTransceiverLoopbackTest`)

Ketika kunci kontak dalam posisi OFF (ECU kendaraan mati dan PID `0x01`/`0x0C` tidak menjawab), node tetap melakukan diagnosa kesehatan modul `WCMCU-230` pada setiap wake cycle melalui mode `TWAI_MODE_NO_ACK` dengan flag frame `txMsg.self = 1`. Jika transceiver gagal memantulkan frame loopbacknya sendiri, flag `can_ok` dikemas sebagai `0` (`CAN Loopback Fault` di backend dan HMI).
