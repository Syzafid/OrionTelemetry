---
id: live-polling-and-guard
title: Live Polling & Mass Disconnect Guard
---

# Live Polling API & Mass Disconnect Guard (`get_data.php`)

Seluruh enam modul HMI membaca kondisi nyata armada dari satu pintu yaitu `GET` / `HEAD /dipo_api/get_data.php` ([get_data.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/get_data.php), juga tersedia lewat alias `get_live_status.php`).

## 1. Menghemat Kuota Database Lewat Micro-Cache `2,0 Detik`

Bayangkan ada 10 browser operator atau tab bengkel terbuka serentak melakukan polling tiap 3 detik ke database JawsDB yang memiliki batas kuota `3.600 query/jam`. Tanpa penyangga di server, 10 browser akan menghasilkan `12.000` permintaan query per jam dan langsung menghabiskan kuota.

Untuk mencegah hal tersebut, `get_data.php` menyimpan hasil JSON terakhir ke berkas sementara server (`sys_get_temp_dir() . '/orion_get_data_cache.json'`) dengan masa berlaku `2,0 detik`:

1. Saat menulis cache, PHP mengisi file sementara dengan kunci tulis eksklusif (`LOCK_EX`) lalu mengganti nama file secara atomik (`rename()`) sehingga tidak pernah ada browser yang membaca file setengah tertulis.
2. Respons HTTP ditandai dengan header `X-Orion-Cache: HIT` (dari file) atau `MISS` (query segar).
3. Begitu ada data masuk baru lewat `simpan_data.php` atau mutasi konfigurasi dari operator lewat `update_config.php`, file cache langsung dihapus agar tampilan HMI ikut segar pada tarikan polling berikutnya. Untuk inspeksi manual, sertakan query `?nocache=1`. Endpoint juga melayani metode `HEAD` guna pemeriksaan uptime tanpa mengirim isi JSON.

## 2. Kapan Sebuah Unit Disebut `ONLINE` vs `OFFLINE / DEEP SLEEP`

Suatu unit ditampilkan berstatus `ONLINE` oleh `get_data.php` hanya apabila pengiriman data terakhirnya berumur paling lama `10 detik` (`last_seen_sec <= 10`, memberi kelonggaran untuk siklus kirim 5 detik ditambah jeda pemindaian Wi-Fi `~3,5 detik`) dan terhubung lewat `YARD` atau `TECH_HOTSPOT`. Di luar kondisi tersebut, lencana status otomatis beralih menjadi `OFFLINE / DEEP SLEEP` (bila unit masih tercatat di gudang) atau `OFFLINE / OUT OF YARD`.

Untuk menggambar grafik riwayat `24` titik terakhir tiap kendaraan sekaligus menghitung laju penurunan voltase OLS, PHP menarik seluruh titik lewat satu query jendela SQL `ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY created_at DESC, id DESC)` sehingga jumlah query tidak membengkak seiring bertambahnya mobil.

## 3. Cara Kerja *Mass Disconnect Guard* (`>= 66%`) dengan Contoh Kasus

Misalkan di lapangan gudang ada **6 kendaraan** yang sudah aktif mengirim telemetri normal (`last_seq >= 500`), lalu pada malam hari router Wi-Fi utama gudang padam karena pemadaman listrik. Batas waktu tunggu per unit dihitung dari interval tidurnya masing-masing:

$$\text{timeout\_threshold} = \max\left(900,\ 3 \times \max(300,\ \text{sleep\_cfg})\right)\ \text{detik}$$

Sesudah batas tersebut terlewati, ke-6 kendaraan (`6 dari 6 = 100%`) berhenti melapor pada waktu yang berdekatan:

1. Tanpa pengaman, server akan menuduh keenam mobil tersebut keluar dari gerbang gudang secara bersamaan dan memicu `6` alarm kehilangan unit palsu di kontrol room.
2. Dengan **Mass Disconnect Guard**, karena porsi unit yang diam serentak mencapai minimal `66%` (`>= 0.66`) dan sedikitnya ada `2` unit aktif yang mengalami timeout bersamaan, `get_data.php` menyalakan bendera `"mass_disconnect_guard": true`.
3. Keenam mobil tetap dipertahankan posisinya di dalam area gudang (`in_yard = true`) dengan status `'AP Link Down (Guard Active)'` sampai listrik/router gudang pulih kembali.
4. Sebaliknya, jika hanya `1` dari `6` mobil yang terhenti melebihi ambang tunggu (atau hanya `16,7%`), barulah server menandai mobil tersebut benar-benar keluar area sebagai `DEPARTED` (`Out of Yard (Test Drive)`).
