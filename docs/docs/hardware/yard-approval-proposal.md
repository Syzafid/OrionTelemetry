---
id: yard-approval-proposal
title: Dokumen Izin Gudang (PDF) & Memo Cirkit
---

import useBaseUrl from "@docusaurus/useBaseUrl";

# Dokumen Izin Pemasangan Gudang (PDF) & Memo Pembaruan

Untuk mengajukan izin uji coba ke Kepala Gudang atau Penanggung Jawab Unit (*Stock Yard*), rincian jalur solder bawah maupun rumus matematika regresi sengaja disederhanakan menjadi dokumen ringkas **3 halaman** yang berfokus pada empat hal utama: cara pasang *plug-and-play*, alur wiring berpengaman, alur pengambilan data, dan jaminan keamanan aki/ECU.

<p>
  <a
    href={useBaseUrl("/pdf/ORION_Dokumen_Izin_Teknis_Gudang.pdf")}
    download="ORION_Dokumen_Izin_Teknis_Gudang.pdf"
    className="orion-export-btn"
  >
    Unduh Dokumen Izin Gudang (.pdf - 3 Halaman A4)
  </a>
</p>

:::info Memo Revisi & Cara Memperbarui PDF Secara Otomatis
Berkas PDF di atas dibangkitkan dari satu skrip terpusat di [generate-yard-approval-pdf.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/generate-yard-approval-pdf.mjs).

Apabila nanti terdapat perubahan spesifikasi perangkat atau Anda ingin mengganti Diagram Vektor Blok 2 dengan gambar hasil render resmi dari **`app.cirkitdesigner.com`**:
1. Ekspor gambar rangkaian dari Cirkit Designer dan simpan dengan nama `docs/static/img/cirkit-wiring-v2.png` (atau `.jpg`). Skrip generator akan otomatis mendeteksi dan menyematkan gambar Cirkit tersebut ke Halaman 2.
2. Ubah angka ringkasan, durasi pilot test, atau versi dokumen pada objek `APPROVAL_DOC_MEMO` di [generate-yard-approval-pdf.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/generate-yard-approval-pdf.mjs).
3. Jalankan perintah berikut untuk mencetak ulang PDF lalu verifikasi dan build situs:
   `npm run pdf:yard-approval && npm run check:hygiene && npm run build`
:::

---

## Ringkasan Isi 3 Halaman PDF Perizinan

| Halaman | Topik Utama | Tujuan bagi Pihak Gudang |
| :--- | :--- | :--- |
| **Halaman 1** | Tujuan Operasional, Gambar Soket OBD-II 16-Pin (12 pin kosong, 4 pin aktif), dan Spesifikasi Ringkas | Menunjukkan bahwa alat bersifat *non-invasif* tanpa memotong kabel mobil dan dapat dilepas dalam 5 detik. |
| **Halaman 2** | Skema Alur Wiring & 4 Titik Pengaman (`[1]` Sekring 500 mA + Dioda, `[2]` Sakelar Aki, `[3]` Sakelar CAN + RTC, `[4]` ESP32) serta Foto Tata Letak `70 x 50 mm` | Menunjukkan wujud modul nyata beserta letak sekring dan sakelar pemutus fisik sehingga aman dari korsleting. |
| **Halaman 3** | Siklus Kerja 4 Langkah (`Tidur -> Bangun 40 ms -> Cek Mesin -> Kirim 2 dtk`), Simulasi Aki 60 Hari (`1,4%` vs `88,6%`), 4 Jaminan Keamanan, & Kolom Tanda Tangan Uji Coba | Memberi bukti hitungan bahwa aki tidak soak dan menyediakan form persetujuan *pilot test* 1 unit kendaraan. |

---

## Arsip Prompt untuk Cirkit AI (`app.cirkitdesigner.com`)

Gunakan salah satu prompt di bawah ini di **`app.cirkitdesigner.com`** apabila Anda ingin merender ulang gambar wiring rangkaian realistis tanpa papan PCB.

### Opsi A: Prompt Lengkap (Semua Komponen & Resistor PCB v2.0 Step 2.1)

