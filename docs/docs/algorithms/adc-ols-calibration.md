---
id: adc-ols-calibration
title: Regresi Linear OLS Kalibrasi ADC (SOP C.1)
---

# Regresi Linear *Ordinary Least Squares* (OLS) Kalibrasi ADC

Perbedaan toleransi resistor pembagi (1%) serta karakteristik offset ADC internal tiap papan ESP32 dikalibrasi secara individual melalui SOP C.1 di Modul 06 menggunakan empat titik pengukuran multimeter digital presisi (**DMM**). Implementasi murni berada di [calibration.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/calibration.ts) dan [config-validation.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/config-validation.ts).

## 1. Model Matematika OLS

Misalkan $(x_i, y_i)$ adalah pasangan sampel pengukuran sebanyak $n \ge 2$, di mana:
- $x_i$ (`adc_raw_mv`): pembacaan mentah `GPIO 34` dalam satuan millivolt ($\text{mV}$)
- $y_i$ (`v_bat`): tegangan terminal aki terukur menggunakan DMM terkalibrasi dalam satuan Volt ($\text{V}$)

Model linear target untuk firmware ESP32 adalah:

$$V_{\text{bat}} = m \cdot \text{adc\_raw\_mv} + c$$

Rata-rata sampel $\bar{x}, \bar{y}$ serta komponen jumlah kuadrat simpangan:

$$S_{xx} = \sum_{i=1}^{n} (x_i - \bar{x})^2, \quad S_{yy} = \sum_{i=1}^{n} (y_i - \bar{y})^2, \quad S_{xy} = \sum_{i=1}^{n} (x_i - \bar{x})(y_i - \bar{y})$$

Koefisien kalibrasi (`cal_slope`, `cal_offset`) dan koefisien determinasi ($R^2$) dihitung sebagai berikut:

$$m = \frac{S_{xy}}{S_{xx}}, \qquad c = \bar{y} - m\bar{x}, \qquad R^2 = \frac{S_{xy}^2}{S_{xx} \cdot S_{yy}}$$

## 2. Preset Titik Uji Standar PCB v1.0 & PCB v2.0

| DMM (`V`) | PCB v1.0 (`300k/68k`) mV | PCB v2.0 (`100k/27k`) mV |
| :--- | :--- | :--- |
| `11.00 V` | `2020 mV` | `2305 mV` |
| `12.00 V` | `2205 mV` | `2517 mV` |
| `13.00 V` | `2389 mV` | `2730 mV` |
| `14.40 V` | `2648 mV` | `3027 mV` |
| **Hasil Fit Default** | $m = 0.0054118$, $c = 0.0690\text{ V}$ | $m = 0.0047037$, $c = 0.1600\text{ V}$ |

## 3. Batas Pengaman (*Guardrails*) Firmware & Server

Sebelum koefisien dikirim via `update_config.php` dan dipraktikkan oleh `applyPiggybackAck()` di NVS ESP32, baik frontend maupun backend menerapkan validasi seragam:

- Minimal **`2` titik** pengukuran DMM & ADC yang valid dan bernilai positif.
- **Kualitas kecocokan garis**: $R^2 \ge 0.9900$ (mencegah kesalahan ketik saat memasukkan data DMM ke tabel).
- **Rentang aman `slope_m`**: $0.001 < m < 0.02$.
- **Rentang aman `offset_c`**: $-2.0\text{ V} < c < +2.0\text{ V}$.
