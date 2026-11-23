---
id: pinout-and-wiring
title: Pinout ESP32 & Pemetaan Jalur Kabel
---

# Pinout ESP32 & Pemetaan Jalur Kabel (`W-01` s/d `W-08`)

## 1. Alokasi Pin Mikrokontroler ESP32 DevKit V1

| Konstanta Firmware | Pin GPIO | Arah / Mode | Komponen Terhubung | Keterangan Operasi |
| :--- | :--- | :--- | :--- | :--- |
| `PIN_I2C_SDA` | `GPIO 21` | `I2C SDA` | `DS3231SN` (`0x68`) | Komunikasi waktu real-time presisi & sensor suhu internal RTC. |
| `PIN_I2C_SCL` | `GPIO 22` | `I2C SCL` | `DS3231SN` (`0x68`) | Clock bus I2C untuk pembacaan register `0x00..0x12`. |
| `PIN_RTC_IRQ` | `GPIO 32` | `INPUT_PULLUP` | `DS3231 SQW/INT` | Sinyal bangun eksternal (`Active-LOW`) setelah siklus Deep Sleep. |
| `PIN_GATE_CAN` | `GPIO 26` (X7) | `OUTPUT` | Gate `AO3401A` CAN | `LOW = 3V3_CAN Aktif`, `HIGH = Mati (0V)`. |
| `PIN_GATE_ADC` | `GPIO 27` (X5) | `OUTPUT` | `2N3904 + AO3401A` ADC | `HIGH = Pembagi Tegangan Aktif`, `LOW = Mati (0 uA)`. |
| `PIN_ADC_BAT` | `GPIO 34` (X6) | `ADC1_CH6` | Node M Divider `R1/R2` | Resolusi `12-bit`, atenuasi `ADC_11db`. |
| `PIN_CAN_TX` | `GPIO 5` (D5) | `TWAI TX` | `CTX` `WCMCU-230` | Sinyal transmisi frame CAN (`500 kbps`). |
| `PIN_CAN_RX` | `GPIO 4` (D4) | `TWAI RX` | `CRX` `WCMCU-230` | Sinyal penerimaan frame CAN ECU / loopback internal. |

## 2. Pemetaan 8 Titik Uji Kelistrikan (`resolveWiringRows`)

Tabel berikut memetakan delapan jalur uji diagnostik fisik yang tampil pada Tab 03 di **Modul 04 (Diagnostik OBD-II)** dan membedakan pembacaan sensor riil dengan nilai referensi tetap:

| ID Jalur | Sinyal / Jalur | Sumber Evaluasi | Kondisi Sehat vs Peringatan |
| :--- | :--- | :--- | :--- |
| `W-01` | Pin 16 Port J1962 (`12V BATT`) | **Sensor Riil** (`v_bat`) | `OK` bila $V_{\text{bat}} \ge V_{\text{crit}}$; `WARN` bila di bawah ambang kritis unit. |
| `W-02` | Pin 4/5 Port J1962 (`Chassis/Signal GND`) | **Referensi Hardware** | `0.00 Ohm` (referensi nominal ground harness ke sasis). |
| `W-03` | Output Buck `MP1584` (`3.3V Logic Rail`) | **Referensi Hardware** | `3.30 V` (referensi nominal rel logika regulator DC-DC). |
| `W-04` | `GPIO 27` Sakelar Divider (`ADC Gate`) | **Sensor Riil** (`adc_raw_mv`, `engine_on`) | Pulsa `40 ms` / siklus ketika aktif (`adc_raw_mv > 0`); `0.00 V` saat idle. |
| `W-05` | `GPIO 34` Node M (`ADC Sense Input`) | **Sensor Riil** (`adc_raw_mv` & `cal_slope`) | Menampilkan millivolt mentah GPIO34 beserta koefisien `m` aktif unit. |
| `W-06` | `GPIO 26` Sakelar CAN (`3V3_CAN Gate`) | **Sensor Riil** (`can_ok`, `engine_on`) | `FAULT` jika `can_ok = false`; `OK` saat ECU aktif; `SLEEP` (gated `0V`) saat standby. |
| `W-07` | Pin 6/14 (`CAN-H / CAN-L 500 kbps`) | **Sensor Riil** (`can_ok`, `engine_on`) | `FAULT` jika loopback WCMCU-230 gagal; `OK` saat ECU merespons; `STANDBY` saat loopback lolos tetapi kontak mati. |
| `W-08` | Bus I2C `SDA/SCL` (`DS3231SN Temp`) | **Sensor Riil** (`rtc_temp_c`) | Menampilkan suhu internal kristal DS3231SN presisi 2 desimal (`0.25 C` resolusi). |
