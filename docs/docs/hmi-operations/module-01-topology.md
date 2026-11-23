---
id: module-01-topology
title: "Modul 01: Topologi & Inspektor Transduser"
---

# Modul 01: Topologi Kelistrikan & Inspektor Transduser

Modul 01 ([ShowroomModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/ShowroomModule.tsx)) dirender sebagai tampilan utama `/dashboard` dan tetap ter-mount di memori saat operator berpindah tab modul sehingga status visualisasi topologi selalu siaga.

## 1. Komponen Utama

- **Sidebar Daftar Unit Armada**: menampilkan badge bay (`A-01`, dst.), model kendaraan, voltase baterai aktual (`v_bat`), status koneksi (`LIVE / ONLINE`, `OFFLINE / DEEP SLEEP`), serta kotak pencarian filter instan bay/VIN/model.
- **Peta Topologi Interaktif 7 Node** ([VehicleTopologyMap.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/VehicleTopologyMap.tsx)): menampilkan aliran daya dan sinyal antar `battery`, `alternator`, `powertrain`, `can_obd`, `esp32_core`, dan `rf_network` (atau filter `all`). Mengklik salah satu node di peta SVG langsung menyaring daftar transduser di inspektor.
- **Inspektor 8-Channel Transduser** ([ComponentNodeInspector.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/ComponentNodeInspector.tsx)): membaca profil OEM kendaraan dari [vehicle-topology.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/vehicle-topology.ts) (kode mesin, kapasitas aki, spesifikasi alternator, idle RPM, cut-in RPM) serta menampilkan pembacaan 8 kanal sinyal beserta status warna (`emerald`, `amber`, `crimson`).

## 2. Konsistensi Data Live vs Sandbox

Pada mode **`LIVE_API`**, inspektor hanya menggambar tren sparkline dari riwayat titik nyata MySQL (`telemetry_logs`). Apabila unit dalam kondisi `OFFLINE` atau `STANDBY`, grafik tidak pernah melakukan interpolasi kurva buatan (*synthetic waveform*).
