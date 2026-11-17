# AUDIT 007 — Review Mendalam & Pembersihan Slop Lanjutan (Dashboard Menu 1)

**Tanggal**: 2026-11-17  
**Scope**: `src/components/hmi/ShowroomModule.tsx`, `src/components/hmi/VehicleTopologyMap.tsx`, `src/components/hmi/ComponentNodeInspector.tsx`  
**Hasil Review**: **NEED REFINEMENT (Pembersihan Lanjutan / Liveliness & Real Evidence)**  
**Diagnosa Utama**: Arah sasis dan matriks tabel sudah benar, namun masih terdapat 5 jejak AI slop halus (*subtle AI slop*) yang perlu dibersihkan untuk mencapai standar *Craftsmanship C-1 s/d C-5*.

---

## 1. Numbered Findings List (Temuan Audit 007)

| No | Aturan | Prioritas | Temuan / Pelanggaran Antislop yang Masih Tersisa |
|:---|:---|:---:|:---|
| **#1** | **C-5** (Evidence Over Claims) & **R-38** (Real Content) | **HIGH** | Kolom `LIVE WAVEFORM` pada `ComponentNodeInspector.tsx` saat ini menggunakan titik koordinat SVG statis yang di-*hardcode* (`"0,14 15,13 30,14..."`). Ini adalah klaim palsu (*fake oscilloscope*); bentuk gelombang tidak bergerak atau berfluktuasi saat telemetri 5 detik diperbarui. |
| **#2** | **R-01** (Radial Orbs & Glow Background) | **MEDIUM** | Pada `ShowroomModule.tsx` baris 36 masih tertinggal elemen glow orbs AI: `<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_75%...)]" />`. Latar belakang harus bersih dari gradasi elips dekoratif. |
| **#3** | **R-03** (Mobile Responsiveness / Min-Width Overflow) | **HIGH** | `VehicleTopologyMap.tsx` memaksakan `min-w-[820px]` dengan `overflow-x-auto`. Di layar ponsel (< 768px), teknisi terpaksa menggeser layar secara horizontal (pan horisontal) untuk melihat Probe 05 dan 06. Seharusnya SVG dibuat responsif (*preserveAspectRatio / viewbox auto-fit*) atau menyediakan toggle orientasi ramah mobile. |
| **#4** | **C-1** (Intentionality & Visual Hierarchy) | **MEDIUM** | Saat tombol filter simpul diklik (misal: "AKI 12V"), tabel data di bawah terfilter rapi, namun di diagram sasis atas semua probe lainnya tetap menyala penuh tanpa efek fokus (redupkan probe non-aktif ke opacity 0.35 agar hierarki visual fokus pada simpul yang dipilih). |
| **#5** | **R-32** (Keyboard Accessibility) & **R-39** (Focus Indicator) | **HIGH** | Titik probe di dalam SVG menggunakan elemen `<g tabIndex={0} role="button">`. Sebagian besar browser (Chrome/Edge) tidak menampilkan outline cincin fokus default pada elemen grup SVG `<g>` saat tombol Tab ditekan, melanggar aksesibilitas navigasi papan ketik. |
| **#6** | **R-10** (Glassmorphism Dose Cap) | **LOW** | Kelas `.glass` dengan `backdrop-blur-md` masih digunakan pada badge VIN dan strip HUD lama padahal panggung sekarang sudah menggunakan panel solid tanpa canvas 3D di belakangnya. |

---

## 2. Solusi Teknis Perbaikan (Actionable Craftsmanship Fixes)

### 1. Ubah MiniWaveform Menjadi Real Oscilloscope Trace (C-5 & R-38)
- Sambungkan gelombang ke data telemetri historis / generator riak dinamis berbasis parameter aktual:
  - Untuk Aki: Variasikan amplitudo gelombang sesuai fluktuasi desimal voltase ($V_{bat}$ dan $mV$ ADC).
  - Untuk Alternator: Saat charging aktif ($\ge 13.2\text{V}$), riak 3-fase bergerak secara halus (*smooth scrolling phase*), dan menjadi garis datar mutlak saat mesin mati.
  - Untuk RPM: Frekuensi pulsa gigi kruk as sebanding dengan nilai RPM aktual (misal: 750 RPM menghasilkan pulsa rapat, 0 RPM menghasilkan flatline).

### 2. Hapus Radial Gradient Orb di `ShowroomModule.tsx` (R-01)
- Hapus baris `bg-[radial-gradient(ellipse_at_50%_75%...)]`.
- Gunakan surface solid industri murni yang menyatu dengan token tema `--carbon` dan `--hairline`.

### 3. Responsivitas Sasis untuk Layar Mobile (R-03)
- Hapus `min-w-[820px]` yang memaksa scroll horisontal.
- Gunakan `w-full h-auto max-h-[380px] aspect-[2.4/1]` dengan `viewBox="0 0 960 400"`, sehingga seluruh badan mobil Pajero Sport dan ke-6 probenya terlihat utuh di layar ponsel tanpa terpotong atau harus digeser.

### 4. Hierarki Seleksi Simpul Dinamis (C-1)
- Ketika `activeNode !== "all"`, probe yang tidak dipilih diturunkan opacity-nya ke `opacity-30` secara transisional.
- Probe yang dipilih mendapatkan cincin aksen kontras tinggi dan garis penunjuk yang menyala jelas.

### 5. Aksesibilitas Keyboard SVG Sempurna (R-32 & R-39)
- Berikan style `:focus-visible` eksplisit pada grup SVG atau bungkus dalam elemen interaktif standar, dengan cincin fokus SVG selebar 2px (`stroke="#F2EFE9" strokeWidth="2"`).
