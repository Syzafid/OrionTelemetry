import type { ModuleId } from "@/context/TelemetryContext";

export type GuideTrackId = "overview" | ModuleId;

export interface WebGuideStep {
  id: string;
  title: string;
  description: string;
  tip: string;
  tryAction?: string;
  moduleId?: ModuleId;
  subTab?: string;
  targetSelector: string;
}

export interface GuideTrack {
  id: GuideTrackId;
  shortLabel: string;
  title: string;
  summary: string;
  moduleId?: ModuleId;
  nextTrackId?: GuideTrackId;
  steps: WebGuideStep[];
}

export const WEB_GUIDE_COMPLETED_KEY = "orion_web_guide_completed";
export const WEB_GUIDE_COMPLETED_TRACKS_KEY = "orion_web_guide_completed_tracks";
export const GUIDE_SUBTAB_EVENT = "orion:guide-subtab";

export const WEB_GUIDE_TRACKS: GuideTrack[] = [
  {
    id: "overview",
    shortLabel: "Navigasi",
    title: "Navigasi Utama & Bilah Atas",
    summary:
      "Pindah antar menu, buka pencarian cepat, cek status Access Point, aktifkan alarm suara, dan ganti mode data.",
    nextTrackId: "01",
    steps: [
      {
        id: "ov-tabs",
        title: "Deretan Tab Menu 01 sampai 06",
        description:
          "Enam tab di bagian bawah bilah atas membuka seluruh halaman kerja ORION dalam satu layar tanpa memuat ulang aplikasi. Pilihan kendaraan yang sedang aktif ikut dibawa saat Anda berpindah tab.",
        tip: "Anda bisa menekan Alt+1 sampai Alt+6 di keyboard untuk berpindah tab seketika.",
        tryAction: "Coba klik beberapa tab di atas lalu perhatikan perpindahan cepatnya.",
        targetSelector: '[data-guide-target="module-tabs"]',
      },
      {
        id: "ov-tools",
        title: "Pencarian Cepat (Ctrl+K)",
        description:
          "Tombol Cari Cepat membuka jendela perintah global untuk melompat ke unit tertentu, berpindah menu, mengubah jumlah unit simulasi, atau langsung mengunduh laporan Excel.",
        tip: "Tekan Ctrl+K (Windows/Linux) atau Cmd+K (Mac) dari menu mana saja.",
        tryAction: "Klik Cari Cepat atau tekan Ctrl+K, lalu ketik nomor bay seperti A-01.",
        targetSelector: '[data-guide-target="nav-tools"]',
      },
      {
        id: "ov-docs-help",
        title: "Dokumentasi Teknis & Bantuan Kontekstual",
        description:
          "Tombol Docs membuka dokumentasi lengkap di /docs/, sedangkan tombol Bantuan otomatis mengenali menu yang sedang Anda buka dan menampilkan daftar langkah khusus menu tersebut.",
        tip: "Tekan tanda tanya (?) di keyboard (di luar kotak ketik) untuk membuka jendela Bantuan.",
        tryAction:
          "Setelah selesai, tekan tombol ? kapan saja jika ingin pindah ke panduan menu lain.",
        targetSelector: '[data-guide-target="nav-docs-help"]',
      },
      {
        id: "ov-ap-alarm",
        title: "Status Yard AP, Jumlah di Yard & Alarm Suara",
        description:
          "Bilah ini menampilkan jumlah node yang tersambung ke Access Point gudang, jumlah unit yang terpantau berada di dalam area parkir, serta sakelar Alarm Suara (880Hz/660Hz) untuk peringatan kondisi kritis.",
        tip: "Secara bawaan Alarm Suara dalam mode Senyap agar browser tidak bising sebelum diaktifkan.",
        tryAction: "Klik tombol Alarm Suara untuk mencoba bunyi konfirmasi audio browser.",
        targetSelector: '[data-guide-target="nav-ap-alarm"]',
      },
      {
        id: "ov-status",
        title: "Ganti Mode Simulasi / Live API & Endpoint",
        description:
          "Tombol ini memindahkan sumber data antara Mode Simulasi (12 unit contoh lokal) dan Live API (polling 3 detik ke server MySQL). Ikon gir di sebelah kanan membuka pengaturan alamat endpoint API.",
        tip: "Saat server Live API terputus sementara, indikator berubah menjadi Cache Offline memakai snapshot terakhir.",
        tryAction:
          "Klik ikon gir di kanan tombol ini untuk melihat alamat API dan tombol Cek Koneksi.",
        targetSelector: '[data-guide-target="nav-status"]',
      },
    ],
  },
  {
    id: "01",
    shortLabel: "Menu 01",
    title: "Menu 01: Topologi & Transduser",
    summary:
      "Pilih kendaraan di daftar unit, klik komponen pada gambar topologi, lalu periksa matriks saluran, grafik 24 jam, dan ringkasan OBD-II.",
    moduleId: "01",
    nextTrackId: "02",
    steps: [
      {
        id: "m01-unit-list",
        title: "Daftar & Filter Unit Stock Yard",
        description:
          "Daftar samping menampilkan seluruh kendaraan yang sedang dipantau lengkap dengan nomor bay, status koneksi (Live/Deep Sleep), dan tegangan aki terbaru. Kotak filter di atas daftar membantu menyaring menurut bay, model, atau nomor rangka.",
        tip: "Pada layar HP atau tablet, daftar ini tampil sebagai bar gulir horizontal di bagian atas peta.",
        tryAction:
          "Klik unit lain pada daftar atau ketik TRITON di kotak filter untuk mencoba penyaringan.",
        moduleId: "01",
        targetSelector: '[data-guide-target="m01-unit-list"]',
      },
      {
        id: "m01-header",
        title: "Header Unit & Pintasan Cepat Antar Menu",
        description:
          "Bagian atas panggung menampilkan identifikasi unit terpilih (Bay, Unit ID, model, VIN) beserta pintasan ke menu lain ketika muncul peringatan, seperti Antrean Pemanasan (03) atau Kalibrasi & Config (06).",
        tip: "Pada Mode Simulasi tersedia tombol Segarkan/uji langsung jika Anda ingin melihat respons tampilan.",
        tryAction: "Periksa nomor VIN dan status sinkronisasi terakhir di bawah judul unit.",
        moduleId: "01",
        targetSelector: '[data-guide-target="m01-header"]',
      },
      {
        id: "m01-stage",
        title: "Peta Visual Kelistrikan & Titik Komponen",
        description:
          "Gambar topologi menampilkan enam subsistem kendaraan: Aki, Alternator, Powertrain, CAN OBD-II, ESP32 Core, dan Jaringan Wi-Fi. Warna titik mengikuti kondisi pembacaan unit yang sedang dipilih.",
        tip: "Anda dapat mengklik titik komponen langsung pada gambar ataupun lewat tombol filter di bagian bawah.",
        tryAction:
          "Klik titik Aki atau Alternator pada gambar kendaraan untuk memfokuskan inspector di bawahnya.",
        moduleId: "01",
        targetSelector: '[data-guide-target="m01-stage"]',
      },
      {
        id: "m01-inspector-matrix",
        title: "Inspector Tab 1: Matriks Data Stream (8 Saluran)",
        description:
          "Tab Matriks Data Stream merinci seluruh 8 saluran telemetri yang diterima dari unit (tegangan terminal, arus tidur shunt, keluaran pengisian alternator, RPM, coolant, CAN bus, dan sinyal RSSI).",
        tip: "Saat memilih satu node di peta topologi, tabel otomatis menyaring saluran milik komponen itu beserta tombol Tampilkan Semua.",
        tryAction:
          "Gulir bagian tengah panel dan coba ubah filter komponen di peta untuk melihat perubahan baris.",
        moduleId: "01",
        subTab: "matrix",
        targetSelector: '[data-guide-target="m01-inspector"]',
      },
      {
        id: "m01-inspector-detail",
        title: "Inspector Tab 2 & 3: Transduser OLS & Catatan Cek",
        description:
          "Tab Transduser & OLS menunjukkan nilai kalibrasi slope/offset aktif serta grafik tren 24 jam, sedangkan tab berikutnya memuat catatan pemeriksaan rutin komponen terkait.",
        tip: "Gunakan tombol tab di kanan atas inspector untuk berganti antara data sensor mentah, kalibrasi, dan catatan.",
        tryAction:
          "Klik tab ketiga di inspector jika ingin melihat daftar catatan pemeriksaan komponen.",
        moduleId: "01",
        subTab: "transducer",
        targetSelector: '[data-guide-target="m01-inspector"]',
      },
      {
        id: "m01-summary",
        title: "Ringkasan OBD-II & Pita Status Koneksi",
        description:
          "Panel kiri bawah meringkas bacaan kecepatan, tingkat bahan bakar, status MIL ECU, jarak sejak reset, dan jumlah rekaman yang mengantre di memori lokal node.",
        tip: "Saat mesin kendaraan mati (Standby), pembacaan OBD-II berstatus CAN Off agar tidak memberi angka palsu.",
        tryAction: "Bandingkan kolom ECU V / MIL saat mesin dalam keadaan Standby dan menyala.",
        moduleId: "01",
        targetSelector: '[data-guide-target="m01-summary"]',
      },
    ],
  },
  {
    id: "02",
    shortLabel: "Menu 02",
    title: "Menu 02: Armada & PDI",
    summary:
      "Cari dan saring kondisi aki seluruh armada, urutkan prioritas penanganan, kelola tiket, buka sertifikat PDI, dan ekspor Excel atau CSV.",
    moduleId: "02",
    nextTrackId: "03",
    steps: [
      {
        id: "m02-filter-bar",
        title: "Pencarian & Filter Status Kondisi Aki",
        description:
          "Ketik nomor bay, model, nomor rangka, atau kode DTC untuk menyaring kartu unit secara instan. Empat tombol filter mengelompokkan unit ke dalam Semua, Kritis, Peringatan, atau Normal / Mengisi.",
        tip: "Jika hasil pencarian kosong, tersedia tombol Reset Pencarian & Filter untuk mengembalikan daftar penuh.",
        tryAction:
          "Klik tombol filter Kritis atau ketik XPANDER di kotak pencarian untuk mencoba saringan.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-filter-bar"]',
      },
      {
        id: "m02-actions",
        title: "Urutan Prioritas, Ekspor Excel & Unduh CSV",
        description:
          "Dropdown pengurutan mengatur urutan kartu berdasarkan Prioritas Aki, Voltase Terendah, Sisa Waktu Tercepat, atau Lokasi Bay. Tombol Ekspor Excel dan Unduh CSV membuka dialog pengaturan cakupan unit serta periode laporan.",
        tip: "Angka jumlah unit pada tombol Ekspor selalu mengikuti hasil filter yang sedang aktif di layar.",
        tryAction:
          "Klik Ekspor Excel untuk mencoba jendela pemilihan periode Harian/Bulanan/Tahunan dan resolusi data.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-actions"]',
      },
      {
        id: "m02-quickjump",
        title: "Bilah Pilih Cepat & Navigasi Halaman Kartu",
        description:
          "Saat menampilkan lebih dari satu unit, bar Pilih Cepat memungkinkan Anda melompat langsung ke kartu unit tertentu tanpa menggeser dek secara manual. Tombol Sebelumnya/Berikutnya berpindah halaman dek kartu.",
        tip: "Titik warna pada tiap tombol bay menandakan status voltase terakhir unit tersebut.",
        tryAction: "Klik salah satu tombol bay di bar Pilih Cepat untuk menggeser dek kartu.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-quickjump"]',
      },
      {
        id: "m02-cards",
        title: "Kartu Kesehatan Baterai & Laju Kuras",
        description:
          "Setiap kartu memuat informasi lengkap satu unit: lokasi bay, grafik tren tegangan, nilai ADC mentah, suhu RTC, serta laju kuras dan estimasi sisa waktu aman sebelum mencapai batas kritis.",
        tip: "Anda dapat menggulir dek kartu secara horizontal maupun menggulir isi di dalam kartu saat layar sempit.",
        tryAction:
          "Geser dek kartu ke kanan/kiri atau gulir isi salah satu kartu untuk melihat metrik lengkapnya.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-cards"]',
      },
      {
        id: "m02-card-ticket",
        title: "Panel Status Tiket & Klaim Penanganan",
        description:
          "Pada unit yang sedang dalam kondisi Peringatan, Kritis, atau sudah memiliki tiket aktif, kotak ini menampilkan kode tiket, penanggung jawab (PIC), catatan terakhir, dan tombol Klaim Tiket / Tutup Tiket.",
        tip: "Klik Tutup Tiket... untuk membuka form pengesahan tindakan pemeliharaan (misalnya pengisian daya charger).",
        tryAction:
          "Klik Klaim Tiket atau Tutup Tiket... pada kartu yang memiliki tiket untuk mencoba alurnya.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-card-ticket"]',
      },
      {
        id: "m02-card-actions",
        title: "Tombol Bawah Kartu: Pemanasan, PDI & Pintasan",
        description:
          "Bagian kaki kartu berisi tombol Catat Jadwal Pemanasan (untuk unit yang tegangannya rendah), ekspor Excel/CSV satuan, pratinjau Sertifikat PDI yang siap cetak, serta pintasan menuju Menu 04 dan Menu 01.",
        tip: "Klik PDI Cert untuk membuka lembar Sertifikat Inspeksi Pra-Kirim dengan opsi cetak bersih.",
        tryAction:
          "Klik tombol PDI Cert di kaki kartu untuk melihat pratinjau sertifikat unit tersebut.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-card-actions"]',
      },
    ],
  },
  {
    id: "03",
    shortLabel: "Menu 03",
    title: "Menu 03: Antrean Pemanasan",
    summary:
      "Pantau jumlah unit perlu pemanasan, jalankan stopwatch target 10 menit, jadwalkan unit prioritas, dan tinjau grafik serta riwayat sesi.",
    moduleId: "03",
    nextTrackId: "04",
    steps: [
      {
        id: "m03-kpi",
        title: "Bar Status KPI Pemanasan Mesin",
        description:
          "Menampilkan jumlah unit yang mesinnya sedang menyala (Sedang Nyala), sudah terverifikasi mengisi pada tegangan >= 13.50V, dan yang masih menunggu pemanasan karena voltase rendah.",
        tip: "Penghitungan ini mengikuti data real-time saat Live API aktif atau status simulasi di browser.",
        tryAction: "Perhatikan angka unit di pojok kanan bar ini saat menyalakan simulasi mesin.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-kpi"]',
      },
      {
        id: "m03-unit-strip",
        title: "Bilah Pemilih Cepat Unit Target",
        description:
          "Pilih salah satu unit kendaraan di bar horizontal ini untuk mengarahkan konsol stopwatch, grafik kurva, dan pencatatan jadwal pemanasan ke unit tersebut.",
        tip: "Unit berstatus RUN ditandai warna hijau agar mudah dibedakan dari unit yang sedang Standby.",
        tryAction:
          "Klik beberapa tombol bay di bar ini untuk melihat konsol dan grafik berganti unit.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-unit-strip"]',
      },
      {
        id: "m03-console",
        title: "Konsol Timer 10 Menit & Verifikasi Alternator",
        description:
          "Konsol utama menampilkan stopwatch durasi pemanasan terhadap target 10 menit (600 detik), status pengisian alternator, tombol Catat Jadwal Pemanasan, dan tombol Simulasikan Kontak Nyala (ON).",
        tip: "Saat kontak dinyalakan dalam Mode Simulasi, timer berjalan otomatis dan status pengisian 14.20V ikut terverifikasi.",
        tryAction:
          "Klik Simulasikan Kontak Nyala (ON) lalu hentikan lagi untuk mencatat sesi contoh ke tabel riwayat.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-console"]',
      },
      {
        id: "m03-queue",
        title: "Daftar Prioritas Pemanasan Armada",
        description:
          "Mengurutkan otomatis unit dengan tegangan di bawah batas aman dari yang terendah. Setiap baris memiliki tombol Jadwalkan (mencegah pengiriman ganda setelah tercatat) dan tombol Pilih untuk fokus ke konsol atas.",
        tip: "Jika semua unit bervoltase aman, panel ini otomatis menampilkan kondisi baterai prima.",
        tryAction:
          "Klik Jadwalkan atau Pilih pada salah satu unit bervoltase rendah di daftar ini.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-queue"]',
      },
      {
        id: "m03-history",
        title: "Grafik Kurva Langsung & Riwayat Sesi Pemanasan",
        description:
          "Panel kanan atas memplot kurva RPM & coolant (saat mesin ON) atau voltase & suhu RTC (saat Standby), sedangkan panel bawah mencatat riwayat sesi selesai beserta durasi dan tegangan puncaknya.",
        tip: "Pada Mode Live API, tabel riwayat hanya memuat catatan nyata dari server tanpa data dummy simulator.",
        tryAction:
          "Gulir daftar riwayat di panel kanan bawah setelah menguji sesi simulasi pemanasan.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-history"]',
      },
    ],
  },
  {
    id: "04",
    shortLabel: "Menu 04",
    title: "Menu 04: OBD-II Diagnostik",
    summary:
      "Periksa instrumen RPM dan coolant, 8 parameter powertrain, kode gangguan DTC (mode baca saja), data emisi/BBM, serta matriks pinout OBD-II.",
    moduleId: "04",
    nextTrackId: "05",
    steps: [
      {
        id: "m04-toolbar",
        title: "Pemilih Unit & Pencarian Kode Gangguan",
        description:
          "Pilih kendaraan target dari bar horizontal atau gunakan kotak pencarian di sebelah kiri untuk mencari menurut nomor bay, model, atau kode DTC aktif (misalnya P0133).",
        tip: "Unit dengan kode DTC aktif otomatis ditandai bingkai merah di daftar pilih.",
        tryAction: "Pilih unit yang berbeda atau ketik P0133 di kotak pencarian.",
        moduleId: "04",
        targetSelector: '[data-guide-target="m04-toolbar"]',
      },
      {
        id: "m04-sim-controls",
        title: "Kontrol Simulasi Mesin, DTC & Pintasan Modul",
        description:
          "Bar kedua menampilkan kode mesin, status koneksi, waktu last seen, tombol simulasi (Menyala/Matikan Mesin, Simulasi DTC P0133, Pulihkan Nominal), dan tombol pindah ke Menu 02, 03, atau 06.",
        tip: "Tombol Simulasi hanya tampil pada Mode Simulasi agar data produksi pada Live API tetap bersih.",
        tryAction:
          "Klik Simulasikan Mesin ON atau Simulasi DTC P0133 lalu perhatikan perubahan di sub-tab di bawah.",
        moduleId: "04",
        targetSelector: '[data-guide-target="m04-sim-controls"]',
      },
      {
        id: "m04-subtabs",
        title: "Tiga Sub-Tab Kategori Diagnostik",
        description:
          "Halaman Diagnostik dipecah menjadi 3 bagian: 01 Instrumen & Powertrain, 02 Emisi, BBM & DTC, dan 03 Kelistrikan & Pinout CAN. Badge jumlah kode atau voltase ikut tampil di judul sub-tab.",
        tip: "Gunakan tombol panah kiri/kanan pada keyboard saat fokus di tab untuk berpindah cepat.",
        tryAction: "Klik ketiga tab di bar ini untuk meninjau masing-masing tampilannya.",
        moduleId: "04",
        subTab: "POWERTRAIN",
        targetSelector: '[data-guide-target="m04-subtabs"]',
      },
      {
        id: "m04-gauges",
        title: "Sub-Tab 01: Gauge RPM, Suhu Coolant & Grafik Tren",
        description:
          "Menampilkan dua dial meter analog untuk putaran mesin (PID 010C) dan suhu cairan pendingin (PID 0105), berdampingan dengan grafik tren dari rekaman nyata terakhir.",
        tip: "Saat mesin Standby (0 RPM), area grafik memberi keterangan jelas beserta tombol pintasan ke Antrean Pemanasan.",
        tryAction:
          "Coba nyalakan simulasi mesin untuk melihat jarum RPM bergerak dan grafik tergambar.",
        moduleId: "04",
        subTab: "POWERTRAIN",
        targetSelector: '[data-guide-target="m04-gauges"]',
      },
      {
        id: "m04-powertrain",
        title: "Sub-Tab 01: 8 Kartu Parameter Powertrain (Mode 01)",
        description:
          "Di bawah panel gauge terdapat 8 kartu pembacaan Mode 01 baca-saja, mencakup beban mesin, throttle, tekanan MAP, aliran udara MAF, timing pengapian, tegangan kontrol, jarak tempuh, dan durasi mesin menyala.",
        tip: "Setiap kartu mencantumkan kode PID standar dan rentang idle sebagai acuan membaca angka.",
        tryAction: "Gulir ke bawah pada panel ini untuk memeriksa kedelapan kartu parameter mesin.",
        moduleId: "04",
        subTab: "POWERTRAIN",
        targetSelector: '[data-guide-target="m04-powertrain"]',
      },
      {
        id: "m04-dtc",
        title: "Sub-Tab 02: Monitor DTC (Mode 03) & Emisi BBM",
        description:
          "Kolom kiri menampilkan status MIL serta detail kode kerusakan (Mode 03 baca-saja tanpa mengirim perintah hapus ke ECU). Kolom kanan menampilkan level tangki bahan bakar, laju konsumsi, dan status loop campuran.",
        tip: "Jika sebelumnya Anda mengaktifkan Simulasi DTC P0133, detail sensor oksigen langsung tampil di sini.",
        tryAction:
          "Periksa status Read-Only ECU di kanan atas panel DTC dan uraian penyebab gangguan.",
        moduleId: "04",
        subTab: "EMISSIONS",
        targetSelector: '[data-guide-target="m04-dtc"]',
      },
      {
        id: "m04-electrical",
        title: "Sub-Tab 03: Kelistrikan Node & Matriks Pinout J1962",
        description:
          "Menampilkan 4 kartu kelistrikan (tegangan modul ECU, aki terminal, arus tidur shunt, RSSI) serta tabel acuan jalur kabel OBD-II 16-pin J1962 untuk membantu verifikasi pembacaan di aplikasi.",
        tip: "Tabel pinout memberi penanda antara nilai bacaan sensor langsung dan nilai referensi spesifikasi.",
        tryAction: "Gulir ke bawah untuk membaca keseluruhan baris status W-01 sampai W-04.",
        moduleId: "04",
        subTab: "ELECTRICAL",
        targetSelector: '[data-guide-target="m04-electrical"]',
      },
    ],
  },
  {
    id: "05",
    shortLabel: "Menu 05",
    title: "Menu 05: Presensi & Log",
    summary:
      "Pantau proteksi putus Wi-Fi massal, kapasitas memori antrean offline dua tingkat, kontrol tampilan log, dan catatan aktivitas kendaraan.",
    moduleId: "05",
    nextTrackId: "06",
    steps: [
      {
        id: "m05-guard",
        title: "Indikator Proteksi Putus Wi-Fi Massal",
        description:
          "Saat >= 66% armada terputus bersamaan pada jaringan yang memiliki minimal 2 unit, sistem menahan status keberangkatan agar mati lampu atau gangguan Access Point gudang tidak dianggap kendaraan keluar area.",
        tip: "Keterangan di bawah judul menjelaskan hitungan persentase unit di luar jangkauan saat ini.",
        tryAction: "Perhatikan indikator status di sebelah kanan panel ini.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-guard"]',
      },
      {
        id: "m05-filter-row",
        title: "Pencarian & Filter Presensi Lokasi / Buffer",
        description:
          "Cari unit berdasarkan bay, model, VIN, ID event, atau tag aktivitas. Tombol filter menyaring Semua, Di Dalam Yard, Di Luar Yard, serta unit yang masih memiliki Antrean Buffer > 0.",
        tip: "Dalam Mode Simulasi juga tersedia tombol simulasi keluar/masuk dan spillover di bar aksi.",
        tryAction: "Coba klik filter Di Luar Yard atau ketik nama tag seperti Test Drive.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-filter-row"]',
      },
      {
        id: "m05-buffer",
        title: "Peta Slot Antrean Dua Tingkat (RTC + LittleFS)",
        description:
          "Memvisualisasikan 20 slot memori cepat Tier-1 RTC SRAM milik node terpilih (plus kapasitas limpahan 2.000 slot Tier-2 LittleFS) ketika perangkat kehilangan koneksi Wi-Fi sementara.",
        tip: "Klik tombol bay di bar atas panel ini untuk berpindah melihat status antrean unit lainnya.",
        tryAction: "Pilih beberapa unit di atas peta slot dan amati angka terisi per 20 slotnya.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-buffer"]',
      },
      {
        id: "m05-buffer-actions",
        title: "Status Sync, Reset Antrean & Riwayat Burst Sync",
        description:
          "Panel penjelasan status menunjukkan apakah memori perangkat kosong atau sedang menahan rekaman menunggu unggah massal (Burst Sync), diikuti tombol Konfirmasi / Reset Antrean dan log riwayat Burst Sync.",
        tip: "Pada Mode Simulasi, Anda bisa mencoba tombol Simulasi 28 Data Offline di panel ini lalu me-resetnya.",
        tryAction: "Coba klik Simulasi 28 Data Offline lalu klik Konfirmasi / Reset Antrean.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-buffer-actions"]',
      },
      {
        id: "m05-log-controls",
        title: "Cakupan Unit & Mode Tabel Pergerakan",
        description:
          "Kontrol di kanan atas tabel mengatur cakupan baris (Semua Unit atau hanya Unit terpilih) serta mode tampilan: Sesi Keluar-Masuk (memasangkan waktu keluar-kembali) atau Transisi 4-Zona (kejadian mentah).",
        tip: "Tanda (~) di depan durasi menunjukkan penyesuaian jam otomatis setelah perangkat sinkron ulang ke NTP.",
        tryAction:
          "Klik Transisi 4-Zona lalu kembali ke Sesi Keluar-Masuk untuk membandingkan isi tabel.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-log-controls"]',
      },
      {
        id: "m05-log-table",
        title: "Tabel Riwayat Pergerakan & Pemberian Tag Aktivitas",
        description:
          "Tabel kanan mencatat waktu keluar/masuk area gudang, zona asal-tujuan, durasi, serta tombol tag aktivitas operasional (seperti Test Drive, Detailing, atau Pengisian BBM) agar riwayat perpindahan tercatat rapi.",
        tip: "Klik tombol Detailing atau Test Drive di salah satu baris untuk menandai alasan pergerakan unit.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-log-table"]',
      },
    ],
  },
  {
    id: "06",
    shortLabel: "Menu 06",
    title: "Menu 06: Konfigurasi Node",
    summary:
      "Kelola tiga sub-tab lengkap: pendaftaran & penautan node baru, batas tegangan & kalibrasi ADC 4-titik, serta tiket dan log audit.",
    moduleId: "06",
    steps: [
      {
        id: "m06-subtabs",
        title: "Sub-Tab Pengaturan, Target Node & Status NVS",
        description:
          "Bar kontrol atas menyediakan 3 sub-tab konfigurasi, dropdown pemilih Target Node, lencana koneksi online/tidur, serta status sinkronisasi NVS Sinkron vs ACK Tertunda untuk node terpilih.",
        tip: "Gunakan dropdown Target Node terlebih dahulu sebelum mengubah parameter tegangan atau kalibrasi.",
        tryAction:
          "Ubah Target Node di sisi kanan dan perhatikan nilai slope/offset di baris bawah bar ini.",
        moduleId: "06",
        subTab: "ONBOARDING",
        targetSelector: '[data-guide-target="m06-subtabs"]',
      },
      {
        id: "m06-onboard-form",
        title: "Sub-Tab 01 (Kiri): Form Pendaftaran Node & Label QR",
        description:
          "Formulir ini digunakan untuk mendaftarkan perangkat baru (Unit Node ID, versi PCB, VIN, model, varian, bay, warna, serta batas voltase dan interval tidur awal) dan membuat label QR identitas unit.",
        tip: "Form selalu dibuka kosong agar tidak menimpa data dengan nilai tiruan; gunakan Isi Contoh Data saat mencoba di Mode Simulasi.",
        tryAction:
          "Klik Isi Contoh Data (jika di Mode Simulasi) atau gulir form untuk melihat pratinjau QR.",
        moduleId: "06",
        subTab: "ONBOARDING",
        targetSelector: '[data-guide-target="m06-onboard-form"]',
      },
      {
        id: "m06-onboard-dir",
        title: "Sub-Tab 01 (Kanan): Direktori Node, Lepas & Tautkan Ulang",
        description:
          "Menampilkan daftar seluruh perangkat terdaftar beserta kotak pencarian. Anda dapat melepas node dari kendaraan lama lalu menautkannya ke kendaraan lain lewat form penautan ulang.",
        tip: "Jika pencarian tidak menemukan node, gunakan tombol Reset Pencarian.",
        tryAction:
          "Ketik nomor bay di kotak cari atau coba klik Lepas Node pada salah satu baris simulasi.",
        moduleId: "06",
        subTab: "ONBOARDING",
        targetSelector: '[data-guide-target="m06-onboard-dir"]',
      },
      {
        id: "m06-cal-nvs",
        title: "Sub-Tab 02 (Kiri): Parameter NVS & Pratinjau JSON ACK",
        description:
          "Atur ambang voltase kritis (crit_v), interval deep sleep (sleep_cfg), batas debounce keluar area, dan interval fast poll. Di bagian bawah tampil pratinjau persis payload JSON Piggyback ACK dari server.",
        tip: "Tombol Simpan otomatis terkunci bila nilai crit_v atau interval berada di luar batas aman firmware.",
        tryAction:
          "Ubah Interval Deep Sleep menjadi 1 Jam lalu klik Simpan & Antrekan ACK NVS untuk melihat JSON berubah.",
        moduleId: "06",
        subTab: "CALIBRATION",
        targetSelector: '[data-guide-target="m06-cal-nvs"]',
      },
      {
        id: "m06-cal-ols",
        title: "Sub-Tab 02 (Kanan): Kalkulator Kalibrasi ADC 4-Titik",
        description:
          "Menghitung koefisien regresi linear OLS (slope, offset, dan R-kuadrat) dari 4 pasang angka tegangan multimeter (DMM) dan pembacaan mentah GPIO34 (mV). Tersedia preset bawaan PCB v1.0 dan v2.0.",
        tip: "Jika nilai R-kuadrat di bawah ambang kelayakan, tombol Simpan ke NVS otomatis dinonaktifkan untuk mencegah salah kalibrasi.",
        tryAction:
          "Klik Muat Preset PCB v2.0 dan perhatikan perubahan grafik garis serta nilai slope/offset.",
        moduleId: "06",
        subTab: "CALIBRATION",
        targetSelector: '[data-guide-target="m06-cal-ols"]',
      },
      {
        id: "m06-ticket-panel",
        title: "Sub-Tab 03 (Kiri): Tiket Pemeliharaan & Serah Terima Shift",
        description:
          "Panel ini mengelola alur kerja tiket untuk unit terpilih: isi nama penanggung jawab, tulis catatan serah terima shift, lalu ubah status tiket (Klaim Dikerjakan, Tandai Selesai, atau Buka Ulang).",
        tip: "Setiap perubahan status tiket otomatis dicatat ke tabel Jejak Audit di panel sebelah kanan.",
        tryAction: "Isi nama Anda dan catatan singkat, lalu klik Klaim Dikerjakan.",
        moduleId: "06",
        subTab: "TICKETS",
        targetSelector: '[data-guide-target="m06-ticket-panel"]',
      },
      {
        id: "m06-audit-panel",
        title: "Sub-Tab 03 (Kanan): Jejak Audit Operasional & Filter Log",
        description:
          "Menampilkan riwayat kronologis aktivitas sistem (sinkronisasi data, kalibrasi, antrean NVS, jadwal pemanasan, perubahan tiket) yang dapat disaring menurut kata kunci, tingkat keparahan, atau unit.",
        tip: "Jika daftar tampak kosong karena kata kunci/filter masih terisi, klik Reset Filter Audit.",
        tryAction:
          "Gunakan dropdown tingkat keparahan (INFO/WARN/CRITICAL) atau kotak pencarian untuk memfilter log.",
        moduleId: "06",
        subTab: "TICKETS",
        targetSelector: '[data-guide-target="m06-audit-panel"]',
      },
    ],
  },
];

export const WEB_GUIDE_STEPS: WebGuideStep[] = WEB_GUIDE_TRACKS.flatMap((track) => track.steps);

export function getGuideTrack(trackId: GuideTrackId): GuideTrack {
  return WEB_GUIDE_TRACKS.find((t) => t.id === trackId) ?? WEB_GUIDE_TRACKS[0]!;
}

export function readCompletedGuideTracks(): GuideTrackId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WEB_GUIDE_COMPLETED_TRACKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const validIds = new Set<string>(WEB_GUIDE_TRACKS.map((t) => t.id));
    return parsed.filter(
      (item): item is GuideTrackId => typeof item === "string" && validIds.has(item),
    );
  } catch {
    return [];
  }
}

export function markGuideTrackCompleted(trackId: GuideTrackId): GuideTrackId[] {
  if (typeof window === "undefined") return [];
  try {
    const existing = readCompletedGuideTracks();
    const next = existing.includes(trackId) ? existing : [...existing, trackId];
    window.localStorage.setItem(WEB_GUIDE_COMPLETED_TRACKS_KEY, JSON.stringify(next));
    window.localStorage.setItem(WEB_GUIDE_COMPLETED_KEY, "1");
    return next;
  } catch {
    return [];
  }
}
