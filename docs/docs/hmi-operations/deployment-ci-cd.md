---
id: deployment-ci-cd
title: Arsitektur Build, Keamanan & CI/CD
---

# Arsitektur Build Produksi, Keamanan Server & CI/CD

Aplikasi web frontend, situs dokumentasi `/docs/`, dan backend REST PHP dikemas menjadi satu deployment **Heroku-24 Dual-Buildpack** yang dilayani oleh Apache 2 (`vendor/bin/heroku-php-apache2 .output/public/`).

## 1. Alur Packaging Produksi (Node.js + Docusaurus + PHP)

Urutan build pada setiap deployment:
1. **Buildpacks Heroku**:
   - Buildpack #1 (`heroku/nodejs`): menjalankan `npm run build` (`vite build && npm run docs:build && node scripts/prepare-heroku.mjs`), menghasilkan:
     - Frontend CSR teroptimasi *code-splitting* (`/`, `/dashboard`, lazy chunks untuk Modul `02..06`)
     - Pre-rendering HTML statis untuk route `/` dan `/dashboard`
     - Situs statis Docusaurus v3.10 ke `.output/public/docs/`
     - Penyalinan 7 file PHP publik terwhitelist (`db.php`, `get_data.php`, `get_live_status.php`, `simpan_data.php`, `update_config.php`, `export_csv.php`, `export_excel.php`) ke `.output/public/dipo_api/` (berkas migrasi/skema SQL/dotfile dikecualikan)
     - Pembangkitan berkas konfigurasi Apache `.output/public/.htaccess`
   - Buildpack #2 (`heroku/php`, PHP `8.5.x`): memvalidasi `composer.json` dan menyalin ulang 7 file PHP whitelist yang sama pada langkah `composer compile`.

## 2. Proteksi Lapisan HTTP (`.htaccess` & Backend Guard)

- **Blokir Akses Berkas Internal**: `.htaccess` menolak permintaan langsung ke `db.php`, `migrate.php`, `*.sql`, dan dotfiles (`HTTP 403`). Selain itu, `db.php` menolak eksekusi langsung HTTP lewat `SCRIPT_FILENAME`, dan `migrate.php` hanya mengizinkan mode `CLI` atau header token admin `X-Migrate-Token`.
- **Kompresi & Caching Aset**: `mod_deflate` memampatkan HTML/JS/CSS/JSON via `gzip`; aset JS/CSS/gambar ter-hash diberi header `Cache-Control: public, max-age=31536000, immutable`, sedangkan file `.html` memakai `no-cache, must-revalidate`.
- **Header Keamanan**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, dan `Permissions-Policy`.
- **Validasi Host CORS**: `CORS_ALLOWED_ORIGIN` disetel ketat pada `https://www.oriontelemetry.tech` (mengizinkan exact host `oriontelemetry.tech`, subdomain `*.oriontelemetry.tech`, serta `localhost`/`127.0.0.1` untuk uji lokal).

## 3. Variabel Environment Server

| Variabel | Sifat | Fungsi |
| :--- | :--- | :--- |
| `JAWSDB_URL` | Wajib (Produksi) | DSN koneksi MySQL otomatis dari add-on Heroku JawsDB. |
| `CORS_ALLOWED_ORIGIN` | Wajib (Produksi) | Asal web resmi yang diizinkan mengirim CORS request (`https://www.oriontelemetry.tech`). |
| `NODE_AUTH_TOKEN` | Opsional | Jika disetel, mewajibkan header `X-Node-Token` pada seluruh `POST /dipo_api/simpan_data.php`. |
| `MIGRATE_AUTH_TOKEN` | Opsional | Diperlukan sebagai header `X-Migrate-Token` bila `migrate.php` dipanggil selain via CLI. |

## 4. Pipeline Verifikasi GitHub Actions & Hygiene Repositori

- **CI Pipeline (`ci.yml`)**: menjalankan 3 job berurutan (`frontend-verify` yang mencakup `npm run check:hygiene`, `tsc --noEmit`, `lint:ci`, dan seluruh suite Vitest; `backend-php-verify` yang mencakup `composer validate --strict`, `php -l` seluruh file PHP, dan pemeriksaan static guard keamanan; serta `build-and-bundle-check` yang memverifikasi prerender HTML, isi `.htaccess`, paket Docusaurus `/docs/`, serta batas ukuran chunk entri `/dashboard < 450 kB`).
- **CD Pipeline (`cd-heroku.yml`)**: berjalan otomatis setelah CI lulus di branch `main`, mendorong artefak ke Heroku remote via token API aman, lalu melakukan verifikasi otomatis `HTTP 200`, header `gzip` & `immutable`, `HEAD get_data.php`, dan status blokir `HTTP 403/404` pada file terlarang.
- **Git Hooks Versi Repo (`.githooks/`)**: menegakkan skrip pengecekan [check-repo-hygiene.mjs](file:///d:/magang/v1/pixel-twin-workbench/scripts/check-repo-hygiene.mjs) pada `pre-commit` (`--staged`) dan `pre-push` (`--strict`) guna memblokir file root tak dikenal, ekstensi sensitif/backup, file berukuran berlebih, maupun kebocoran token rahasia.
