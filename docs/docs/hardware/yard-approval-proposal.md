---
id: yard-approval-proposal
title: Proposal Uji Coba Unit Gudang (PDF) & Memo
---

import useBaseUrl from "@docusaurus/useBaseUrl";

# Proposal Izin Uji Coba Kendaraan Gudang (PDF Monokrom)

Halaman ini menyediakan dokumen proposal teknis resmi dalam format **PDF monokrom 3 halaman A4** yang ditujukan kepada **Kepala Gudang dan Tim Teknisi Kendaraan** sebelum pemasangan perangkat uji coba ORION v2.0. Dokumen memisahkan secara tegas hasil pengukuran meja (*bench test*) yang sudah tercatat dari parameter wajib uji **Tahap C**, tanpa menyertakan kolom tanda tangan kontrak maupun klaim tanpa data ukur.

<p>
  <a
    href={useBaseUrl("/pdf/ORION_Dokumen_Izin_Teknis_Gudang.pdf")}
    download="ORION_Dokumen_Izin_Teknis_Gudang.pdf"
    className="orion-export-btn"
  >
    Unduh Dokumen Proposal Uji Coba (.pdf - 3 Halaman Monokrom)
  </a>
</p>

:::info Memo Revisi & Cara Memperbarui Proposal PDF
Seluruh isi dokumen PDF dibangkitkan otomatis oleh skrip [generate-yard-approval-pdf.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/generate-yard-approval-pdf.mjs) dari objek konfigurasi `APPROVAL_DOC_MEMO`.

Jika ada pengukuran Tahap C yang sudah selesai (misalnya hasil ukur arus tidur `E5`, `Vgs Q2`, atau uji MP1584 di `12,6 V` dan `+/- 14 V`) atau ada perubahan konektor fisik, perbarui dokumen dengan 3 langkah berikut:
1. *(Opsional)* Simpan hasil gambar wiring dari **`app.cirkitdesigner.com`** ke `docs/static/img/cirkit-wiring-v2.png` (atau `.jpg`). Skrip otomatis menyematkannya ke Halaman 2 dalam mode monokrom (*grayscale*).
2. Perbarui data angka atau status pengujian pada objek `APPROVAL_DOC_MEMO` di [generate-yard-approval-pdf.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/generate-yard-approval-pdf.mjs).
3. Jalankan `npm run pdf:yard-approval && npm run check:hygiene && npm run build`.

**Catatan Penyelarasan Konektor**: Bagian mitigasi risiko proposal ini mencatat pemisahan fisik dua konektor terkunci (`JST-XH 2-pin` Daya dan `2-pin` CAN) sebagai pengaman anti-tertukar di lapangan, sementara rancangan matriks lubang [PCB v2.0 Step 2.1](pcb-v2-blueprint-layout.md) memakai header `J1 1x4` terkunci. Jika papan fisik final memakai dual `JST-XH 2-pin`, sesuaikan footprint `J1` saat revisi blueprint berikutnya.
:::

---

## Ringkasan Struktur 3 Halaman PDF (Rev 2.0 Monokrom)

| Halaman | Bagian Isi | Penekanan Informasi |
| :--- | :--- | :--- |
| **Halaman 1** | Judul Resmi, Ringkasan Eksekutif Non-Invasif, Diagram Konektor OBD-II 16-Pin Monokrom, dan Tabel 5 Blok Arsitektur Perangkat | Menjelaskan aturan keselamatan `H8`, peran pasif `WCMCU-230`, konfigurasi *common ground* `MP1584`, modifikasi fisik `ZS-042`, serta pemutusan daya via `Q1` dan `Q2/Q3`. |
| **Halaman 2** | Skema Wiring Monokrom, Foto Grid PCB `70 x 50 mm` (*Grayscale*), dan Bagian Awal Tabel Data Pengujian | Memperlihatkan aliran kabel dari konektor daya & CAN melewati proteksi masuk hingga ESP32, serta memisahkan data terukur dari rencana uji Tahap C. |
| **Halaman 3** | Lanjutan Tabel Data Pengujian (`Q2/Q3`, `E5`), Matriks Mitigasi Risiko 4 Butir, dan Urutan Verifikasi Pra-Instalasi | Merinci pemisahan status `TERUJI MEJA` vs `TARGET UJI TAHAP C`, langkah pencegahan risiko lapangan, serta 4 langkah cek wajib sebelum dipasang ke mobil (tanpa kolom tanda tangan). |

---

## Arsip Prompt Cirkit AI (`app.cirkitdesigner.com`)

Gunakan salah satu prompt di bawah ini di **`app.cirkitdesigner.com`** bila hendak merender gambar wiring realistis untuk disematkan ke Halaman 2 PDF.

### Opsi A: Prompt Lengkap (Semua Komponen & Resistor PCB v2.0 Step 2.1)

