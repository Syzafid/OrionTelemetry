# Audit & Rencana Arsitektur #003
**Tanggal:** 2026-11-16  
**Proyek:** ORION Telemetry & Digital Twin Workbench  
**Fokus:**  
1. Audit & Perbaikan Kerusakan Tampilan Pilihan Unit (Menu 03 & Modul Lainnya saat 12 Unit)  
2. Isolasi Mode Live API (1 Unit Terdaftar Aktual) vs Mode Sandbox (12 Unit Simulasi)  
3. Analisis Menu Baru: Fitur Linking/Pairing Perangkat IoT & Pengenalan Data ECU Mobil untuk Registrasi Database  
**Status:** DRAFT ANALISIS & RENCANA KERJA (Menunggu Konfirmasi User)

---

## 1. Analisis & Rencana Perbaikan Kerusakan Tampilan (Menu 03 Pilihan Unit)

### A. Investigasi Akar Masalah di Menu 03 (`WarmupQueueModule.tsx`)
Pada bar pemilihan unit cepat (*quick-selection bar*) di Menu 03:
```tsx
{/* Target Node Quick-Selection Bar */}
<div className="panel flex shrink-0 items-center gap-2 px-3 py-1.5 overflow-x-auto card-scroll">
  <span className="label-hmi mr-1 shrink-0 text-[10px]">Pilih Unit:</span>
  {units.map((u) => (
    <button ...>...</button>
  ))}
</div>
```

**Penyebab Kerusakan Tampilan:**
1. Baris tersebut menyertakan class `.panel`.
2. Di file `src/styles.css` (baris 242–248), terdapat aturan spesifik desktop:
   ```css
   @media (min-width: 1024px) and (min-height: 680px) {
     .workspace .panel,
     .workspace .hmi-panel {
       display: flex;
       flex-direction: column;
       min-height: 0;
       overflow: hidden;
     }
   }
   ```
3. Aturan CSS tersebut memiliki spesifisitas tinggi (`.workspace .panel`) yang **menimpa display flex horizontal** Tailwind (`flex` row) menjadi `flex-direction: column` serta menerapkan `overflow: hidden`.
4. Akibatnya:
   - Ketika ada 12 unit kendaraan, ke-12 tombol unit (`Bay A-01` sampai `Bay C-04`) **tersusun bertumpuk ke bawah (vertikal)** di dalam header bar yang sempit.
   - Karena ada `overflow: hidden`, tombol-tombol unit terpotong dan tidak bisa di-scroll secara horizontal.
   - Tumpukan vertikal tersebut mendorong dan merusak tata letak 2 kolom di bawahnya (Konsol Pemanasan & Kurva Suhu).

### B. Solusi Perbaikan Menu 03:
1. Hapus class `.panel` dari bar pilihan unit di `WarmupQueueModule.tsx`.
2. Ganti dengan container netral:
   `flex shrink-0 items-center gap-1.5 overflow-x-auto card-scroll rounded-[2px] border border-border bg-card/60 px-3 py-1.5 min-w-0`
3. Berikan class `min-w-0` pada flex container dan `shrink-0` pada setiap tombol unit, serta scrollbar halus horizontal yang dapat digeser mulus via mouse wheel atau touch.

### C. Cek Audit Modul-Modul Lainnya Saat 12 Unit:
- **Menu 01 (Digital Twin 3D - `ShowroomModule.tsx`):**
  - Sidebar kanan memuat daftar unit yard. Perlu dipastikan container unit list memiliki `max-h` terkunci dan `overflow-y-auto` mandiri agar tidak menyebabkan vertical page overflow.
- **Menu 02 (Armada & PDI - `FleetModule.tsx`):**
  - Carousel kartu armada sudah dilengkapi pagination deck. Perlu dipastikan saat beralih antara 1 unit (Live API) dan 12 unit (Sandbox), kartu armada berada di posisi terpusat (*centered*).
- **Menu 04 (OBD-II Diagnostik - `DiagnosticsModule.tsx`):**
  - Bar pilih node di atas menggunakan container pill horizontal. Sudah menggunakan `shrink-0`, tampil stabil.
- **Menu 05 (Presensi & Log - `PresenceModule.tsx`):**
  - Daftar presensi di mobile snap horizontal dan desktop stacked vertikal. Tampil stabil.
- **Menu 06 (Konfigurasi Node - `ConfigModule.tsx`):**
  - Selector node menggunakan `flex-wrap` sehingga membungkus otomatis menjadi 2 baris rapi saat 12 unit.

---

## 2. Isolasi Mode Live API (1 Unit Aktual) vs Mode Sandbox (12 Unit Simulasi)

