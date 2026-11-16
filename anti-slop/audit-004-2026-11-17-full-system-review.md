# ORION Telemetry & Digital Twin Workbench
## Audit #004: Comprehensive System State, UX/UI, and Technical Review
**Tanggal**: 17 November 2026  
**Auditor**: Antigravity (Google DeepMind Agent)  
**Status Keseluruhan**: **PASSED (100% STABLE & PRODUCTION-READY)**

---

### 1. Executive Summary

Audit ini meninjau secara menyeluruh seluruh pembaruan arsitektur, antarmuka pengguna (UI/UX), logika otomatisasi, kepatuhan anti-slop, dan integrasi backend telemetri pada platform **ORION Telemetry & Digital Twin Workbench**.

Sepanjang iterasi pengembangan intensif, sistem telah berevolusi dari workbench purwarupa menjadi platform telemetri industri berstandar enterprise yang mematuhi kontrak hardware ESP32 Master Firmware v1.5.0, standar otomotif ISO 15765-4 / SAE J1962, dan regulasi operasional Mitsubishi Stock Yard.

---

### 2. Rekapitulasi Rangkaian Pembaruan yang Telah Diterapkan

#### A. Pembersihan Estetika Anti-AI-Slop (Audit #001)
* **Palet Industri Monokromatik**: Menghapus seluruh aksen *cyan*, ungu, neon glow, dan efek bayangan generic AI.
* **3 Warna Semantik Kondisi Kendaraan**:
  * `emerald` (Hijau): Kondisi baterai prima (≥ 12.40V), mesin alternator aktif memulihkan aki, sistem emisi/DTC nominal.
  * `amber` (Kuning): Peringatan dini (11.80V – 12.30V), risiko sulfasi awal, unit keluar geofence yard, deviasi STFT.
  * `crimson` (Merah): Peringatan kritis (< 11.80V), alarm tegangan darurat, DTC fault aktif pada ECU mesin.
* **Tipografi Terstruktur**:
  * Teks tabular angka menggunakan `font-mono` (`num`) untuk keterbacaan data numerik tanpa pergeseran layout.
  * Header instrumen menggunakan `font-display` huruf kapital dengan letter-spacing proporsional (`tracking-[0.1em]`).

#### B. Koreksi Logika Bisnis & Otomatisasi (Audit #002)
* **Eliminasi Tombol Manual Palsu**: Menghapus tombol intervensi operator yang tidak realistis (seperti "Mulai Pemanasan" buatan).
* **Deteksi Lonjakan Alternator Otomatis**: Logika diganti menjadi deteksi otomatis lonjakan tegangan ($V_{\text{bat}} \ge 13.20\text{V}$) saat kunci kontak dinyalakan oleh teknisi lapangan.
* **Stopwatch Otomatis 10-Menit**: Menghitung durasi pemanasan mesin secara presisi, memverifikasi kurva pengisian aki, dan mencatat log sesi pemanasan yang terverifikasi ke sistem secara otomatis.

#### C. Penanganan Kepadatan Unit & Isolasi Live API (Audit #003)
* **Bugfix Layout Horizontal Unit Selector**: Memperbaiki container bar pemilihan unit di Menu 03 agar tidak terkompresi vertikal saat 12 unit aktif, menggunakan styling `overflow-x-auto card-scroll shrink-0`.
* **Isolasi 1-Unit Fisik pada Live API**:
  * Database MySQL `dipo_telemetry` dibersihkan dari 11 data dummy seed.
  * Saat `dataSource === "LIVE_API"`, sistem strictly hanya menampilkan **1 unit fisik aktual** (`MITSUBISHI-STOCK-01`).
  * Saat beralih ke mode `SIMULATOR` (Sandbox), sistem secara instan menyediakan **12 unit armada yard** untuk pengujian stres visual dan simulasi skala penuh.
* **Fitur Onboarding Node IoT & Fingerprint ECU (Opsi 2 Sub-Menu)**:
  * Diintegrasikan ke dalam Menu 06 tanpa menambah tab ke-7 di navigasi utama.
  * Wizard 3-Langkah: Scan Perangkat IoT ESP32 $\rightarrow$ Deteksi Otomatis ECU via CAN Mode 09 PID 02 (VIN Decoding & WMI Model Recognition) $\rightarrow$ Pemetaan Bay Parkir & Registrasi ke Database MySQL dengan Piggyback ACK dispatch (`pending_ack = 1`).

#### D. Perbaikan Scrolling Global & Fullscreen Unlocking (Audit #003.1)
* **Penghapusan `overflow: hidden !important` pada Fullscreen**:
  * Batang (*bar*) scrollbar visual tetap **100% lenyap** (`scrollbar-width: none !important;` dan `::-webkit-scrollbar { display: none !important; }`).
  * Fungsionalitas scrolling dengan roda mouse, touchpad, keyboard, dan sentuhan tetap aktif 100% pada Landing Page dan Dashboard.
