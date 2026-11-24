---
id: yard-approval-proposal
title: Proposal Uji Coba Unit Gudang (PDF) & Memo
---

import useBaseUrl from "@docusaurus/useBaseUrl";

# Proposal Izin Uji Coba Kendaraan Gudang (PDF Monokrom)

Halaman ini menyediakan dokumen proposal teknis dalam format **PDF monokrom 7 halaman A4** (3 halaman utama dan 4 halaman lampiran) sebelum pelaksanaan uji coba terbatas perangkat ORION v2.0 pada unit kendaraan operasional di area gudang. Dokumen memisahkan secara tegas hasil pengukuran meja (*bench test*) yang sudah tercatat dari parameter wajib uji **Tahap C**, tanpa kolom tanda tangan maupun klaim tanpa data ukur.

<p>
  <a
    href={useBaseUrl("/pdf/ORION_Dokumen_Izin_Teknis_Gudang.pdf")}
    download="ORION_Dokumen_Izin_Teknis_Gudang.pdf"
    className="orion-export-btn"
  >
    Unduh Dokumen Proposal Uji Coba (.pdf - 7 Halaman Monokrom)
  </a>
</p>

:::info Memo Revisi & Cara Memperbarui Proposal PDF
Seluruh 7 halaman PDF (`ORION-DOC-YARD-02 / Rev 3.0`) dibangkitkan otomatis oleh skrip [generate-yard-approval-pdf.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/generate-yard-approval-pdf.mjs) dari objek konfigurasi `APPROVAL_DOC_MEMO` serta aset grafis lokal:
- Foto PCB tampak atas & tampak bawah cermin: `docs/static/img/pcb-v2-tampak-atas.jpg` dan `docs/static/img/pcb-v2-tampak-bawah-cermin.jpg`.
- Aset potongan modul fisik monokrom untuk Lampiran C: `docs/static/img/cirkit-modules/*.png` (`obd2-plug`, `fuse-holder`, `mp1584-buck`, `zs042-rtc`, `wcmcu230-can`, `esp32-devkit`).

Jika ada pengukuran Tahap C yang sudah selesai (misalnya hasil ukur arus tidur `E5`, `Vgs Q2`, atau uji MP1584 di `12,6 V` dan `+/- 14 V`), perbarui PDF dengan 2 langkah berikut:
1. Ubah angka atau status pengujian pada objek `APPROVAL_DOC_MEMO` di [generate-yard-approval-pdf.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/generate-yard-approval-pdf.mjs).
2. Jalankan `npm run pdf:yard-approval`, lalu verifikasi dengan `npm run check:hygiene` dan `npm run build`.

**Catatan Penyelarasan Konektor**: Bagian mitigasi risiko dan Lampiran C menampilkan pemisahan fisik dua konektor terkunci (`JST-XH 2-pin` Daya dan `2-pin` CAN) sebagai pencegah salah colok di lapangan, sedangkan tata letak matriks lubang [PCB v2.0 Step 2.1](pcb-v2-blueprint-layout.md) saat ini menggunakan header `J1 1x4` terkunci. Jika papan fisik final memakai dual `JST-XH 2-pin`, sesuaikan *footprint* `J1` pada revisi layout berikutnya.
:::

---

## Ringkasan Struktur 7 Halaman PDF (Rev 3.0 Monokrom)

| Halaman | Bagian Isi | Penekanan Informasi |
| :--- | :--- | :--- |
| **Halaman 1** | Judul, Ringkasan Eksekutif Non-Invasif, Diagram Konektor OBD-II 16-Pin Monokrom, dan Tabel 5 Blok Arsitektur | Menjelaskan tujuan uji coba, aturan keselamatan `H8`, mode baca pasif `WCMCU-230`, konfigurasi *common ground* `MP1584`, modifikasi fisik `ZS-042`, serta sakelar `Q1` & `Q2/Q3`. |
| **Halaman 2** | Skema Wiring Monokrom Berpanah Arah Input-Output (`Gambar 2`) dan Bagian Awal Tabel Data Pengujian | Memperlihatkan arah aliran daya (`->`), sinyal ADC (`->`), bus dua arah CAN/I2C (`<->`), serta kontrol gate & interupsi bangun (`SQW -> GPIO32`) beserta data uji 1-4. |
| **Halaman 3** | Lanjutan Tabel Data Pengujian (`Q2/Q3`, `E5`), Matriks Mitigasi Risiko 4 Butir, dan Urutan Verifikasi Tahap C | Memisahkan status `TERUJI MEJA` vs `TARGET UJI TAHAP C`, langkah pencegahan risiko lapangan, serta 4 langkah verifikasi wajib pra-pemasangan unit. |
| **Halaman 4 (Lampiran A)** | Tata Letak Fisik PCB ORION v2.0 Step 2.1 Tampak Atas (`70 x 50 mm`, penuh 1 halaman) | Menampilkan proyeksi sisi komponen (`c1` kiri ke `c24` kanan), zona *keep-out* `3 x 3` lubang untuk `Q1`/`Q2`, serta 4 sudut dudukan mekanis. |
| **Halaman 5 (Lampiran B)** | Peta Jalur Solder Sisi Bawah Cermin PCB ORION v2.0 Step 2.1 (penuh 1 halaman) | Menampilkan proyeksi cermin penyolderan (`c24` kiri ke `c1` kanan), ringkasan `22 net` / `237 segmen` / `0` persilangan sisi bawah / `1` jumper `JV1`, dan syarat cek kontinuitas Tahap B. |
| **Halaman 6 (Lampiran C)** | Diagram Wiring Realistis ORION v2.0 Berbasis Aset Modul Fisik Monokrom (penuh 1 halaman) | Merangkai aset fisik `OBD-II`, `Sekring 500 mA`, `MP1584`, `WCMCU-230`, `ZS-042`, dan `ESP32 DevKit` memakai perutean ortogonal berpanah arah serta mengoreksi 5 ketidaksesuaian dari skema otomatis awal. |
| **Halaman 7 (Lampiran D)** | Daftar Komponen Utama (`BOM Step 2.1`) & SOP 5 Langkah Pemasangan/Pelepasan Aman | Merinci seluruh komponen aktif-pasif serta langkah praktis colok-lepas aman (kunci kontak `OFF`, kepatuhan `H8`, pemulihan kondisi standar mobil). |

---

## Arsip Prompt Cirkit AI (`app.cirkitdesigner.com`)

Aset modul fisik pada **Lampiran C** diekstrak menjadi grafis monokrom bersih dan dirangkai ulang mengikuti *netlist* Step 2.1 karena skema otomatis mentah dari Cirkit AI masih memuat beberapa kekeliruan (penambahan 3 dioda diskret, kapasitor berlebih di luar BOM, serta pemakaian pin 6-sisi kiri pada `ZS-042` alih-alih header 4-pin kanan). Prompt di bawah tetap diarsipkan sebagai referensi apabila dibutuhkan regenerasi skema pada aplikasi Cirkit.

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
- U2: DS3231 RTC Module (ZS-042, with power LED and coin-cell charging circuit removed) using pins VCC, GND, SDA, SCL on the 4-pin side and SQW on the 6-pin side.
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
- U2 4-pin side SDA/SCL -> ESP32 GPIO21/GPIO22; U2 SQW -> ESP32 GPIO32.
```
