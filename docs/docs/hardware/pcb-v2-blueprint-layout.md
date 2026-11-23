---
id: pcb-v2-blueprint-layout
title: Peta Alur PCB v2.0 Step 2.1 & Memo Revisi
---

import BlueprintImageDownload from "@site/src/components/BlueprintImageDownload";

# PCB ORION v2.0 (Step 2.1 S-D-G): Peta Lubang & Jalur Solder Bawah

Papan matriks `70 x 50 mm` memakai grid **24 kolom (`c1..c24`) x 18 baris (`r1..r18`)** pada pitch `2,54 mm`. Pada **Revisi 3 (Step 2.1)**, pin adaptor SOT-23 ke SIP-3 untuk `Q1` dan `Q2` diurutkan menjadi **S-D-G** (`2-3-1`, Drain di tengah) agar modul adaptor dapat langsung disolder tanpa kawat ekstensi.

:::info Memo Revisi & Panduan Pembaruan Blueprint
- **Versi Blueprint Aktif**: `PCB-v2.0-Step2.1-Rev3` (`Status: FINAL BERSYARAT`)
- **Single Source of Truth (SSOT)**: Seluruh tabel komponen, 22 jaring (net), pin header `H`, serta status gerbang `G1..G5` dan `E1..E7` disimpan terpusat di [hardwareBlueprint.ts](file:///d:/magang/v1/pixel-twin-workbench/src/data/hardwareBlueprint.ts).
- **Cara Memperbarui ke Revisi 4**: Apabila pengukuran gerbang `G1`, `G2`, `G4`, `G5`, atau `E2..E7` mengubah koordinat atau komponen, cukup perbarui 3 tempat ini secara berurutan:
  1. Ubah konstanta dan changelog revisi di [hardwareBlueprint.ts](file:///d:/magang/v1/pixel-twin-workbench/src/data/hardwareBlueprint.ts).
  2. Ganti gambar di `docs/static/img/pcb-v2-tampak-atas.jpg` dan `docs/static/img/pcb-v2-tampak-bawah-cermin.jpg`.
  3. Catat perubahan pada tabel *Riwayat Perubahan* dan *Catatan Terbuka* di halaman ini, lalu perbarui `WIRING` di [mockTelemetry.ts](file:///d:/magang/v1/pixel-twin-workbench/src/data/mockTelemetry.ts) bila ada koordinat jalur diagnosa yang bergeser.
:::

---

## 1. Status Verifikasi Topologi & Memo Perubahan

### Ringkasan Pemeriksaan Topologi

| Pemeriksaan | Hasil Verifikasi | Keterangan Batas |
| :--- | :--- | :--- |
| Total jaring & segmen jalur | `22 net`, `237 segmen jalur` | Seluruh pin wajib tersambung dalam net masing-masing. |
| Konflik dua net pada satu lubang | `0` | Tidak ada lubang berbagi net berbeda. |
| Persilangan diagonal di sisi bawah | `0` | Nol persilangan fisik di lapisan solder bawah. |
| Keep-out adaptor `3x3` (`Q1`: `c17-c19 x r8-r10`, `Q2`: `c3-c5 x r6-r8`) | Bersih | Tidak ada kaki komponen lain di dalam zona aman. |
| Empat lubang sudut papan | Kosong (`XXXX`) | `c1r1`, `c24r1`, `c1r18`, `c24r18` tidak disolder. |
| Lubang pin dicabut & pilar | Bebas | Pin header `c23r7` dan `c23r9` dicabut; pilar `U3` di `c17r2` dan `c19r7`. |
| Jumper di sisi atas papan | `1 dari maks 2` (`JV1`) | Panjang `+/- 40 mm` menyalurkan `3V3_MAIN` ke RTC dan ESP32. |

Batas pemeriksaan skrip mencakup keabsahan topologi listrik (bebas korsleting dan persilangan) serta area keep-out. Kecocokan dimensi fisik tinggi modul, lebar selubung Dupont, dan kelonggaran mekanis wajib lulus gerbang pada Bagian 8 sebelum penyolderan Tahap B.

### Keputusan Arsitektur Terkunci

1. Urutan konektor `J1` dari atas ke bawah: `GND (W3)`, `CANL (W7)`, `CANH (W4)`, `+12V_F (W9)` karena posisi `WCMCU-230` diputar `180 derajat`.
2. Modul `ZS-042` diputar `180 derajat`: deret `6-pin` di kolom kiri `c7`, deret `4-pin` di kolom kanan `c21` dengan baterai menghadap ke atas.
3. Header ke ESP32 Base memakai **1 strip utuh `1x14`** pada `c23 r4-r17` dengan pin `c23r7` dan `c23r9` dicabut, menyisakan **12 pin aktif** termasuk `GND3` di `c23r10`.
4. Resistor `R2` (`27 kOhm 1/8 W`) dan kapasitor `C1` (`100 nF`) ditempatkan di sisi kanan berdekatan dengan pin `ADC_OUT (c23r11)`.
5. Suplai `3.3 V` menuju RTC dan ESP32 lewat satu-satunya jumper atas `JV1`.
6. Kapasitor bulk `C2` (`100 uF`) tidak diletakkan di PCB `70 x 50 mm`, melainkan dipasang langsung pada pin `V/G` di ESP32 Base.
7. Pada **Step 2.1**, pin `Q1` dan `Q2` mengikuti urutan **S-D-G** sesuai hasil uji kontinuitas adaptor `2-3-1 = S-D-G`; resistor pull-up `R3` dan `R4` dipasang rebah (flat) mengangkangi dua lubang.

### Memo Perubahan Step 2.1 vs Step 2 Final Bersyarat

| Komponen | Posisi Sebelumnya (Step 2) | Posisi Aktif (Step 2.1 S-D-G / Rev 3) |
| :--- | :--- | :--- |
| `Q2` | `c3r6-c5r6`, `G-S-D` horizontal | `c4r6-c4r8`, `S-D-G` vertikal (`S` di utara `c4r6`) |
| `R4` | Berdiri `c3r7/c4r7` | **Rebah (flat)**, kaki di `c6r8` dan `c6r6` |
| `R1` | `c5r7/c5r8` | `c7r7/c7r8` |
| `R6` | `c3r8/c3r9` | `c4r9/c4r10` |
| `Q3` | `c3 r10-r12` | `c4 r11-r13` |
| `R7 / R8` | `c4 r9-r10 / c4 r11-r12` | `c5 r10-r11 / c5 r12-r13` |
| `R5` | `c6r5/c6r6` | `c6r5/c6r4` |
| `TVS` (opsional) | `c4r5 / c5r5` | `c3r15 (K)` / `c3r16 (A)` |
| `Q1` | `c19r8-c21r8`, `D-S-G` | `c17r9-c19r9`, `S-D-G` (`D` di `c18r9`) |
| `R3` | Berdiri `c19r9/c20r9` | **Rebah (flat)**, kaki di `c20r8` dan `c22r8` |
| `C3` | `c17r5/c17r6` | `c15r10 (GND)` / `c16r10 (3V3_CAN)` |
| `JV1` | `c18r8 -> c18r14 -> c20r14` | `c16r8 -> c14r8 -> c14r12 -> c22r12 -> c22r14` |

Komponen yang tidak berubah dari versi sebelumnya: `J1`, `D1`, `JP`, `U4 (MP1584)`, soket `U3 (WCMCU c22 r2-r7)`, `U2 (ZS-042)`, `C1`, `R2`, header `c23`, serta busbar `GND` tepi.

### Memo Catatan Terbuka (Menunggu Keputusan Revisi Berikutnya)

- `C2 (100 uF)` belum memiliki pad pada papan `70 x 50 mm` dan dipasang pada pin `V/G` ESP32 Base.
- Pemasangan `TVS P6KE18A` di `c3r15-c3r16` beserta kawat `+12V_D` sepanjang `+/- 22 mm` (`c4r6 -> c3r7 -> c3r15`) bersifat opsional.
- `C3 (100 nF)` kini berada dekat `Q1` (`c15r10-c16r10`) dengan panjang jalur ground `+/- 70 mm` melewati `r5`. Opsi revisi tanpa mengubah skema routing: solder kapasitor keramik `100 nF` secara rebah di sisi bawah langsung menjembatani pad `c22r6 (GND)` dan `c22r7 (3V3_CAN)`.
- Konduktor kabel pita OBD-II (diameter luar `+/- 1 mm`) wajib dikupas dan diukur sebelum menentukan rating sekring akhir: gunakan sekring **500 mA time-lag** selama konduktor belum diukur, dan naikkan ke **1 A** hanya apabila inti terukur `>= 26 AWG (+/- 0,40 mm)`.

---

## 2. Visualisasi Peta Tampak Atas & Tampak Bawah Cermin

- **Tampak Atas (Sisi Komponen)**: kolom `c1` di sebelah kiri (arah konektor pita `J1`), `c24` di sebelah kanan (arah ESP32 Base), baris `r1` di atas, `r18` di bawah.
- **Tampak Bawah (Sisi Solder, Cermin)**: saat papan dibalik horizontal mengikuti poros vertikal seperti membalik halaman buku, `c24` berpindah ke kiri dan `c1` berpindah ke kanan sedangkan baris `r1` tetap berada di sisi atas.

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

Notasi arah jalur: `(H)` = horizontal, `(V)` = vertikal, `(D)` = diagonal (`2,54 x sqrt(2) ~ 3,6 mm`). Istilah **pad mati** menandakan pin soket modul yang tetap disolder sebagai penopang mekanis namun tidak terhubung ke jalur listrik mana pun.

| Ref | Pin ke Lubang `[Net]` | Aturan & Catatan Pemasangan Fisik |
| :--- | :--- | :--- |
| **`J1`** | `1 -> c2r1 [GND]`; `2 -> c2r2 [CANL]`; `3 -> c2r3 [CANH]`; `4 -> c2r4 [V12F]` | Konektor `1x4` pitch `2,54 mm` (`JST-XH`/`KF2510` terkunci). Urutan atas ke bawah: `GND (W3)`, `CANL (W7)`, `CANH (W4)`, `+12V_F (W9)`. |
| **`D1`** | `A -> c3r4 [V12F]`; `K -> c3r5 [N12D]` | `1N5819` **berdiri**. Anoda di `c3r4`, katoda (garis pita) di `c3r5`. Kaki `1N5822` terlalu tebal sehingga tidak dipakai. |
| **`TVS`** | `K -> c3r15 [N12D]`; `A -> c3r16 [GND]` | **Opsional** `P6KE18A` berdiri (`K` pita di `c3r15`, `A` di `c3r16`). Jalur `GND` pada `c3r16` tetap dipasang meski TVS tidak dirakit. |
| **`R5`** | `a -> c6r5 [N12D]`; `b -> c6r4 [VIN]` | `10 Ohm` berdiri vertikal (`a = +12V_D` di `c6r5`, `b = VIN` di `c6r4`). Shunt pengukur arus tidur. |
| **`JP`** | `a -> c7r5 [N12D]`; `b -> c7r6 [VIN]` | Header `2-pin` + jumper bypass berdiri. **Jumper wajib terpasang saat operasi normal.** |
| **`Q2`** | `S -> c4r6 [N12D]`; `D -> c4r7 [QD]`; `G -> c4r8 [G2]` | Adaptor `SOT-23 -> SIP-3` (`2-3-1 = S-D-G`) disolder **langsung** tanpa kawat ekstensi, vertikal di `c4` (`S` di utara). Zona `3x3` (`c3-c5 x r6-r8`) bersih dari kaki komponen lain. |
| **`R4`** | `b -> c6r6 [N12D]`; `a -> c6r8 [G2]` | `47 kOhm` **ditidurkan (flat)** mengangkangi `c6r6` dan `c6r8`. Lubang tengah `c6r7` dibiarkan kosong. |
| **`R1`** | `a -> c7r7 [QD]`; `b -> c7r8 [NODEM]` | `100 kOhm` berdiri vertikal (`a = drain Q2`, `b = Node M`). |
| **`R6`** | `a -> c4r9 [G2]`; `b -> c4r10 [QC]` | `27 kOhm` berdiri vertikal (`a = gate Q2`, `b = collector Q3`). |
| **`Q3`** | `C -> c4r11 [QC]`; `B -> c4r12 [QB]`; `E -> c4r13 [GND]` | `2N3904 TO-92` vertikal di `c4 r11-r13` dengan **sisi datar menghadap timur (ke `c5`)**. |
| **`R7`** | `b -> c5r10 [ADCT]`; `a -> c5r11 [QB]` | `10 kOhm` berdiri vertikal (`a = basis Q3`, `b = ADC_TRIG`). |
| **`R8`** | `a -> c5r12 [QB]`; `b -> c5r13 [GND]` | `100 kOhm` berdiri vertikal (`a = basis Q3`, `b = GND`). |
| **`U4`** | `IN- -> c8r2 [GND]`; `OUT- -> c16r2 [GND]`; `IN+ -> c8r7 [VIN]`; `OUT+ -> c16r7 [V33A]` | `MP1584 3.3V fix` di atas 4 pilar kawat (`3-4 mm`), tanpa diputar (`9x6` lubang). Pasang selotip Kapton di bawah modul. |
| **`U3`** | `CANL -> c22r2`; `CANH -> c22r3`; `CRX -> c22r4`; `CTX -> c22r5`; `GND -> c22r6`; `3V3 -> c22r7` | `WCMCU-230` **diputar 180 derajat** di soket `1x6` tinggi `8,5 mm` pada `c22`. Ditambah 2 pilar non-konduktif di `c17r2` dan `c19r7`. |
| **`Q1`** | `S -> c17r9 [V33A]`; `D -> c18r9 [V33CAN]`; `G -> c19r9 [G1]` | Adaptor `SOT-23 -> SIP-3` (`2-3-1 = S-D-G`) disolder **langsung**, horizontal pada baris `r9` (`S` di barat). Zona `3x3` (`c17-c19 x r8-r10`) bersih. |
| **`R3`** | `a -> c20r8 [G1]`; `b -> c22r8 [V33A]` | `47 kOhm` **ditidurkan (flat)** mengangkangi `c20r8` dan `c22r8`. Lubang tengah `c21r8` dibiarkan kosong. |
| **`C3`** | `b -> c15r10 [GND]`; `a -> c16r10 [V33CAN]` | `100 nF` keramik berdiri horizontal di `c15r10-c16r10`. |
| **`C1`** | `b -> c20r10 [GND]`; `a -> c20r11 [NODEM]` | `100 nF` keramik berdiri vertikal (`c20 r10-r11`) di bawah tepi `ZS-042`. |
| **`R2`** | `b -> c22r10 [GND]`; `a -> c22r11 [NODEM]` | `27 kOhm` **wajib 1/8 W** berdiri vertikal di `c22` agar tidak menekan selubung Dupont header `c23`. |
| **`U2`** | 6-pin kiri (`c7`): `r12 GND` (mati), `r13 VCC` (mati), `r14 SDA` (mati), `r15 SCL` (mati), `r16 SQW` (**aktif**), `r17 32K` (mati); 4-pin kanan (`c21`): `r13 GND`, `r14 VCC`, `r15 SDA`, `r16 SCL` (**semua aktif**) | `ZS-042` **diputar 180 derajat** pada soket `8,5 mm` (baterai menghadap ke atas). Lepas LED POWER dan dioda/resistor charger sebelum dipasang. |
| **`H`** | Strip `1x14` di `c23 r4-r17` (`r7` dan `r9` dicabut): `r4 CRX`, `r5 CTX`, `r6 GND1`, `r8 CAN_EN`, `r10 GND3`, `r11 ADC_OUT`, `r12 ADC_TRIG`, `r13 GND2`, `r14 3V3`, `r15 SDA`, `r16 SCL`, `r17 RTC_INT` | Tersisa **12 pin aktif**. Gunakan housing Dupont multi-way rata atau terminal female ber-heat-shrink; jangan menekuk pin. |
| **`JV1`** | `c16r8 -> c14r8 -> c14r12 -> c22r12 -> c22r14` | **Jumper atas tunggal** (`+/- 40 mm` kawat `26 AWG` berisolasi). Masukkan kedua ujung sebelum jalur bawah di `c16r8` dan `c22r14` disolder. |

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

Aturan umum penyolderan bawah: semua kawat menempel datar di permukaan papan (tanpa bertumpuk) dan kaki komponen dipotong maksimal `1 mm` agar tinggi kolong tetap `<= 2,5 mm`.

| Net | Segmen Jalur Bawah (`Tampak Bawah Cermin`) |
| :--- | :--- |
| **`GND`** (Busbar `r1`, cincin `c24`, `r18`, riser `c2`, cabang) | `c2r1->c23r1 (H)` ; `c23r1->c24r2 (D)` ; `c24r2->c24r17 (V)` ; `c24r17->c23r18 (D)` ; `c23r18->c2r18 (H)` ; `c2r18->c2r16 (V)` ; `c2r16->c3r16 (H)` ; `c8r1->c8r2 (V)` ; `c16r1->c16r2 (V)` ; `c24r6->c22r6 (H)` ; `c24r10->c20r10 (H)` ; `c24r13->c21r13 (H)` ; `c4r15->c4r13 (V)` ; `c3r16->c4r15 (D)` ; `c4r13->c5r13 (H)` ; `c14r9->c15r10 (D)` ; `c14r7->c14r9 (V)` ; `c16r5->c14r7 (D)` ; `c21r5->c16r5 (H)` ; `c22r6->c21r5 (D)` |
| **`V12F`** (`+12V_F` sebelum `D1`) | `c2r4->c3r4 (H)` |
| **`N12D`** (`+12V_D` setelah `D1`) | `c3r5->c4r6 (D)` ; `c4r6->c6r6 (H)` ; `c6r6->c6r5 (V)` ; `c6r5->c7r5 (H)` |
| **`VIN`** (setelah `R5`/`JP` -> `U4 IN+`) | `c8r7->c7r6 (D)` ; `c7r4->c6r4 (H)` ; `c8r5->c7r4 (D)` ; `c7r6->c8r5 (D)` |
| **`V33A`** (`3V3_MAIN` sisi buck & `Q1.S`) | `c16r8->c17r9 (D)` ; `c16r7->c16r8 (V)` ; `c21r7->c22r8 (D)` ; `c20r7->c21r7 (H)` ; `c19r8->c20r7 (D)` ; `c18r8->c19r8 (H)` ; `c17r9->c18r8 (D)` |
| **`V33B`** (`3V3_MAIN` sisi RTC & Header via `JV1`) | `c21r14->c23r14 (H)` |
| **`V33CAN`** (`3V3_CAN` drain `Q1` -> `U3` & `C3`) | `c15r9->c16r10 (D)` ; `c15r7->c15r9 (V)` ; `c16r6->c15r7 (D)` ; `c21r6->c16r6 (H)` ; `c22r7->c21r6 (D)` ; `c17r10->c18r9 (D)` ; `c16r10->c17r10 (H)` |
| **`CANL`** (`J1.2` -> `U3.CANL`) | `c21r3->c22r2 (D)` ; `c8r3->c21r3 (H)` ; `c7r2->c8r3 (D)` ; `c2r2->c7r2 (H)` |
| **`CANH`** (`J1.3` -> `U3.CANH`) | `c21r4->c22r3 (D)` ; `c8r4->c21r4 (H)` ; `c7r3->c8r4 (D)` ; `c2r3->c7r3 (H)` |
| **`CRX`** (`U3.CRX` -> `H.CRX GPIO4`) | `c22r4->c23r4 (H)` |
| **`CTX`** (`U3.CTX` -> `H.CTX GPIO5`) | `c22r5->c23r5 (H)` |
| **`SDA`** (`U2.SDA4` -> `H.SDA GPIO21`) | `c21r15->c23r15 (H)` |
| **`SCL`** (`U2.SCL4` -> `H.SCL GPIO22`) | `c21r16->c23r16 (H)` |
| **`SQW`** (`U2.SQW` -> `H.RTC_INT GPIO32`) | `c21r17->c23r17 (H)` ; `c20r16->c21r17 (D)` ; `c7r16->c20r16 (H)` |
| **`G1`** (`H.CAN_EN GPIO26` -> `R3.a` -> `Q1.G`) | `c21r9->c20r8 (D)` ; `c22r9->c21r9 (H)` ; `c23r8->c22r9 (D)` ; `c20r8->c19r9 (D)` |
| **`G2`** (`Gate Q2` -> `R4.a` & `R6.a`) | `c4r8->c4r9 (V)` ; `c4r8->c6r8 (H)` |
| **`QD`** (`Drain Q2` -> `R1.a`) | `c4r7->c7r7 (H)` |
| **`QC`** (`R6.b` -> `Collector Q3`) | `c4r10->c4r11 (V)` |
| **`QB`** (`Base Q3` -> `R7.a` -> `R8.a`) | `c4r12->c5r12 (H)` ; `c5r12->c5r11 (V)` |
| **`ADCT`** (`H.ADC_TRIG GPIO27` -> `R7.b`) | `c6r11->c5r10 (D)` ; `c7r11->c6r11 (H)` ; `c8r12->c7r11 (D)` ; `c23r12->c8r12 (H)` |
| **`NODEM`** (`R1.b` -> `C1.a` -> `R2.a` -> `H.ADC_OUT GPIO34`) | `c10r11->c23r11 (H)` ; `c10r11->c7r8 (D)` |
| **`K32`** (`U2.32K` dan pad mati 6-pin kiri) | Pad mati tanpa jalur (`c7r12..c7r15`, `c7r17`) disolder mekanis |

- **Segmen Opsional TVS (`P6KE18A`)**: tambahkan kawat berisolasi `+12V_D: c4r6->c3r7 (D) ; c3r7->c3r15 (V)` (`+/- 22 mm` sejajar riser `c2`) hanya apabila komponen `TVS` dipasang.
- **Jalur Melintas di Bawah Modul**: di bawah `MP1584` hanya terdapat kawat tipis `CAN_L` dan `CAN_H`; di bawah `ZS-042` terdapat jalur bawah `SQW (r16)`, sebagian `ADC_TRIG`/`NODEM`, dan jumper atas `JV1` pada baris `r12`.

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

Legenda net: `0`=`GND`, `F`=`+12V_F`, `D`=`+12V_D`, `I`=`VIN`, `3`/`4`=`3V3`, `C`=`3V3_CAN`, `L`=`CAN_L`, `H`=`CAN_H`, `X`=`CRX`, `T`=`CTX`, `S`=`SDA`, `K`=`SCL`, `Q`=`SQW`, `1`=`CAN_EN`, `2`=`Gate Q2`, `d`=`Drain Q2`, `c`=`Collector Q3`, `b`=`Base Q3`, `A`=`ADC_TRIG`, `M`=`Node M`.

---

## 6. Spesifikasi Kawat & Aturan Fisik Ruang

### Ukuran Kawat Berdasarkan Fungsi Arus

| Kelompok Jalur | Estimasi Panjang | Spesifikasi Kawat | Alasan Teknis |
| :--- | :--- | :--- | :--- |
| Busbar `r1` dan cincin `c24` | `+/- 95 mm` | Tembaga tunggal polos/tinned `22 AWG (+/- 0,64 mm)` | Membawa seluruh arus balik ESP32 dan modul menuju `J1.1` (`H.GND -> c24 -> r1 -> c2r1`). |
| Busbar `r18` | `+/- 57 mm` | Tembaga tunggal polos `24 AWG (+/- 0,50 mm)` | Hanya menanggung arus mikro (`Q3`, `R8`). |
| Riser `c2` (`c2r16->c2r18->c3r16`) | `+/- 8 mm` | Tembaga `24 AWG` | Bagian `r6-r15` pada `c2` tidak memiliki koneksi sehingga tidak dipasang. |
| Jalur daya `+12V` (`V12F`, `N12D`, `VIN`), `3V3_MAIN` (`V33A`, `V33B`), `JV1` | `+/- 16 + 27 + 40 mm` | `26 AWG` tunggal berisolasi | `JV1 + V33A + V33B` menyalurkan suplai utama `3,3 V` ke ESP32 dan RTC. |
| Jalur sinyal (`CAN_L/H`, `Node M`, `ADC_TRIG`, `SQW`, `SDA/SCL`, `CRX/CTX`, `CAN_EN`, gate/basis, `3V3_CAN`) | `+/- 330 mm` | Wire-wrapping wire `30 AWG` solid (`Kynar`/`PVC`) | Arus sinyal `< 20 mA`; tipis dan rata menjaga kolong `<= 2,5 mm`. |
| Cabang `GND` lokal dekat modul | `+/- 79 mm` | `30 AWG` berisolasi | Arus balik sinyal lokal. |

- Total kebutuhan beli (ditambah cadangan `30%`): `22 AWG +/- 130 mm`, `24 AWG +/- 90 mm`, `26 AWG +/- 110 mm`, `30 AWG +/- 530 mm`.
- Kupas isolasi Kynar `1,5-2 mm` memakai stripper `30 AWG`, lalu tempelkan kawat di permukaan pad sisi bawah tanpa menjejalkan ke dalam lubang. Hindari kawat email dan hindari penyambungan potongan pendek untuk busbar panjang `53-56 mm`.
- Kabel harness eksternal menuju `J1` wajib menggunakan ribbon 4-kawat (`W3`, `W4`, `W7`, `W9`) dengan terminal crimp `JST-XH` (jangan memakai jumper Dupont lepas di dalam kendaraan).

### Batasan Ruang & Mekanik Modul

- **Di bawah `MP1584` (pilar `3-4 mm`)**: hanya dilewati kawat sinyal tipis dengan lapisan isolasi selotip Kapton di bawah modul.
- **Di bawah `WCMCU-230` dan `ZS-042` (soket `8,5 mm`)**: hanya diizinkan komponen rendah (`C1` keramik, `R3`/`R4` rebah, kawat datar); **dilarang memasang resistor berdiri di bawah badan modul**.
- **Header `c23` vs Soket `U3` / `R2` di `c22`**: jarak hanya `1 pitch` (`2,54 mm`), dengan celah ke selubung Dupont tersisa sekitar `0,08 mm`. Wajib menggunakan housing `multi-way` rata atau terminal heat-shrink, memakai `R2` ukuran `1/8 W`, dan lulus uji dry-fit (**G2**).

---

## 7. Alur Perakitan Bertahap & Uji Kontinuitas

### Prosedur 4 Tahap Perakitan

1. **Tahap 0 - Persiapan Tanpa Solder (`+/- 45 menit`)**:
   - Tandai orientasi `c1` (sisi kiri kabel pita), `r1` (sisi atas), serta empat lubang sudut kosong pada papan polos.
   - Ukur gerbang fisik **G1** dan lakukan dry-fit **G2** (ukur **G4** hanya jika **G2** gagal).
   - Uji seluruh komponen terpisah: `D1` mode dioda (`~0,15-0,35 V`), kedua `AO3401A` body diode `D->S ~0,5 V`, uji fungsi `2N3904` (**E7**: titik `G ~ 4,4 V` saat basis diberi `3,3 V` via `10k`), serta ukur nilai Ohm semua resistor (`10`, `10k`, `27k x2`, `47k x2`, `100k x2`) agar tidak tertukar.
2. **Tahap A - Blok Kiri, `MP1584`, & Busbar Tepi** *(mulai setelah Tahap 0 poin 3)*:
   - Solder komponen blok kiri: `D1`, `R5`, `JP`, `Q2` (pin `2/S` utara di `c4r6`), `R4` rebah (`c6r6-c6r8`), `R6`, `R1`, `Q3`, `R7`, `R8` (dan `TVS` jika dipasang).
   - Pasang `MP1584` di atas 4 pilar kawat + Kapton, pasang soket `ZS-042` (`c7 r12-r17` dan `c21 r13-r16`), serta konektor `J1` (`c2 r1-r4`).
   - Pasang busbar `GND` tepi (`r1`, `c24`, `r18`, riser `c2`) dan jalur lokal blok kiri.
   - **Uji A** (PSU `12 V` bersekring, batas arus `100 mA`, **tanpa modul lain**, jumper `JP` terpasang): `+12V_D ~ Vin - 0,20..0,35 V`, `VIN` setara `+12V_D`, output `MP1584` tanpa beban terbaca `3,2-3,4 V`.
3. **Tahap B - Sisi Kanan, `JV1`, & Header `c23`** *(mulai setelah **G1** dan **G2** lulus)*:
   - **Pasang jumper atas `JV1` lebih dahulu** ke lubang `c16r8` dan `c22r14` sebelum jalur bawah di kedua lubang itu disolder.
   - Pasang soket `U3` (`c22 r2-r7`) dan 2 pilar non-konduktif (`c17r2`, `c19r7`).
   - Pasang `Q1` (`S` di `c17r9`), `R3` rebah (`c20r8-c22r8`), `C3`, `C1`, dan `R2 (1/8 W)`.
   - Tarik jalur `CAN_L`, `CAN_H`, `3V3_MAIN`, `3V3_CAN`, `CAN_EN`, `Node M`, `ADC_TRIG`, `SQW`, `SDA`, `SCL`, `3V3` sisi RTC, dan sisa cabang `GND`.
   - Cabut pin `r7` dan `r9` dari strip `1x14`, lalu solder lurus di `c23 r4-r17`.
   - **Uji B** (tanpa daya dan tanpa modul): verifikasi matriks kontinuitas penuh di bawah ini, khususnya pastikan slot `J1.2` ke `U3.CANL` dan `J1.3` ke `U3.CANH`.
4. **Tahap C - Integrasi Modul & Uji Kalibrasi**:
   - Modifikasi modul `ZS-042`: lepas LED POWER dan resistor/dioda rangkaian pengisi baterai agar aman bagi sel primer `CR2032`.
   - Pasang `WCMCU-230` dan `ZS-042` satu per satu sambil memantau arus dari PSU `12 V`.
   - Hubungkan ESP32 Base (**dilarang menyalakan USB dan 12 V secara bersamaan**; pertahankan jumper Base di posisi `3,3 V`).
   - Ukur `Vgs Q2` saat ON/OFF (**E2**), jalankan kalibrasi DMM SOP C.1, dan ukur arus tidur (**E5**).

### Matriks Uji Kontinuitas Multimeter (Tanpa Daya & Tanpa Modul)

- **Wajib Berbunyi (Tersambung)**:
  - `J1.1 <-> U4.IN- <-> U4.OUT- <-> U3.GND <-> H.GND1/2/3 <-> Q3.E <-> R8.b <-> C1.b <-> R2.b <-> C3.b (<-> TVS.A)`
  - `J1.4 <-> D1.A` ; `D1.K <-> Q2.S <-> R4.b <-> R5.a <-> JP.a` ; `R5.b <-> JP.b <-> U4.IN+`
  - `Q2.D <-> R1.a` ; `Q2.G <-> R4.a <-> R6.a` ; `R6.b <-> Q3.C` ; `Q3.B <-> R7.a <-> R8.a`
  - `R1.b <-> R2.a <-> C1.a <-> H.ADC_OUT` ; `R7.b <-> H.ADC_TRIG`
  - `U4.OUT+ <-> Q1.S <-> R3.b <-> lubang JV1 c16r8` ; `ujung JV1 c22r14 <-> U2.VCC(4p) <-> H.3V3`
  - `Q1.D <-> U3.3V3 <-> C3.a` ; `Q1.G <-> R3.a <-> H.CAN_EN`
  - `J1.2 <-> U3.CANL` ; `J1.3 <-> U3.CANH` ; `U3.CRX <-> H.CRX` ; `U3.CTX <-> H.CTX`
  - `U2.SDA(4p) <-> H.SDA` ; `U2.SCL(4p) <-> H.SCL` ; `U2.SQW <-> H.RTC_INT`
- **Wajib Tidak Berbunyi (Terisolasi)**:
  - `GND <-> J1.4` ; `GND <-> +12V_D` ; `+12V_D <-> 3V3_MAIN` ; `3V3_MAIN <-> 3V3_CAN` ; `CAN_L <-> CAN_H` ; `ADC_OUT <-> ADC_TRIG`
  - `Q2.S <-> Q2.D` ; `Q2.D <-> Q2.G` ; `Q1.S <-> Q1.D` ; `Q1.D <-> Q1.G`
  - *(Catatan pengukuran: `Q2.S <-> Q2.G` hanya terbaca `47 kOhm` via `R4`; `Q1.S <-> Q1.G` hanya terbaca `47 kOhm` via `R3`, tidak boleh short `0 Ohm`.)*

---

## 8. Daftar Gerbang Verifikasi Bersyarat (`G1..G5` & `E1..E7`)

### Gerbang Fisik (Pra-Solder Tahap B)

| ID | Bagian yang Diukur | Kriteria Lulus | Status | Rencana Revisi Bila Gagal |
| :--- | :--- | :--- | :--- | :--- |
| **`G1`** | Jarak pusat pin 1 dan 6 `WCMCU-230` ke tepi badan modul dan komponen tertinggi | Margin pin ke tepi bawah `>= 1,1 mm` (badan berakhir `<= r7,45`) | Belum diukur | Geser `Q1` (blok `r8-r10`) ke posisi baru. |
| **`G2`** | Dry-fit soket `1x6` di `c22` vs selubung Dupont di `c23` | Tidak saling menekan; lebar selubung `<= 2,54 mm` | Belum diukur | Geser `U3` dan `R2` ke kolom `c21`. |
| **`G3`** | Adaptor `SOT-23 -> SIP-3` (`2-3-1 = S-D-G`) | Kontinuitas `2-3-1 = S-D-G` dan tinggi `< 6 mm` | **Lulus** | Terkonfirmasi; disolder langsung tanpa kawat ekstensi. |
| **`G4`** | Tinggi komponen `MP1584` di `2,5 mm` terakhir tepi kanan | Celah ke dasar `WCMCU` (`8,5 mm`) `>= 1 mm` bila tumpang tindih | Belum diukur | Wajib diukur hanya jika `G2` gagal. |
| **`G5`** | Ukuran papan adaptor (`P x L`) dan posisi baris pin | `<= 7,6 x 7,6 mm` dengan baris pin di tengah blok `3x3` | Belum diukur | Perbesar blok keep-out dengan re-route minor. |

### Gerbang Elektrikal

| ID | Sirkuit Pengujian | Kriteria / Temuan | Status |
| :--- | :--- | :--- | :--- |
| **`E1`** | Output `MP1584` tanpa beban | Stabil `3,33 V` pada input `3S 11,91 V`; ulangi pada `12,6 V` dan `+/- 14 V`. | Sebagian lulus |
| **`E2`** | Sakelar ADC `Q2`/`Q3` + pembagi `R1`/`R2` | OFF: `Node M = 0,00 V`; ON pada v2.0 diharapkan `Vgs ~ -7,6 V` (`11,9 V`) s/d `-9,1 V` (`14,4 V`). | Ukur ulang di prototipe v2.0 |
| **`E3`** | Sakelar CAN `Q1` (`GPIO26 Active-LOW`) | OFF `= 0,00 V`, ON `= 3,33 V`. | **Lulus** |
| **`E4`** | Polaritas `GPIO27` (`ADC_TRIG`) | Perangkat keras **Active-HIGH**; cocok dengan [sketch_oct16aa.ino](file:///d:/magang/v1/pixel-twin-workbench/firmware/sketch_oct16aa/sketch_oct16aa.ino). | Konfirmasi firmware |
| **`E5`** | Arus tidur DevKit + Base via shunt `R5` | Mengukur arus gabungan dengan `JP` dilepas (`< 500 uA`). | Belum diukur |
| **`E6`** | Uji dioda `D1` dan polaritas `TVS P6KE18A` | `1N5819` drop forward `0,15-0,35 V`; pastikan arah pita katoda. | Belum dilaporkan |
| **`E7`** | Uji fungsi `Q3` + pembagi gate `R4`/`R6` | Titik `G ~ 4,4 V` saat basis `3,3 V` dan `~ 12 V` saat basis `GND`. | Wajib sebelum `Q3` disolder |
