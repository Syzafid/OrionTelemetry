# AUDIT 009: Audit Sistemik Lanjutan Menu 1 Dashboard (Showroom & Topologi Sasis)

**Tanggal**: 2026-11-17  
**Scope**: `src/components/hmi/ShowroomModule.tsx`, `src/components/hmi/VehicleTopologyMap.tsx`, `src/components/hmi/ComponentNodeInspector.tsx`, `src/components/hmi/Stage3D.tsx`  
**Status**: **NEED REFINEMENT (Pembersihan Lanjutan / Arsitektur & Keterbacaan Mobile)**  
**Framework**: Anti-Slop Filter (`antislop.md`) Mode 2 (AFTER Audit)  

---

## 1. Executive Summary & Diagnosa Lanjutan

Setelah perbaikan pada Audit 008, stabilitas teknis dan waveform dinamis telah bekerja secara autentik. Namun, pengujian ergonomi pada berbagai ukuran layar (*viewport audit*) dan penelusuran arsitektur antarmuka mengungkap **6 temuan AI Slop sistemik baru**:

1. **Illegible SVG Text Scaling on Mobile (R-03 & R-25)**: Pada layar smartphone (< 640px), teks tag probe yang berada di dalam SVG (viewBox 960x400) mengecil menjadi ~3.2px secara optik sehingga mustahil dibaca oleh teknisi di lapangan tanpa pinch-to-zoom.
2. **Residual Three.js 1MB 3D Toy (C-3 & R-40)**: Tombol toggle `[3D Twin]` masih memuat bundle Three.js sebesar ~994 kB yang hanya menampilkan model SUV mainan berputar dengan roda berputar dan pipa neon melayang. Ini adalah artefak AI slop murni yang tidak memiliki nilai diagnostik industri.
3. **Redundant Quadruple Metric Stacking (C-3)**: Nilai voltase baterai, RPM, coolant, dan bus CAN ditampilkan serempak di 4 lokasi berbeda pada satu layar: (1) tag callout sasis, (2) panel Live Payload di sidebar, (3) bilah Live Telemetry State Bar di bawah panggung, dan (4) tabel ComponentNodeInspector di bawah sasis.
4. **Interactive Hotspot Depth (C-2 & R-26)**: Memilih probe saat ini hanya memfilter 2 baris tabel di bawahnya tanpa menyajikan informasi diagnostik mendalam yang nyata bagi teknisi (seperti pinout J1962: Pin 16 B+, Pin 4/5 GND, Pin 6 CAN-H, Pin 14 CAN-L, kode warna kabel harness, atau prosedur uji MUT-III).
5. **Duplikasi Daftar Unit di Layar Ponsel (R-03)**: Pada perangkat mobile, daftar unit mobil dirender dua kali: sekali di baris geser horizontal di bagian atas panggung, dan sekali lagi di bagian bawah sidebar.
6. **Kontras Teks Centerline Rendah (R-25)**: Teks dimensi `CL VEHICLE CENTERLINE` menggunakan warna `oklch(0.50 0.01 260)` pada latar gelap yang memiliki rasio kontras < 4.5:1.

---

## 2. Numbered Findings List (Daftar Temuan Berurutan)

| No | Aturan yang Dilanggar | Prioritas | Temuan / Pelanggaran AI Slop yang Teridentifikasi |
|:---|:---|:---:|:---|
| **#1** | **R-03** (Mobile Responsiveness) & **R-25** (Legibility / Minimum Font Scale) | **HIGH** | **Teks Callout SVG Mengecil Tidak Terbaca di Layar Ponsel**: Teks di dalam SVG sasis (`fontSize="8.5"` sampai `10.5` pada `viewBox="0 0 960 400"`) mengecil secara proporsional saat dibuka di layar ponsel (skala ~0.38x), menghasilkan teks optik berukuran ~3.2px yang tidak dapat dibaca oleh mata manusia. |
| **#2** | **C-3** (Content-Driven Composition) & **R-40** (Performance / Bundle Bloat) | **HIGH** | **Retensi Bundle Three.js 1MB & Mainan 3D Berputar**: Tab `[3D Twin]` masih mempertahankan kode `Stage3D.tsx` (bundle 994 kB) dengan mobil SUV 3D mainan yang berputar-putar di atas piringan putar (*turntable*). Ini adalah fitur *gimmick* AI murni yang memboroskan kuota jaringan dan RAM tanpa fungsi diagnostik. |
| **#3** | **C-3** (Content-Driven Composition / Anti-Redundancy) | **MEDIUM** | **Penumpukan Metrik 4 Kali Lipat (Quadruple Stacking)**: Parameter V_BAT, RPM, Coolant, dan CAN diulang secara identik di 4 tempat sekaligus pada satu layar yang sama (sidebar, panggung sasis, bilah status bawah, dan tabel inspektur). |
| **#4** | **C-2** (Functional Completeness) & **R-26** (Interactive Elements Purpose) | **MEDIUM** | **Interaktivitas Probe Belum Menyajikan Detail Diagnostik Nyata**: Mengklik simpul probe pada sasis hanya memfilter tabel di bawah, tanpa menyajikan spesifikasi kelistrikan penting seperti nomor pin terminal, standar protokol OEM, maupun diagram pinout harness. |
| **#5** | **R-03** (Mobile Responsiveness) | **LOW** | **Duplikasi Daftar Unit Kendaraan di Ponsel**: Daftar unit kendaraan ditampilkan dua kali pada layar mobile: strip horizontal di header panggung, dan daftar kartu vertikal di sidebar bawah, membingungkan alur navigasi teknisi. |
| **#6** | **R-25** (Color Contrast WCAG AA) | **LOW** | **Kontras Teks Sumbu Dimensi Rendah**: Teks `CL VEHICLE CENTERLINE` dan partisi ruang kabin menggunakan warna abu-abu gelap `oklch(0.50 ...)` yang berada di bawah standar kontras WCAG AA (4.5:1). |

