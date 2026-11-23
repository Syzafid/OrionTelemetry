---
id: module-03-warmup
title: "Modul 03: Antrean Pemanasan Mesin"
---

# Modul 03: Antrean Pemanasan Mesin (SOP 10 Menit)

Modul 03 ([WarmupQueueModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/WarmupQueueModule.tsx)) menyusun antrean prioritas mobil stok yang harus dipanaskan secara berkala agar pengisian alternator tetap terjaga dan oli mesin bersirkulasi normal sesuai SOP pemanasan `10 menit` (`WARMUP_TARGET_SEC = 600` detik).

## 1. Fungsi & Kapan Modul Ini Dipakai

Gunakan Modul 03 ketika menjadwalkan staf lapangan berjalan ke baris parkir untuk menghidupkan kendaraan yang voltasenya mulai turun (`v_bat < 12.30 V`), serta saat mengawasi langsung berjalannya stopwatch pemanasan dan tegangan pengisian alternator.

## 2. Bagian Layar & Arti Indikator

Panel atas menampilkan indikator ambang pengisian sehat **`ALT_VERIFY_V = 13.50 V`** beserta baris antrean unit yang otomatis diurutkan dari voltase terendah terlebih dahulu. Ketika salah satu mobil distarter di lapangan, panel stopwatch aktif otomatis tersinkron dengan parameter ECU `run_time_s` (PID `0x1F`) dan menghitung mundur sisa waktu menuju `10:00`.

## 3. Langkah Kerja Operator

1. Pilih kendaraan teratas di antrean prioritas (`v_bat < 12.30 V`) yang membutuhkan pemanasan paling mendesak.
2. Klik **Kirim Staf Pemanasan** agar HMI mengirim mutasi `DISPATCH_WARMUP` ke server. Label status mobil di layar berubah menjadi `Warm-Up Dispatched` dan bertahan hingga `45` menit selama mobil belum menyala (paket tidur rutin setiap 5 detik tidak akan menimpa label instruksi ini).
3. Begitu teknisi menyalakan mesin di area parkir (`engine_on = true`), pantau grafik tegangan hingga melampaui `13.50 V` sebagai bukti alternator bekerja baik, dan biarkan mesin menyala minimal `600 detik`.
4. Setelah teknisi mematikan mesin (`durasi sesi >= 5 detik`), riwayat sesi otomatis tercatat di log sebagai **`PASS`** (apabila durasi mencapai `>= 600 detik` dan puncak pengisian menyentuh `>= 13.50 V`) atau **`INCOMPLETE`** jika dimatikan terlalu cepat.

## 4. Mode Simulator vs Mode Live MySQL

Di mode Simulator, tombol uji mesin tersedia untuk mensimulasikan naiknya tegangan pengisian alternator dan stopwatch 10 menit. Di mode **`LIVE_API`**, log dispatch dan riwayat pemanasan dibaca langsung dari entri `WARMUP_DISPATCH` pada tabel `system_events` serta pembacaan PID `0x1F` nyata dari ECU mobil.