### A. Kondisi Saat Ini
- `TelemetryContext.tsx` menginisialisasi `allUnits` dengan 12 unit mock (`EXPANDED_YARD_UNITS`).
- Saat pengguna memilih `LIVE_API`, polling dilakukan ke `get_data.php`.
- Di database MySQL saat ini, tabel `vehicles` masih menyimpan 12 baris dummy dari proses migrasi awal.
- Akibatnya, pada mode `LIVE_API`, sistem tetap menampilkan 12 unit (padahal di lapangan hanya ada 1 unit hardware ESP32 yang aktif: `MITSUBISHI-STOCK-01`).

### B. Rencana Perbaikan Bersih:
1. **Logika Sumber Data di `TelemetryContext.tsx`:**
   - **Saat `dataSource === "LIVE_API"`:**
     - Data unit **hanya diambil dari database backend aktual** (`vehicles` yang terdaftar di MySQL).
     - Jika database MySQL hanya mendaftarkan 1 unit (`MITSUBISHI-STOCK-01`), maka seluruh modul (Menu 01 s/d 06) **hanya menampilkan 1 unit tersebut**.
     - Tidak ada injeksi 11 unit mock dummy saat mode Live API aktif.
     - `selectedId` otomatis mengunci ke `MITSUBISHI-STOCK-01`.
   - **Saat `dataSource === "SIMULATOR"` (Mode Sandbox):**
     - Menggunakan data lengkap 12 unit (`EXPANDED_YARD_UNITS`).
     - Memungkinkan operator/pengembang menguji visualisasi multi-unit, antrean pemanasan bertingkat, dan triase baterai armada besar.
2. **Sinkronisasi Database MySQL:**
   - Menyediakan query/skrip untuk merapikan tabel `vehicles` dan `node_configs` di MySQL sehingga hanya berisi unit fisik aktif (`MITSUBISHI-STOCK-01`), sedangkan data 12 unit disimpan sebagai simulasi di client.

---

## 3. Analisis & Rencana Menu Baru: "Linking / Pairing Perangkat IoT & Pengenalan Data ECU Mobil"

### A. Urgensi & Latar Belakang Kebutuhan
Saat dealer Mitsubishi menerima unit mobil baru di yard:
1. Teknisi mengambil dongle OBD-II ESP32 dari inventaris dan menancapkannya ke soket OBD-II mobil.
2. Sistem web saat ini belum memiliki alur registrasi resmi (*onboarding wizard*).
3. Sangat tidak realistis jika teknisi bengkel harus membuka database MySQL / phpMyAdmin untuk mengetik `INSERT INTO vehicles...`.
4. Diperlukan fitur terpadu di aplikasi untuk:
   - **Mendeteksi Perangkat IoT Baru:** Scan Node ID, MAC Address ESP32, IP Address, dan Versi PCB.
   - **Pengenalan ECU Mobil Otomatis:** Membaca respon OBD-II Mode 09 PID 02 (VIN decoding) dan mendeteksi model mobil secara otomatis via protokol CAN.
   - **Registrasi Database:** Menyimpan unit ke tabel `vehicles` dan `node_configs` agar langsung aktif beroperasi di mode Live API.

---

### B. Alur Kerja (Workflow) Onboarding 3 Tahap

```
[Tahap 1: Deteksi Hardware IoT]
   Dongle ESP32 terhubung ke port OBD-II & Wi-Fi dealer
   -> Web mendeteksi sinyal Node ID (misal: MITSUBISHI-STOCK-02, MAC: 24:6F:28:XX)
   -> Verifikasi pembacaan awal tegangan baterai (ADC Pin 34)

[Tahap 2: Pengenalan Data ECU Mobil (Auto-Detection)]
   -> ESP32 mengirim frame CAN Mode 09 PID 02 (Query VIN)
   -> Respon ECU didecode: 17 Karakter VIN (misal: MMBXFUJ40SH000877)
   -> Sistem mengenali World Manufacturer Identifier (WMI):
      - MMB = Mitsubishi Motors Thailand (Pajero Sport / Triton)
      - MK2 = Mitsubishi Motors Krama Yudha Indonesia (Xpander)
      - MMBXF = Mitsubishi Xforce
   -> Jika kontak mobil mati (ECU tidak membalas Mode 09), teknisi dapat scan barcode VIN faktur.

[Tahap 3: Penempatan Yard & Registrasi Database]
   -> Teknisi memilih lokasi parkir yard (misal: Bay B-02) dan warna mobil.
   -> Menentukan ambang batas voltase kritis (default: 11.80V) dan interval sleep (300s).
   -> Klik "Daftarkan Unit & Mulai Pemantauan".
   -> Backend mengeksekusi INSERT ke database MySQL (vehicles & node_configs).
   -> Unit langsung muncul secara live di dashboard!
```

---

### C. Analisis Pilihan Arsitektur Penempatan Menu

Berikut adalah 2 opsi arsitektur penempatan fitur ini:

