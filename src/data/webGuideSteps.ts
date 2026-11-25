import type { ModuleId } from "@/context/TelemetryContext";

export type GuideTrackId = "overview" | ModuleId;

export interface WebGuideStep {
  id: string;
  title: string;
  description: string;
  tip: string;
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
      "Pindah antar menu, cari unit dengan cepat, aktifkan alarm suara, dan ganti sumber data Simulasi atau Live API.",
    nextTrackId: "01",
    steps: [
      {
        id: "ov-tabs",
        title: "Tab Menu 01 sampai 06",
        description:
          "Deretan tab ini membuka enam halaman kerja ORION dalam satu layar tanpa memuat ulang halaman. Halaman Topologi, Armada, Pemanasan, Diagnostik, Presensi, dan Konfigurasi selalu tersimpan keadaannya saat berpindah tab.",
        tip: "Anda juga bisa menekan tombol Alt+1 sampai Alt+6 di keyboard untuk berpindah menu lebih cepat.",
        targetSelector: '[data-guide-target="module-tabs"]',
      },
      {
        id: "ov-tools",
        title: "Cari Cepat (Ctrl+K) & Bantuan (?)",
        description:
          "Tombol Cari Cepat membuka kotak pencarian global untuk melompat ke unit kendaraan, lokasi bay, atau ekspor laporan. Tombol Bantuan menampilkan ringkasan menu yang sedang aktif serta panduan langkah demi langkah.",
        tip: "Tekan Ctrl+K (atau Cmd+K di Mac) untuk Cari Cepat, dan tekan tanda tanya (?) untuk membuka Bantuan.",
        targetSelector: '[data-guide-target="nav-tools"]',
      },
      {
        id: "ov-ap-alarm",
        title: "Indikator Yard AP & Alarm Suara",
        description:
          "Bilah atas juga menampilkan status Access Point gudang, jumlah unit yang berada di area yard, serta tombol Alarm Suara untuk memberi bunyi peringatan saat ada kondisi aki kritis atau kode DTC.",
        tip: "Secara bawaan Alarm Suara dalam keadaan Senyap agar nyaman di browser; klik untuk mengaktifkan saat pemantauan aktif.",
        targetSelector: '[data-guide-target="nav-ap-alarm"]',
      },
      {
        id: "ov-status",
        title: "Mode Simulasi, Live API & Pengaturan",
        description:
          "Tombol ini memindahkan sumber data antara Mode Simulasi (12 unit contoh) dan Mode Live API (server MySQL). Ikon gir di sebelah kanan membuka pengaturan alamat endpoint dan status sinkronisasi.",
        tip: "Bila server Live API terputus sementara, indikator berubah menjadi Cache Offline dan memakai rekaman lokal terakhir.",
        targetSelector: '[data-guide-target="nav-status"]',
      },
    ],
  },
  {
    id: "01",
    shortLabel: "Menu 01",
    title: "Menu 01: Topologi & Transduser",
    summary:
      "Pilih kendaraan di daftar unit lalu klik titik komponen pada gambar untuk memeriksa bacaan tiap saluran sensor.",
    moduleId: "01",
    nextTrackId: "02",
    steps: [
      {
        id: "m01-unit-list",
        title: "Daftar & Pencarian Unit Kendaraan",
        description:
          "Panel ini menampilkan seluruh unit yang sedang dipantau beserta nomor bay, tegangan aki terakhir, dan status koneksi. Ketik bay, model, atau nomor rangka di kotak filter untuk mempersempit daftar.",
        tip: "Pada layar HP atau tablet, daftar unit berubah menjadi tombol gulir horizontal di bagian atas peta.",
        moduleId: "01",
        targetSelector: '[data-guide-target="m01-unit-list"]',
      },
      {
        id: "m01-stage",
        title: "Peta Komponen Kelistrikan Interaktif",
        description:
          "Gambar topologi menampilkan jalur baterai, alternator, powertrain, CAN OBD-II, unit kontrol, dan jaringan Wi-Fi. Klik langsung titik komponen pada gambar untuk menyorot bagian tersebut.",
        tip: "Warna titik mengikuti kondisi komponen unit yang dipilih: hijau normal, kuning perlu dipantau, atau merah kritis.",
        moduleId: "01",
        targetSelector: '[data-guide-target="m01-stage"]',
      },
      {
        id: "m01-inspector",
        title: "Filter Komponen & Tabel Bacaan Sensor",
        description:
          "Bagian inspector merinci setiap saluran pembacaan dari node beserta catatan pemeriksaan singkat. Gunakan deretan tombol filter di sisi kanan untuk menampilkan Semua saluran atau satu komponen saja.",
        tip: "Grafik mini di sebelah kanan memperlihatkan tren tegangan 24 jam agar penurunan bertahap mudah terlihat.",
        moduleId: "01",
        targetSelector: '[data-guide-target="m01-inspector"]',
      },
      {
        id: "m01-summary",
        title: "Ringkasan OBD-II & Status Antrean Node",
        description:
          "Panel ringkasan menyajikan pembacaan kecepatan, tingkat bahan bakar, status MIL/ECU, jarak sejak reset, dan jumlah data yang masih mengantre di memori node.",
        tip: "Jika nilai OBD-II tertulis Standby atau Off, mesin kendaraan sedang mati sehingga hanya data tegangan aki yang diperbarui.",
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
      "Saring unit berdasarkan kondisi aki, urutkan prioritas penanganan, buka sertifikat PDI, dan unduh laporan Excel atau CSV.",
    moduleId: "02",
    nextTrackId: "03",
    steps: [
      {
        id: "m02-filter-bar",
        title: "Pencarian, Filter Status Aki & Pengurutan",
        description:
          "Gunakan kotak pencarian untuk mencari bay, model, nomor rangka, atau kode DTC. Tombol filter menyaring unit Kritis, Peringatan, atau Normal, dan dropdown urutkan membantu menaruh unit terendah di paling depan.",
        tip: "Tombol Pilih Cepat di bawah bar filter membantu melompat ke halaman kartu berikutnya saat daftar unit banyak.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-filter-bar"]',
      },
      {
        id: "m02-actions",
        title: "Ekspor Laporan Excel & Unduh CSV",
        description:
          "Klik Ekspor Excel atau Unduh CSV untuk membuka jendela pengaturan ekspor. Anda dapat memilih seluruh armada atau unit tertentu, rentang waktu harian hingga tahunan, dan resolusi data.",
        tip: "Jumlah unit pada tombol Ekspor selalu mengikuti hasil filter dan pencarian yang sedang aktif di layar.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-actions"]',
      },
      {
        id: "m02-cards",
        title: "Kartu Tegangan, Laju Kuras & Sisa Waktu",
        description:
          "Setiap kartu menampilkan grafik tegangan terbaru, nilai ADC mentah, suhu RTC, serta estimasi sisa waktu aman sebelum tegangan mencapai ambang kritis.",
        tip: "Pada layar desktop, daftar kartu dapat digulir ke samping menggunakan tombol Sebelumnya/Berikutnya atau trackpad.",
        moduleId: "02",
        targetSelector: '[data-guide-target="m02-cards"]',
      },
      {
        id: "m02-card-actions",
        title: "Aksi Unit: Pemanasan, Sertifikat PDI & Tiket",
        description:
          "Di bagian bawah kartu tersedia tombol untuk mengekspor laporan satuan, membuka pratinjau Sertifikat PDI yang siap cetak, serta membuka halaman Topologi atau Diagnostik untuk unit tersebut.",
        tip: "Untuk unit yang tegangannya rendah atau memiliki kode DTC, muncul tombol tambahan untuk mencatat jadwal pemanasan atau mengklaim tiket.",
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
      "Pantau daftar unit dengan voltase rendah, catat jadwal pemanasan mesin, dan amati timer 10 menit beserta riwayatnya.",
    moduleId: "03",
    nextTrackId: "04",
    steps: [
      {
        id: "m03-kpi",
        title: "Ringkasan Jumlah Unit & Pemilih Unit",
        description:
          "Bar atas menampilkan ringkasan berapa unit yang mesinnya sedang menyala, sudah mencapai tegangan pengisian target, dan masih menunggu pemanasan. Gunakan bar bay tepat di bawahnya untuk memilih unit.",
        tip: "Unit dengan label RUN hijau menandakan mesin atau pengisian alternator sedang aktif terbaca.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-kpi"]',
      },
      {
        id: "m03-console",
        title: "Konsol Timer 10 Menit & Status Alternator",
        description:
          "Konsol utama menghitung durasi mesin menyala menuju target 10 menit sekaligus memeriksa apakah tegangan pengisian alternator telah mencapai ambang verifikasi 13.50V.",
        tip: "Dalam Mode Simulasi, klik tombol Simulasikan Kontak Nyala (ON) untuk melihat stopwatch berjalan dan status alternator berubah.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-console"]',
      },
      {
        id: "m03-queue",
        title: "Daftar Prioritas Pemanasan & Tombol Jadwalkan",
        description:
          "Daftar ini otomatis mengurutkan unit dengan tegangan aki di bawah batas aman. Klik Jadwalkan untuk mencatat unit ke log aktivitas agar tidak terjadi pencatatan ganda.",
        tip: "Klik Pilih pada salah satu baris antrean untuk memindahkannya ke konsol pemantauan di atas.",
        moduleId: "03",
        targetSelector: '[data-guide-target="m03-queue"]',
      },
      {
        id: "m03-history",
        title: "Grafik Tegangan & Riwayat Sesi Pemanasan",
        description:
          "Sisi kanan memperlihatkan grafik tren tegangan atau putaran mesin secara langsung, diikuti tabel riwayat sesi pemanasan yang mencatat waktu, durasi, dan tegangan puncak pengisian.",
        tip: "Pada Mode Live API, tabel riwayat hanya memuat catatan nyata dari server tanpa menambahkan data tiruan.",
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
      "Baca instrumen RPM dan suhu mesin, kode gangguan DTC (mode baca saja), data bahan bakar, dan informasi pinout OBD-II.",
    moduleId: "04",
    nextTrackId: "05",
    steps: [
      {
        id: "m04-toolbar",
        title: "Pemilih Unit & Kontrol Simulasi Mesin",
        description:
          "Bar atas dipakai untuk memilih unit berdasarkan bay, model, atau kode DTC. Di Mode Simulasi tersedia tombol menyalakan mesin atau mencoba simulasi kode gangguan P0133 untuk melihat respons UI.",
        tip: "Gunakan tombol pintas di kanan bar atas jika ingin langsung membuka Menu 02, 03, atau 06 untuk unit yang sama.",
        moduleId: "04",
        targetSelector: '[data-guide-target="m04-toolbar"]',
      },
      {
        id: "m04-subtabs",
        title: "Tiga Sub-Tab Kategori Diagnostik",
        description:
          "Menu Diagnostik dibagi menjadi tiga sub-tab: 01 Instrumen & Powertrain, 02 Emisi, BBM & DTC, serta 03 Kelistrikan & Pinout CAN. Anda bisa berpindah lewat klik maupun tombol panah kiri/kanan keyboard.",
        tip: "Angka atau kode DTC di label sub-tab otomatis muncul bila unit sedang membawa gangguan terbaca.",
        moduleId: "04",
        subTab: "POWERTRAIN",
        targetSelector: '[data-guide-target="m04-subtabs"]',
      },
      {
        id: "m04-gauges",
        title: "Panel RPM, Suhu Coolant & Grafik Tren",
        description:
          "Pada sub-tab pertama, dua gauge menampilkan putaran mesin dan suhu cairan pendingin bersama grafik tren rekaman terakhir. Di bawahnya terdapat 8 kartu parameter powertrain.",
        tip: "Saat mesin mati, gauge berada pada posisi standby agar pengguna tahu pembacaan ECU belum aktif.",
        moduleId: "04",
        subTab: "POWERTRAIN",
        targetSelector: '[data-guide-target="m04-gauges"]',
      },
      {
        id: "m04-dtc",
        title: "Pembaca Kode Gangguan DTC (Mode 03)",
        description:
          "Sub-tab Emisi, BBM & DTC menampilkan daftar kode gangguan ECU beserta deskripsi penyebabnya. Semua pembacaan bersifat baca saja tanpa mengirim perintah hapus ke ECU.",
        tip: "Cek juga sub-tab ketiga jika ingin melihat daftar acuan pinout OBD-II dan nilai tegangan node.",
        moduleId: "04",
        subTab: "EMISSIONS",
        targetSelector: '[data-guide-target="m04-dtc"]',
      },
    ],
  },
  {
    id: "05",
    shortLabel: "Menu 05",
    title: "Menu 05: Presensi & Log",
    summary:
      "Pantau keberadaan unit di area gudang, kapasitas memori antrean offline di perangkat, dan riwayat keluar-masuk.",
    moduleId: "05",
    nextTrackId: "06",
    steps: [
      {
        id: "m05-guard",
        title: "Proteksi Putus Wi-Fi Massal & Filter Lokasi",
        description:
          "Panel atas memantau apabila banyak unit terputus bersamaan akibat gangguan Access Point gudang agar tidak memicu peringatan keluar area palsu. Bar di bawahnya menyaring unit Di Dalam Yard, Di Luar Yard, atau yang memiliki antrean data.",
        tip: "Ketik nomor bay, ID event, atau nama tag di kotak pencarian untuk menyaring tabel pergerakan sekaligus.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-guard"]',
      },
      {
        id: "m05-buffer",
        title: "Antrean Data Offline (RTC & LittleFS)",
        description:
          "Panel kiri memperlihatkan pemakaian 20 slot memori cepat RTC dan limpahan hingga 2.000 slot di penyimpanan LittleFS saat perangkat berada di luar jangkauan Wi-Fi.",
        tip: "Di Mode Simulasi tersedia tombol Simulasi 28 Data Offline dan Konfirmasi / Reset Antrean untuk menguji tampilan buffer.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-buffer"]',
      },
      {
        id: "m05-log-controls",
        title: "Cakupan Unit & Pilihan Mode Tabel Log",
        description:
          "Di pojok kanan panel log, atur apakah tabel menampilkan Semua Unit atau hanya Unit terpilih. Mode Sesi Keluar-Masuk memasangkan waktu pergi-kembali, sedangkan Transisi 4-Zona menampilkan tiap kejadian mentah.",
        tip: "Durasi yang disertai tanda penyesuaian menunjukkan waktu diselaraskan setelah perangkat terhubung kembali ke NTP.",
        moduleId: "05",
        targetSelector: '[data-guide-target="m05-log-controls"]',
      },
      {
        id: "m05-log-table",
        title: "Tabel Pergerakan & Pemberian Tag Aktivitas",
        description:
          "Setiap baris keluar-masuk di tabel dapat diberi label aktivitas (seperti Test Drive, Cuci/Detailing, atau Isi BBM) untuk mencatat alasan perpindahan unit selama operasional.",
        tip: "Klik tombol Reset Filter jika hasil pencarian kosong karena filter lokasi atau kata kunci masih aktif.",
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
      "Daftarkan perangkat ke kendaraan, ubah batas voltase dan interval tidur di web, serta kelola tiket dan log aktivitas.",
    moduleId: "06",
    steps: [
      {
        id: "m06-subtabs",
        title: "Pemilih Node Target & 3 Sub-Tab Pengaturan",
        description:
          "Gunakan dropdown Target Node di kanan atas untuk memilih perangkat yang akan diatur. Tiga sub-tab memisahkan proses pendaftaran perangkat, kalibrasi/parameter, dan pengelolaan tiket penanganan.",
        tip: "Lencana NVS Sinkron atau ACK Tertunda menunjukkan apakah perubahan setelan sudah dikirim ke perangkat.",
        moduleId: "06",
        subTab: "ONBOARDING",
        targetSelector: '[data-guide-target="m06-subtabs"]',
      },
      {
        id: "m06-onboarding",
        title: "Sub-Tab 01: Pendaftaran, Pasang & Lepas Node",
        description:
          "Isi form untuk menautkan perangkat baru ke kendaraan dan mencetak label QR identitas unit. Di kolom kanan, Anda dapat mencari node terdaftar serta melepas atau menautkan ulang node ke mobil lain.",
        tip: "Pada Mode Simulasi tersedia tombol Isi Contoh Data untuk mengisi formulir secara cepat saat mencoba alurnya.",
        moduleId: "06",
        subTab: "ONBOARDING",
        targetSelector: '[data-guide-target="m06-onboarding"]',
      },
      {
        id: "m06-calibration",
        title: "Sub-Tab 02: Batas Tegangan, Tidur & Kalibrasi",
        description:
          "Atur ambang tegangan kritis (crit_v) dan interval tidur perangkat (sleep_cfg), lalu lihat pratinjau payload JSON ACK yang disiapkan server. Di kanan terdapat kalkulator kalibrasi 4 titik untuk menyamakan bacaan ADC dengan multimeter.",
        tip: "Tombol Simpan nonaktif otomatis bila angka berada di luar batas aman yang ditetapkan.",
        moduleId: "06",
        subTab: "CALIBRATION",
        targetSelector: '[data-guide-target="m06-calibration"]',
      },
      {
        id: "m06-tickets",
        title: "Sub-Tab 03: Tiket Penanganan & Log Aktivitas",
        description:
          "Isi nama penanggung jawab dan catatan shift untuk mengklaim atau menutup tiket kendaraan. Tabel di sisi kanan menampilkan seluruh log aktivitas sistem yang bisa disaring menurut tingkat keparahan atau unit.",
        tip: "Gunakan tombol Reset Filter Audit apabila daftar log tidak memunculkan baris setelah pencarian.",
        moduleId: "06",
        subTab: "TICKETS",
        targetSelector: '[data-guide-target="m06-tickets"]',
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
