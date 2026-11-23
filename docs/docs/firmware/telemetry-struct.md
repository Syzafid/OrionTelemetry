---
id: telemetry-struct
title: Struktur TelemetryItem 88-Byte & Bit-Packing
---

# Struktur Rekaman Biner 88-Byte (`TelemetryItem`)

Untuk menghemat ruang RTC Slow SRAM (yang terbatas di ESP32) sekaligus menyimpan seluruh 35 field telemetri serta metadata OBD-II Mode `0x01`/`0x03`, firmware memadatkan setiap sampel menjadi tepat **88 byte** menggunakan atribut C++ `__attribute__((packed))` dengan pemeriksaan waktu kompilasi `static_assert(sizeof(TelemetryItem) == 88)`.

## 1. Peta Layout Memori (`TelemetryItem`)

Field disusun terurut berdasarkan keselarasan lebar tipe (`32-bit -> 16-bit -> 8-bit`) agar meminimalkan masalah penyelarasan memori pada arsitektur Xtensa LX6:

### Kelompok 32-bit (`15 field x 4 byte = 60 byte`, Offset `0..59`)
| Field | Tipe C | Satuan / Keterangan |
| :--- | :--- | :--- |
| `seq` | `uint32_t` | Nomor urut paket monotonik dari NVS (`seq_cnt`, dimulai `> 1000`). |
| `boot` | `uint32_t` | Jumlah siklus cold-boot dari NVS (`boot_cnt`). |
| `ts_epoch` | `uint32_t` | Stem waktu UNIX UTC dari DS3231SN RTC. |
| `v_bat` | `float` | Tegangan baterai terkalibrasi (V). |
| `rtc_temp_c` | `float` | Suhu kristal DS3231SN (`C`). |
| `load_pct` | `float` | PID `0x04` beban mesin terhitung (`%`). |
| `tps_pct` | `float` | PID `0x11` posisi katup throttle (`%`). |
| `ign_deg` | `float` | PID `0x0E` sudut pengapian (`deg`). |
| `maf_gs` | `float` | PID `0x10` laju aliran udara massa (`g/s`). |
| `run_time_s` | `uint32_t` | PID `0x1F` waktu mesin menyala (`detik`). |
| `fuel_pct` | `float` | PID `0x2F` level tangki bahan bakar (`%`). |
| `fuel_rate_lh` | `float` | PID `0x5E` atau estimasi MAF (`L/h`). |
| `o2_v` | `float` | PID `0x14` tegangan sensor oksigen (`V`). |
| `stft_pct` | `float` | PID `0x06` koreksi bahan bakar jangka pendek (`%`). |
| `ecu_v` | `float` | PID `0x42` tegangan modul kontrol ECU (`V`). |

### Kelompok 16-bit (`6 field x 2 byte = 12 byte`, Offset `60..71`)
`adc_raw_mv` (`uint16_t`), `shunt_sleep_ua` (`uint16_t`), `rpm` (`uint16_t`), `dist_clr_km` (`uint16_t`), `iat_c` (`int16_t`), `map_kpa` (`uint16_t`).

### Kelompok 8-bit & Array (`8 + 8 x 1 byte = 16 byte`, Offset `72..87`)
`dtc[8]` (`char[8]`), `engine_on` (`uint8_t`), `crit_alert` (`uint8_t`), `temp_c` (`uint8_t`), `dtc_cnt` (`uint8_t`), `rssi` (`int8_t`), `can_ok` (`uint8_t`), `speed_kmh` (`uint8_t`), `mil_on` (`uint8_t`).

## 2. Bit-Packing pada Byte `can_ok`

Agar status kesehatan bus CAN, zona jaringan (`OrionNetZone`), dan keterlambatan (*exit lag*) saat kendaraan meninggalkan gerbang muat di dalam 1 byte `uint8_t can_ok` tanpa menambah ukuran struct melebihi 88 byte, firmware menerapkan pengemasan bit berikut:

```text
  Bit:    [ 7   6   5   4   3 ] [ 2   1 ] [   0   ]
  Field:  [   exit_lag_steps   ] [ zone  ] [can_ok ]
  Mask:          0xF8              0x06       0x01
```

| Rentang Bit | Masker Hex | Fungsi Ekstraksi | Makna Nilai |
| :--- | :--- | :--- | :--- |
| Bit `0` | `0x01` | `getRecordCanOk(p)` | `1` = Loopback WCMCU-230 / ECU sehat; `0` = gangguan fisik CAN transceiver. |
| Bit `1..2` | `0x06` | `getRecordNetZone(p)` | `0` = `UNKNOWN`, `1` = `YARD`, `2` = `TECH_HOTSPOT`, `3` = `OFFLINE`. |
| Bit `3..7` | `0xF8` | `getRecordExitLagSec(p)` | `0..31` step dikalikan `20 detik/step` -> merepresentasikan jeda antara scan hilang pertama (*firstMiss*) dan konfirmasi keluar (`0..620 detik`). |

Saat dikirim melalui JSON `buildSingleRecordJson()`, nilai `zone_exit_epoch` direkonstruksi sebagai:

$$\text{zone\_exit\_epoch} = \text{ts\_epoch} - (\text{exit\_lag\_steps} \times 20)$$
