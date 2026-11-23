---
id: adc-ols-calibration
title: Regresi Linear OLS Kalibrasi ADC (SOP C.1)
---

# Regresi Linear *Ordinary Least Squares* (OLS) Kalibrasi ADC

Dua unit PCB ORION dengan nilai resistor pembagi yang sama di atas kertas tetap memiliki selisih pembacaan puluhan milivolt di dunia nyata. Penyebabnya datang dari toleransi pabrikan resistor (`1%` atau `5%`), jatuh tegangan kabel, serta perbedaan referensi ADC internal tiap keping ESP32. Karena itu, setiap papan node dikalibrasi secara individual lewat **SOP C.1** di Modul 06 sebelum dipasang ke mobil.

Implementasi algoritma murni berada di [calibration.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/calibration.ts) dan aturan validasinya di [config-validation.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/config-validation.ts).

## 1. Langkah Praktis Teknisi di Meja Kerja (4 Titik DMM)

1. Hubungkan papan PCB v2.0 ke sumber daya variabel (*bench PSU*) dan jepit probe multimeter digital terkalibrasi (DMM) tepat di terminal masuk `J1.4 (+12V)` dan `J1.1 (GND)`.
2. Atur tegangan PSU bertahap pada empat titik acuan (`11.00 V`, `12.00 V`, `13.00 V`, dan `14.40 V`), lalu catat nilai `adc_raw_mv` yang terbaca oleh `GPIO 34` pada serial monitor atau layar HMI.
3. Masukkan empat pasangan angka `(DMM Volt, ADC mV)` ke panel Kalibrasi SOP C.1 di **Modul 06**.
4. Klik simpan agar HMI mengirim `cal_slope` dan `cal_offset` baru ke `node_configs`, lalu otomatis diterapkan oleh ESP32 pada siklus berikutnya lewat **Piggyback ACK**.

## 2. Rumus Garis Lurus (*Ordinary Least Squares* / OLS)

Misalkan ada $n \ge 2$ pasangan ukur $(x_i, y_i)$, dengan $x_i$ adalah pembacaan mentah `adc_raw_mv` (`mV`) dan $y_i$ adalah tegangan nyata multimeter (`V`). Kita mencari kemiringan $m$ dan titik potong $c$ untuk garis paling pas:

$$V_{\text{bat}} = m \cdot \text{adc\_raw\_mv} + c$$

Dari rata-rata sampel $\bar{x}$ dan $\bar{y}$, HMI menghitung jumlah kuadrat simpangan:

$$S_{xx} = \sum_{i=1}^{n} (x_i - \bar{x})^2, \quad S_{yy} = \sum_{i=1}^{n} (y_i - \bar{y})^2, \quad S_{xy} = \sum_{i=1}^{n} (x_i - \bar{x})(y_i - \bar{y})$$

Koefisien kalibrasi (`cal_slope`, `cal_offset`) serta ukuran kecocokan garis ($R^2$) diperoleh dari:

$$m = \frac{S_{xy}}{S_{xx}}, \qquad c = \bar{y} - m\bar{x}, \qquad R^2 = \frac{S_{xy}^2}{S_{xx} \cdot S_{yy}}$$

## 3. Tabel Acuan Preset PCB v1.0 & PCB v2.0

| Tegangan DMM (`V`) | PCB v1.0 (`300k/68k`) `mV` | PCB v2.0 (`100k/27k`) `mV` |
| :--- | :--- | :--- |
| `11.00 V` | `2020 mV` | `2305 mV` |
| `12.00 V` | `2205 mV` | `2517 mV` |
| `13.00 V` | `2389 mV` | `2730 mV` |
| `14.40 V` | `2648 mV` | `3027 mV` |
| Koefisien Default | $m = 0.0054118$, $c = 0.0690\text{ V}$ | $m = 0.0047037$, $c = 0.1600\text{ V}$ |

## 4. Batas Pengaman Agar Salah Ketik Tidak Terkirim

Sebelum `update_config.php` menerima koefisien baru ke NVS ESP32, frontend dan backend sama-sama menolak hasil regresi bila melanggar salah satu syarat berikut:

1. Jumlah pasangan titik ukur minimal `2` baris dan bernilai positif.
2. Kualitas kecocokan garis $R^2 \ge 0.9900$ (langsung menangkap kesalahan ketik semisal angka `2517` tertulis `257`).
3. Nilai `cal_slope` harus berada dalam rentang wajar `0.001 < m < 0.02`.
4. Nilai `cal_offset` tidak boleh melampaui `-2.0 V < c < +2.0 V`.
