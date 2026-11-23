---
id: module-01-topology
title: "Modul 01: Topologi & Inspektor Transduser"
---

# Modul 01: Topologi Kelistrikan & Inspektor Transduser

Modul 01 ([ShowroomModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/ShowroomModule.tsx)) adalah halaman utama saat operator membuka `/dashboard`. Komponen peta topologi tetap terjaga di memori walaupun pengguna berpindah ke modul lain sehingga keadaan seleksi unit dan animasi sasis tidak tereset.

## 1. Fungsi & Kapan Modul Ini Dipakai

Gunakan Modul 01 untuk inspeksi cepat satu unit kendaraan tertentu: melihat apakah jalur daya dari aki ke alternator sehat, mengecek sinyal mana yang memicu peringatan, atau memeriksa spesifikasi bawaan pabrik mobil (kapasitas aki, jenis mesin, cut-in alternator).

## 2. Bagian Layar & Arti Warna

Layar dibagi menjadi tiga kolom utama: daftar unit armada di kiri (dengan pencarian nomor rangka VIN, kode bay, atau model), diagram sasis kendaraan di tengah ([VehicleTopologyMap.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/VehicleTopologyMap.tsx)), dan panel detail 8 kanal sinyal di kanan ([ComponentNodeInspector.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/ComponentNodeInspector.tsx)). Peta topologi menampilkan 7 komponen sasis (`battery`, `alternator`, `powertrain`, `can_obd`, `esp32_core`, `rf_network`, dan filter `all`). Warna indikator **hijau (`emerald`)** menandakan nilai berada di rentang aman, **kuning (`amber`)** menandakan perlu perhatian, dan **merah (`crimson`)** menandakan aki kritis atau gangguan bus CAN.

## 3. Langkah Kerja Operator

1. Cari kendaraan berdasarkan bay parkir (`A-01`, dst.) atau VIN di bilah kiri lalu klik kartunya.
2. Klik salah satu node pada peta sasis di tengah (misalnya simpul `battery` atau `can_obd`) untuk menyaring daftar kanal sinyal agar hanya menampilkan jalur yang terhubung ke komponen tersebut.
3. Periksa kartu spesifikasi OEM di panel kanan (diambil dari [vehicle-topology.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/vehicle-topology.ts)) untuk membandingkan pembacaan alternator terhadap batas normal mesin diesel atau bensin unit tersebut.
4. Gunakan tombol silang ke modul lain bila ingin menindaklanjuti anomali (misalnya membuka diagnostik mesin atau riwayat tiket).

## 4. Mode Simulator vs Mode Live MySQL

Ketika konsol berada di mode **`LIVE_API`**, grafik mini (*sparkline*) di panel kanan murni digambar dari titik riwayat nyata yang ada di tabel MySQL `telemetry_logs`. Bila unit sedang tidur (`OFFLINE / DEEP SLEEP`) dan belum memiliki titik riwayat baru, panel tidak pernah mengisi grafik dengan kurva simulasi buatan.
