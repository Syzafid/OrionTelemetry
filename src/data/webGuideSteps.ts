import type { ModuleId } from "@/context/TelemetryContext";

export interface WebGuideStep {
  id: string;
  title: string;
  description: string;
  tip: string;
  moduleId?: ModuleId;
  targetSelector: string;
}

export const WEB_GUIDE_COMPLETED_KEY = "orion_web_guide_completed";

export const WEB_GUIDE_STEPS: WebGuideStep[] = [
  {
    id: "nav-status",
    title: "Sumber Data & Mode Tampilan",
    description:
      "Tombol ini mengganti sumber data antara Mode Simulasi (12 unit contoh) dan Live API dari server MySQL. Saat server tidak terjangkau, web menampilkan status Cache Offline memakai rekaman terakhir.",
    tip: "Tekan ikon gir di sebelah kanan tombol ini untuk melihat atau mengubah alamat endpoint API.",
    targetSelector: '[data-guide-target="nav-status"]',
  },
  {
    id: "nav-tools",
    title: "Cari Cepat & Pintasan Bantuan",
    description:
      "Gunakan Cari Cepat (Ctrl+K) untuk langsung melompat ke kendaraan tertentu, membuka menu, atau mengekspor laporan Excel. Tombol Bantuan (?) di bilah atas membuka ringkasan menu kapan saja.",
    tip: "Anda juga bisa menekan Alt+1 sampai Alt+6 di keyboard untuk berpindah antar menu dashboard.",
    targetSelector: '[data-guide-target="nav-tools"]',
  },
  {
    id: "module-01",
    title: "Menu 01: Topologi & Transduser",
    description:
      "Tampilan utama untuk melihat skema komponen kelistrikan pada unit yang dipilih. Pilih kendaraan di daftar samping, lalu klik titik pada gambar kendaraan untuk melihat nilai pembacaan tiap jalur.",
    tip: "Gunakan daftar filter komponen di bagian kanan atas gambar bila ingin memfokuskan saluran tertentu.",
    moduleId: "01",
    targetSelector: '[data-guide-target="module-01"]',
  },
  {
    id: "module-02",
    title: "Menu 02: Armada & PDI",
    description:
      "Menampilkan kartu seluruh unit kendaraan yang dipantau beserta sisa estimasi waktu aki. Anda bisa menyaring unit berdasarkan status (Kritis, Peringatan, Normal), mengurutkan prioritas, membuka sertifikat PDI, atau mengunduh Excel.",
    tip: "Klik Pilih Cepat atau gunakan kolom pencarian untuk mencari unit berdasarkan bay parkir, model, atau nomor rangka.",
    moduleId: "02",
    targetSelector: '[data-guide-target="module-02"]',
  },
  {
    id: "module-03",
    title: "Menu 03: Antrean Pemanasan",
    description:
      "Berisi urutan kendaraan yang disarankan untuk pemanasan mesin agar daya aki tetap terjaga. Tekan Catat Jadwal Pemanasan untuk menandai unit, dan pantau timer berhitung hingga target 10 menit tercapai.",
    tip: "Daftar riwayat di bagian bawah mencatat waktu pemanasan beserta tegangan pengisian alternator.",
    moduleId: "03",
    targetSelector: '[data-guide-target="module-03"]',
  },
  {
    id: "module-04",
    title: "Menu 04: OBD-II Diagnostik",
    description:
      "Menampilkan panel putaran mesin (RPM), suhu cairan pendingin, kode gangguan (DTC mode baca saja), serta grafik tren tegangan dan aktivitas mesin dalam beberapa rekaman terakhir.",
    tip: "Pada Mode Simulasi, tersedia tombol uji coba untuk melihat perubahan grafik saat mesin menyala.",
    moduleId: "04",
    targetSelector: '[data-guide-target="module-04"]',
  },
  {
    id: "module-05",
    title: "Menu 05: Presensi & Log",
    description:
      "Melacak status keberadaan unit di dalam atau di luar area gudang, antrean data lokal saat perangkat sempat offline, serta tabel riwayat perpindahan kendaraan lengkap dengan catatan aktivitas.",
    tip: "Gunakan tombol Sesi Keluar-Masuk atau Transisi 4-Zona untuk mengganti sudut pandang tabel log.",
    moduleId: "05",
    targetSelector: '[data-guide-target="module-05"]',
  },
  {
    id: "module-06",
    title: "Menu 06: Konfigurasi Node",
    description:
      "Terbagi dalam tiga sub-tab: pendaftaran node perangkat ke kendaraan baru, pengaturan batas tegangan dan kalibrasi pembacaan di web, serta pengelolaan tiket penanganan dan log sistem.",
    tip: "Di sub-tab Pengaturan & Kalibrasi Tegangan, perubahan yang disimpan akan menyiapkan payload JSON pembaruan untuk perangkat.",
    moduleId: "06",
    targetSelector: '[data-guide-target="module-06"]',
  },
];