#### **Opsi 1: Menu Baru Terdedikasi — Menu 07: "Registrasi & Onboarding Node" (`OnboardingModule.tsx`)**
* **Struktur Navigasi:** Menambahkan tab ke-7 di TopNav (`07 Onboarding`) dengan shortcut `Alt+7`.
* **Kelebihan:**
  1. Memberikan ruang visual yang sangat luas untuk alur Wizard 3 Langkah (Hardware Scan $\rightarrow$ ECU Decode $\rightarrow$ Database Register).
  2. Alur kerja sangat jelas: Menu 01–05 untuk operasional harian, Menu 06 untuk konfigurasi teknis node terpasang, Menu 07 khusus pendaftaran armada/alat baru.
  3. Sangat ramah bagi teknisi penerimaan unit baru (*PDI reception team*).
* **Kekurangan:**
  - Tab navbar bertambah menjadi 7 kolom (`repeat(7, 1fr)`). Pada layar laptop dengan resolusi 1366px, lebar tab navigasi menjadi lebih padat sehingga teks label tab harus ringkas.

#### **Opsi 2: Tab Utama Terpadu di Dalam Menu 06: "Konfigurasi & Onboarding Node" (`ConfigModule.tsx`)**
* **Struktur Navigasi:** Tetap mempertahankan 6 menu utama di TopNav (`Alt+1` s/d `Alt+6`). Menu 06 diperluas menjadi **"Manajemen & Onboarding Node"**.
* **Struktur Sub-Tab di Dalam Menu 06:**
  - **Sub-Tab 1: "Onboarding & Pairing Unit Baru"** (Wizard Deteksi Node & Pengenalan ECU).
  - **Sub-Tab 2: "Parameter NVS & Kalibrasi ADC"** (Tabel Piggyback ACK & 4-Point OLS).
  - **Sub-Tab 3: "Tiket Pemeliharaan & Audit"** (Shift Handover & Jejak Audit).
* **Kelebihan:**
  - Navbar TopNav tetap seimbang dan simetris dengan 6 tab utama berjarak proporsional.
  - Seluruh siklus hidup hardware IoT (pendaftaran awal, pairing mobil, kalibrasi ADC, hingga update parameter sleep) terkumpul dalam satu rumah kendali teknisi yang terintegrasi.
* **Kekurangan:**
  - Menu 06 memiliki 3 sub-tab navigasi internal.

---

## 4. Matriks Perbandingan Rencana Kerja

| Aspek | Kondisi Saat Ini | Rencana Perbaikan / Implementasi |
|---|---|---|
| **Pilihan Unit Menu 03** | Rusak vertikal & terpotong karena class `.panel` tertimpa CSS desktop `.workspace .panel`. | Hapus `.panel`, gunakan horizontal scroll bar mandiri dengan `min-w-0` dan `shrink-0`. Tombol berjejer rapi dan dapat digeser mulus. |
| **Data Mode Live API** | Menampilkan 12 unit mock (11 unit dummy offline fiktif). | **Hanya menampilkan unit terdaftar aktual (1 unit: `STOCK-01`)**. Tidak ada dummy di mode live. |
| **Data Mode Sandbox** | Menampilkan 12 unit simulasi. | Tetap mempertahankan 12 unit simulasi lengkap untuk pengujian multi-armada dan stres-test layout. |
| **Fitur Onboarding IoT & ECU** | Belum ada (hanya form mini unpair/re-assign VIN statis di Config). | Implementasi **IoT Node Onboarding & ECU Fingerprinting Wizard** (Deteksi MAC/Node, Query VIN Mode 09, Decode Model, Registrasi MySQL `vehicles`). |
| **Penempatan Menu Onboarding** | Belum ditentukan. | **Pilihan User:** Opsi 1 (Menu Baru 07) atau Opsi 2 (Sub-Tab Onboarding Terpadu di Menu 06). |

---

## 5. Rekomendasi Langkah Selanjutnya

1. **Prioritas 1 (Bugfix Tampilan Menu 03 & Audit Menu Lain):** Segera perbaiki container pemilihan unit di [WarmupQueueModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/WarmupQueueModule.tsx) agar 12 unit dapat di-scroll secara horizontal tanpa merusak layout.
2. **Prioritas 2 (Isolasi Live API 1 Unit vs Sandbox 12 Unit):** Perbarui [TelemetryContext.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/context/TelemetryContext.tsx) agar saat `dataSource === "LIVE_API"`, daftar unit murni memuat unit aktual yang dikembalikan API backend MySQL (1 unit).
3. **Prioritas 3 (Konfirmasi Pilihan Arsitektur Menu Onboarding):**
   - Apakah Anda lebih menyukai **Opsi 1 (Menu Baru 07 "Onboarding & Pairing IoT")** di TopNav?
   - Atau **Opsi 2 (Sub-Tab Onboarding Terpadu di dalam Menu 06 "Konfigurasi Node")** agar TopNav tetap berisi 6 menu simetris?
