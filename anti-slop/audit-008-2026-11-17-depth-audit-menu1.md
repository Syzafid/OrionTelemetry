# AUDIT 008: Audit Menyeluruh Menu 1 Dashboard (Showroom & Topologi Kelistrikan)

**Tanggal**: 2026-11-17  
**Scope**: `src/components/hmi/ShowroomModule.tsx`, `src/components/hmi/VehicleTopologyMap.tsx`, `src/components/hmi/ComponentNodeInspector.tsx`, `src/components/hmi/Stage3D.tsx`  
**Status**: **NEED REFINEMENT (Pembersihan Slop Lanjutan & Standar Craftsmanship C-1 s/d C-5)**  
**Framework**: Anti-Slop Filter (`antislop.md`) Mode 2 (AFTER Audit)  

---

## 1. Executive Summary & Diagnosa Utama

Penggantian model 3D generik berputar dengan **Diagram Topologi Kelistrikan Sasis Vektor (Pajero Sport 1:1 OEM)** dan **Matriks Data Stream Diagnostik (SAE J1979 / MUT-III)** pada Task 1 sudah berada pada arah arsitektur industri yang tepat.

Namun, pengujian mendalam terhadap kode dan interaksi pengguna menunjukkan bahwa implementasi saat ini masih menyimpan **8 sisa pola AI Slop (subtle slop)** yang melanggar aturan Hard Gate (R-02, R-03, R-32, R-38, R-39), Purpose Gate (R-01, R-10), dan Craftsmanship Standards (C-1 s/d C-5):

1. **Fake Oscilloscope Waveform (C-5 & R-38)**: Gelombang osiloskop di tabel diagnostik menggunakan koordinat SVG statis yang di-*hardcode*, tidak berubah atau berdenyut saat telemetri 5 detik masuk.
2. **Mobile Chassis Clipping (R-03)**: Sasis dipaksa `min-w-[820px]` di dalam wadah `overflow-x-auto`, memotong modul ESP32 dan Antena RF pada layar ponsel < 768px.
3. **Ghost Keyboard Focus (R-32 & R-39)**: Titik probe SVG memiliki `tabIndex={0}` tetapi browser tidak merender cincin fokus visual sama sekali pada elemen `<g>` SVG.
4. **Sisa Orbs Bercahaya (R-01)**: Latar belakang panggung masih memuat elips gradien radial AI (`radial-gradient(ellipse_at_50%_75%...)`).
5. **Kurangnya Hierarki Seleksi Simpul (C-1)**: Memilih filter probe (misal: "AKI 12V") memfilter tabel bawah, tetapi diagram sasis di atas tetap menyalakan semua probe lain tanpa peredupan (*dimming*).
6. **Redundant Glassmorphism (R-10)**: Penggunaan kelas `.glass` dan `backdrop-blur-md` pada badge VIN dan panel HUD padahal panggung berada pada panel solid.
7. **Kepadatan Tabel di Layar Kecil (C-4 & R-03)**: Tabel matriks sensor `min-w-[700px]` memaksa scroll horisontal di ponsel tanpa opsi tampilan kartu diagnostik padat.
8. **Label Telemetri Fallback yang Janggal (R-16)**: Tulisan "CAN & Seq / CAN & Boot" pada sidebar telemetri terkesan sebagai logika string mentah yang belum dipoles.

---

## 2. Numbered Findings List (Daftar Temuan Berurutan)

| No | Aturan yang Dilanggar | Prioritas | Temuan / Pelanggaran AI Slop yang Teridentifikasi |
|:---|:---|:---:|:---|
| **#1** | **C-5** (Evidence Over Claims) & **R-38** (Real Content / No Fabricated Waveforms) | **HIGH** | **MiniWaveform Osiloskop Palsu**: Pada `ComponentNodeInspector.tsx`, gelombang SVG menggunakan string koordinat statis `"0,14 15,13 30,14..."`. Gelombang ini tidak merespons perubahan voltase baterai ($V_{bat}$), ripple alternator saat charging, frekuensi pulsa RPM mesin, maupun error CAN bus. Ini adalah representasi dekoratif fiktif (*fake telemetry*). |
| **#2** | **R-03** (Mobile Responsiveness / No Clipping) | **HIGH** | **Sasis Terpotong di Layar Ponsel**: Pada `VehicleTopologyMap.tsx` baris 96, SVG sasis dipatok `min-w-[820px]` dengan pembungkus `overflow-x-auto`. Pada smartphone (layar 360px - 430px), Probe 05 (ESP32) dan Probe 06 (RF Antena) tersembunyi di luar layar dan memaksa teknisi melakukan panning horizontal kikuk. |
| **#3** | **R-32** (Keyboard Accessibility) & **R-39** (Interaction Affordances & Focus Indicators) | **HIGH** | **Cincin Fokus Papan Ketik Hilang**: Elemen probe SVG `<g tabIndex={0} role="button">` dapat menerima fokus navigasi `Tab`, namun mayoritas browser (Chromium/Firefox) tidak merender *focus ring outline* pada elemen grafis SVG. Pengguna papan ketik tidak dapat melihat probe mana yang sedang aktif disorot. |
| **#4** | **R-01** (Color & Radial Glow Background) | **MEDIUM** | **Radial Glow Orb Tertinggal**: Pada `ShowroomModule.tsx` baris 40, masih terdapat elemen dekoratif khas AI: `<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_75%,oklch(0.20_0.01_265/0.8),transparent_70%)]" />`. Latar belakang harus menggunakan surface solid industri murni. |
| **#5** | **C-1** (Intentionality & Visual Hierarchy) | **MEDIUM** | **Hierarki Visual Sasis Tidak Fokus Saat Filter Dipilih**: Ketika teknisi mengklik tombol "AKI 12V", tabel data di bawah terfilter, tetapi pada diagram sasis atas ke-5 probe lainnya tetap menyala dengan kontras yang sama persis tanpa peredupan (*opacity dimming*). |
| **#6** | **R-10** (Glassmorphism Dose Cap) | **LOW** | **Glassmorphism Redundan Tanpa Latar Transparan**: Kelas `.glass` dan `backdrop-blur-md` masih digunakan pada badge VIN (baris 128) dan HUD atas (baris 163, 224) padahal panggung sekarang sudah menggunakan kartu solid opaque `--card`. |
| **#7** | **C-4** (Resilience) & **R-03** (Mobile Responsiveness) | **MEDIUM** | **Tabel Matriks Sensor Memaksa Scroll Lebar di Ponsel**: Tabel `min-w-[700px]` pada `ComponentNodeInspector.tsx` memotong kolom *LIVE WAVEFORM* dan *RENTANG* di layar < 640px. Perlu adaptasi tampilan responsif (kartu telemetri ringkas di mobile atau sticky header kolom utama). |
| **#8** | **R-06** (Typography) & **R-16** (Copywriting / Content Clarity) | **LOW** | **Label Stat Sidebar Mentah**: Label stat `label={t.seq !== undefined ? "CAN & Seq" : "CAN & Boot"}` pada sidebar menampilkan string kondisi mentah tanpa nomenklatur otomotif standar. Seharusnya ditampilkan terpisah sebagai saluran bus CAN dan nomor urut paket. |

