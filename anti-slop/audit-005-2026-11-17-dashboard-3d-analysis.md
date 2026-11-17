# AUDIT 005 — Dashboard Menu 1 (Showroom & 3D Stage) Anti-Slop Audit & Replacement Plan

**Tanggal**: 2026-11-17  
**Scope**: `src/components/hmi/ShowroomModule.tsx` & `src/components/hmi/Stage3D.tsx` (Dashboard Menu 01: Digital Twin Showroom)  
**Tujuan**: Mengeliminasi pola generic AI slop pada visualisasi 3D kendaraan dan merancang pengganti visualisasi yang berorientasi data teknik otomotif nyata (*industrial automotive craftsmanship*).

---

## 1. Numbered Findings List (Evaluasi Aturan Antislop)

| No | Aturan | Prioritas | Temuan / Alasan Satu Baris |
|:---|:---|:---:|:---|
| **#1** | **R-22** (Illustrations / 3D Stand-in) & **C-1** (Intentionality) | **HIGH** | Mobil 3D poligon procedural yang berputar di atas turntable adalah "sci-fi gimmick" dekoratif tanpa tujuan teknis, bukan digital twin otomotif yang memuat data komponen nyata. |
| **#2** | **R-26** (Interactive Elements) & **C-2** (Functional Completeness) | **HIGH** | Node-node 3D (`battery`, `alternator`, `ecu`, `obd`) hanya berupa kubus mati yang melayang tanpa event handler klik, tooltip, atau pembacaan diagnostik saat diinteraksi. |
| **#3** | **R-40** (Performance Mechanisms) & **R-03** (Mobile Responsiveness) | **HIGH** | Render loop Three.js kontinu (`frameloop="always"`) dengan fog, directional lighting, 3 lightformers, dan polar grid membebani GPU/baterai perangkat tablet lapangan secara sia-sia. |
| **#4** | **R-27** (UI States & Diagnostic Richness) | **HIGH** | Status 3D hanya terbagi ke 4 mode kasar (`WARMUP`, `CRITICAL`, `DEPARTED`, `STANDBY`) tanpa menampilkan rincian ADC raw mV, kurva OLS, arus shunt mikroampere, atau frame CAN bus. |
| **#5** | **R-13** (Glow Everywhere) & **R-01** (Visual Slop) | **MEDIUM** | Penumpukan efek glow berlebih (kubus emissive 1.4, bola partikel meluncur di dalam tabung, cincin ripple berdenyut, thermal aura) mereplikasi estetika holodeck AI tanpa nilai informasi. |
| **#6** | **R-07** (Background Grid) | **MEDIUM** | Penggunaan `PolarGridHelper` di lantai panggung dan radial gradient gelap di latar belakang hanyalah template visual default 3D canvas tanpa relevansi bengkel/stockyard. |
| **#7** | **R-10** (Glassmorphism Overuse) | **MEDIUM** | Panel HUD di pojok kanan atas dan strip bawah menumpuk kelas `glass` dengan `backdrop-blur-md` secara repetitif di atas canvas yang sudah gelap. |
| **#8** | **R-20** (Visual Identity) | **LOW** | Tampilan visual 3D saat ini dapat ditukar ke sembarang aplikasi fiksi tanpa mencerminkan identitas operasional PDI Stockyard Mitsubishi (Pajero Sport / Xforce) dan modul ESP32 ORION. |

---

## 2. Analisis Konseptual: Apa Pengganti yang Kaya Informasi & Bebas AI Slop?

### Kenapa Visualisasi 3D Sekarang Terasa "AI Slop"?
1. **Teknik Tanpa Tujuan (*Technique Without Purpose*)**: 3D wireframe mobil berputar terlihat keren di screenshot, tetapi teknisi lapangan atau supervisor stockyard tidak bisa memakainya untuk mendiagnosis masalah aki drop, alternator bermasalah, atau kegagalan bus CAN.
2. **Data Nyata Tidak Terpetakan**: ESP32 ORION mengirimkan 20 field telemetri presisi tinggi (`adc_raw_mv`, `v_bat`, `shunt_sleep_ua`, `daily_mah`, `rtc_temp_c`, `dtc`, `rpm`, `temp_c`, `net_zone`, `lag_steps`), tetapi 3D canvas hanya mengubah warna garis dan memutar roda.

### Solusi Pengganti: *Interactive Automotive Topology & Digital Twin Workbench*
Mengubah panggung 3D mainan menjadi **Diagram Topologi Skematik Interaktif 2D/2.5D (CAD / Electrical Wiring Architecture)** yang terinspirasi dari manual servis resmi OEM (Mitsubishi MUT-III / FSM Wiring Manual) dan instrumen telemetri industri (Vector CANalyzer / Bosch Diagnostic):

