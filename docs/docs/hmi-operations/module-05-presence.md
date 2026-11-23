---
id: module-05-presence
title: "Modul 05: Presensi Yard & Buffer Offline"
---

# Modul 05: Presensi Stock Yard, Buffer Dua Tingkat & Log Pergerakan

Modul 05 ([PresenceModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/PresenceModule.tsx)) menggabungkan pengawasan keberadaan kendaraan di area yard dengan pemantauan antrean rekaman luring ESP32.

## 1. Visualisasi Buffer Two-Tier (`2.020 Slot`)

- Menampilkan status keterisian aktual `buffer_used`:
  - **Tier-1 (RTC Slow SRAM)**: grid 20 slot (`0..20`) terisi sesuai angka aktual laporan firmware tanpa fabrikasi alamat memori palsu.
  - **Tier-2 (LittleFS Flash)**: bar utilisasi hingga `2.000` slot saat antrean melebihi kapasitas RTC.
- Tombol **Konfirmasi / Reset Antrean** memanggil mutasi `FLUSH_BUFFER` ke `update_config.php` guna membersihkan badge antrean sesudah verifikasi operator dan mencatat `BUFFER_FLUSH` di `system_events`.

## 2. Mode Tabel Pergerakan (`PAIRED` vs `RAW`) & Tag Operasional

- **Mode `PAIRED`**: menggabungkan event `EXIT_YARD` dan `ENTER_YARD` menjadi satu baris perjalanan lengkap berisi asal/tujuan zona, durasi keluar akurat (termasuk lencana koreksi `clock_adjusted` bila terjadi lompatan jam pra-NTP), dan tag operasional.
- **Mode `RAW`**: menampilkan tiap event mentah transisi 4-zona (`YARD -> TECH_HOTSPOT`, `TECH_HOTSPOT -> OFFLINE`, dst.) beserta jumlah hit debounce.
- **Penandaan Tag**: operator dapat melabeli pergerakan sebagai `Test Drive`, `PDI Workshop`, `Detailing`, atau `Customer Delivery` (`TAG_MOVEMENT`), sekaligus memantau status banner **Proteksi Mass Disconnect** apabila AP gudang mengalami gangguan.