```text
Design a clean, well-organized automotive OBD-II telemetry and battery monitoring circuit (ORION v2.0) arranged logically from LEFT to RIGHT with no overlapping wires. Use standard automotive wire colors: Red for +12V, Orange for +3.3V, Black for GND, Yellow for CAN_H, Green for CAN_L, Blue for ADC signals, Purple for control gates, and Cyan for I2C/RTC.

1. COMPONENTS LIST (BILL OF MATERIALS):
- Input Terminal Block 1x4 (J1, representing OBD-II harness cable): Pin 1 = GND, Pin 2 = CAN_L, Pin 3 = CAN_H, Pin 4 = +12V_BATT (protected by external 500mA inline fuse).
- D1: 1N5819 Schottky Diode (reverse polarity protection).
- TVS1: P6KE18A unidirectional TVS diode (optional surge clamp).
- R5: 10 Ohm resistor (sleep current sense shunt) in parallel with JP1 (2-pin bypass jumper header, closed during normal operation).
- U4: MP1584EN Fixed 3.3V Buck Converter Module (pins: IN+, IN-, OUT+, OUT-).
- U1: ESP32 DevKit V1 (30-pin development board) + 100uF electrolytic capacitor (C2) across 3V3 and GND pins.
- U2: DS3231 RTC Module (ZS-042, with power LED and charging resistor removed) using pins VCC, GND, SDA, SCL, and SQW.
- U3: SN65HVD230 CAN Bus Transceiver Module (WCMCU-230) with pins 3V3, GND, CTX, CRX, CANH, CANL.
- High-Side Battery ADC Switch & Voltage Divider block:
  - Q2: AO3401A P-Channel MOSFET (Pin order: Source, Drain, Gate).
  - Q3: 2N3904 NPN Transistor (Collector, Base, Emitter).
  - R4: 47 kOhm resistor (Q2 Gate pull-up to Source).
  - R6: 27 kOhm resistor (between Q2 Gate and Q3 Collector to limit Vgs to safe -7.6V to -9.0V).
  - R7: 10 kOhm resistor (between ESP32 GPIO27 and Q3 Base).
  - R8: 100 kOhm resistor (Q3 Base pull-down to GND).
  - R1: 100 kOhm resistor (upper divider from Q2 Drain to Node_M).
  - R2: 27 kOhm resistor (lower divider from Node_M to GND).
  - C1: 100 nF ceramic capacitor (filter across Node_M and GND).
- High-Side CAN Transceiver Power Gate block:
  - Q1: AO3401A P-Channel MOSFET (Source, Drain, Gate).
  - R3: 47 kOhm resistor (Q1 Gate pull-up to 3.3V_MAIN).
  - C3: 100 nF ceramic capacitor (decoupling across 3V3_CAN and GND).

2. PIN-TO-PIN CONNECTIONS (NETLIST):
[Power & Input Protection]
- J1 Pin 1 (GND) -> Common GND busbar (connected to TVS1 Anode, U4 IN-, U4 OUT-, Q3 Emitter, R8, R2, C1, C3, U3 GND, U2 GND, and ESP32 GND).
- J1 Pin 4 (+12V_F) -> D1 Anode.
- D1 Cathode (Net +12V_D) -> TVS1 Cathode, Q2 Source, R4 (pin b), R5 (pin a), and JP1 (pin a).
- R5 (pin b) and JP1 (pin b) -> Net VIN -> U4 (MP1584 IN+).
- U4 (MP1584 OUT+) -> Net 3V3_MAIN -> Q1 Source, R3 (pin b), U2 (DS3231 VCC), ESP32 3V3 pin, and C2 (+).

[High-Side Battery ADC Switch & 100k/27k Divider]
- ESP32 GPIO27 (ADC_TRIG, Active-HIGH 40ms pulse) -> R7 (10k) -> Net QB (Q3 Base) and R8 (100k to GND).
- Q3 Emitter -> GND.
- Q3 Collector (Net QC) -> R6 (27k) -> Net G2 (Q2 Gate) and R4 (47k to +12V_D).
- Q2 Drain (Net QD) -> R1 (100k) -> Net Node_M.
- Net Node_M -> R2 (27k to GND), C1 (100nF to GND), and ESP32 GPIO34 (ADC1_CH6 input).

[CAN Bus Power Gate & Transceiver]
- ESP32 GPIO26 (CAN_EN, Active-LOW) -> Net G1 -> Q1 Gate and R3 (47k to 3V3_MAIN).
- Q1 Drain -> Net 3V3_CAN -> C3 (100nF to GND) and U3 (SN65HVD230 3V3 pin).
- J1 Pin 2 (CAN_L) -> U3 CANL.
- J1 Pin 3 (CAN_H) -> U3 CANH.
- U3 CRX -> ESP32 GPIO4 (TWAI RX).
- U3 CTX -> ESP32 GPIO5 (TWAI TX).

[RTC DS3231 I2C & Deep-Sleep Wakeup]
- U2 (DS3231 SDA) -> ESP32 GPIO21 (I2C SDA).
- U2 (DS3231 SCL) -> ESP32 GPIO22 (I2C SCL).
- U2 (DS3231 SQW/INT) -> ESP32 GPIO32 (ext0 Wakeup Interrupt, Active-LOW).

3. LAYOUT INSTRUCTIONS:
Place J1, D1, TVS1, R5/JP1, and the Q2/Q3 ADC switch on the LEFT; place the MP1584 buck converter in the TOP-CENTER; place the DS3231 RTC in the BOTTOM-CENTER; place Q1, the SN65HVD230 CAN module, and the R2/C1 ADC filter on the RIGHT feeding neatly into the ESP32 DevKit V1 on the FAR RIGHT. Route all wires orthogonally with clear labels.
```

