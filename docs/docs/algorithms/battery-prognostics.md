---
id: battery-prognostics
title: Kompensasi Termal & Prediksi Baterai (TTC)
---

# Kompensasi Suhu OCV, Faktor Arrhenius & Prediksi *Time-to-Critical* (TTC)

Algoritma prognostik kesehatan aki 12V diimplementasikan secara identik di dua sisi: modul frontend TypeScript ([battery-analytics.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/battery-analytics.ts)) untuk pemantauan langsung, dan PHP ([export_excel.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/export_excel.php)) untuk laporan ringkasan PDI armada.

## 1. Kompensasi OCV Suhu Referensi $25^\circ\text{C}$ & Estimasi SOC

Tegangan rangkaian terbuka (*Open Circuit Voltage* / OCV) aki timbal-asam 6-sel berubah terhadap suhu sekitar dengan koefisien nominal **$-3\text{ mV/}^\circ\text{C/sel}$** atau **$-0.018\text{ V/}^\circ\text{C}$**. Menggunakan pembacaan suhu fisik dari kristal kompensasi suhu `DS3231SN` ($T_{\text{RTC}}$):

$$V_{25} = V_{\text{bat}} + 0.018 \times (25 - T_{\text{RTC}})$$

Persentase muatan baterai (*State of Charge* / SOC) dipetakan linear pada rentang $11.60\text{ V}\ (0\%)$ hingga $12.70\text{ V}\ (100\%)$ apabila mesin tidak sedang melakukan pengisian alternator:

$$\text{SOC}_{\%} = \begin{cases} 100\%, & \text{jika } \text{engine\_on} = \text{true} \lor V_{\text{bat}} \ge 13.50\text{ V} \\ \text{clamp}\left(\text{round}\left(\frac{V_{25} - 11.60}{12.70 - 11.60} \times 100\right), 0, 100\right), & \text{sebaliknya} \end{cases}$$

## 2. Faktor Akselerasi Pengurasan Termal Arrhenius ($Q_{10} = 2$)

Laju pengosongan mandiri (*self-discharge*) elektrokimia meningkat dua kali lipat setiap kenaikan suhu $10^\circ\text{C}$ di atas suhu referensi $25^\circ\text{C}$:

$$AF = \begin{cases} 2^{\frac{T_{\text{RTC}} - 25}{10}}, & \text{jika } T_{\text{RTC}} > 25^\circ\text{C} \\ 1.0, & \text{jika } T_{\text{RTC}} \le 25^\circ\text{C} \end{cases}$$

## 3. Regresi Laju Pengurasan & *Time-to-Critical* (TTC)

Dari hingga 24 titik riwayat tegangan $(t_i, v_i)$, kemiringan garis regresi OLS $\text{slope}$ ($\text{V/jam}$) dihitung dengan pemilihan skala waktu:
- Jika seluruh titik memiliki epoch valid dengan rentang `ts_last - ts_first >= 60 detik`, sumbu waktu $x_i = (t_i - t_0) / 3600$ (jam riil).
- Jika rentang waktu kurang dari `60 detik` (misal simulasi atau burst cepat), setiap indeks sampel dinormalisasi menjadi $x_i = i$ ($1\text{ jam/sampel}$) untuk menghindari pembagian mendekati nol.

### Klasifikasi Status & Rumus TTC

1. **Kritis Sekarang (`0.0h`, Tone `crimson`)**: bila $V_{\text{bat}} \le V_{\text{crit}}$.
2. **Sedang Mengisi (`Charging`, Tone `emerald`)**: bila `engine_on = true` atau $\text{slope} > +0.002\text{ V/jam}$.
3. **Menurun Terukur ($\text{slope} < -0.002\text{ V/jam}$)**:

$$\text{TTC}_{\text{base}} = \frac{V_{\text{bat}} - V_{\text{crit}}}{|\text{slope}|}$$

Apabila suhu kabin/kompartemen mesin tinggi ($T_{\text{RTC}} > 30^\circ\text{C}$), estimasi TTC dipercepat dengan faktor penalti termal:

$$\text{TTC}_{\text{adjusted}} = \begin{cases} \frac{\text{TTC}_{\text{base}}}{AF}, & \text{jika } T_{\text{RTC}} > 30^\circ\text{C} \land AF > 1 \\ \text{TTC}_{\text{base}}, & \text{sebaliknya} \end{cases}$$

Ambang warna peringatan: `crimson` bila $\text{TTC} \le 12.0\text{ jam}$, `amber` bila $\text{TTC} \le 36.0\text{ jam}$, dan `emerald` di atas itu.
4. **Stabil (`Stable (> 72h Safe)`, Tone `emerald`)**: bila $|\text{slope}| \le 0.002\text{ V/jam}$.
