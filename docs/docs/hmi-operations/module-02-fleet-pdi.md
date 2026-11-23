---
id: module-02-fleet-pdi
title: "Modul 02: Armada, Sertifikat PDI & Ekspor"
---

# Modul 02: Manajemen Armada, Sertifikat PDI & Ekspor Laporan

Modul 02 ([FleetModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/FleetModule.tsx)) merangkum kondisi baterai seluruh mobil di stok gudang dalam satu halaman kerja. Halaman ini membantu kepala bengkel memutuskan mobil mana yang harus segera dicharge atau dipanaskan sebelum pengiriman unit ke konsumen (*Pre-Delivery Inspection*).

## 1. Fungsi & Kapan Modul Ini Dipakai

Operator memakai Modul 02 di awal shift pagi atau sebelum jadwal serah-terima mobil untuk menyortir unit berstatus kritis, mencetak lembar sertifikat kesiapan baterai (QR PDI), memproses tiket perawatan, dan mengunduh laporan audit ke Excel atau CSV.

## 2. Bagian Layar & Arti Indikator

Setiap kartu kendaraan memperlihatkan grafik tren tegangan Recharts, nilai tegangan terkompensasi suhu $V_{25}$, persentase muatan (`SOC%`), faktor panas Arrhenius $AF$, laju penurunan (`mV/jam`), serta estimasi waktu menuju batas kritis (`TTC`). Kartu juga menampilkan tombol cepat menuju modal Sertifikat PDI ([UnitQrCode.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/UnitQrCode.tsx)) serta tombol tindak lanjut tiket kerusakan (`OPEN`, `IN_PROGRESS`, `RESOLVED`).

## 3. Langkah Kerja Operator

1. Gunakan tombol filter status di atas daftar (`Semua`, `Kritis`, `Warmup`, `Offline`) serta kolom urutkan untuk mengangkat unit dengan `TTC` paling pendek ke posisi paling atas.
2. Untuk unit yang memerlukan perbaikan, klik tombol tiket pada kartu kendaraan, ubah status menjadi `IN_PROGRESS` atau `RESOLVED`, isi nama teknisi pelaksana dan catatan kerja, lalu simpan agar mutasi `UPDATE_TICKET` tercatat ke database MySQL.
3. Untuk mobil siap kirim, klik **Sertifikat PDI** guna menampilkan 6 baris ringkasan verifikasi beserta QR Code `?unit=<UNIT_ID>&module=fleet` yang bisa langsung dipindai teknisi menggunakan kamera ponsel di lapangan.
4. Untuk membuat laporan rapat mingguan atau bulanan, klik **Ekspor Laporan**, pilih cakupan unit (`ALL` atau beberapa unit tertentu), pilih rentang waktu (`DAILY`, `7_DAYS`, `MONTHLY`, `YEARLY`, `CUSTOM`, atau `ALL_TIME`), tentukan resolusi agregasi (`RAW`, `HOURLY`, atau `DAILY_SUMMARY`), lalu unduh berkas CSV (39 kolom) atau Excel `.xls` (3 worksheet).

## 4. Mode Simulator vs Mode Live MySQL

Pada mode `SIMULATOR`, operator dapat mengganti tampilan antara **3 Unit Inti** dan **12 Unit Stock Yard** guna menguji kepadatan layar. Pada mode **`LIVE_API`**, daftar armada hanya menampilkan kendaraan yang benar-benar terdaftar di tabel `vehicles` MySQL lengkap dengan riwayat titik nyata masing-masing unit.
