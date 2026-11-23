---
id: module-05-presence
title: "Modul 05: Presensi Yard & Buffer Offline"
---

# Modul 05: Presensi Stock Yard, Buffer Dua Tingkat & Log Pergerakan

Modul 05 ([PresenceModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/PresenceModule.tsx)) menjawab dua pertanyaan operasional utama di lapangan parkir: mobil mana yang sedang berada di luar pagar gudang sekarang, dan seberapa penuh memori antrean offline di dalam alat ketika mobil berada di titik tanpa sinyal Wi-Fi.

## 1. Memantau Memori Cadangan Two-Tier (`2.020 Slot`)

Bagian atas modul memvisualisasikan keterisian `buffer_used` berdasarkan angka laporan terakhir dari firmware:

1. **Grid Tier-1 (`20` Slot RTC Slow SRAM)**: kotak 1 sampai 20 menyala mengikuti jumlah rekaman yang ditahan di RAM cepat RTC saat mobil baru keluar dari sinyal Wi-Fi.
2. **Bilahan Kapasitas Tier-2 (`2.000` Slot LittleFS Flash)**: aktif terisi begitu antrean melampaui 20 sampel.
3. **Konfirmasi / Reset Antrean**: bila operator sudah memverifikasi di lapangan bahwa seluruh paket tertunda telah selesai disinkronkan, klik tombol ini untuk memanggil mutasi `FLUSH_BUFFER` ke `update_config.php` dan mencatat audit `BUFFER_FLUSH`.

## 2. Membaca Riwayat Pergerakan (`PAIRED` vs `RAW`) & Menandai Kegiatan

Operator dapat mengganti sudut pandang tabel riwayat kapan saja sesuai keperluan investigasi:

1. Gunakan **Mode `PAIRED`** untuk pekerjaan harian staf gudang. Sistem otomatis memasangkan baris keluar (`EXIT_YARD`) dengan baris masuk pasangannya (`ENTER_YARD`) menjadi satu ringkasan perjalanan lengkap beserta lama mobil berada di luar. Bila jam RTC baru tersinkron NTP setelah perjalanan selesai sehingga memicu koreksi waktu di backend, baris tersebut menampilkan lencana **`clock_adjusted`** agar operator tahu durasi dihitung dari stempel server MySQL yang akurat.
2. Gunakan **Mode `RAW`** untuk audit teknis perubahan zona 4 lapis (`YARD -> TECH_HOTSPOT`, `TECH_HOTSPOT -> OFFLINE`, dst.) beserta berapa kali hitungan gagal (*debounce*) terjadi sebelum pindah zona.
3. Klik opsi **Tag Operasional** di setiap baris perjalanan (`Test Drive`, `PDI Workshop`, `Detailing`, atau `Customer Delivery`) guna menyimpan alasan resmi keluarnya mobil lewat mutasi `TAG_MOVEMENT` ke kedua baris keluar-masuknya.
4. Perhatikan banner **Proteksi Mass Disconnect** apabila muncul peringatan di atas tabel: banner ini menandakan router AP gudang sedang mengalami gangguan massal (`>= 66%` unit terdiam serentak) sehingga mobil tetap dijaga posisinya di dalam area gudang tanpa alarm palsu.
