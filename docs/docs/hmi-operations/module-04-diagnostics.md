---
id: module-04-diagnostics
title: "Modul 04: Diagnostik OBD-II CAN Bus"
---

# Modul 04: Diagnostik Mesin & OBD-II Read-Only

Modul 04 ([DiagnosticsModule.tsx](file:///d:/magang/v1/pixel-twin-workbench/src/components/hmi/DiagnosticsModule.tsx)) menampilkan data telemetri ECU ISO 15765-4 melalui 3 sub-tab terpisah dengan kebijakan **100% Read-Only ECU**:

1. **Tab 01 - Telemetri Mesin & Gauge Analog**:
   - Dua gauge SVG `270 derajat` untuk **Putaran Mesin (`RPM`)** dan **Suhu Coolant (`C`)** dengan skala zona merah dinamis mengikuti profil model ([vehicle-topology.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/vehicle-topology.ts), contoh bensin Xforce/Xpander maks `7.000 RPM` vs diesel Pajero/Triton maks `5.000 RPM`).
   - Grafik tren *dual-axis* RPM vs Suhu Coolant serta kartu seluruh **15 Parameter Live PID Mode `0x01`** (termasuk rasio sisa bahan bakar terhadap kapasitas tangki OEM masing-masing model).
2. **Tab 02 - Pembacaan Fault Code (Mode `0x03` / `0x07`)**:
   - Menampilkan status lampu **MIL (Check Engine)**, jarak tempuh pasca-reset (`dist_clr_km`), kode gangguan aktif (`DTC`), serta deskripsi diagnosa komponen.
   - Tidak menyediakan perintah penghapusan DTC (`Mode 0x04`) di produksi sesuai regulasi keutuhan stok kendaraan diler.
3. **Tab 03 - Diagnostik Fisik Jalur Kabel (`W-01` s/d `W-08`)**:
   - Menginspeksi kesehataan sinyal input `12V`, output pulsa `GPIO27` ADC `40 ms`, status catu daya CAN `GPIO26`, hasil self-loopback `WCMCU-230`, dan suhu RTC `DS3231SN`.
