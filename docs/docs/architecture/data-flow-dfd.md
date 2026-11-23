---
id: data-flow-dfd
title: Diagram Alir Data (DFD Level 0, 1, 2)
---

# Diagram Alir Data Sistem ORION (DFD Level 0, 1, dan 2)

Halaman ini menjelaskan jalur perjalanan data pada sistem ORION mulai dari sinyal tegangan dan frame CAN di [PCB v2.0 Step 2.1](../hardware/pcb-v2-blueprint-layout.md), pemadatan di firmware [ESP32 v1.6.0](../firmware/telemetry-struct.md), pemrosesan oleh PHP/MySQL, hingga tampil di layar operator atau diunduh menjadi berkas Excel.

## Perjalanan Satu Paket Data (Dari Pin OBD-II ke Layar Operator)

Sebelum membaca diagram lengkap di bawah, ikuti alur lima tahap berikut untuk memahami apa yang terjadi dalam satu siklus bangun perangkat:

1. Ketika alarm `DS3231SN` berbunyi pada pin `GPIO32`, mikrokontroler ESP32 bangun dari Deep Sleep dan menyalakan `GPIO27` selama `40 ms` agar tegangan aki masuk melewati pembagi `R1/R2` ke pin `GPIO34`.
2. Firmware menyampel tegangan `16 kali`, menyalakan transceiver `WCMCU-230` lewat `GPIO26` untuk memeriksa kesehatan bus CAN serta PID mesin (bila kunci kontak aktif), lalu memadatkan hasilnya menjadi rekaman biner `88 byte`.
3. Jika Wi-Fi gudang terhubung, ESP32 langsung mengirim rekaman JSON via `HTTPS POST` ke `simpan_data.php`. Bila tidak ada sinyal, rekaman masuk ke antrean dua tingkat (20 slot di RTC SRAM dan 2.000 slot di LittleFS Flash) untuk dikirim ulang nanti.
4. Di server, `simpan_data.php` menyaring paket duplikat, memeriksa apakah mobil baru saja keluar-masuk gudang, membuka tiket otomatis jika voltase di bawah ambang batas, dan mengembalikan balasan `HTTP 200` (berikut konfigurasi baru bila ada antrean `pending_ack`).
5. Layar HMI di browser operator menanyakan `get_data.php` setiap `3 detik`, menghitung prediksi waktu kritis aki (TTC), dan menyajikan hasilnya di enam modul tanpa merekayasa kurva buatan ketika unit sedang offline.

---

## 1. DFD Level 0 (Diagram Konteks)

Diagram konteks memperlihatkan batas sistem ORION beserta pertukaran informasi dengan tiga pihak luar di lapangan: kendaraan (aki dan ECU), infrastruktur Wi-Fi/NTP, serta operator/teknisi bengkel.

```mermaid
flowchart LR
  VEH["Entitas: Kendaraan (Aki 12V + ECM J1962)"]
  NET["Entitas: AP Gudang / Hotspot & Server NTP"]
  OP["Entitas: Operator Control Room & Teknisi PDI"]

  SYS(("0.0 Sistem ORION Telemetry & Digital Twin"))

  VEH -->|"Tegangan Aki (Pin 16) + Frame CAN 500kbps"| SYS
  SYS -->|"Query Read-Only OBD Mode 01/03/07 (0x7DF)"| VEH

  NET -->|"Beacon RSSI + Sinkronisasi Waktu UTC (SNTP)"| SYS
  SYS -->|"Paket JSON HTTPS POST & Header X-Orion-Node"| NET

  OP -->|"Ambang crit_v, sleep_cfg, Kalibrasi OLS, Tiket & Warmup"| SYS
  SYS -->|"Status 3D Twin, Prognostik Aki, DTC, Ekspor CSV/XLSX"| OP
```

---

## 2. DFD Level 1 (Enam Proses Utama & Lima Penyimpanan Data)

Sistem dipecah menjadi enam proses utama (`1.0` hingga `6.0`) yang membaca dan menulis lima tempat penyimpanan data (`D1` sampai `D5`).