### Opsi B: Prompt Modular Ringkas (Untuk Tampilan Presentasi Rapi)

```text
Create a presentation-grade automotive OBD-II wiring diagram for an ESP32 vehicle battery and CAN bus monitor, arranged cleanly from left to right for a safety approval document:

1. LEFT BLOCK (Vehicle OBD-II J1962 4-Wire Input & Protection):
- 4-pin OBD-II input connector: Pin 16 (+12V Battery via 500mA inline fuse), Pin 4/5 (GND), Pin 6 (CAN-H), Pin 14 (CAN-L).
- 1N5819 Schottky reverse-polarity diode on the +12V line, followed by a 10 Ohm sleep-current test shunt with a 2-pin bypass jumper.

2. TOP-CENTER BLOCK (DC-DC Power Regulation):
- MP1584 Fixed 3.3V Buck Converter module stepping +12V down to a regulated 3.3V rail feeding the ESP32 3V3 pin (with 100uF bulk capacitor) and DS3231 RTC VCC.

3. MIDDLE BLOCK (Two Physical Power-Saving MOSFET Switches):
- Switch A (Battery Sense High-Side Gate): 2N3904 NPN + AO3401A P-MOSFET controlled by ESP32 GPIO27 (40ms pulse) with 47k/27k gate divider, connecting +12V to a 100k / 27k voltage divider (+ 100nF filter capacitor) feeding ESP32 GPIO34 (ADC).
- Switch B (CAN Transceiver Power Gate): AO3401A P-MOSFET with 47k pull-up controlled by ESP32 GPIO26 (Active-LOW), switching 3.3V power to the SN65HVD230 CAN module (with 100nF decoupling capacitor) so CAN draws 0mA during deep sleep.

4. RIGHT BLOCK (Core Controller & Peripherals):
- ESP32 DevKit V1 (30-pin) receiving 3.3V, GND, GPIO34 (ADC), GPIO27 (ADC Trigger), GPIO26 (CAN Enable), GPIO4 (CAN RX), GPIO5 (CAN TX), GPIO21 (SDA), GPIO22 (SCL), and GPIO32 (RTC SQW Wakeup).
- SN65HVD230 CAN Transceiver connected to OBD-II CAN-H/CAN-L and ESP32 GPIO4/GPIO5.
- DS3231 ZS-042 RTC module connected to ESP32 GPIO21 (SDA), GPIO22 (SCL), and GPIO32 (SQW alarm wakeup).

Use orthogonal color-coded wires (Red=+12V, Orange=+3.3V, Black=GND, Yellow=CAN-H, Green=CAN-L, Blue=ADC, Purple=Control Gates) with zero wire crossings over component bodies.
```
