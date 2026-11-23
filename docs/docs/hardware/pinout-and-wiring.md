---
id: pinout-and-wiring
title: Pinout ESP32 & Pemetaan Jalur Kabel
---

# Pinout ESP32, Header `H (c23)` & Jalur Kabel (`W-01` s/d `W-08`)

Penghubung antara papan **PCB ORION v2.0 Step 2.1 (`70 x 50 mm`)** dan board **ESP32 DevKit / Base** memakai satu strip header male `1x14` di kolom `c23` (`r4..r17`). Dua pin pada lubang `c23r7` dan `c23r9` dicabut untuk menciptakan celah pengaman mekanis di samping jalur `3V3_CAN` dan gate `Q1`, menyisakan **12 pin aktif**.

## 1. Alokasi Pin Header `H (c23)` & GPIO ESP32

| Konstanta Firmware | Pin GPIO | Pin Header PCB v2.0 (`c23`) | Arah / Mode | Komponen Terhubung | Fungsi Operasi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PIN_CAN_RX` | `GPIO 4` | `H.CRX (c23r4)` | `TWAI RX` | `CRX` `WCMCU-230 (c22r4)` | Menerima frame balasan dari ECU atau loopback internal transceiver. |
| `PIN_CAN_TX` | `GPIO 5` | `H.CTX (c23r5)` | `TWAI TX` | `CTX` `WCMCU-230 (c22r5)` | Mengirim permintaan read-only CAN `500 kbps`. |
| `GND1 / GND2 / GND3` | `GND` | `c23r6`, `c23r10`, `c23r13` | `Return` | Cincin Busbar `c24 -> r1 -> J1.1` | Return utama logika ESP32 serta return filter ADC (`C1` dan `R2`). |
| `PIN_GATE_CAN` | `GPIO 26` | `H.CAN_EN (c23r8)` | `OUTPUT` | Gate `Q1 AO3401A (c19r9)` | `LOW` menyalakan `3V3_CAN`; `HIGH` memutus daya transceiver (`0 V`). |
| `PIN_ADC_BAT` | `GPIO 34` | `H.ADC_OUT (c23r11)` | `ADC1_CH6` | Node M (`R2 27k` / `C1 100nF`) | Input bacaan `12-bit` tegangan pembagi baterai (atenuasi `ADC_11db`). |
| `PIN_GATE_ADC` | `GPIO 27` | `H.ADC_TRIG (c23r12)` | `OUTPUT` | `R7 10k -> Q3 2N3904 -> Q2` | `HIGH` membuka sakelar pembagi selama `40 ms`; `LOW` menghentikan arus bocor (`0 uA`). |
| `3V3` | `3V3` | `H.3V3 (c23r14)` | `Power Input` | `V33B` via `JV1 (c22r14)` | Sumber daya `3.3 V` dari `MP1584`. Jangan colok USB dan 12V bersamaan. |
| `PIN_I2C_SDA` | `GPIO 21` | `H.SDA (c23r15)` | `I2C SDA` | `ZS-042 DS3231SN (c21r15)` | Jalur data I2C menuju chip RTC dan sensor suhu kristal. |
| `PIN_I2C_SCL` | `GPIO 22` | `H.SCL (c23r16)` | `I2C SCL` | `ZS-042 DS3231SN (c21r16)` | Sinyal clock I2C ke register `0x00..0x12` milik `DS3231SN`. |
| `PIN_RTC_IRQ` | `GPIO 32` | `H.RTC_INT (c23r17)` | `INPUT_PULLUP` | `DS3231 SQW (c7r16)` | Interupsi `Active-LOW` pembangun ESP32 setelah waktu Deep Sleep habis. |

## 2. Mengapa Jalur Uji `W-01..W-08` Dibagi Antara Sensor Riil & Referensi?

Pada Tab 03 di **Modul 04 (Diagnostik OBD-II)**, fungsi `resolveWiringRows()` di [obd-diagnostics.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/obd-diagnostics.ts) memisahkan delapan jalur inspeksi kabel menjadi **Sensor Riil** dan **Referensi Hardware**.

Alasan praktisnya sederhana: PCB ORION hanya punya satu kanal ADC pengukuran tegangan (`GPIO 34`) dan sensor suhu RTC, serta tidak membuang pin untuk memonitor rel `3.3V` atau `GND` secara terpisah. Karena itu, nilai `0.00 Ohm` pada `W-02 (GND)` dan `3.30 V` pada `W-03 (MP1584)` adalah patokan desain referensi untuk membantu teknisi mencari kaki pin di bengkel. Bila ESP32 hidup dan mampu mengirim data ke server, rel daya `3.3V` dan ground dipastikan berfungsi. Sebaliknya, baris berlabel Sensor Riil (`W-01`, `W-04`, `W-05`, `W-06`, `W-07`, dan `W-08`) berubah mengikuti pengukuran perangkat keras aktual pada paket telemetri terakhir.

| ID Jalur | Sinyal & Jalur PCB v2.0 Step 2.1 | Sumber Evaluasi | Kondisi Sehat vs Peringatan |
| :--- | :--- | :--- | :--- |
| `W-01` | `J1.4` Pin 16 Port J1962 (`+12V BATT -> D1 -> R5/JP`) | Sensor Riil (`v_bat`) | `OK` bila $V_{\text{bat}} \ge V_{\text{crit}}$; `WARN` bila di bawah ambang kritis unit. |
| `W-02` | `J1.1` Pin 4/5 (`GND Cincin c24 -> Busbar r1 -> r18`) | Referensi Hardware | `0.00 Ohm` (acuan ground harness menuju sasis mobil). |
| `W-03` | `MP1584 U4 -> JV1 -> H.3V3 (c23r14) + C2 100uF Base` | Referensi Hardware | `3.30 V` (acuan tegangan keluaran regulator DC-DC). |
| `W-04` | `GPIO 27` Sakelar Divider (`H.ADC_TRIG -> R7/R8 -> Q3 -> R6/R4 -> Q2`) | Sensor Riil (`adc_raw_mv`, `engine_on`) | Pulsa `40 ms` per siklus saat aktif (`adc_raw_mv > 0`); `0.00 V` saat idle. |
| `W-05` | `GPIO 34` Node M (`R1 100k -> R2 27k / C1 100nF -> H.ADC_OUT`) | Sensor Riil (`adc_raw_mv` & `cal_slope`) | Menampilkan millivolt mentah GPIO34 beserta koefisien `m` aktif unit. |
| `W-06` | `GPIO 26` Sakelar CAN (`H.CAN_EN -> R3 47k -> Q1 -> C3 -> U3.3V3`) | Sensor Riil (`can_ok`, `engine_on`) | `FAULT` bila inisialisasi rel `3.3V` gagal (`can_ok = false`); `OK` saat ECU merespons; `SLEEP` (`0V`) saat standby. |
| `W-07` | `J1.2/3` Pin 6/14 (`CANL/CANH -> U3 -> H.CRX/H.CTX 500 kbps`) | Sensor Riil (`can_ok`, `engine_on`) | `FAULT` bila loopback `WCMCU-230` gagal; `OK` saat ECU aktif; `STANDBY` bila loopback lolos saat kontak mobil mati. |
| `W-08` | Bus I2C `GPIO 21/22 + SQW` (`DS3231SN ZS-042 + CR2032`) | Sensor Riil (`rtc_temp_c`) | Menampilkan suhu internal kristal `DS3231SN` berpresisi dua angka di belakang koma (`0.25 C` langkah resolusi). |