1. **Schematic Blueprint Otomotif Interaktif (Zero-Lag, Scalable Vector)**:
   - Diagram wiring harness kendaraan yang memetakan jalur fisik:
     - **Sub-sistem Daya**: Aki 12V 70Ah, Shunt Resistor arus tidur (`shunt_sleep_ua`), Pembagi Tegangan ADC (Pin 16 ESP32, OLS $m=0.005412$, $c=0.069$).
     - **Sub-sistem Pengisian**: Alternator & Regulator, Starter Relay, Ambang Pengisian $\ge 13.2\text{ V}$.
     - **Sub-sistem Diagnostik & Komputasi**: Port OBD-II (Pin 6/14 CAN), Transceiver WCMCU-230, DS3231 RTC Module ($I^2C$), ESP32 Dual-Core Orion Gateway.
     - **Sub-sistem Powertrain**: Sensor RPM Poros Engkol, Sensor Suhu Coolant, Indikator DTC MIL.
     - **Sub-sistem Gateway Jaringan**: Dual-Band RF Antenna, Status Yard vs Tech Hotspot vs Offline, Antrean Buffer RTC SRAM (Tier-1) & LittleFS (Tier-2).
2. **Interactive Component Node Inspector (C-2 Functional Completeness)**:
   - Setiap komponen pada skematik dapat diklik (keyboard accessible) untuk membuka **Live Channel Telemetry Inspector**:
     - *Aki 12V*: Menampilkan grafik laju penurunan tegangan (*discharge rate*), perbandingan ADC raw vs calibrated, dan estimasi waktu menuju batas kritis ($11.80\text{ V}$).
     - *Alternator*: Menampilkan tegangan ripple, status pengisian aktif/standby, dan durasi mesin menyala.
     - *CAN & OBD-II*: Menampilkan status bus OK/Fault, daftar kode DTC aktif beserta deskripsi kerusakan, serta RPM & Coolant.
     - *ESP32 Node*: Menampilkan konsumsi harian (`daily_mah`), arus standby (`shunt_sleep_ua`), temperatur RTC DS3231, dan kesehatan flash LittleFS.
3. **Dual-View Switcher (Opsional)**:
   - Mode 1 (Utama & Default): **Topologi Skematik Listrik (2D Blueprint Architecture)** — Cepat, responsif, zero GPU drain.
   - Mode 2 (Visual Ruang): **Vehicle Orthographic Cutaway (X-Ray Technical Chassis)** — Gambar teknis potongan mobil yang bersih dan presisi dengan titik-titik sensor yang dapat diklik, tanpa rotasi terus-menerus dan tanpa efek neon glow.

---

## 3. Rencana Task Rinci (Task Breakdown)

### Task 1: Desain Arsitektur Skematik Topologi Kelistrikan & Sensor (Komponen `VehicleTopologyMap`)
- Buat komponen `VehicleTopologyMap.tsx` berbasis SVG interaktif / Canvas presisi.
- Hubungkan 5 simpul utama (Aki, Alternator, ESP32 Orion Node, Port OBD-II / CAN, Sensor Suhu/RPM) dengan jalur bus data dan jalur arus daya nyata.
- Tambahkan status visual yang relevan secara teknis (misal: tegangan drop ditandai dengan garis putus-putus oranye, CAN fault ditandai dengan node berlabel fault).

### Task 2: Pembuatan Node Inspector Interaktif (Komponen `ComponentNodeInspector`)
- Buat drawer / panel samping interaktif saat salah satu komponen skematik diklik.
- Tampilkan data telemetri mendalam:
  - Pembacaan sensor mentah vs terkalibrasi.
  - Parameter kalibrasi OLS aktif (`cal_slope`, `cal_offset`).
  - Mini sparkline grafik tren 10 sampel terakhir.
  - Dokumentasi pinout fisik ESP32 PCB v1.0.

### Task 3: Pembersihan Efek AI Slop pada Shell Dashboard Menu 1 (`ShowroomModule.tsx`)
- Hilangkan polar grid 3D helper, background radial orbs yang berlebihan, dan turntable yang terus berputar.
- Ganti HUD gantung kanan atas yang berantakan dengan layout terstruktur yang menyatu dengan grid workspace industri.
- Pastikan kepatuhan penuh terhadap **R-03** (Mobile target minimum 44px, no overflow) dan **R-32** (Navigasi keyboard Tab & Enter pada setiap node komponen).

### Task 4: Integrasi Mode Ringan / Dual-View & Verifikasi Performa
- Sediakan tombol switch bersih: `[Skematik Topologi]` vs `[X-Ray Cutaway Otomotif]`.
- Nonaktifkan WebGL yang memakan resource baterai berlebih saat tidak dibutuhkan.
- Jalankan audit kontras warna (WCAG AA $\ge 4.5:1$) dan verifikasi responsivitas pada resolusi desktop maupun layar HP teknisi.
