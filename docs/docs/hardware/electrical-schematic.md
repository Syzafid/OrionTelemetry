---
id: electrical-schematic
title: Skematik & Proteksi Kelistrikan PCB
---

# Skematik & Proteksi Kelistrikan PCB ORION

Node perangkat keras ORION terhubung langsung ke port diagnostik **SAE J1962 (OBD-II 16-Pin)** kendaraan stok tanpa memotong atau memodifikasi kabel asli pabrik (*non-invasive tap*). Untuk peta lubang lengkap (`70 x 50 mm`, `24 x 18` grid) dan alur listrik per blok sirkuit pada cetakan **PCB v2.0 Step 2.1**, rujuk [Peta Alur PCB v2.0 Step 2.1](pcb-v2-blueprint-layout.md) dan [Alur Kelistrikan Lengkap PCB v2.0](electrical-flow.md).

## 1. Proteksi Input, Shunt Uji & Regulasi Daya

| Blok Sirkuit | Komponen Kunci | Fungsi Proteksi & Operasi |
| :--- | :--- | :--- |
| **Proteksi Arus Lebih** | Fuse eksternal `500 mA time-lag` (awal) / `1 A` bila kabel `>= 26 AWG` | Memutus suplai seketika bila terjadi hubung singkat di sisi PCB atau harness (Pin 16 `12V BATT`). |
| **Proteksi Polaritas & Lonjakan** | Dioda Schottky `1N5819` + TVS (`SMBJ15A` v1.0 / opsional `P6KE18A` v2.0 Step 2.1) | Menahan tegangan terbalik serta meredam lonjakan transien (*load dump* / pulsa induktif alternator) agar aman bagi regulator. |
| **Shunt Uji & Bypass** | `R5 10 Ohm` (`c6r5-c6r4`) diparalel header `JP` (`c7r5-c7r6`) | `JP` wajib terpasang saat operasi normal; dibuka saat pengukuran arus tidur (`E5`) melintasi shunt `10 Ohm`. |
| **Regulator DC-DC** | Buck Converter `MP1584` (`12V -> 3.3V` fix) | Menurunkan tegangan baterai kendaraan (`9V` s/d `16V`) ke rel logika `3.3V` untuk ESP32, transceiver CAN, dan RTC `ZS-042` (`+ C2 100 uF` pada ESP32 Base). |

## 2. Sakelar Daya High-Side & Pembagi Tegangan (ADC Sensing)

Pembagi tegangan resistor yang tersambung permanen ke baterai akan menguras aki selama kendaraan diparkir berbulan-bulan. Oleh karena itu, ORION memutus sisi positif `+12V_D` menuju pembagi secara fisik melalui transistor NPN `Q3 (2N3904)` yang mengendalikan P-MOSFET `Q2 (AO3401A)` melalui `GPIO 27` (**Active-HIGH**). Pembagi gate `R4 = 47 kOhm` dan `R6 = 27 kOhm` pada **PCB v2.0 Step 2.1** membatasi $V_{GS}$ `Q2` di kisaran `-7,6 V` (aki `11,9 V`) hingga `-9,0 V` (pengisian `14,4 V`) agar tetap di bawah batas mutlak $\pm 12\text{ V}$.

### Perbandingan Konstanta Pembagi PCB v1.0 dan PCB v2.0

Konstanta default diatur di `sketch_oct16aa.ino` melalui makro `#define ORION_PCB_VERSION` serta selaras dengan preset di Modul 06 (`src/lib/config-validation.ts`):

| Parameter | PCB v1.0 (Perfboard Awal) | PCB v2.0 Step 2.1 (Matriks 24x18 S-D-G) |
| :--- | :--- | :--- |
| Resistor Atas (`R1`) | `300 kOhm` | `100 kOhm` (`c7r7-c7r8`) |
| Resistor Bawah (`R2`) | `68 kOhm` | `27 kOhm` `1/8 W` (`c22r11-c22r10`) + `C1 100 nF` |
| Pembatas Gate `Q2` | Zener `10 V` | Pembagi resistor `R4 47 kOhm` + `R6 27 kOhm` |
| Rasio Pembagi Teoritis $\frac{R_1 + R_2}{R_2}$ | `5.4118` | `4.7037` |
| Konstanta `DEFAULT_SLOPE_M` | `0.0054118` | `0.0047037` |
| Konstanta `DEFAULT_OFFSET_C` | `0.0690 V` | `0.1600 V` |
| Kalibrasi Referensi Multimeter | `2188 mV -> 11.91 V` | `2517 mV -> 12.00 V` |

:::info Kompensasi Non-Linearitas ADC ESP32
ADC 12-bit ESP32 memiliki karakteristik *offset* kecil di sekitar ujung bawah rentang pengukuran. Formula terkalibrasi $V_{\text{bat}} = m \times \text{ADC\_mV} + c$ yang disimpan di NVS mengompensasi toleransi resistor maupun penyimpangan referensi internal ESP32 hingga akurasi $\pm 0.02\text{ V}$.
:::

## 3. Power Gating CAN Transceiver (`WCMCU-230` / `SN65HVD230`)

Transceiver `SN65HVD230` pada bus CAN 500 kbps disuplai melalui sakelar P-MOSFET high-side `Q1 (AO3401A)` (`V33CAN`) yang ditarik HIGH saat tidur oleh `R3 = 47 kOhm` dan dikendalikan oleh `GPIO 26` (**Active-LOW**: `LOW = ON`, `HIGH = OFF`). Pada **PCB v2.0 Step 2.1**, jalur `3V3_CAN` dilengkapi kapasitor keramik decoupling `C3 100 nF` (`c15r10-c16r10`) serta penundaan stabilisasi `20 ms` di firmware sebelum driver TWAI ESP32 diinisialisasi. Saat node tertidur, jalur `3V3_CAN` diputus total (`0 V`).