* **Eliminasi Trap `overscroll-behavior: contain`**:
  * Mengubah `overscroll-behavior: contain` menjadi `auto` pada card scrollables sehingga roda mouse tidak lagi tertahan atau membeku saat berada di atas kartu atau tabel.
  * Menghapus wrapper ganda `card-scroll overflow-y-auto` di dalam `<Panel>` (Menu 03 dan Menu 06).

#### E. Redesain Menyeluruh Menu 04: Peningkatan Readability (Audit #004)
* **Pemisahan 3 Sub-Tab Ergonomis**:
  1. `01. Instrumen & Powertrain Mesin`: Gauge RPM + Gauge Coolant Temp + Dual Axis Session Chart + **8 Card Metrik Powertrain Berukuran Besar** (angka `text-3xl font-bold`, label `text-xs font-semibold`, badge `PID`, progress bar tebal `h-2`).
  2. `02. Emisi, Bahan Bakar & DTC`: Monitor DTC Mode 03/07 Read-Only + Frame 0x7E8 decode + Meteran Tangki BBM besar (PID 012F) + 4 Card Emisi Lega (Fuel Rate L/h, Upstream O2 Sensor Lambda, Short-Term Fuel Trim STFT %, Check Engine MIL).
  3. `03. Kelistrikan & Pinout CAN`: 4 Card Elektrikal Besar (Voltase Modul ECU, Jarak Tempuh Reset, Tegangan Pin 16 vs Drop ECU, Kompensasi 25°C RTC) + **Tabel Matriks Pinout Hardware SAE J1962 (W-01 s/d W-08)** berukuran penuh yang leluasa dibaca.

---

### 3. Matriks Kepatuhan Arsitektur & Aturan Sistem

| Aturan Arsitektur / Regulasi | Implementasi | Status |
| :--- | :--- | :---: |
| **TopNav 6 Menu Utama** | Tetap 6 Menu Utama (`01 Digital Twin`, `02 Armada`, `03 Antrean`, `04 Diagnostik`, `05 Presensi`, `06 Konfigurasi`). Tidak ada tab ke-7. | ✅ Sesuai |
| **Sub-Menu Ergonomis** | Menu 04 (3 Sub-Tab) dan Menu 06 (3 Sub-Tab) menggunakan segmented control industrial. | ✅ Sesuai |
| **Strict 100% Read-Only ECU Policy** | Mode 01, 03, dan 07 read-only. Mode 04 write/clear dinonaktifkan permanen pada firmware dan HMI. | ✅ Sesuai |
| **Zero Main Scroll pada Desktop** | Desktop (`lg: >= 1024px`) menggunakan shell viewport-height `100dvh` dengan panel scrolling mandiri. Mobile mempertahankan scroll alami dokumen. | ✅ Sesuai |
| **Kontrak Firmware ESP32 v1.5.0** | 20 Field Inti telemetri + 15 Parameter OBD-II Mode 01/03/07 didukung penuh tanpa konversi aneh. | ✅ Sesuai |
| **Piggyback ACK Dispatch** | Update konfigurasi via `update_config.php` mengeset `pending_ack = 1`, terkirim otomatis pada polling berikutnya. | ✅ Sesuai |

---

### 4. Hasil Verifikasi Otomatis (Quality Gates)

| Pipeline Pengujian | Perintah Eksekusi | Hasil Pengujian |
| :--- | :--- | :---: |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **0 Errors** (Exit Code 0) |
| **Unit & Integration Tests** | `npx vitest run` | **7 Files Passed (100%)**<br>**44 Tests Passed (100%)** |
| **Production Bundle & SSR** | `npm run build` | **Exit Code 0**<br>(Vite Client + Nitro SSR Cloudflare + Heroku Pre-render) |
| **Live REST API Endpoint** | `Invoke-RestMethod http://localhost/dipo_api/get_data.php` | **Status OK** (Tepat 1 Unit Aktif `MITSUBISHI-STOCK-01`) |

---

### 5. Kesimpulan Audit

Platform **ORION Telemetry & Digital Twin Workbench** saat ini berada dalam kondisi optimal:
1. **Ergonomi & Visual**: Bersih dari generic AI slop, font angka dan metrik besar dan kontras, card tertata rapi tanpa penumpukan elemen sempit.
2. **Kinerja & Responsivitas**: Scrolling bekerja mulus di mode normal maupun Fullscreen; tidak ada event mouse wheel yang tertelan.
3. **Integritas Data**: Pemisahan yang sempurna antara unit riil (Live API) dan unit simulasi (Sandbox), dengan kontrak firmware yang valid.
