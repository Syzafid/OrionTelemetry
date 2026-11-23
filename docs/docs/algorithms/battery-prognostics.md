---
id: battery-prognostics
title: Kompensasi Termal & Prediksi Baterai (TTC)
---

# Kompensasi Suhu OCV, Faktor Arrhenius & Prediksi *Time-to-Critical* (TTC)

Membaca angka Volt aki mentah sering mengecoh operator gudang: aki bersuhu `35 C` di lapangan terbuka bisa terlihat sehat dengan tegangan `12,20 V`, padahal muatan sebenarnya lebih rendah dan sel kimianya lebih cepat turun dibandingkan mobil yang diparkir di ruang teduh `25 C`.

Algoritma prognostik ini dijalankan dengan rumus yang persis sama di browser HMI ([battery-analytics.ts](file:///d:/magang/v1/pixel-twin-workbench/src/lib/battery-analytics.ts)) dan saat membuat laporan Excel di server ([export_excel.php](file:///d:/magang/v1/pixel-twin-workbench/backend/dipo_api/export_excel.php)).

## 1. Koreksi Tegangan ke Suhu Acuan $25^\circ\text{C}$ & Hitung SOC

Tegangan rangkaian terbuka (*Open Circuit Voltage*) aki timbal-asam 6-sel bergeser sekitar **$-0{,}018\text{ V/}^\circ\text{C}$**. Dengan memanfaatkan pembacaan suhu dari kristal RTC `DS3231SN` ($T_{\text{RTC}}$), sistem menormalkan voltase ke suhu referensi $25^\circ\text{C}$:

$$V_{25} = V_{\text{bat}} + 0{,}018 \times (25 - T_{\text{RTC}})$$

Persentase muatan baterai (`SOC%`) dipetakan secara linear dari $11{,}60\text{ V}\ (0\%)$ ke $12{,}70\text{ V}\ (100\%)$ ketika mesin dalam keadaan mati:

$$\text{SOC}_{\%} = \begin{cases} 100\%, & \text{jika } \text{engine\_on} = \text{true} \lor V_{\text{bat}} \ge 13{,}50\text{ V} \\ \text{clamp}\left(\text{round}\left(\frac{V_{25} - 11{,}60}{12{,}70 - 11{,}60} \times 100\right), 0, 100\right), & \text{sebaliknya} \end{cases}$$

## 2. Faktor Percepatan Panas Arrhenius ($Q_{10} = 2$)

Laju pengosongan mandiri (*self-discharge*) elektrokimia berlipat dua kali setiap kenaikan suhu $10^\circ\text{C}$ di atas $25^\circ\text{C}$:

$$AF = \begin{cases} 2^{\frac{T_{\text{RTC}} - 25}{10}}, & \text{jika } T_{\text{RTC}} > 25^\circ\text{C} \\ 1{,}0, & \text{jika } T_{\text{RTC}} \le 25^\circ\text{C} \end{cases}$$

## 3. Laju Penurunan Voltase & Estimasi *Time-to-Critical* (TTC)

Dari maksimal `24` titik riwayat tegangan terakhir, program menghitung kemiringan garis OLS ($\text{slope}$ dalam $\text{V/jam}$). Apabila jarak waktu antar titik pertama dan terakhir minimal `60 detik`, sumbu waktu memakai jam nyata $(t_i - t_0) / 3600$; jika kurang dari `60 detik` (misalnya uji cepat), indeks titik dipakai sebagai langkah per jam supaya tidak terjadi pembagian nol.

Berdasarkan hasil regresi tersebut, kondisi unit dibagi ke empat kelompok:

1. **Kritis Sekarang (`0.0h`, merah `crimson`)**: tegangan sudah menyentuh $V_{\text{bat}} \le V_{\text{crit}}$.
2. **Sedang Mengisi (`Charging`, hijau `emerald`)**: mesin menyala atau kemiringan tren positif ($\text{slope} > +0{,}002\text{ V/jam}$).
3. **Stabil (`Stable (> 72h Safe)`, hijau `emerald`)**: hampir tidak ada penurunan terukur ($|\text{slope}| \le 0{,}002\text{ V/jam}$).
4. **Menurun Terukur ($\text{slope} < -0{,}002\text{ V/jam}$)**: sisa waktu aman dihitung dulu secara garis lurus lalu diperketat oleh penalti panas bila suhu $T_{\text{RTC}} > 30^\circ\text{C}$:

$$\text{TTC}_{\text{base}} = \frac{V_{\text{bat}} - V_{\text{crit}}}{|\text{slope}|}, \qquad \text{TTC}_{\text{adjusted}} = \begin{cases} \frac{\text{TTC}_{\text{base}}}{AF}, & \text{jika } T_{\text{RTC}} > 30^\circ\text{C} \land AF > 1 \\ \text{TTC}_{\text{base}}, & \text{sebaliknya} \end{cases}$$

Layar HMI menandai unit berwarna `crimson` apabila $\text{TTC} \le 12{,}0\text{ jam}$, `amber` bila $\text{TTC} \le 36{,}0\text{ jam}$, dan `emerald` di atas ambang tersebut.

## 4. Contoh Hitungan Nyata di Lapangan

Sebuah mobil diparkir di area terbuka bersuhu siang hari $T_{\text{RTC}} = 35^\circ\text{C}$. Tegangan terbaca $V_{\text{bat}} = 12{,}20\text{ V}$ dengan batas kritis $V_{\text{crit}} = 11{,}80\text{ V}$ dan laju penurunan $-0{,}010\text{ V/jam}$:

1. Tegangan terkoreksi suhu: $V_{25} = 12{,}20 + 0{,}018 \times (25 - 35) = 12{,}02\text{ V}$ (`SOC ~ 38%`).
2. Faktor percepatan panas: $AF = 2^{(35 - 25)/10} = 2{,}0$.
3. Perkiraan awal garis lurus: $\text{TTC}_{\text{base}} = (12{,}20 - 11{,}80) / 0{,}010 = 40{,}0\text{ jam}$.
4. Karena $T_{\text{RTC}} > 30^\circ\text{C}$, prediksi diperketat menjadi $\text{TTC}_{\text{adjusted}} = 40{,}0 / 2{,}0 = 20{,}0\text{ jam}$ (peringatan **kuning / amber** agar segera dijadwalkan pemanasan mesin).
