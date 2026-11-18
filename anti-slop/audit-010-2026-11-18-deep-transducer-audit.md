# AUDIT 010: Audit Transduser & Ergonomi Lanjutan Menu 1 Dashboard

**Tanggal**: 2026-11-18  
**Scope**: `src/components/hmi/ComponentNodeInspector.tsx`, `src/components/hmi/VehicleTopologyMap.tsx`, `src/components/hmi/ShowroomModule.tsx`  
**Status**: **NEED REFINEMENT (Penyelarasan Kontekstual Tab & Target Sentuh Mobile)**  
**Framework**: Anti-Slop Filter (`antislop.md`) Mode 2 (AFTER Audit)  

---

## 1. Executive Summary & Diagnosa Lanjutan

Implementasi Task 2 pada Audit 009 telah berhasil membawa kalkulasi OLS matematis dan manual SOP bengkel resmi ke dalam antarmuka. Namun, pengujian fungsional yang mendalam mengungkap **4 sisa pola AI Slop & inefisiensi interaksi**:

1. **Static OLS Card untuk Seluruh Simpul (C-1 Intentionality & C-3 Content-Driven)**: Pada Tab 2 (`Transduser & OLS`), kartu kalibrasi OLS ADC baterai (`GPIO34 Node M`) ditampilkan secara statis untuk semua simpul, bahkan ketika teknisi memilih simpul `can_obd`, `powertrain`, `esp32_core`, atau `rf_network`. Saat memilih CAN Bus, teknisi seharusnya melihat analisis timing bit dan pinout J1962, bukan rumus regresi voltase aki.
2. **Target Sentuh Tab di Bawah Standar Mobile (R-03 Mobile Responsiveness)**: Tombol tab switcher (`Matriks Data Stream`, `Transduser & OLS`, `Manual Servis`) memiliki tinggi vertikal hanya ~28px (`py-1`), melanggar aturan minimum tap target 44px (atau minimal 40px) pada layar sentuh ponsel teknisi.
3. **Peringatan Kalibrasi Terisolasi (C-4 Resilience)**: Ketika terdeteksi *drift* kalibrasi ADC ($\Delta \ge 0.080\text{V}$), peringatan hanya muncul di dalam Tab 2 yang tersembunyi. Tidak ada penanda visual pada diagram sasis atas atau ringkasan status bahwa unit tersebut memerlukan re-kalibrasi SOP C.1.
4. **Badge Header Redundan (R-09 Purpose-Gate)**: Teks kecil "OEM SPESIFIKASI PAJERO SPORT" di header inspektor masih menggunakan gaya kapsul badge generik yang mengulang informasi yang sudah jelas dari judul sasis.

---

## 2. Numbered Findings List (Daftar Temuan Berurutan)

| No | Aturan yang Dilanggar | Prioritas | Temuan / Pelanggaran AI Slop yang Teridentifikasi |
|:---|:---|:---:|:---|
| **#1** | **C-1** (Intentionality) & **C-3** (Content-Driven Composition) | **HIGH** | **Kartu OLS Baterai Statis pada Simpul Non-Baterai**: Tab `Transduser & OLS` selalu menampilkan kalkulasi ADC GPIO34 Baterai terlepas dari simpul yang dipilih. Ketika simpul `can_obd` aktif, konten harus beradaptasi menampilkan **Analisis Protokol CAN TWAI & Mode 01 PIDs**; saat `powertrain` aktif menampilkan **Analisis Timing Gigi Reluktansi CKP & Suhu NTC**; dan saat `esp32_core` aktif menampilkan **Analisis Buffer LittleFS & Kristal TCXO DS3231**. |
| **#2** | **R-03** (Mobile Responsiveness / Minimum Tap Target) | **MEDIUM** | **Target Sentuh Tab Terlalu Kecil di Ponsel**: Tombol tab navigasi pada `ComponentNodeInspector.tsx` hanya memiliki `py-1` (~28px tinggi fisik), menyulitkan penekanan jari pada layar smartphone teknisi. Perlu ditingkatkan menjadi `min-h-[40px] sm:min-h-[32px]`. |
| **#3** | **C-4** (Resilience & Hardware State Awareness) | **MEDIUM** | **Status Drift Kalibrasi Tersembunyi**: Kondisi `CALIBRATION DRIFT DETECTED` ($\Delta \ge 0.080\text{V}$) tidak tercermin pada probe aki di sasis atas, sehingga teknisi tidak segera mengetahui bahwa unit memerlukan kalibrasi ulang DMM 4-titik. |
| **#4** | **R-09** (Badges Purpose-Gate) | **LOW** | **Badge Kapsul Redundan**: Badge "OEM SPESIFIKASI PAJERO SPORT" di header tab merupakan dekorasi kapsul yang redundan dengan judul panggung utama. |

---

## 3. Rencana Tindakan Perbaikan (Actionable Solutions)

### Solusi untuk Temuan #1 (Komponen Kontekstual Dinamis pada Tab 2):
Ubah Tab `Transduser & OLS` agar beradaptasi secara spesifik berdasarkan `activeNode`:
- **`battery`**: Tampilkan **Kalkulator Regresi Linier OLS ADC GPIO34** ($m=0.005412$, $c=0.069$, $mV$ mentah vs terkalibrasi, delta drift).
- **`alternator`**: Tampilkan **Karakteristik Pengisian Denso 130A** (tegangan ambang cas 13.2V, batas riak AC penyearah 250mV, status regulator beban penuh).
- **`powertrain`**: Tampilkan **Transduser Timing Putaran & Suhu** (Roda reluktansi 60-2 gigi poros engkol, respons kurva NTC blok mesin, beban mesin %).
- **`can_obd`**: Tampilkan **Arsitektur J1962 & CAN Bus TWAI** (Pinout Pin 16/4/5/6/14, resistansi terminasi 60 Ohm, baudrate 500 kbps, live Mode 01 PIDs).
- **`esp32_core`**: Tampilkan **Hardware Node M & Memori Gateway** (Regulasi buck TPS54302 3.3V, drift TCXO DS3231SN < 2ppm, sisa kapasitas antrean LittleFS 1.5MB).
- **`rf_network`**: Tampilkan **RF Link Budget & Buffer Sync** (Kekuatan sinyal RSSI dBm, zona geofence aktif, slot buffer Tier-1 RTC SRAM & Tier-2 LittleFS).

### Solusi untuk Temuan #2 (Ergonomi Tab Mobile):
- Berikan `min-h-[42px] sm:min-h-[34px]` pada tombol tab switcher sehingga nyaman disentuh jari di smartphone.

### Solusi untuk Temuan #3 (Indikator Drift Kalibrasi Terpadu):
- Jika `vDelta >= 0.080V`, tambahkan status peringatan kalibrasi `DRIFT` berwarna amber pada probe baterai di sasis dan pada banner mobile aktif.

### Solusi untuk Temuan #4 (Pembersihan Badge Kapsul):
- Hapus badge kapsul redundan dan gunakan tipografi terstruktur industri.

---

## 4. Konfirmasi User (Delivery Gate Mode 2)

Sesuai aturan **Anti-Slop Mode 2 (AFTER)**:
1. Tidak ada file kode yang diubah sebelum ada persetujuan nomor temuan tertentu.
2. Silakan tentukan nomor temuan yang ingin dieksekusi (contoh: **"Perbaiki semua #1 sampai #4"** atau pilih nomor tertentu seperti **"#1, #2"**).