```text
Design a clean, well-organized automotive OBD-II telemetry and battery monitoring circuit (ORION v2.0) arranged logically from LEFT to RIGHT with no overlapping wires. Use clear orthogonal routing with distinct wire styling.

1. COMPONENTS LIST (BILL OF MATERIALS):
- Two keyed 2-pin JST-XH connectors representing the OBD-II harness input: Connector 1 (Power): +12V_BATT (OBD Pin 16, via 500mA fuse) and GND (OBD Pin 4/5); Connector 2 (CAN Signal): CAN_H (OBD Pin 6) and CAN_L (OBD Pin 14).
- D1: 1N5819 Schottky Diode (reverse polarity protection).
- TVS1: P6KE18A TVS diode parallel to GND (>18V transient clamp).
- R5: 10 Ohm resistor (sleep current sense shunt) in parallel with JP1 (2-pin bypass jumper header).
- U4: MP1584 Fixed 3.3V Buck Converter Module (+12V to 3.3V, common ground topology).
- U1: ESP32 DevKit V1 (30-pin development board) + 100uF electrolytic capacitor (C2) across 3V3 and GND pins.
- U2: DS3231 RTC Module (ZS-042, with power LED and coin-cell charging circuit removed) using pins VCC, GND, SDA, SCL, and SQW.
- U3: SN65HVD230 CAN Bus Transceiver Module (WCMCU-230) with pins 3V3, GND, CTX, CRX, CANH, CANL.
- High-Side Battery ADC Switch & Voltage Divider block:
  - Q2: AO3401A P-Channel MOSFET (S-D-G).
  - Q3: 2N3904 NPN Transistor (C-B-E).
  - R4: 47 kOhm resistor (Q2 Gate pull-up to Source).
  - R6: 27 kOhm resistor (between Q2 Gate and Q3 Collector).
  - R7: 10 kOhm resistor (between ESP32 GPIO27 and Q3 Base).
  - R8: 100 kOhm resistor (Q3 Base pull-down to GND).
  - R1: 100 kOhm resistor (upper divider from Q2 Drain to Node_M).
  - R2: 27 kOhm resistor (lower divider from Node_M to GND).
  - C1: 100 nF ceramic capacitor (filter across Node_M and GND).
- High-Side CAN Transceiver Power Gate block:
  - Q1: AO3401A P-Channel MOSFET (S-D-G).
  - R3: 47 kOhm resistor (Q1 Gate pull-up to 3.3V_MAIN).
  - C3: 100 nF ceramic capacitor (decoupling across 3V3_CAN and GND).

2. PIN-TO-PIN CONNECTIONS (NETLIST):
- Common GND busbar connects OBD Pin 4/5, TVS1 Anode, U4 IN-/OUT-, Q3 Emitter, R8, R2, C1, C3, U3 GND, U2 GND, and ESP32 GND.
- +12V_F -> D1 Anode; D1 Cathode (+12V_D) -> TVS1 Cathode, Q2 Source, R4, R5, JP1; R5/JP1 output -> MP1584 IN+; MP1584 OUT+ -> 3.3V_MAIN -> Q1 Source, R3, U2 VCC, ESP32 3V3, C2 (+).
- ESP32 GPIO27 (Active-HIGH) -> R7 (10k) -> Q3 Base & R8 (100k to GND); Q3 Collector -> R6 (27k) -> Q2 Gate & R4 (47k to +12V_D); Q2 Drain -> R1 (100k) -> Node_M -> R2 (27k to GND), C1 (100nF to GND), and ESP32 GPIO34.
- ESP32 GPIO26 (Active-LOW) -> Q1 Gate & R3 (47k to 3.3V_MAIN); Q1 Drain -> C3 (100nF to GND) and U3 3V3; CAN_L/CAN_H -> U3; U3 CRX/CTX -> ESP32 GPIO4/GPIO5.
- U2 SDA/SCL/SQW -> ESP32 GPIO21/GPIO22/GPIO32.
```

### Opsi B: Prompt Modular Ringkas (Untuk Skema Presentasi Bersih)

```text
Create a clean automotive OBD-II wiring schematic (ORION v2.0) arranged left-to-right for technical documentation:

1. LEFT: Two separate keyed JST-XH 2-pin inputs: Power (+12V via 500mA fuse, GND) and CAN (CAN_H, CAN_L). +12V enters 1N5819 diode, TVS P6KE18A to GND, and 10 Ohm shunt + 2-pin jumper bypass.
2. CENTER: MP1584 3.3V Buck Converter (common ground), High-Side ADC MOSFET switch (Q3 2N3904 + Q2 AO3401A controlled by GPIO27 with R1 100k / R2 27k divider + C1 100nF), and High-Side CAN MOSFET switch (Q1 AO3401A controlled by GPIO26 with C3 100nF).
3. RIGHT: WCMCU-230 SN65HVD230 CAN module (GPIO4/GPIO5), modified ZS-042 DS3231 RTC module (GPIO21/22/32, LED and charger removed), feeding ESP32 DevKit V1 (GPIO34 ADC input, 3.3V with 100uF cap on Base).
Route orthogonal wires neatly with zero overlaps over components.
```
