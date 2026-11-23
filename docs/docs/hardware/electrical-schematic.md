---
id: electrical-schematic
title: Skematik & Proteksi Kelistrikan PCB
---

# Skematik & Proteksi Kelistrikan PCB ORION

Node perangkat keras ORION menumpang daya dan membaca data dari port diagnostik **SAE J1962 (OBD-II 16-Pin)** bawaan pabrik tanpa memotong atau mengupas kabel asli mobil (*non-invasive tap*). Detail pemetaan koordinat lubang papan `70 x 50 mm` dan skema arus lengkap tersedia di [Peta Alur PCB v2.0 Step 2.1](pcb-v2-blueprint-layout.md) dan [Alur Kelistrikan Lengkap PCB v2.0](electrical-flow.md).

## 1. Proteksi Input, Shunt Uji & Regulasi Daya

| Blok Sirkuit | Komponen Utama | Tugas Rangkaian |
| :--- | :--- | :--- |
| Proteksi Arus Lebih | Sekring luar `500 mA time-lag` (awal) atau `1 A` bila kabel `>= 26 AWG` | Memutus suplai dari Pin 16 (`+12V BATT`) seketika jika terjadi hubung singkat di kabel atau PCB. |
| Polaritas & Lonjakan Transien | Dioda Schottky `1N5819` dan TVS (`SMBJ15A` pada v1.0 / opsional `P6KE18A` pada v2.0) | `1N5819` mencegah kerusakan akibat kabel aki terbalik, sedangkan TVS menahan lonjakan induktif alternator di atas batas aman regulator. |
| Shunt Uji & Bypass | Resistor `R5 10 Ohm` (`c6r5-c6r4`) diparalel header `JP` (`c7r5-c7r6`) | `JP` selalu terpasang saat mobil beroperasi; dilepas sementara hanya saat mengukur arus tidur (`E5`) lewat `R5`. |
| Regulator DC-DC | Buck converter `MP1584` (`12V -> 3.3V` fix) | Menurunkan tegangan baterai kendaraan (`9V` s/d `16V`) ke rel stabil `3.3V` untuk ESP32, CAN transceiver, dan RTC `ZS-042` (dibantu `C2 100 uF` di ESP32 Base). |

## 2. Cara Kerja Sakelar High-Side ADC (`Q3` & `Q2`)

Bila pembagi resistor `100 kOhm / 27 kOhm` dihubungkan terus-menerus ke aki 12V, arus akan terus bocor dan lama-kelamaan melemahkan aki kendaraan yang terparkir berbulan-bulan. ORION memutus sisi `+12V_D` memakai kombinasi transistor NPN `Q3 (2N3904)` dan P-MOSFET `Q2 (AO3401A)` yang dikendalikan dari `GPIO 27` (`Active-HIGH`):

1. **Saat ESP32 Tidur (`GPIO 27 = LOW` / mengambang)**: resistor `R8 (100 kOhm)` menarik basis `Q3` ke ground sehingga `Q3` menutup total. Resistor pull-up `R4 (47 kOhm)` menarik gate `Q2` menyamai tegangan sumber `+12V_D`, membuat `Q2` mati sehingga arus yang masuk ke pembagi `R1/R2` benar-benar `0 uA`.
2. **Saat ESP32 Mengukur (`GPIO 27 = HIGH` selama `40 ms`)**: arus mengalir lewat `R7 (10 kOhm)` ke basis `Q3` sehingga `Q3` menyala. Pembagi gate `R4 (47 kOhm)` dan `R6 (27 kOhm)` menurunkan tegangan gate `Q2` agar $V_{GS}$ tetap di kisaran aman `-7,6 V` (saat aki `11,9 V`) hingga `-9,0 V` (saat alternator mengisi `14,4 V`), jauh di bawah batas mutlak $\pm 12\text{ V}$ milik `AO3401A`. Tegangan aki pun melewati `Q2` ke `R1/R2` untuk disampel pin `GPIO 34`.

### Perbandingan Konstanta Pembagi PCB v1.0 dan PCB v2.0

Konstanta bawaan diatur di `sketch_oct16aa.ino` lewat `#define ORION_PCB_VERSION` dan dapat ditimpa langsung dari kalibrasi Modul 06 (`src/lib/config-validation.ts`):

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
ADC 12-bit internal ESP32 memiliki pergeseran *offset* kecil di bagian bawah rentang pembacaannya. Rumus garis lurus terkalibrasi $V_{\text{bat}} = m \times \text{ADC\_mV} + c$ yang tersimpan di NVS menutup selisih toleransi resistor maupun deviasi chip ESP32 hingga akurasi pembacaan `+/- 0.02 V`.
:::

## 3. Sakelar Daya Transceiver CAN (`Q1` & `WCMCU-230`)

Transceiver `SN65HVD230` (`WCMCU-230`) mendapat suplai `3,3 V` lewat P-MOSFET `Q1 (AO3401A)` yang dikontrol `GPIO 26` secara terbalik (**Active-LOW**: `LOW = Nyala`, `HIGH = Mati`). Ketika `GPIO 26` tidak aktif atau tertidur, resistor pull-up `R3 (47 kOhm)` memastikan gerbang `Q1` tertarik ke `3V3_MAIN` sehingga catu `3V3_CAN` jatuh ke `0 V`. Pada PCB v2.0 Step 2.1, jalur keluaran dipasang kapasitor keramik `C3 (100 nF)` (`c15r10-c16r10`) dan firmware menyisipkan jeda stabilisasi `20 ms` sebelum mengaktifkan driver TWAI.