```mermaid
flowchart TD
  VEH["Kendaraan (OBD-II J1962)"]
  NTP["AP Gudang / Hotspot / NTP"]
  USR["Operator & Teknisi HMI"]

  P1(("1.0 Akuisisi Sinyal & CAN Read-Only"))
  P2(("2.0 Evaluasi 4-Zona Wi-Fi & Buffer 2-Tingkat"))
  P3(("3.0 Ingesti, State Machine & Auto-Tiket (simpan_data.php)"))
  P4(("4.0 Kontrol Konfigurasi & Piggyback ACK (update_config.php)"))
  P5(("5.0 Penyajian Live, Guard & Prognostik (get_data.php / HMI)"))
  P6(("6.0 Agregasi Audit & Ekspor Laporan (CSV / Excel)"))

  D1[("D1: Tier-1 RTC SRAM (20 Slot)")]
  D2[("D2: Tier-2 LittleFS /tier2_queue.bin (2.000 Slot)")]
  D3[("D3: NVS Flash (orion_nvm)")]
  D4[("D4: MySQL Telemetry & Ops (vehicles, telemetry_logs, movement_events, maintenance_tickets, system_events)")]
  D5[("D5: MySQL node_configs (pending_ack & Parameter)")]

  VEH -->|"mV Node M (GPIO34) + Frame 0x7E8 (GPIO4/5)"| P1
  D3 -->|"slope_m, offset_c, sleep_cfg"| P1
  P1 -->|"TelemetrySample (v_bat, rpm, temp_c, dtc, can_ok, rtc_temp)"| P2

  NTP -->|"Scan RSSI & UTC Epoch"| P2
  P2 <-->|"Push / Drain saat offline & Wakeup"| D1
  P2 <-->|"Spillover > 20 & Drain FIFO"| D2

  P2 -->|"Single JSON / Burst Array (<= 20 per POST)"| P3
  P3 <-->|"Upsert Kronologis, Deteksi Zona, Auto-Tiket"| D4
  P3 -->|"Permintaan Cek pending_ack"| P4
  P4 <-->|"Baca Parameter & Reset pending_ack = 0"| D5
  P4 -->|"Payload Piggyback ACK JSON HTTP 200"| P2
  P2 -->|"Simpan Konfigurasi Baru ke Flash"| D3

  USR -->|"Ubah crit_v / sleep_cfg / Kalibrasi / Mutasi"| P4
  USR -->|"Assign Bay, Warmup, Tiket, Hapus Unit"| P3
  D4 -->|"Query Window 24 Titik + Cache File 2.0s"| P5
  D5 -->|"Konfigurasi Aktif Unit"| P5
  P5 -->|"Status 3D Twin, Prognostik OLS, Peta Kendaraan"| USR

  D4 -->|"Rentang Tanggal + Resolusi RAW / HOURLY / DAILY_SUMMARY"| P6
  P6 -->|"Berkas Unduhan CSV & Excel 3-Sheet"| USR
```

### Kamus Proses & Penyimpanan Data (Level 1)

