# AUDIT 006 — Task 1 Result Anti-Slop Audit (Mengapa Masih Terasa AI Slop)

**Tanggal**: 2026-11-17  
**Scope**: `src/components/hmi/VehicleTopologyMap.tsx` & `src/components/hmi/ComponentNodeInspector.tsx`  
**Hasil Review**: **REJECTED (FAIL / MASIH AI SLOP)**  
**Diagnosa Utama**: Mengganti 3D sci-fi gimmick dengan flowchart SVG berlatar blueprint grid dan kartu metrik seragam yang merupakan bentuk klasik AI slop lain.

---

## 1. Numbered Findings List (Penyebab Utama Masih AI Slop)

| No | Aturan | Prioritas | Temuan / Pelanggaran Aturan Antislop |
|:---|:---|:---:|:---|
| **#1** | **R-07** (Background Grid) | **HIGH** | `VehicleTopologyMap.tsx` memakai `<pattern id="cad-grid">` garis kotak-kotak blueprint di latar belakang SVG. Ini adalah pola AI default nomor satu: memalsukan kesan "teknis" dengan grid blueprint tanpa fungsi teknis nyata. |
| **#2** | **R-14** (Copy-Paste Feature Cards / Bento Slop) | **HIGH** | `ComponentNodeInspector.tsx` mengulang template 4 kotak identik (`grid lg:grid-cols-4`) dengan format sama: label kecil di atas, nilai besar di tengah, dan teks penjelasan di bawah. Ini adalah pola AI card grid generik. |
| **#3** | **R-05** (Layout & Page Structure / Flowchart Klise) | **HIGH** | Bentuk topologi saat ini hanyalah diagram kotak PowerPoint/flowchart (6 kotak persegi panjang dengan garis panah berujung panah runcing) yang dipaksakan ke layar, bukan arsitektur chassis atau wiring diagram otomotif nyata. |
| **#4** | **R-16** & **C-5** (AI Explainer Copywriting) | **MEDIUM** | Teks di bawah setiap metrik berisi kalimat ceramah AI ("Dihitung dari pembagi tegangan...", "Mencegah kerusakan permanen...", "Dapat diperbarui secara OTA..."). Alat diagnostik teknisi bengkel (seperti Mitsubishi MUT-III atau Bosch) tidak berisi paragraf penjelasan AI, melainkan data stream teknis, satuan, register, dan rentang toleransi. |
| **#5** | **R-06** (Generic Monospace & Bracket Typography) | **MEDIUM** | Penggunaan label bracket kurung siku seperti `[KOMPARTEMEN MESIN / POWERTRAIN]` dan `[KABIN / KONEKTOR OBD-II J1962]` adalah gaya visual tiruan "hacker/terminal" yang dihasilkan AI untuk mengisi kekosongan tata letak. |
| **#6** | **R-20** (Ketiadaan Identitas Fisik Kendaraan) | **HIGH** | Diagram tidak memiliki wujud fisik mobil sama sekali. Posisinya abstrak (kotak di kiri, kotak di tengah, kotak di kanan). Pengguna tidak dapat melihat di mana letak fisik aki pada kap Pajero Sport, letak port OBD-II di bawah setir, atau letak modul ESP32 di konsol. |
| **#7** | **C-1** (Intentionality & Craftsmanship) | **HIGH** | Tidak ada grafik sinyal live (waveform/oscilloscope), tidak ada tabel PID standar SAE J1979, dan tidak ada aksi nyata teknisi (misal: tombol kalibrasi nol ADC, tombol uji ping bus CAN). |

---

## 2. Analisis Mendalam: Bagaimana Mengubahnya Menjadi Tampilan Teknisi Nyata (Bebas Slop 100%)?

### Perbedaan Tampilan AI Slop vs Alat Diagnostik Otomotif Nyata

| Aspek | Yang Dihasilkan AI Slop (Sekarang) | Tampilan Industri / Bengkel Nyata (Yang Seharusnya) |
|:---|:---|:---|
| **Latar Belakang** | Grid blueprint garis tipis dekoratif | Panel solid warna carbon matte gelap dengan kontras tinggi, garis pemisah struktural tegas (hairline border), tanpa grid kotak-kotak. |
| **Representasi Fisik** | 6 kotak flowchart abstrak terhubung panah | **Siluet Vektor Ortografis Fisik Chassis Mitsubishi** (tampak atas/samping teknis akurat) dengan hotspot penempatan komponen nyata: Aki di ruang mesin kiri depan, OBD di bawah kolom setir, Modul IoT di balik laci kabin. |
| **Tampilan Metrik** | 4 kotak card seragam berisi paragraf penjelasan | **Live Telemetry Channel Matrix (PID Data Stream Table & High-Density Gauges)**: Kolom PID, Nama Sensor, Nilai Real-Time, Satuan, Rentang Ambang (Min - Max), dan Sparkline 20 Sampel Terakhir. |
| **Interaksi** | Klik kotak membuka teks penjelasan statis | Klik komponen membuka **Live Channel Waveform / Oscilloscope Trace** (misal: grafik drop tegangan saat starter, bit traffic CAN bus, log DTC interaktif). |
| **Bahasa & Tone** | "Mencegah kerusakan sulfasi aki..." (gaya ceramah AI) | `PID 0x42: CTRL_MOD_V | RAW: 2154 mV | CAL: 11.73 V | RANGE: [11.80 - 14.40] | STATUS: UNDERVOLT_WARN` (gaya engineering tegas). |

---

## 3. Rencana Perombakan Radikal (Non-Slop Industrial Redesign)

### A. Ganti SVG Flowchart dengan *Chassis Cutaway Technical Vector*
1. Buat siluet vektor 2D teknis (tampak atas/samping Pajero Sport / Xforce) yang presisi, clean, dan elegan tanpa grid blueprint.
2. Tempatkan titik-titik probe sensor (Hotspot Pins) pada lokasi fisik sebenarnya:
   - **Engine Bay (Depan)**: Aki 12V 70Ah, Alternator 130A, Shunt Resistor 10Ω, Sensor Suhu Coolant Mesin.
   - **Driver Footwell / Cockpit (Tengah)**: Port OBD-II J1962 16-pin, Transceiver CAN bus.
   - **Electronics Bay (Kabin)**: Gateway ORION ESP32 v1.0, Sensor Suhu RTC DS3231, Jalur ADC Pin 16.
   - **RF Pillar (Atap/Pilar A)**: Antena Wi-Fi 2.4 GHz, Indikator Geofence Gudang vs Hotspot Teknisi.

### B. Ganti 4 Kartu Bento dengan *High-Density Live Telemetry Data Stream Matrix*
1. Tampilkan tabel matriks saluran data industri bergaya OEM diagnostic scanner (MUT-III / CANalyzer):
   - Kolom: `CHANNEL / PID` | `PARAMETER` | `LIVE READOUT` | `MIN / MAX TOLERANCE` | `SIGNAL WAVEFORM` | `HEALTH`
2. Lengkapi dengan sparkline SVG real-time mini (grafik tren 15 titik terakhir) untuk tegangan aki dan RPM.
3. Hapus seluruh kalimat penjelasan AI generik; gantikan dengan parameter teknis konkret.
