---
id: pcb-v2-blueprint-layout
title: Peta Alur PCB v2.0 Step 2.1 & Memo Revisi
---

import BlueprintImageDownload from "@site/src/components/BlueprintImageDownload";

# PCB ORION v2.0 (Step 2.1 S-D-G): Peta Lubang & Jalur Solder Bawah

Papan matriks `70 x 50 mm` ini disusun pada grid **24 kolom (`c1..c24`) x 18 baris (`r1..r18`)** berjarak lubang `2,54 mm`. Pada **Revisi 3 (Step 2.1)**, urutan kaki adaptor SOT-23 ke SIP-3 milik `Q1` dan `Q2` diubah menjadi **S-D-G** (`2-3-1`, Drain di tengah) supaya komponen adaptor dapat langsung ditancap dan disolder ke papan tanpa kabel ekstensi.

:::info Memo Revisi & Panduan Pembaruan Blueprint
Versi blueprint aktif saat ini adalah `PCB-v2.0-Step2.1-Rev3` dengan status **FINAL BERSYARAT**. Seluruh daftar komponen, 22 jaring (net), 14 slot header `H`, serta status gerbang `G1..G5` dan `E1..E7` tercatat terpusat di [hardwareBlueprint.ts](file:///d:/magang/v1/pixel-twin-workbench/src/data/hardwareBlueprint.ts).

Apabila pengukuran meja pada gerbang `G1`, `G2`, `G4`, `G5`, atau `E2..E7` mengubah posisi komponen pada Revisi 4, perbarui tiga lokasi berikut secara berurutan:
1. Perbarui konstanta dan riwayat revisi di [hardwareBlueprint.ts](file:///d:/magang/v1/pixel-twin-workbench/src/data/hardwareBlueprint.ts).
2. Ganti kedua gambar panduan di `docs/static/img/pcb-v2-tampak-atas.jpg` dan `docs/static/img/pcb-v2-tampak-bawah-cermin.jpg`.
3. Perbarui tabel perubahan pada halaman ini, lalu sesuaikan konstanta `WIRING` di [mockTelemetry.ts](file:///d:/magang/v1/pixel-twin-workbench/src/data/mockTelemetry.ts) bila koordinat diagnosa bergeser.
:::

---

## 1. Status Verifikasi Topologi & Keputusan Desain

### Hasil Pemeriksaan Topologi Jalur

| Parameter Pemeriksaan | Hasil | Keterangan Batas |
| :--- | :--- | :--- |
| Total jaring dan segmen | `22 net`, `237 segmen jalur` | Seluruh pin aktif tersambung sesuai jaringnya masing-masing. |
| Konflik dua net pada satu lubang | `0` | Tidak ada lubang berbagi net berbeda. |
| Persilangan diagonal sisi bawah | `0` | Semua kawat bawah bebas persilangan fisik. |
| Zona aman adaptor `3x3` (`Q1`, `Q2`) | Bersih | Tidak ada kaki komponen lain di dalam `c17-c19 x r8-r10` dan `c3-c5 x r6-r8`. |
| Empat lubang sudut papan | Kosong (`XXXX`) | Lubang `c1r1`, `c24r1`, `c1r18`, dan `c24r18` dibiarkan kosong. |
| Pin dicabut & lubang pilar | Bebas | Pin header `c23r7` dan `c23r9` dicabut; pilar `U3` menempati `c17r2` dan `c19r7`. |
| Jumper di sisi atas papan | `1 dari maks 2` (`JV1`) | Kawat tunggal berisolasi `+/- 40 mm` menyalurkan `3V3_MAIN` ke RTC dan ESP32. |

Pemeriksaan topologi memastikan papan bebas korsleting dan persilangan jalur. Kecocokan dimensi tinggi modul, tebal selubung Dupont, dan kelonggaran antar-komponen tetap harus dibuktikan di meja kerja melalui gerbang `G1..G5` sebelum menyolder Tahap B.

### Enam Keputusan Desain yang Sudah Dikunci

1. Konektor input `J1` disusun dari atas ke bawah sebagai `GND (W3)`, `CANL (W7)`, `CANH (W4)`, dan `+12V_F (W9)` karena modul `WCMCU-230` diputar `180 derajat`.
2. Modul RTC `ZS-042` dipasang terbalik `180 derajat` pada soket `8,5 mm` dengan posisi baterai tetap menghadap atas; barisan `6-pin` ada di kolom kiri `c7` dan `4-pin` di kolom kanan `c21`.
3. Koneksi ke ESP32 Base memakai satu strip utuh header male `1x14` pada kolom `c23` (`r4..r17`) dengan pin `r7` dan `r9` dicabut, menyisakan `12` pin aktif termasuk `GND3` di `c23r10`.
4. Resistor `R2 (27 kOhm 1/8 W)` dan kapasitor filter `C1 (100 nF)` ditaruh di sisi kanan dekat `ADC_OUT (c23r11)`, sedangkan `JV1` menjadi satu-satunya jumper atas penyalur `3.3 V`.
5. Kapasitor bulk `C2 (100 uF)` tidak ditempatkan di papan `70 x 50 mm`, melainkan disolder langsung pada pin `V/G` di ESP32 Base.
6. Untuk `Step 2.1`, pin `Q1` dan `Q2` disusun `S-D-G` sesuai uji kontinuitas adaptor `2-3-1`, dan resistor pull-up `R3` serta `R4` direbahkan (*flat*) mengangkangi dua lubang.

### Perubahan Posisi Step 2.1 vs Step 2 Final Bersyarat

| Komponen | Posisi Sebelumnya (Step 2) | Posisi Aktif (Step 2.1 S-D-G / Rev 3) |
| :--- | :--- | :--- |
| `Q2` | `c3r6-c5r6`, `G-S-D` horizontal | `c4r6-c4r8`, `S-D-G` vertikal (`S` di utara `c4r6`) |
| `R4` | Berdiri `c3r7/c4r7` | Rebah (*flat*), kaki di `c6r8` dan `c6r6` |
| `R1` | `c5r7/c5r8` | `c7r7/c7r8` |
| `R6` | `c3r8/c3r9` | `c4r9/c4r10` |
| `Q3` | `c3 r10-r12` | `c4 r11-r13` |
| `R7 / R8` | `c4 r9-r10 / c4 r11-r12` | `c5 r10-r11 / c5 r12-r13` |
| `R5` | `c6r5/c6r6` | `c6r5/c6r4` |
| `TVS` (opsional) | `c4r5 / c5r5` | `c3r15 (K)` / `c3r16 (A)` |
| `Q1` | `c19r8-c21r8`, `D-S-G` | `c17r9-c19r9`, `S-D-G` (`D` di `c18r9`) |
| `R3` | Berdiri `c19r9/c20r9` | Rebah (*flat*), kaki di `c20r8` dan `c22r8` |
| `C3` | `c17r5/c17r6` | `c15r10 (GND)` / `c16r10 (3V3_CAN)` |
| `JV1` | `c18r8 -> c18r14 -> c20r14` | `c16r8 -> c14r8 -> c14r12 -> c22r12 -> c22r14` |

Blok yang tidak bergeser meliputi `J1`, `D1`, `JP`, `U4 (MP1584)`, soket `U3 (c22 r2-r7)`, `U2 (ZS-042)`, `C1`, `R2`, header `c23`, serta busbar `GND` tepi.

### Catatan Terbuka Menuju Revisi Berikutnya

Ada empat hal yang masih berstatus terbuka sambil menunggu hasil perakitan dan ukur bangku. Pertama, `C2 (100 uF)` tetap dipasang pada pin `V/G` di ESP32 Base. Kedua, jalur `+12V_D` ke `TVS P6KE18A` (`c4r6 -> c3r7 -> c3r15`, panjang `+/- 22 mm` berisolasi) hanya dipasang jika dioda TVS ikut dirakit. Ketiga, letak `C3 (100 nF)` di `c15r10-c16r10` berjarak `+/- 70 mm` ke ground; bila butuh penempatan yang lebih dekat ke transceiver tanpa mengubah routing lain, solder `100 nF` rebah di sisi bawah langsung melintasi `c22r6-c22r7`. Keempat, konduktor pita OBD-II (`+/- 1 mm` diameter luar) wajib dikupas untuk mengukur ketebalan tembaga; pasang sekring `500 mA time-lag` selama belum diukur, dan naikkan ke `1 A` hanya jika inti terbukti `>= 26 AWG (0,40 mm)`.

---

## 2. Visualisasi Tampak Atas & Tampak Bawah Cermin

Saat melihat sisi atas komponen, kolom `c1` berada di sisi kiri (arah kabel pita `J1`), `c24` di sisi kanan (arah ESP32 Base), baris `r1` di tepi atas, dan `r18` di tepi bawah. Ketika papan dibalik horizontal mengikuti poros tegak seperti membuka halaman buku, baris `r1` tetap di atas sedangkan kolom `c24` berpindah ke sisi kiri pada gambar solder bawah.

<BlueprintImageDownload
  src="/img/pcb-v2-tampak-atas.jpg"
  alt="Peta Komponen Tampak Atas PCB ORION v2.0 Step 2.1"
  fileBaseName="pcb-orion-v2-step2_1-tampak-atas"
  caption="Tampak Atas (sisi komponen): c1 kiri arah kabel pita J1, c24 kanan arah ESP32 Base"
  rawMdPath="/raw-md/hardware/pcb-v2-blueprint-layout.md"
/>

<BlueprintImageDownload
  src="/img/pcb-v2-tampak-bawah-cermin.jpg"
  alt="Peta Jalur Solder Bawah Cermin PCB ORION v2.0 Step 2.1"
  fileBaseName="pcb-orion-v2-step2_1-tampak-bawah-cermin"
  caption="Tampak Bawah (sisi solder, dicerminkan kiri-kanan): c24 kiri, c1 kanan"
  rawMdPath="/raw-md/hardware/pcb-v2-blueprint-layout.md"
/>

---

## 3. Tabel Pemetaan Komponen ke Lubang Grid

Pada tabel jalur bawah, `(H)` menandakan segmen mendatar, `(V)` segmen tegak, dan `(D)` segmen miring `45 derajat` (`2,54 x sqrt(2) ~ 3,6 mm`). Pin bertanda **pad mati** tetap disolder agar soket berdiri kokoh walau tidak dialiri sinyal.

| Ref | Pin ke Lubang `[Net]` | Aturan & Catatan Pemasangan Fisik |
| :--- | :--- | :--- |
| `J1` | `1 -> c2r1 [GND]`; `2 -> c2r2 [CANL]`; `3 -> c2r3 [CANH]`; `4 -> c2r4 [V12F]` | Konektor `1x4` pitch `2,54 mm` (`JST-XH`/`KF2510` terkunci). Urutan atas ke bawah: `GND (W3)`, `CANL (W7)`, `CANH (W4)`, `+12V_F (W9)`. |
| `D1` | `A -> c3r4 [V12F]`; `K -> c3r5 [N12D]` | `1N5819` berdiri. Anoda di `c3r4`, katoda (garis pita) di `c3r5`. Kaki `1N5822` terlalu tebal sehingga tidak dipakai. |
| `TVS` | `K -> c3r15 [N12D]`; `A -> c3r16 [GND]` | Opsional `P6KE18A` berdiri (`K` pita di `c3r15`, `A` di `c3r16`). Jalur `GND` pada `c3r16` tetap dipasang meski TVS tidak dirakit. |
| `R5` | `a -> c6r5 [N12D]`; `b -> c6r4 [VIN]` | `10 Ohm` berdiri vertikal (`a = +12V_D` di `c6r5`, `b = VIN` di `c6r4`). Shunt pengukur arus tidur. |
| `JP` | `a -> c7r5 [N12D]`; `b -> c7r6 [VIN]` | Header `2-pin` dan jumper bypass berdiri. Jumper wajib terpasang saat operasi normal. |
| `Q2` | `S -> c4r6 [N12D]`; `D -> c4r7 [QD]`; `G -> c4r8 [G2]` | Adaptor `SOT-23 -> SIP-3` (`2-3-1 = S-D-G`) disolder langsung tanpa kawat ekstensi, vertikal di `c4` (`S` di utara). Zona `3x3` (`c3-c5 x r6-r8`) harus bebas komponen lain. |
| `R4` | `b -> c6r6 [N12D]`; `a -> c6r8 [G2]` | `47 kOhm` rebah (*flat*) mengangkangi `c6r6` dan `c6r8`. Lubang tengah `c6r7` dibiarkan kosong. |
| `R1` | `a -> c7r7 [QD]`; `b -> c7r8 [NODEM]` | `100 kOhm` berdiri vertikal (`a = drain Q2`, `b = Node M`). |
| `R6` | `a -> c4r9 [G2]`; `b -> c4r10 [QC]` | `27 kOhm` berdiri vertikal (`a = gate Q2`, `b = collector Q3`). |
| `Q3` | `C -> c4r11 [QC]`; `B -> c4r12 [QB]`; `E -> c4r13 [GND]` | `2N3904 TO-92` vertikal di `c4 r11-r13` dengan sisi datar menghadap timur ke kolom `c5`. |
| `R7` | `b -> c5r10 [ADCT]`; `a -> c5r11 [QB]` | `10 kOhm` berdiri vertikal (`a = basis Q3`, `b = ADC_TRIG`). |
| `R8` | `a -> c5r12 [QB]`; `b -> c5r13 [GND]` | `100 kOhm` berdiri vertikal (`a = basis Q3`, `b = GND`). |
| `U4` | `IN- -> c8r2 [GND]`; `OUT- -> c16r2 [GND]`; `IN+ -> c8r7 [VIN]`; `OUT+ -> c16r7 [V33A]` | `MP1584 3.3V fix` ditopang 4 pilar kawat (`3-4 mm`) tanpa diputar (`9x6` lubang). Tempel selotip Kapton di sisi bawah modul. |
| `U3` | `CANL -> c22r2`; `CANH -> c22r3`; `CRX -> c22r4`; `CTX -> c22r5`; `GND -> c22r6`; `3V3 -> c22r7` | `WCMCU-230` diputar `180 derajat` di soket `1x6` tinggi `8,5 mm` pada `c22`, dibantu 2 pilar non-konduktif di `c17r2` dan `c19r7`. |
| `Q1` | `S -> c17r9 [V33A]`; `D -> c18r9 [V33CAN]`; `G -> c19r9 [G1]` | Adaptor `SOT-23 -> SIP-3` (`2-3-1 = S-D-G`) disolder langsung, horizontal pada baris `r9` (`S` di barat). Zona `3x3` (`c17-c19 x r8-r10`) bebas kaki komponen lain. |
| `R3` | `a -> c20r8 [G1]`; `b -> c22r8 [V33A]` | `47 kOhm` rebah (*flat*) mengangkangi `c20r8` dan `c22r8`. Lubang tengah `c21r8` dibiarkan kosong. |
| `C3` | `b -> c15r10 [GND]`; `a -> c16r10 [V33CAN]` | `100 nF` keramik berdiri horizontal di `c15r10-c16r10`. |
| `C1` | `b -> c20r10 [GND]`; `a -> c20r11 [NODEM]` | `100 nF` keramik berdiri vertikal (`c20 r10-r11`) di bawah tepi `ZS-042`. |
| `R2` | `b -> c22r10 [GND]`; `a -> c22r11 [NODEM]` | `27 kOhm` ukuran `1/8 W` berdiri vertikal di `c22` supaya bodinya tidak menekan selubung Dupont header `c23`. |
| `U2` | 6-pin kiri (`c7`): `r12 GND` (mati), `r13 VCC` (mati), `r14 SDA` (mati), `r15 SCL` (mati), `r16 SQW` (aktif), `r17 32K` (mati); 4-pin kanan (`c21`): `r13 GND`, `r14 VCC`, `r15 SDA`, `r16 SCL` (aktif) | `ZS-042` diputar `180 derajat` pada soket `8,5 mm` (baterai menghadap ke atas). Lepas LED POWER dan dioda/resistor pengisi baterai sebelum dipasang. |
| `H` | Strip `1x14` di `c23 r4-r17` (`r7` dan `r9` dicabut): `r4 CRX`, `r5 CTX`, `r6 GND1`, `r8 CAN_EN`, `r10 GND3`, `r11 ADC_OUT`, `r12 ADC_TRIG`, `r13 GND2`, `r14 3V3`, `r15 SDA`, `r16 SCL`, `r17 RTC_INT` | Tersisa `12` pin aktif. Pakai housing Dupont *multi-way* rata atau terminal female ber-heat-shrink; hindari menekuk pin. |
| `JV1` | `c16r8 -> c14r8 -> c14r12 -> c22r12 -> c22r14` | Jumper atas tunggal (`+/- 40 mm` kawat `26 AWG` berisolasi). Masukkan kedua ujungnya sebelum jalur bawah di `c16r8` dan `c22r14` disolder. |

---

## 4. Peta Grid Tampak Atas (`c1..c24 x r1..r18`)

```text
     c1    c2    c3    c4    c5    c6    c7    c8    c9    c10   c11   c12   c13   c14   c15   c16   c17   c18   c19   c20   c21   c22   c23   c24
r1   XXXX  J11   .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     XXXX
r2   .     J12   .     .     .     .     .     U4I-  .     .     .     .     .     .     .     U4O-  .     .     .     .     .     U3CAN .     .
r3   .     J13   .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     U3CAN .     .
r4   .     J14   D1A   .     .     R5b   .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     U3CRX HCRX  .
r5   .     .     D1K   .     .     R5a   JPa   .     .     .     .     .     .     .     .     .     .     .     .     .     .     U3CTX HCTX  .
r6   .     .     .     Q2S   .     R4b   JPb   .     .     .     .     .     .     .     .     .     .     .     .     .     .     U3GND HG1   .
r7   .     .     .     Q2D   .     .     R1a   U4I+  .     .     .     .     .     .     .     U4O+  .     .     .     .     .     U33V3 .     .
r8   .     .     .     Q2G   .     R4a   R1b   .     .     .     .     .     .     .     .     .     .     .     .     R3a   .     R3b   HCANE .
r9   .     .     .     R6a   .     .     .     .     .     .     .     .     .     .     .     .     Q1S   Q1D   Q1G   .     .     .     .     .
r10  .     .     .     R6b   R7b   .     .     .     .     .     .     .     .     .     C3b   C3a   .     .     .     C1b   .     R2b   HG3   .
r11  .     .     .     Q3C   R7a   .     .     .     .     .     .     .     .     .     .     .     .     .     .     C1a   .     R2a   HADCO .
r12  .     .     .     Q3B   R8a   .     U2G6  .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     HADCT .
r13  .     .     .     Q3E   R8b   .     U2V6  .     .     .     .     .     .     .     .     .     .     .     .     .     U2G4  .     HG2   .
r14  .     .     .     .     .     .     U2D6  .     .     .     .     .     .     .     .     .     .     .     .     .     U2V4  .     H3V3  .
r15  .     .     TVSK  .     .     .     U2L6  .     .     .     .     .     .     .     .     .     .     .     .     .     U2D4  .     HSDA  .
r16  .     .     TVSA  .     .     .     U2SQW .     .     .     .     .     .     .     .     .     .     .     .     .     U2L4  .     HSCL  .
r17  .     .     .     .     .     .     U232K .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     HRTC  .
r18  XXXX  .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     .     XXXX
```

---

## 5. Peta Jalur Solder Bawah (22 Net, 237 Segmen) & Jumper `JV1`

Setiap kawat bawah menempel datar di permukaan pad tanpa saling bertumpukan, lalu kaki komponen dipotong maksimal `1 mm` supaya jarak bebas kolong terjaga di angka `<= 2,5 mm`.

| Net | Segmen Jalur Bawah (`Tampak Bawah Cermin`) |
| :--- | :--- |
| `GND` (Busbar `r1`, cincin `c24`, `r18`, riser `c2`, cabang) | `c2r1->c23r1 (H)` ; `c23r1->c24r2 (D)` ; `c24r2->c24r17 (V)` ; `c24r17->c23r18 (D)` ; `c23r18->c2r18 (H)` ; `c2r18->c2r16 (V)` ; `c2r16->c3r16 (H)` ; `c8r1->c8r2 (V)` ; `c16r1->c16r2 (V)` ; `c24r6->c22r6 (H)` ; `c24r10->c20r10 (H)` ; `c24r13->c21r13 (H)` ; `c4r15->c4r13 (V)` ; `c3r16->c4r15 (D)` ; `c4r13->c5r13 (H)` ; `c14r9->c15r10 (D)` ; `c14r7->c14r9 (V)` ; `c16r5->c14r7 (D)` ; `c21r5->c16r5 (H)` ; `c22r6->c21r5 (D)` |
| `V12F` (`+12V_F` sebelum `D1`) | `c2r4->c3r4 (H)` |
| `N12D` (`+12V_D` setelah `D1`) | `c3r5->c4r6 (D)` ; `c4r6->c6r6 (H)` ; `c6r6->c6r5 (V)` ; `c6r5->c7r5 (H)` |
| `VIN` (setelah `R5`/`JP` -> `U4 IN+`) | `c8r7->c7r6 (D)` ; `c7r4->c6r4 (H)` ; `c8r5->c7r4 (D)` ; `c7r6->c8r5 (D)` |
| `V33A` (`3V3_MAIN` sisi buck & `Q1.S`) | `c16r8->c17r9 (D)` ; `c16r7->c16r8 (V)` ; `c21r7->c22r8 (D)` ; `c20r7->c21r7 (H)` ; `c19r8->c20r7 (D)` ; `c18r8->c19r8 (H)` ; `c17r9->c18r8 (D)` |
| `V33B` (`3V3_MAIN` sisi RTC & Header via `JV1`) | `c21r14->c23r14 (H)` |
| `V33CAN` (`3V3_CAN` drain `Q1` -> `U3` & `C3`) | `c15r9->c16r10 (D)` ; `c15r7->c15r9 (V)` ; `c16r6->c15r7 (D)` ; `c21r6->c16r6 (H)` ; `c22r7->c21r6 (D)` ; `c17r10->c18r9 (D)` ; `c16r10->c17r10 (H)` |
| `CANL` (`J1.2` -> `U3.CANL`) | `c21r3->c22r2 (D)` ; `c8r3->c21r3 (H)` ; `c7r2->c8r3 (D)` ; `c2r2->c7r2 (H)` |
| `CANH` (`J1.3` -> `U3.CANH`) | `c21r4->c22r3 (D)` ; `c8r4->c21r4 (H)` ; `c7r3->c8r4 (D)` ; `c2r3->c7r3 (H)` |
| `CRX` (`U3.CRX` -> `H.CRX GPIO4`) | `c22r4->c23r4 (H)` |
| `CTX` (`U3.CTX` -> `H.CTX GPIO5`) | `c22r5->c23r5 (H)` |
| `SDA` (`U2.SDA4` -> `H.SDA GPIO21`) | `c21r15->c23r15 (H)` |
| `SCL` (`U2.SCL4` -> `H.SCL GPIO22`) | `c21r16->c23r16 (H)` |
| `SQW` (`U2.SQW` -> `H.RTC_INT GPIO32`) | `c21r17->c23r17 (H)` ; `c20r16->c21r17 (D)` ; `c7r16->c20r16 (H)` |
| `G1` (`H.CAN_EN GPIO26` -> `R3.a` -> `Q1.G`) | `c21r9->c20r8 (D)` ; `c22r9->c21r9 (H)` ; `c23r8->c22r9 (D)` ; `c20r8->c19r9 (D)` |
| `G2` (`Gate Q2` -> `R4.a` & `R6.a`) | `c4r8->c4r9 (V)` ; `c4r8->c6r8 (H)` |
| `QD` (`Drain Q2` -> `R1.a`) | `c4r7->c7r7 (H)` |
| `QC` (`R6.b` -> `Collector Q3`) | `c4r10->c4r11 (V)` |
| `QB` (`Base Q3` -> `R7.a` -> `R8.a`) | `c4r12->c5r12 (H)` ; `c5r12->c5r11 (V)` |
| `ADCT` (`H.ADC_TRIG GPIO27` -> `R7.b`) | `c6r11->c5r10 (D)` ; `c7r11->c6r11 (H)` ; `c8r12->c7r11 (D)` ; `c23r12->c8r12 (H)` |
| `NODEM` (`R1.b` -> `C1.a` -> `R2.a` -> `H.ADC_OUT GPIO34`) | `c10r11->c23r11 (H)` ; `c10r11->c7r8 (D)` |
| `K32` (`U2.32K` dan pad mati 6-pin kiri) | Pad mati tanpa jalur (`c7r12..c7r15`, `c7r17`) disolder mekanis |

Kawat berisolasi `+12V_D: c4r6->c3r7 (D) ; c3r7->c3r15 (V)` sepanjang `+/- 22 mm` sejajar riser `c2` hanya dipasang jika `TVS P6KE18A` ikut dirakit. Di bawah bodi `MP1584`, hanya kawat tipis `CAN_L` dan `CAN_H` yang boleh melintas; sedangkan di bawah `ZS-042` melintas jalur bawah `SQW (r16)`, sebagian `ADC_TRIG`/`NODEM`, dan jumper atas `JV1` pada baris `r12`.

### Peta ASCII Tampak Bawah Cermin (`c24` di Kiri, `c1` di Kanan)

```text
     2423222120191817161514131211109 8 7 6 5 4 3 2 1
r1   X 0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0 X
      /              |               |
r2   0 . L . . . . . 0 . . . . . . . 0 L-L-L-L-L-L .
     |    \                           /
r3   0 . H L-L-L-L-L-L-L-L-L-L-L-L-L-L H-H-H-H-H-H .
     |    \                           /
r4   0 X-X H-H-H-H-H-H-H-H-H-H-H-H-H-H I-I . . F-F .
     |                                /
r5   0 T-T 0-0-0-0-0-0 . . . . . . . I D-D . . D . .
     |    /           \               \  |    /
r6   0-0-0 C-C-C-C-C-C 0 . . . . . . . I D-D-D . . .
     |    /           \ \             /       \
r7   0 . C 3-3 . . . 3 C 0 . . . . . I d-d-d-d D . .
     |    /   \      | | |                     |
r8   0 1 3 . 1 3-3 . 3 C 0 . . . . . . M 2-2-2 D . .
     |  \   / \   \ /  | |            /      | |
r9   0 . 1-1 . 1 C 3 . C 0 . . . . . M . . . 2 D . .
     |            \   / /           /          |
r10  0-0-0-0-0 . . C-C 0 . . . . . M . . . A c D . .
     |                            /       /  | |
r11  0 M-M-M-M-M-M-M-M-M-M-M-M-M-M . . A-A b c D . .
     |                                /    |   |
r12  0 A-A-A-A-A-A-A-A-A-A-A-A-A-A-A-A 0 . b-b D . .
     |                                         |
r13  0-0-0-0 . . . . . . . . . . . . . 4 . 0-0 D . .
     |                                       | |
r14  0 4-4-4 . . . . . . . . . . . . . S . . 0 D . .
     |                                       | |
r15  0 S-S-S . . . . . . . . . . . . . K . . 0 D . .
     |                                        \
r16  0 K-K-K Q-Q-Q-Q-Q-Q-Q-Q-Q-Q-Q-Q-Q-Q . . . 0-0 .
     |      /                                    |
r17  0 Q-Q-Q . . . . . . . . . . . . . - . . . . 0 .
      \                                          |
r18  X 0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0 X
```

Legenda kode net: `0`=`GND`, `F`=`+12V_F`, `D`=`+12V_D`, `I`=`VIN`, `3`/`4`=`3V3`, `C`=`3V3_CAN`, `L`=`CAN_L`, `H`=`CAN_H`, `X`=`CRX`, `T`=`CTX`, `S`=`SDA`, `K`=`SCL`, `Q`=`SQW`, `1`=`CAN_EN`, `2`=`Gate Q2`, `d`=`Drain Q2`, `c`=`Collector Q3`, `b`=`Base Q3`, `A`=`ADC_TRIG`, `M`=`Node M`.

---

## 6. Spesifikasi Kawat & Aturan Ruang Komponen

| Kelompok Jalur | Estimasi Panjang | Spesifikasi Kawat | Alasan Teknis |
| :--- | :--- | :--- | :--- |
| Busbar `r1` dan cincin `c24` | `+/- 95 mm` | Tembaga tunggal polos/tinned `22 AWG (+/- 0,64 mm)` | Menyalurkan seluruh arus balik ESP32 dan modul menuju `J1.1` (`H.GND -> c24 -> r1 -> c2r1`). |
| Busbar `r18` | `+/- 57 mm` | Tembaga tunggal polos `24 AWG (+/- 0,50 mm)` | Hanya menanggung arus mikro dari `Q3` dan `R8`. |
| Riser `c2` (`c2r16->c2r18->c3r16`) | `+/- 8 mm` | Tembaga `24 AWG` | Bagian `r6-r15` pada kolom `c2` tidak terhubung ke mana pun sehingga dibiarkan kosong. |
| Jalur daya `+12V` (`V12F`, `N12D`, `VIN`), `3V3_MAIN` (`V33A`, `V33B`), `JV1` | `+/- 16 + 27 + 40 mm` | `26 AWG` tunggal berisolasi | Jalur `JV1 + V33A + V33B` menyuplai daya utama `3,3 V` untuk ESP32 dan RTC. |
| Jalur sinyal (`CAN_L/H`, `Node M`, `ADC_TRIG`, `SQW`, `SDA/SCL`, `CRX/CTX`, `CAN_EN`, gate/basis, `3V3_CAN`) | `+/- 330 mm` | Wire-wrapping `30 AWG` solid (`Kynar`/`PVC`) | Arus sinyal `< 20 mA`; kawat tipis menjaga jarak kolong bawah tetap `<= 2,5 mm`. |
| Cabang `GND` lokal dekat modul | `+/- 79 mm` | `30 AWG` berisolasi | Arus balik sinyal lokal. |

Jika membeli kawat gulungan, siapkan cadangan `30%`: `22 AWG +/- 130 mm`, `24 AWG +/- 90 mm`, `26 AWG +/- 110 mm`, dan `30 AWG +/- 530 mm`. Kupas isolasi Kynar sepanjang `1,5-2 mm` memakai stripper `30 AWG`, lalu solder menempel di permukaan pad bawah tanpa menjejalkan ujung kawat ke dalam lubang. Hindari kawat email berlapiskan pernis serta hindari penyambungan potongan sisa kaki komponen untuk busbar panjang `53-56 mm`.

Untuk kabel luar yang masuk ke soket `J1`, pakai kabel ribbon 4 kawat (`W3`, `W4`, `W7`, `W9`) dengan terminal crimp `JST-XH`, jangan memakai jumper Dupont lepas di dalam mobil.

Pada ruang atas dan kolong komponen, patuhi tiga batasan mekanis berikut. Pertama, beri selotip Kapton di bawah bodi `MP1584` yang bertumpu pada pilar kawat `3-4 mm`. Kedua, di bawah `WCMCU-230` dan `ZS-042` (`soket 8,5 mm`), hanya komponen rendah (`C1` keramik, `R3`/`R4` rebah, dan kawat datar) yang diizinkan; resistor berdiri dilarang dipasang di bawah modul. Ketiga, jarak antara soket `U3`/`R2` (`c22`) dan header `H` (`c23`) tinggal `1 pitch` (`2,54 mm`), sehingga tepi selubung Dupont tersisa `+/- 0,08 mm` saja; karena itu pakailah housing *multi-way* yang rata, gunakan `R2` ukuran `1/8 W`, dan jalankan dry-fit gerbang `G2`.

---

## 7. Alur Perakitan Bertahap & Ceklis Multimeter

### Urutan Perakitan dalam Empat Tahap

1. **Tahap 0 (Persiapan Tanpa Solder, `+/- 45 menit`)**: tandai huruf `c1` dan `r1` serta empat lubang sudut dengan spidol pada papan polos. Ukur gerbang `G1` dan dry-fit `G2` (ukur `G4` hanya jika `G2` gagal). Uji semua komponen terpisah: `D1` pada mode dioda (`0,15-0,35 V`), body diode `AO3401A` (`D->S ~ 0,5 V`), simulasi `2N3904` gerbang `E7` (`G ~ 4,4 V` saat basis diberi `3,3 V`), serta ukur nilai Ohm kedelapan resistor.
2. **Tahap A (Blok Kiri, `MP1584`, & Busbar Tepi)** *(mulai setelah komponen Tahap 0 lolos)*: solder `D1`, `R5`, `JP`, `Q2` (`S` di utara `c4r6`), `R4` rebah (`c6r6-c6r8`), `R6`, `R1`, `Q3`, `R7`, `R8`, dan `TVS` jika dipakai. Pasang `MP1584` di atas 4 pilar + Kapton, soket `ZS-042`, serta konektor `J1`. Tarik busbar `GND` tepi (`r1`, `c24`, `r18`, `c2`) dan jalur lokal blok kiri. Lakukan **Uji A** memakai PSU `12 V` bersekring batas arus `100 mA` tanpa modul lain dan pastikan jumper `JP` terpasang: tegangan `+12V_D` terbaca `Vin - 0,20..0,35 V`, `VIN` setara `+12V_D`, dan keluaran `MP1584` stabil `3,2-3,4 V`.
3. **Tahap B (Sisi Kanan, `JV1`, & Header `c23`)** *(mulai setelah `G1` dan `G2` lulus)*: masukkan kedua ujung `JV1` dari sisi atas ke lubang `c16r8` dan `c22r14` lebih dahulu sebelum jalur bawah pada dua lubang itu disolder. Berikutnya pasang soket `U3`, 2 pilar non-konduktif (`c17r2`, `c19r7`), `Q1` (`S` di `c17r9`), `R3` rebah (`c20r8-c22r8`), `C3`, `C1`, dan `R2 (1/8 W)`. Setelah itu tarik semua jalur kanan (`CAN_L/H`, `3V3`, `CAN_EN`, `Node M`, `ADC_TRIG`, `SQW`, `SDA/SCL`, dan sisa `GND`). Terakhir, cabut pin `r7` dan `r9` dari strip `1x14` lalu solder lurus di `c23 r4-r17`, kemudian jalankan **Uji B** (ceklis kontinuitas tanpa daya).
4. **Tahap C (Integrasi Modul & Kalibrasi)**: modifikasi `ZS-042` dengan melepas LED POWER dan resistor/dioda pengisi baterai. Pasang `WCMCU-230` dan `ZS-042` satu per satu dengan PSU `12 V` sambil memantau arus. Hubungkan ESP32 Base (dilarang keras menyalakan USB dan 12 V bersamaan), ukur `Vgs Q2` ON/OFF (`E2`), kalibrasi DMM SOP C.1, dan ukur arus tidur (`E5`).

### Ceklis Uji Kontinuitas Multimeter (Tanpa Daya & Tanpa Modul)

Gunakan mode buzzer/dioda multimeter sebelum modul dipasang:

| Jalur Uji Wajib Berbunyi (`0 Ohm`) | Titik Probe 1 ke Titik Probe 2 |
| :--- | :--- |
| Rel Ground Utama | `J1.1 <-> U4.IN- <-> U4.OUT- <-> U3.GND <-> H.GND1/2/3 <-> Q3.E <-> R8.b <-> C1.b <-> R2.b <-> C3.b` (serta `TVS.A` bila dipasang) |
| Jalur Masuk `+12V` | `J1.4 <-> D1.A` ; `D1.K <-> Q2.S <-> R4.b <-> R5.a <-> JP.a` ; `R5.b <-> JP.b <-> U4.IN+` |
| Sakelar High-Side ADC | `Q2.D <-> R1.a` ; `Q2.G <-> R4.a <-> R6.a` ; `R6.b <-> Q3.C` ; `Q3.B <-> R7.a <-> R8.a` ; `R7.b <-> H.ADC_TRIG` |
| Node M Pembagi ADC | `R1.b <-> R2.a <-> C1.a <-> H.ADC_OUT` |
| Jalur Daya `3.3 V` via `JV1` | `U4.OUT+ <-> Q1.S <-> R3.b <-> c16r8` ; `c22r14 <-> U2.VCC(4p) <-> H.3V3` |
| Power Gate & Sinyal CAN | `Q1.D <-> U3.3V3 <-> C3.a` ; `Q1.G <-> R3.a <-> H.CAN_EN` ; `J1.2 <-> U3.CANL` ; `J1.3 <-> U3.CANH` ; `U3.CRX <-> H.CRX` ; `U3.CTX <-> H.CTX` |
| Jalur I2C & Bangun RTC | `U2.SDA(4p) <-> H.SDA` ; `U2.SCL(4p) <-> H.SCL` ; `U2.SQW <-> H.RTC_INT` |

Pastikan pasangan di bawah ini **tidak berbunyi (terisolasi)** sebelum papan diberi tegangan:

| Pasangan Titik Uji | Kondisi Wajib Terukur |
| :--- | :--- |
| `GND` vs `J1.4`, `GND` vs `+12V_D`, `+12V_D` vs `3V3_MAIN`, `3V3_MAIN` vs `3V3_CAN` | Putus (`OL`) |
| `CAN_L` vs `CAN_H` (tanpa modul terpasang), `ADC_OUT` vs `ADC_TRIG` | Putus (`OL`) |
| `Q2.S` vs `Q2.D`, `Q2.D` vs `Q2.G`, `Q1.S` vs `Q1.D`, `Q1.D` vs `Q1.G` | Putus (`OL`) |
| `Q2.S` vs `Q2.G` dan `Q1.S` vs `Q1.G` | Membaca `+/- 47 kOhm` (lewat `R4` dan `R3`), bukan short `0 Ohm` |

---

## 8. Daftar Gerbang Verifikasi Bersyarat (`G1..G5` & `E1..E7`)

### Gerbang Fisik (Pra-Solder Tahap B)

| ID | Bagian yang Diukur | Kriteria Lulus | Status | Rencana Bila Gagal |
| :--- | :--- | :--- | :--- | :--- |
| `G1` | Posisi pin `WCMCU-230` terhadap tepi modul & tinggi komponen | Margin pin ke tepi bawah `>= 1,1 mm` (badan berakhir `<= r7,45`) | Belum diukur | Geser blok `Q1` (`r8-r10`) ke koordinat aman. |
| `G2` | Dry-fit soket `1x6` di `c22` vs selubung Dupont di `c23` | Tidak saling menekan; lebar selubung `<= 2,54 mm` | Belum diukur | Geser `U3` dan `R2` satu kolom ke `c21`. |
| `G3` | Adaptor `SOT-23 -> SIP-3` (`2-3-1 = S-D-G`) | Kontinuitas `2-3-1 = S-D-G` dan tinggi terpasang `< 6 mm` | Lulus | Terkonfirmasi; disolder langsung tanpa kawat ekstensi. |
| `G4` | Tinggi komponen `MP1584` di `2,5 mm` terakhir tepi kanan | Celah ke dasar `WCMCU` (`8,5 mm`) `>= 1 mm` bila bertumpuk | Belum diukur | Wajib diukur hanya jika `G2` gagal. |
| `G5` | Panjang x lebar papan adaptor dan posisi baris pin | `<= 7,6 x 7,6 mm` dengan baris pin di tengah blok `3x3` | Belum diukur | Perbesar area keep-out dengan penyesuaian jalur kecil. |

### Gerbang Elektrikal

| ID | Sirkuit Pengujian | Kriteria / Temuan | Status |
| :--- | :--- | :--- | :--- |
| `E1` | Output `MP1584` tanpa beban | Stabil `3,33 V` pada input `3S 11,91 V`; ulangi pada `12,6 V` dan `+/- 14 V`. | Sebagian lulus |
| `E2` | Sakelar ADC `Q2`/`Q3` + pembagi `R1`/`R2` | OFF: `Node M = 0,00 V`; ON pada v2.0 ditargetkan `Vgs ~ -7,6 V` (`11,9 V`) s/d `-9,1 V` (`14,4 V`). | Ukur ulang di prototipe v2.0 |
| `E3` | Sakelar CAN `Q1` (`GPIO26 Active-LOW`) | OFF `= 0,00 V`, ON `= 3,33 V`. | Lulus |
| `E4` | Polaritas `GPIO27` (`ADC_TRIG`) | Perangkat keras bekerja aktif-HIGH; pastikan cocok di [sketch_oct16aa.ino](file:///d:/magang/v1/pixel-twin-workbench/firmware/sketch_oct16aa/sketch_oct16aa.ino). | Konfirmasi firmware |
| `E5` | Arus tidur DevKit + Base lewat shunt `R5` | Mengukur arus gabungan saat `JP` dilepas (`< 500 uA`). | Belum diukur |
| `E6` | Uji dioda `D1` dan polaritas `TVS P6KE18A` | `1N5819` drop maju `0,15-0,35 V`; pastikan arah pita katoda. | Belum dilaporkan |
| `E7` | Uji fungsi `Q3` + pembagi gate `R4`/`R6` | Titik `G ~ 4,4 V` saat basis `3,3 V` dan `~ 12 V` saat basis ke `GND`. | Wajib sebelum `Q3` disolder |
