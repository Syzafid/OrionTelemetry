---
id: obd2-can-protocol
title: Protokol OBD-II CAN Bus 100% Read-Only
---

# Protokol OBD-II CAN Bus (ISO 15765-4 500 kbps)

Mobil stok yang terparkir di diler masih menjadi aset baru bernilai tinggi dengan garansi resmi pabrik. Karena itu, ORION mengunci protokol komunikasinya secara **100% Read-Only (`STRICT_MODE_01_03_07_ONLY_NO_MODE_04`)**. Perangkat keras maupun firmware sama sekali tidak diizinkan mengirim perintah hapus fault code (`Mode 0x04`), menulis memori, atau menggerakkan aktuator mobil lewat jaringan CAN.

## 1. Penjagaan Read-Only di Level Driver TWAI

Sebelum menyusun frame permintaan ke ID broadcast ECU `0x7DF`, fungsi `queryObdPid(mode, pid, ...)` di [sketch_oct16aa.ino](file:///d:/magang/v1/pixel-twin-workbench/firmware/sketch_oct16aa/sketch_oct16aa.ino) langsung menolak perintah apa pun di luar mode pembacaan resmi:

```cpp
if (mode != 0x01 && mode != 0x03 && mode != 0x07) {
  return false;
}
```

Driver hanya menerima balasan *single-frame* ISO 15765-4 pada rentang identifier `0x7E8` hingga `0x7EF` yang memiliki Service ID balasan `mode + 0x40`.

## 2. Daftar 17 Parameter & Kode Gangguan yang Dibaca

| Mode & PID | Field Telemetri | Rumus Dekoding ECU | Keterangan & Fallback |
| :--- | :--- | :--- | :--- |
| `0x01 0x01` | `mil_on`, `dtc_cnt` | `A & 0x80` (MIL), `A & 0x7F` (jumlah DTC) | Status lampu Check Engine dan jumlah kode gangguan tersimpan. |
| `0x01 0x0C` | `rpm` | `(256*A + B) / 4` | Putaran mesin (`RPM`). |
| `0x01 0x05` | `temp_c` | `A - 40` | Suhu air pendingin mesin (`C`). |
| `0x01 0x0D` | `speed_kmh` | `A` | Kecepatan jalan kendaraan (`km/h`). |
| `0x01 0x0F` | `iat_c` | `A - 40` | Suhu udara masuk intake (`C`). |
| `0x01 0x0B` | `map_kpa` | `A` | Tekanan udara absolut di intake manifold (`kPa`). |
| `0x01 0x04` | `load_pct` | `(A * 100) / 255` | Beban kerja mesin (`%`). |
| `0x01 0x11` | `tps_pct` | `(A * 100) / 255` | Persentase bukaan katup throttle (`%`). |
| `0x01 0x0E` | `ign_deg` | `(A / 2) - 64` | Sudut pemajuan pengapian (`derajat`). |
| `0x01 0x10` | `maf_gs` | `(256*A + B) / 100` | Laju aliran massa udara (`g/s`). |
| `0x01 0x1F` | `run_time_s` | `(A << 8) \| B` | Durasi mesin hidup sejak distarter (`detik`). |
| `0x01 0x2F` | `fuel_pct` | `(A * 100) / 255` | Sisa level tangki bahan bakar (`%`). |
| `0x01 0x5E` | `fuel_rate_lh` | `(256*A + B) * 0.05` | Konsumsi BBM (`L/h`); dihitung dari MAF `(maf_gs * 3600) / (14.7 * 740)` jika ECU tidak mendukung PID `0x5E`. |
| `0x01 0x14` | `o2_v` | `A / 200` | Tegangan sensor O2 Bank 1 (`V`). |
| `0x01 0x06` | `stft_pct` | `(A - 128) * (100 / 128)` | Koreksi bahan bakar jangka pendek Bank 1 (`%`). |
| `0x01 0x42` | `ecu_v` | `(256*A + B) / 1000` | Tegangan internal ECU (`V`); otomatis memakai `v_bat` jika ECU tidak mengirim PID `0x42`. |
| `0x01 0x31` | `dist_clr_km` | `(A << 8) \| B` | Jarak tempuh mobil sejak kode gangguan terakhir dihapus (`km`). |
| `0x03` / `0x07` | `dtc` | `decodeObdDtcBytes(b1, b2)` | Mengubah 2 byte biner ECU menjadi kode huruf standar `P/C/B/U` (contoh `P0133`). |

## 3. Membedakan "Kunci Kontak Mati" vs "Chip CAN PCB Rusak" (`runCanTransceiverLoopbackTest`)

Saat kendaraan terparkir dengan kunci kontak `OFF`, komputer mesin (ECU) ikut tertidur dan tidak menjawab panggilan CAN apa pun. Bila perangkat hanya mengandalkan balasan dari ECU untuk menilai sehat-tidaknya bus CAN, sistem tidak akan bisa membedakan apakah **mobil sedang mati normal** ataukah **chip transceiver `WCMCU-230` di PCB mengalami solderan lepas/rusak**.

Untuk memisahkan kedua kondisi tersebut secara pasti, setiap bangun firmware memanggil `runCanTransceiverLoopbackTest()`:

1. ESP32 menginisialisasi driver TWAI sementara dalam mode `TWAI_MODE_NO_ACK` lalu mengirim satu frame uji bertanda `txMsg.self = 1` (*self-reception loopback*).
2. Sinyal keluar dari pin `CTX (GPIO 5)` melewati transceiver `WCMCU-230` lalu memantul kembali masuk lewat pin `CRX (GPIO 4)` tanpa mengganggu ECU kendaraan sedikit pun.
3. Jika frame pantulan kembali utuh, `can_ok` bernilai `1` (`true`) walaupun mesin mati (`STANDBY` di HMI Modul 04 Tab 03). Sebaliknya, jika frame uji tidak kembali, barulah firmware menyetel `can_ok = 0` (`FAULT: Gangguan Transceiver / Loopback`) supaya teknisi tahu papan PCB perlu diperiksa.