| Kode | Nama Proses atau Data Store | Lokasi Implementasi | Tugas dan Aliran Masuk/Keluar |
| :--- | :--- | :--- | :--- |
| `1.0` | Akuisisi Sinyal & CAN Read-Only | [sketch_oct16aa.ino](file:///d:/magang/v1/pixel-twin-workbench/firmware/sketch_oct16aa/sketch_oct16aa.ino) | Menyalakan `GPIO27` (`40 ms`) & `GPIO26` (`20 ms`); mengubah bacaan mentah mV menjadi `v_bat` dan menanyakan PID `0x01` dan DTC `0x03` (`0x07` siap di driver). |
| `2.0` | Evaluasi 4-Zona Wi-Fi & Buffer 2-Tingkat | [sketch_oct16aa.ino](file:///d:/magang/v1/pixel-twin-workbench/firmware/sketch_oct16aa/sketch_oct16aa.ino) | Menentukan zona `YARD`, `TECH_HOTSPOT`, atau `OFFLINE`, mengemas struktur `88 byte`, atau menampung ke `D1`/`D2`. |
| `3.0` | Ingesti Transaksional & Auto-Tiket | [simpan_data.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/simpan_data.php) | Mengurutkan batch (`boot, seq, ts_epoch`), membuang duplikat, mencatat perjalanan keluar-masuk, dan membuka tiket kritis otomatis. |
| `4.0` | Kontrol Konfigurasi & Piggyback ACK | [update_config.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/update_config.php) | Menulis parameter baru ke `node_configs` dengan `pending_ack = 1`, lalu menitipkannya ke balasan `HTTP 200` `simpan_data.php` berikutnya. |
| `5.0` | Penyajian Live & Prognostik HMI | [get_data.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/get_data.php), [TelemetryContext.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/context/TelemetryContext.tsx) | Melayani polling browser dari cache `2,0 detik`, menahan status gudang saat AP mati massal (`>= 66%`), dan menghitung regresi OLS + Arrhenius. |
| `6.0` | Agregasi Audit & Ekspor Multi-Resolusi | `export_csv.php`, `export_excel.php` | Mengolah data historis per interval (`RAW`, `HOURLY`, `DAILY_SUMMARY`) dan menghasilkan berkas unduhan CSV atau Excel 3 sheet. |
| `D1` | Tier-1 RTC SRAM | Memori `RTC_DATA_ATTR` | Kapasitas `20` rekaman (`1.760 byte`); bertahan selama Deep Sleep tanpa membuat chip Flash cepat aus. |
| `D2` | Tier-2 LittleFS Ring Buffer | `/tier2_queue.bin` (pointer di NVS `orion_nvm`) | Kapasitas `2.000` rekaman (`176.000 byte`); menampung limpahan otomatis ketika antrean `D1` sudah penuh. |
| `D3` | NVS Flash Partition | Namespace `orion_nvm` | Menyimpan `crit_v`, `slope_m`, `offset_c`, `sleep_cfg`, dan epoch terakhir agar selamat meski aki sempat dicabut. |
| `D4` | MySQL Telemetry & Operasional | 5 tabel relasional InnoDB | Menyimpan kondisi terkini dan riwayat kronologis dengan kunci baris `SELECT ... FOR UPDATE`. |
| `D5` | MySQL Konfigurasi Node | `node_configs` | Menyimpan target kalibrasi per `unit_id` dan tanda antrean `pending_ack`. |

---

## 3. DFD Level 2: Aliran Kritis End-to-End

### Level 2A: Konversi Sinyal Fisik PCB v2.0 ke Struct `88-Byte` (Proses `1.0` dan `2.0`)

```mermaid
flowchart LR
  RTC_IRQ["GPIO32 SQW Wakeup"] -->|"ext0 LOW / Timer"| LOAD_NVS["Baca D3 NVS: slope_m, offset_c, sleep_cfg"]
  LOAD_NVS --> GATE_ADC["Set GPIO27 HIGH (Q3 -> Q2 AO3401A ON 40ms)"]
  GATE_ADC --> ADC_READ["16x Sample GPIO34 -> rawMv (mV)"]
  ADC_READ --> CALC_V["v_bat = rawMv * slope_m + offset_c"]
  GATE_ADC -->|"GPIO27 LOW (0 uA)"| GATE_CAN["Set GPIO26 LOW (Q1 -> 3V3_CAN U3 ON 20ms)"]
  GATE_CAN --> CAN_POLL["Uji Loopback / Baca Mode 01 (17 PID), Mode 03 (Stored DTC)"]
  CAN_POLL -->|"GPIO26 HIGH (0V)"| PACK["Bit-Pack ke TelemetryItem (88-Byte, validasi t2_ssz)"]
  CALC_V --> PACK
```

### Level 2B: Penentuan Waktu Keluar Gudang, Penyelarasan Pra-NTP & Burst Sync (Proses `2.0` ke `3.0`)

```mermaid
flowchart TD
  TRIG_OUT["Miss Scan AP Gudang ke-1 -> Catat rtcFirstMissEpoch"] -->|"Masuk Zona OFFLINE / TECH_HOTSPOT"| LAG_PACK["Kemas exit_lag_steps = (ts_epoch - rtcFirstMissEpoch) / 20 ke bit 3..7 can_ok"]
  LAG_PACK --> QUEUE["Simpan ke D1 RTC SRAM -> Spillover ke D2 LittleFS"]
  QUEUE -->|"Kendaraan Kembali ke AP-GUDANG-01 (RSSI >= -70 dBm)"| FLUSH["Kirim Burst (Header X-Burst-Sync: true)"]
  FLUSH --> RECONCILE["simpan_data.php: Koreksi ts_epoch Pra-NTP bila clock_adjusted = 1"]
  RECONCILE --> EXIT_TIME["Hitung zone_exit_epoch = ts_epoch - (exit_lag_steps * 20)"]
  EXIT_TIME --> UPSERT["INSERT ON DUPLICATE KEY UPDATE telemetry_logs & movement_events"]
```

---

## Referensi Silang Dokumen

Penjelasan rangkaian pembentuk sinyal `GPIO34`, `GPIO26`, dan `GPIO27` dibahas pada [Alur Kelistrikan Lengkap PCB v2.0](../hardware/electrical-flow.md). Susunan lengkap `88-byte` pada proses `2.0` dirinci pada [Struktur TelemetryItem 88-Byte](../firmware/telemetry-struct.md), transisi jaringan dibahas pada [State Machine 4-Zona Wi-Fi](../firmware/wifi-zone-handover.md), dan kontrak respons Piggyback ACK ada pada [Ingest Data & Piggyback ACK](../backend-api/ingest-and-piggyback.md).
