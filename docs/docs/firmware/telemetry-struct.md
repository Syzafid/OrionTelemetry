---
id: telemetry-struct
title: Struktur TelemetryItem 88-Byte & Bit-Packing
---

# Struktur Rekaman Biner 88-Byte (`TelemetryItem`)

Memori RTC Slow SRAM di dalam ESP32 yang tetap bertahan selama Deep Sleep berkapasitas terbatas. Untuk menyimpan 35 variabel telemetri beserta data mesin OBD-II tanpa memboroskan RAM, firmware [sketch_oct16aa.ino](file:///d:/magang/v1/pixel-twin-workbench/firmware/sketch_oct16aa/sketch_oct16aa.ino) memadatkan satu rekaman penuh menjadi tepat **88 byte** menggunakan `__attribute__((packed))` yang dikunci oleh `static_assert(sizeof(TelemetryItem) == 88)` saat kompilasi.

## 1. Susunan Memori Terurut (`TelemetryItem`)

Firmware menempatkan variabel paling lebar (`32-bit`) di awal, diikuti `16-bit`, lalu `8-bit` di bagian akhir. Urutan ini menjaga pembacaan memori tetap sejajar di prosesor Xtensa LX6 tanpa menyisipkan byte kosong (*padding*).

### Kelompok 32-bit (`15 variabel x 4 byte = 60 byte`, Offset `0..59`)

| Field | Tipe C | Satuan & Sumber Data |
| :--- | :--- | :--- |
| `seq` | `uint32_t` | Nomor urut paket naik terus dari NVS (`seq_cnt`, mulai di atas `1000`). |
| `boot` | `uint32_t` | Hitungan berapa kali perangkat menyala penuh (*cold boot*) dari NVS. |
| `ts_epoch` | `uint32_t` | Waktu UNIX (epoch UTC dalam detik) dari chip RTC `DS3231SN`. |
| `v_bat` | `float` | Tegangan aki hasil kalibrasi linear (Volt). |
| `rtc_temp_c` | `float` | Suhu kristal internal `DS3231SN` (`C`). |
| `load_pct` | `float` | PID `0x04` beban kerja mesin terhitung (`%`). |
| `tps_pct` | `float` | PID `0x11` bukaan katup throttle (`%`). |
| `ign_deg` | `float` | PID `0x0E` sudut pengapian (`derajat`). |
| `maf_gs` | `float` | PID `0x10` laju aliran udara masuk (`g/s`). |
| `run_time_s` | `uint32_t` | PID `0x1F` lama mesin menyala sejak distarter (`detik`). |
| `fuel_pct` | `float` | PID `0x2F` sisa bahan bakar di tangki (`%`). |
| `fuel_rate_lh` | `float` | PID `0x5E` atau estimasi MAF untuk laju konsumsi BBM (`L/h`). |
| `o2_v` | `float` | PID `0x14` tegangan sensor oksigen (`V`). |
| `stft_pct` | `float` | PID `0x06` koreksi semprotan bahan bakar jangka pendek (`%`). |
| `ecu_v` | `float` | PID `0x42` tegangan suplai internal modul ECU (`V`). |

### Kelompok 16-bit (`6 variabel x 2 byte = 12 byte`, Offset `60..71`)

Urutan enam variabel 16-bit adalah `adc_raw_mv` (`uint16_t`), `shunt_sleep_ua` (`uint16_t`), `rpm` (`uint16_t`), `dist_clr_km` (`uint16_t`), `iat_c` (`int16_t`), dan `map_kpa` (`uint16_t`).

### Kelompok 8-bit & Array (`8 + 8 x 1 byte = 16 byte`, Offset `72..87`)

Bagian paling akhir menampung `dtc[8]` (`char[8]`), diikuti delapan variabel 1-byte: `engine_on` (`uint8_t`), `crit_alert` (`uint8_t`), `temp_c` (`uint8_t`), `dtc_cnt` (`uint8_t`), `rssi` (`int8_t`), `can_ok` (`uint8_t`), `speed_kmh` (`uint8_t`), dan `mil_on` (`uint8_t`).

## 2. Mengemas Tiga Data Sekaligus ke Satu Byte `can_ok`

Menambah dua variabel baru untuk zona Wi-Fi dan waktu mundur keluar gerbang akan memperbesar ukuran struct dan mematahkan pembacaan antrean LittleFS yang sudah ada. Untuk menghindarinya, firmware menyelipkan ketiga informasi tersebut ke dalam bit-bit sisa pada `uint8_t can_ok` (karena nilai status CAN hanya membutuhkan 1 bit `0` atau `1`):

```text
  Bit:    [ 7   6   5   4   3 ] [ 2   1 ] [   0   ]
  Field:  [   exit_lag_steps   ] [ zone  ] [can_ok ]
  Mask:          0xF8              0x06       0x01
```

| Rentang Bit | Masker Hex | Fungsi Ekstraksi Firmware | Arti Nilai |
| :--- | :--- | :--- | :--- |
| Bit `0` | `0x01` | `getRecordCanOk(p)` | `1` berarti transceiver `WCMCU-230` sehat; `0` menandakan kegagalan loopback CAN. |
| Bit `1..2` | `0x06` | `getRecordNetZone(p)` | Kode `0`=`UNKNOWN`, `1`=`YARD`, `2`=`TECH_HOTSPOT`, `3`=`OFFLINE`. |
| Bit `3..7` | `0xF8` | `getRecordExitLagSec(p)` | Nilai `0..31` step dikali `20 detik/step`, mencatat jeda sejak scan gagal pertama sampai unit dinyatakan keluar (`0..620 detik`). |

### Contoh Pembacaan Nyata `can_ok = 83` (`0x53`)

Misalkan fungsi pengurai menerima byte `can_ok = 83` (biner 8-bit: `01010011`). Nilai tersebut dipecah dari kanan ke kiri menjadi tiga informasi terpisah:

1. **Bit `0` (`0x01`)** bernilai `1`, artinya modul CAN berfungsi normal.
2. **Bit `1..2` (`01` biner)** bernilai `1`, artinya rekaman diambil saat unit terhubung ke `YARD`.
3. **Bit `3..7` (`01010` biner)** bernilai desimal `10`, sehingga jeda keluar tercatat $10 \times 20\text{ detik} = 200\text{ detik}$.

Saat firmware menyusun payload JSON dalam `buildSingleRecordJson()`, server dan klien langsung memperoleh stempel waktu keluar yang sebenarnya lewat rumus:

$$\text{zone\_exit\_epoch} = \text{ts\_epoch} - (\text{exit\_lag\_steps} \times 20)$$
