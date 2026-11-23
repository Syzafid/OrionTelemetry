---
id: pre-ntp-clock-pairing
title: Pairing Pergerakan Yard & Kompensasi Jam Pra-NTP
---

# Algoritma Pairing Keluar-Masuk & Guard Jam Pra-NTP

Saat mobil yang baterainya baru dipasang ulang langsung keluar dari gudang sebelum ESP32 sempat terhubung ke Wi-Fi dan mengambil waktu internet (NTP), jam lokal di modul RTC `DS3231SN` bisa saja masih menunjuk tahun pabrikan (misal `2024`). Ketika mobil pulang ke gudang dan menyentuh Wi-Fi lagi, jam RTC langsung loncat ke waktu saat ini (`2026`). Bila durasi perjalanan dihitung langsung dari selisih `enter_epoch - exit_epoch`, tabel pergerakan bisa memunculkan angka palsu ratusan hingga ribuan hari.

## 1. Menyusun Pasangan Perjalanan (*Paired Trip Builder*)

Di dalam [get_data.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/get_data.php), PHP mengambil maksimal `200` catatan pergerakan paling baru dari tabel `movement_events`, mengurutkannya secara kronologis berdasarkan `(unit_id, boot_id, seq_no, event_epoch, id)`, lalu mencocokkan keluar-masuknya dalam satu putaran:

1. Ketika menemukan baris `EXIT_YARD`: bila kolom histori `returned` sudah terisi dan berbeda dari `departed`, baris langsung dicatat selesai; bila belum, PHP menyimpannya sebagai perjalanan terbuka (`pendingExit`) untuk `unit_id` terkait.
2. Ketika menemukan `ENTER_YARD` berikutnya pada `unit_id` yang sama: baris tersebut dipasangkan dengan `pendingExit` menjadi satu trip utuh (`status = SELESAI`) dengan waktu pulang `enter_epoch` serta mengisi lama keluar pada baris raw awalnya.
3. Jika sampai akhir daftar masih ada `pendingExit` tanpa pasangan `ENTER_YARD`: unit ditandai `masih_di_luar = true` dan durasinya dihitung berjalan hingga waktu server sekarang (`$now`).

## 2. Mengatasi Lonjakan Jam Pra-NTP (`clock_adjusted`)

Untuk mencegah lonjakan tahun akibat RTC yang baru terkalibrasi NTP di tengah perjalanan, fungsi `$computeSafeElapsed()` di `get_data.php` memeriksa kewajaran selisih epoch perangkat terhadap batas maksimal satu trip keluar gudang (`30 hari = 2.592.000 detik`):

```text
  rawDelta = endEpoch - startEpoch
  IF startEpoch > 0 AND endEpoch >= startEpoch AND rawDelta <= 2.592.000 detik:
      Pakai rawDelta (clock_adjusted = false)
  ELSE:
      Hitung selisih timestamp penerimaan server MySQL: strtotime(endCreatedAt) - strtotime(startCreatedAt)
      Tandai trip dengan clock_adjusted = true
```

### Contoh Kronologi Nyata di Bengkel

Misalkan perangkat di `MITSUBISHI-STOCK-03` habis mengganti baterai koin sehingga jam RTC-nya kembali ke `1 Januari 2024`, lalu mobil langsung dibawa *test drive* ke jalan selama `25 menit` tanpa Wi-Fi. Setelah kembali ke gudang, perangkat menerima koreksi NTP menjadi `23 November 2026`.

Selisih epoch perangkat tercatat `> 1.057 hari` (melampaui batas `30 hari`). Fungsi `$computeSafeElapsed()` menolak selisih epoch tersebut, menggantinya dengan selisih kolom `created_at` server (`25 menit`), dan menyematkan bendera `clock_adjusted = true` agar operator di Modul 05 tahu durasi tersebut sudah diamankan dari pergeseran jam.
