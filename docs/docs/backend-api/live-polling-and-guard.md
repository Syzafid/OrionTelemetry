---
id: live-polling-and-guard
title: Live Polling & Mass Disconnect Guard
---

# Live Polling API & Mass Disconnect Guard (`get_data.php`)

Endpoint **`GET` / `HEAD /dipo_api/get_data.php`** ([get_data.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/get_data.php), tersedia juga melalui alias `get_live_status.php`) menjadi sumber tunggal pembacaan real-time untuk seluruh 6 modul HMI saat berada pada mode `LIVE_API`.

## 1. Perlindungan Kuota Database (Atomic Micro-Cache)

Untuk melindungi kuota koneksi dan query MySQL (seperti JawsDB Kitefin `3.600 query/jam`) dari polling bersamaan banyak klien browser tiap 3 detik:

- Payload hasil agregasi disimpan ke `sys_get_temp_dir() . '/orion_get_data_cache.json'` melalui penulisan file sementara ber-lock (`LOCK_EX`) lalu `rename()` atomik agar bebas *torn read*.
- Masa berlaku cache (**TTL**) disetel **`2.0 detik`** dan ditandai dengan header respons `X-Orion-Cache: HIT | MISS`.
- Cache langsung dihapus (*invalidated*) seketika saat ada penulisan baru di `simpan_data.php` maupun `update_config.php`, dan dapat dilewati manual dengan query `?nocache=1`.
- Mendukung metode **`HEAD`** untuk pengecekan kesehatan uptime cepat tanpa mengirim body JSON.

## 2. Ambang Status Online (`ONLINE_THRESHOLD_SEC`) & Riwayat 24 Titik

- **Status Koneksi Live**: Unit dinyatakan `ONLINE` hanya apabila `last_seen_sec <= 10` (mengakomodasi siklus kirim 5 detik + jitter pemindaian 14-channel Wi-Fi ~3,5 detik) **dan** unit terhubung melalui zona `YARD` (`in_yard`) atau `TECH_HOTSPOT`. Jika tidak, badge status berubah menjadi `OFFLINE / DEEP SLEEP` (di yard) atau `OFFLINE / OUT OF YARD`.
- **Bulk Window Query**: Riwayat tegangan (`24` titik terakhir per unit untuk grafik dan prediksi OLS) diambil serentak memakai fungsi window SQL `ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY created_at DESC, id DESC)` sehingga tidak memicu query N+1.

## 3. Algoritma *Mass Disconnect Guard* ($\ge 66\%$)

Untuk membedakan kendaraan yang benar-benar meninggalkan area gudang dengan insiden gangguan jaringan listrik atau Access Point gudang mati serentak:

1. Evaluasi timeout hanya diterapkan kepada unit yang sudah memiliki check-in hardware (`last_seq >= 500`), sehingga unit registrasi statis baru tidak memicu alarm palsu.
2. Ambang batas keterlambatan per unit dihitung dari interval bangun yang berlaku:

$$\text{timeout\_threshold} = \max\left(900,\ 3 \times \max(300,\ \text{sleep\_cfg})\right)\ \text{detik}$$

3. Jika rasio unit yang melewati `timeout_threshold` mencapai **minimal 66% (`>= 0.66`)** dan terdapat **minimal 2 unit** terdampak bersamaan (`isMassDisconnect = true`):
   - Bendera `"mass_disconnect_guard": true` dikirim ke frontend.
   - Seluruh unit terdampak dipertahankan tetap berada di gudang (`in_yard = true`) dengan status `'AP Link Down (Guard Active)'` alih-alih ditandai `DEPARTED`.
4. Jika hanya satu unit individual yang timeout di luar kondisi outage massal, barulah unit ditandai `DEPARTED` (`Out of Yard (Test Drive)`, `in_yard = false`).