---

## 3. Rencana Tindakan Perbaikan (Actionable Solutions)

### Solusi untuk Temuan #1 (Real Oscilloscope Waveforms):
- Ganti fungsi `MiniWaveform` statis menjadi kalkulator kurva dinamis yang terikat pada data telemetri aktual:
  - **Aki 12V**: Amplitudo gelombang berfluktuasi secara dinamis mengikuti variasi desimal `t.v_bat` dan `t.adc_raw_mv` terkini.
  - **Alternator**: Jika `isCharging = true`, riak 3-fase alternator bergerak mulus mengikuti nomor paket `(t.seq % 6)`; jika mesin mati, kurva berupa garis datar (*flatline* 0V).
  - **RPM Poros Engkol**: Kerapatan gelombang pulsa *crank reluctance sensor* bertambah rapat sebanding dengan nilai `t.rpm` (flatline jika 0 RPM).
  - **CAN TWAI**: Menampilkan pulsa biner diferensial CAN-H/CAN-L aktif saat `t.can_ok = true`, atau garis noise terputus-putus saat terjadi `BUS_FAULT`.

### Solusi untuk Temuan #2 (Mobile Chassis Auto-Fit):
- Hapus batasan `min-w-[820px]` dan pembungkus `overflow-x-auto` yang kaku pada `VehicleTopologyMap.tsx`.
- Gunakan konfigurasi SVG responsif murni: `w-full h-auto aspect-[2.4/1] max-h-[360px]` dengan `viewBox="0 0 960 400"` dan `preserveAspectRatio="xMidYMid meet"`. Seluruh sasis Pajero Sport dan ke-6 probenya akan pas secara otomatis di layar selebar 360px tanpa ada komponen yang terpotong.

### Solusi untuk Temuan #3 (Cincin Fokus Aksesibilitas SVG):
- Tambahkan status `focusedNode` pada state komponen atau berikan atribut styling SVG `:focus-visible`:
  - Saat probe menerima fokus keyboard, tampilkan cincin SVG luar selebar 2.5px berwarna putih kontras (`stroke="#F2EFE9" strokeDasharray="4 2" strokeWidth="2.5"`).
  - Pastikan tombol `Enter` dan `Spasi` mengeksekusi seleksi simpul secara konsisten.

### Solusi untuk Temuan #4 & #6 (Pembersihan Orbs & Glassmorphism):
- Hapus elemen elips gradien radial pada baris 40 `ShowroomModule.tsx`.
- Ganti kelas `.glass` pada badge VIN dan HUD dengan styling panel solid industri (`bg-background/90 border border-border rounded-[2px]`).

### Solusi untuk Temuan #5 (Peredupan Probe Non-Aktif):
- Ketika `activeNode !== "all"`, berikan kelas transisi `opacity-30 pointer-events-auto` pada grup probe yang tidak terpilih, dan pertahankan `opacity-100` pada probe yang aktif, sehingga pandangan teknisi langsung terarah ke simpul komponen yang sedang diinspeksi.

### Solusi untuk Temuan #7 (Mobile Card Layout untuk Data Stream):
- Sediakan layout adaptif: di layar desktop (`md:block`) tampilkan tabel matriks lengkap 6 kolom, di layar ponsel (`md:hidden`) tampilkan kartu daftar saluran sensor yang kompak dan mudah di-scroll vertikal tanpa scroll horisontal.

### Solusi untuk Temuan #8 (Pembersihan Label Telemetri):
- Perbaiki label sidebar menjadi nomenklatur standar: `CAN Bus TWAI` dan `Uplink Sequence`.

---

## 4. Konfirmasi User (Delivery Gate Mode 2)

Sesuai aturan **Anti-Slop Mode 2 (AFTER)**:
1. Tidak ada file kode yang diubah sebelum Anda menyetujui nomor temuan tertentu.
2. Silakan tentukan nomor temuan yang ingin dieksekusi (contoh: **"Perbaiki semua #1 sampai #8"** atau pilih nomor spesifik seperti **"#1, #2, #3, #5"**).
3. Setelah Anda mengonfirmasi, perbaikan akan langsung dikerjakan, diuji (`npm run build`), dan dilaporkan secara transparan.
