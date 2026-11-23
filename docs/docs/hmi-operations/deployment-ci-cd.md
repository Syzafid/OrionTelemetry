---
id: deployment-ci-cd
title: Arsitektur Build, Keamanan & CI/CD
---

# Arsitektur Build Produksi, Keamanan Server & CI/CD

Aplikasi web HMI (`/` dan `/dashboard`), situs dokumentasi (`/docs/`), dan layanan REST PHP (`/dipo_api/`) dibungkus ke dalam satu deployment **Heroku-24 Dual-Buildpack** yang dilayani oleh Apache 2 (`vendor/bin/heroku-php-apache2 .output/public/`).

## 1. Urutan Pembentukan Artefak Produksi

Saat proses build berjalan di server atau GitHub Actions, dua buildpack bekerja berurutan:

1. **Buildpack Pertama (`heroku/nodejs`)** menjalankan `npm run build` yang mengeksekusi `vite build`, `npm run docs:build`, dan `node scripts/prepare-heroku.mjs`. Tahap ini memecah bundel kode HMI (*lazy loading* Modul `02..06`), merender HTML awal untuk `/` dan `/dashboard`, memproduksi situs statis Docusaurus ke `.output/public/docs/` (lengkap dengan salinan mentah `.md` di `docs/raw-md/`), menyalin tepat `7` skrip PHP publik ke `.output/public/dipo_api/`, lalu membangkitkan berkas aturan Apache `.output/public/.htaccess`.
2. **Buildpack Kedua (`heroku/php`, PHP `8.5.x`)** memeriksa validitas `composer.json` dan menyalin ulang ketujuh file PHP terwhitelist yang sama pada langkah `composer compile`. Berkas skema SQL maupun `migrate.php` sengaja tidak ikut disalin ke folder web publik.

## 2. Pengamanan HTTP via `.htaccess` & Skrip Backend

Aturan `.htaccess` menolak akses HTTP langsung ke `db.php`, `migrate.php`, semua berkas `*.sql`, dan berkas tersembunyi (*dotfiles*) dengan kode `HTTP 403`. Di sisi PHP, `db.php` ikut menolak panggilan langsung lewat pengecekan `SCRIPT_FILENAME`, sedangkan `migrate.php` hanya mau berjalan lewat terminal CLI atau jika membawa token header `X-Migrate-Token`.

Untuk kecepatan akses browser di jaringan gudang yang terbatas, modul `mod_deflate` memampatkan HTML, JavaScript, CSS, dan JSON memakai `gzip`. Aset JS, CSS, dan gambar ber-hash diberi header `Cache-Control: public, max-age=31536000, immutable`, sementara file `.html` tetap memakai `no-cache, must-revalidate` supaya pembaruan deployment langsung terbaca. Header pengaman standar (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, dan `Permissions-Policy`) dipasang seragam, dengan `CORS_ALLOWED_ORIGIN` dikunci pada `https://www.oriontelemetry.tech` (serta `localhost`/`127.0.0.1` untuk uji lokal).

## 3. Daftar Variabel Environment Server

| Nama Variabel | Sifat | Kegunaan di Server Produksi |
| :--- | :--- | :--- |
| `JAWSDB_URL` | Wajib | String koneksi MySQL otomatis dari add-on Heroku JawsDB. |
| `CORS_ALLOWED_ORIGIN` | Wajib | Asal domain resmi browser yang diizinkan mengakses API (`https://www.oriontelemetry.tech`). |
| `NODE_AUTH_TOKEN` | Opsional | Bila diisi, mewajibkan header `X-Node-Token` pada setiap permintaan `POST /dipo_api/simpan_data.php`. |
| `MIGRATE_AUTH_TOKEN` | Opsional | Token otorisasi yang dibutuhkan dalam header `X-Migrate-Token` jika `migrate.php` dijalankan via HTTP. |

## 4. Pipeline Verifikasi GitHub Actions & Hygiene Repositori

Setiap perubahan yang masuk ke branch `main` melewati empat tahap otomatis serta penjagaan Git lokal:

| Tahap Otomatis | Pemicu | Pemeriksaan yang Dijalankan |
| :--- | :--- | :--- |
| `frontend-verify` (`ci.yml`) | Push / PR ke `main` | Menjalankan `npm run check:hygiene`, `tsc --noEmit`, `npm run lint:ci`, `npm run docs:typecheck`, dan seluruh unit test Vitest. |
| `backend-php-verify` (`ci.yml`) | Push / PR ke `main` | Memeriksa `composer validate --strict`, sintaks `php -l` seluruh file PHP, serta keberadaan penjaga keamanan pada `db.php` dan `migrate.php`. |
| `build-and-bundle-check` (`ci.yml`) | Setelah 2 job di atas lulus | Menjalankan `npm run build`, memverifikasi HTML pra-render, isi `.htaccess`, keluaran `/docs/`, dan batas ukuran chunk `/dashboard < 450 kB`. |
| `deploy-heroku` (`cd-heroku.yml`) | Otomatis setelah CI sukses | Mendorong kode terverifikasi ke Heroku remote lalu menguji `HTTP 200` pada `/`, `/dashboard`, `/docs/`, `/docs/raw-md/...`, header `gzip` & `immutable`, `HEAD get_data.php`, dan kode blokir `403/404` pada file sensitif. |
| Git Hooks Lokal (`.githooks/`) | `pre-commit` & `pre-push` | Menjalankan [check-repo-hygiene.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/check-repo-hygiene.mjs) (`--staged` saat commit dan `--strict` saat push) agar berkas sensitif, hasil backup, atau folder sementara tidak ikut terunggah. |
