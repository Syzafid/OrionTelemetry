---
id: pre-ntp-clock-pairing
title: Pairing Pergerakan Yard & Kompensasi Jam Pra-NTP
---

# Algoritma Pairing Keluar-Masuk & Guard Jam Pra-NTP

Saat kendaraan pertama kali keluar dari stock yard setelah *cold boot* sebelum sempat sinkronisasi NTP, jam lokal `DS3231SN` bisa saja masih berada di tanggal bawaan atau berbeda jauh dari waktu server. Apabila durasi trip langsung dihitung dari selisih `enter_epoch - exit_epoch`, sistem dapat menghasilkan angka ribuan hari (*false jump*).

## 1. Pencocokan Pasangan Keluar-Masuk (*Paired Trip Builder*)

Di sisi backend ([get_data.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/get_data.php)), seluruh event terbaru dari `movement_events` (`LIMIT 200` paling mutakhir lalu diurutkan kronologis `unit_id, boot_id, seq_no, event_epoch, id`) diproses berurutan:

- Saat menemukan `EXIT_YARD`:
  - Jika memiliki kolom `returned` historis eksplisit yang berbeda dari `departed`, langsung ditutup sebagai pasangan selesai.
  - Jika belum memiliki `returned`, disimpan sebagai `pendingExit` per `unit_id`.
- Saat menemukan `ENTER_YARD` berikutnya untuk `unit_id` yang sama:
  - Dipasangkan dengan `pendingExit` aktif (`status: SELESAI`), mengisi `enter_epoch`, `enter_time`, dan menandai baris raw keluar dengan `paired_return_time` dan `durasi_di_luar_sec`.
- Jika sampai akhir loop masih ada `pendingExit` tanpa `ENTER_YARD`:
  - Ditandai `masih_di_luar = true`, durasi dihitung berjalan hingga waktu server saat ini (`$now`).

## 2. Guard Lonjakan Jam RTC -> NTP (`clock_adjusted`)

Fungsi penentu durasi `$computeSafeElapsed()` di `get_data.php` membandingkan selisih epoch perangkat dengan batas kewajaran satu perjalanan stock yard (`maxValidTripGapSec = 30 * 86400 detik` = 30 hari):

```text
  rawDelta = endEpoch - startEpoch
  IF startEpoch > 0 AND endEpoch >= startEpoch AND rawDelta <= 2.592.000 detik:
      Gunakan rawDelta (clock_adjusted = false)
  ELSE:
      Hitung selisih timestamp sisi MySQL: strtotime(endCreatedAt) - strtotime(startCreatedAt)
      Tandai trip dengan clock_adjusted = true
```

Dengan mekanisme fallback `created_at` server dan bendera visual `clock_adjusted` di Modul 05 (**Mode PAIRED** maupun **RAW**), lonjakan epoch RTC ke NTP tidak merusak statistik lama test drive kendaraan.
