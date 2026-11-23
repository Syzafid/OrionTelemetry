---
id: electrical-schematic
title: Skematik & Proteksi Kelistrikan PCB
---

# Skematik & Proteksi Kelistrikan PCB ORION

Node perangkat keras ORION terhubung langsung ke port diagnostik **SAE J1962 (OBD-II 16-Pin)** kendaraan stok tanpa memotong atau memodifikasi kabel asli pabrik (*non-invasive tap*).

## 1. Proteksi Input & Regulasi Daya

| Blok Sirkuit | Komponen Kunci | Fungsi Proteksi & Operasi |
| :--- | :--- | :--- |
| **Proteksi Arus Lebih** | Fuse `1A` (Pin 16 `12V BATT`) | Memutus suplai seketika bila terjadi hubung singkat di sisi PCB atau harness. |
| **Proteksi Polaritas & Lonjakan** | Dioda Schottky `1N5819` + TVS `SMBJ15A` | Menahan tegangan terbalik serta meredam lonjakan transien (*load dump* / pulsa induktif alternator) di atas `15V` agar aman bagi regulator. |
| **Regulator DC-DC** | Buck Converter `MP1584` (`12V -> 3.3V`) | Menurunkan tegangan baterai kendaraan (`9V` s/d `16V`) ke rel logika `3.3V` dengan efisiensi tinggi untuk ESP32 dan RTC. |

## 2. Sakelar Daya High-Side & Pembagi Tegangan (ADC Sensing)

Pembagi tegangan resistor yang tersambung permanen ke baterai akan menguras aki selama kendaraan diparkir berbulan-bulan. Oleh karena itu, ORION memutus jalur ground/referensi pembagi secara fisik melalui transistor NPN `2N3904` dan P-MOSFET `AO3401A` yang dikendalikan oleh `GPIO 27` (**Active-HIGH**).

### Perbandingan Konstanta Pembagi PCB v1.0 dan PCB v2.0

Konstanta default diatur di `sketch_oct16aa.ino` melalui makro `#define ORION_PCB_VERSION` serta selaras dengan preset di Modul 06 (`src/lib/config-validation.ts`):

| Parameter | PCB v1.0 (Through-Hole / Hardware Blueprint) | PCB v2.0 (Integrated SMD) |
| :--- | :--- | :--- |
| Resistor Atas (`R1`) | `300 kOhm` | `100 kOhm` |
| Resistor Bawah (`R2`) | `68 kOhm` | `27 kOhm` |
| Rasio Pembagi Teoritis $\frac{R_1 + R_2}{R_2}$ | `5.4118` | `4.7037` |
| Konstanta `DEFAULT_SLOPE_M` | `0.0054118` | `0.0047037` |
| Konstanta `DEFAULT_OFFSET_C` | `0.0690 V` | `0.1600 V` |
| Kalibrasi Referensi Multimeter | `2188 mV -> 11.91 V` | `2517 mV -> 12.00 V` |

:::info Kompensasi Non-Linearitas ADC ESP32
ADC 12-bit ESP32 memiliki karakteristik *offset* kecil di sekitar ujung bawah rentang pengukuran. Formula terkalibrasi $V_{\text{bat}} = m \times \text{ADC\_mV} + c$ yang disimpan di NVS mengompensasi toleransi resistor 1% maupun penyimpangan referensi internal ESP32 hingga akurasi $\pm 0.02\text{ V}$.
:::

## 3. Power Gating CAN Transceiver (`WCMCU-230` / `SN65HVD230`)

Transceiver `SN65HVD230` pada bus CAN 500 kbps disuplai melalui sakelar P-MOSFET high-side `AO3401A` (`X8 = 3V3_CAN`) yang dikendalikan oleh `GPIO 26` (**Active-LOW**: `LOW = ON`, `HIGH = OFF`). Jalur keluaran dilengkapi kapasitor filter `10 uF` (`U8`) sehingga firmware menyisipkan waktu stabilisasi `20 ms` sebelum menginisialisasi driver TWAI ESP32. Saat node tertidur, jalur `3V3_CAN` diputus total (`0 V`).
