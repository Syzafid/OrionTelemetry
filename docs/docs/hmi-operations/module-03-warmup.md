---
id: module-03-warmup
title: "Modul 03: Antrean Pemanasan Mesin"
---

# Modul 03: Antrean Pemanasan Mesin (SOP 10 Menit)

Modul 03 ([WarmupQueueModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/WarmupQueueModule.tsx)) mengatur prioritas pemanasan mesin kendaraan stok untuk menjaga muatan aki dan sirkulasi pelumasan sesuai SOP berkala Mitsubishi (`WARMUP_TARGET_SEC = 600` detik / 10 menit).

## 1. Logika Antrean & Deteksi Alternator Otomatis

- **Antrean Prioritas Otomatis**: menyaring kendaraan berstatus mesin mati dengan tegangan baterai terendah (`v_bat < 12.30 V`) dan mengurutkannya dari voltase terendah terlebih dahulu.
- **Verifikasi Pengisian Alternator**: sistem mendeteksi keberhasilan pengisian bila `engine_on = true` atau tegangan terminal menembus ambang batas `ALT_VERIFY_V = 13.50 V`.
- **Stopwatch Tersinkron PID `0x1F`**: saat mesin menyala, stopwatch otomatis melakukan sinkronisasi awal dengan parameter ECU `run_time_s` dan berdetak tiap 1 detik menghitung sisa waktu menuju target 10 menit. Ketika mesin kembali dimatikan (`duration >= 5 detik`), riwayat sesi dicatat sebagai `PASS` (durasi >= `600s` & puncak >= `13.50 V`) atau `INCOMPLETE`.

## 2. Dispatch Staf Lapangan (`DISPATCH_WARMUP`)

Menekan tombol **Kirim Staf Pemanasan** memicu mutasi `DISPATCH_WARMUP` ke `update_config.php`, menulis status `'Warm-Up Dispatched'` ke tabel `vehicles`, dan mencatat entri audit `WARMUP_DISPATCH`. Backend `simpan_data.php` mempertahankan label `'Warm-Up Dispatched'` hingga 45 menit selama kendaraan belum menyala atau kritis.
