---
id: module-02-fleet-pdi
title: "Modul 02: Armada, Sertifikat PDI & Ekspor"
---

# Modul 02: Manajemen Armada, Sertifikat PDI & Ekspor Laporan

Modul 02 ([FleetModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/FleetModule.tsx)) menyajikan ringkasan kesehatan baterai, status *Pre-Delivery Inspection* (PDI), pemantauan *Time-to-Critical* (TTC), serta pengelolaan tiket kerja per unit kendaraan.

## 1. Fitur Utama Operator

- **Filter, Pencarian & Skala Armada**: pada mode `SIMULATOR` mendukung switch tampilan **3 Unit Inti** vs **12 Unit Stock Yard**; pada mode `LIVE_API` secara jujur menampilkan daftar unit aktual dari tabel MySQL `vehicles`. Tersedia filter status (`Semua`, `Kritis`, `Warmup`, `Offline`) dan pengurutan (*sort*).
- **Kartu Diagnostik Unit & Prognostik**: memvisualisasikan grafik tren tegangan baterai (Recharts), hasil regresi OLS (*mV/jam*, $V_{25}$ terkompensasi suhu, `SOC%`, faktor termal Arrhenius $AF$), dan status urgensi pengisian aki.
- **Modal Sertifikat PDI & QR Deep-Link** ([UnitQrCode.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/UnitQrCode.tsx)): mencetak lembar verifikasi 6 baris standar PDI beserta kode QR deterministik berformat URL `?unit=<UNIT_ID>&module=fleet` untuk pemindaian cepat menggunakan ponsel teknisi di lapangan.
- **Resolusi Tiket Serah-Terima**: teknisi dapat mengklaim dan memperbarui tiket (`OPEN -> IN_PROGRESS -> RESOLVED`) lengkap dengan nama penanggung jawab dan catatan serah-terima yang tersimpan ke MySQL (`UPDATE_TICKET`).

## 2. Alur Ekspor Data Terkonfigurasi

Tombol **Ekspor Laporan** membuka modal konfigurasi dengan opsi cakupan unit (`ALL`, unit terpilih, atau multi-unit), rentang waktu (`DAILY`, `7_DAYS`, `MONTHLY`, `YEARLY`, `CUSTOM`, `ALL_TIME`), resolusi agregasi (`RAW`, `HOURLY`, `DAILY_SUMMARY`), serta format **CSV (39 kolom)** atau **Excel `.xls` (3 sheet)**.