---

## 3. Rencana Solusi Perbaikan (Actionable Engineering Solutions)

### Solusi untuk Temuan #1 (Decoupled Responsive Callouts di Layar Kecil):
- Pada layar desktop (`md:block`), pertahankan tag callout SVG yang presisi.
- Pada layar mobile (`md:hidden`), sederhanakan SVG sasis menjadi diagram potongan bersih dengan badge nomor simpul (1 s/d 6) berkontras tinggi, dan pindahkan teks detail probe ke kartu interaktif HTML responsif di luar SVG. Teks akan berukuran `11px - 13px` yang nyaman dibaca tanpa zoom.

### Solusi untuk Temuan #2 (Pensiunkan Stage3D & Hapus Bundle 1MB):
- Hapus view switcher `[Topologi Skematik] | [3D Twin]` dan jadikan **Topologi Sasis Vektor Industri** sebagai satu-satunya tampilan utama yang tangguh dan ringan.
- Hapus lazy-load `Stage3D`, menghemat ~1.000 kB (1 MB) transfer JavaScript pada browser teknisi.

### Solusi untuk Temuan #3 (Rasionalisasi Distribusi Informasi):
- Diferensiasikan peran masing-masing panel:
  - **Sasis Atas**: Fokus pada topologi fisik, rute harness kabel, dan status simpul.
  - **Matriks Bawah**: Fokus pada data stream diagnostik real-time, rentang ambang, dan osiloskop.
  - **Sidebar**: Fokus pada pemilihan unit dan telemetri uplink.
  - Hapus strip bawah yang redundan atau satukan menjadi bilah status ringkas 1 baris.

### Solusi untuk Temuan #4 (Pinout & Wiring Harness Drawer):
- Saat probe diklik, tampilkan kartu detail teknis di panel inspektur:
  - **Probe 01 (Aki)**: Pin B+ Terminal 12V, Shunt 10Ω R-Sense ke ADC GPIO34, Ambang Sleep: < 50 µA.
  - **Probe 04 (OBD-II)**: J1962 Pinout (Pin 16 = B+, Pin 4/5 = GND, Pin 6 = CAN-H, Pin 14 = CAN-L), Baudrate: 500 kbps ISO 11898-2.
  - **Probe 05 (ESP32 Gateway)**: RTC DS3231 I2C (GPIO21/22), Flash LittleFS Tier-2 Buffer.

### Solusi untuk Temuan #5 (Pembersihan Duplikasi Daftar Unit di Ponsel):
- Pada layar ponsel (`lg:hidden`), sembunyikan daftar unit di sidebar bawah karena sudah ada quick-switcher horizontal yang cepat di bagian atas panggung.

### Solusi untuk Temuan #6 (Peningkatan Kontras Sumbu Dimensi):
- Tingkatkan warna teks dimensi dan garis batas firewall ke `oklch(0.72 0.01 260)` agar kontras memenuhi standar WCAG AA > 4.5:1.

---

## 4. Konfirmasi User (Delivery Gate Mode 2)

Sesuai aturan **Anti-Slop Mode 2 (AFTER)**:
1. Tidak ada kode yang diubah sebelum Anda menyetujui nomor temuan tertentu.
2. Silakan tentukan nomor temuan yang ingin dieksekusi (contoh: **"Perbaiki semua #1 sampai #6"** atau pilih nomor tertentu seperti **"#1, #2, #4"**).
