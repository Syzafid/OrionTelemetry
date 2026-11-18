# AUDIT 012: Analisis Ulang & Bedah Anti-Slop Menu 01 (Topologi Kelistrikan & Transduser)

**Tanggal**: 2026-11-18  
**Scope**: `TopNav.tsx`, `CommandPaletteModal.tsx`, `TelemetryContext.tsx`, `dashboard.tsx`, `index.tsx`, `Stage3D.tsx`, `ShowroomModule.tsx`, `VehicleTopologyMap.tsx`, `ComponentNodeInspector.tsx`, `styles.css`  
**Status**: **NEED REFACTORING (7 Temuan Kritis Teridentifikasi)**  
**Framework**: Anti-Slop Filter (`antislop.md`)  

---

## 1. Ringkasan Eksekutif

Meskipun perbaikan sebelumnya berhasil mengganti viewport 3D dengan peta topologi 2D ortografis dan inspektor simpul, bedah kode mendalam pada Menu 01 menemukan **7 pola AI Slop dan inkonsistensi faktual** yang merusak keakuratan teknis bengkel dan ketidaksesuaian penamaan modul:

1. **Nama Menu "01 Digital Twin 3D" Sudah Tidak Sesuai & File Mati `Stage3D.tsx` Masih Ada (HIGH: R-24, R-36, R-38, C-5)**.
2. **Hardcode Spesifikasi "PAJERO SPORT (4D56 / 4N15)" untuk Semua Model Mobil (HIGH: R-17, R-36, R-38, C-2, C-5)**.
3. **Tegangan Alternator Di-hardcode Statis `"13.80V"` / `"0.0V"` Alih-alih Membaca Telemetri Nyata (HIGH: R-17, R-36, C-5)**.
4. **Ambang Arus Tidur Shunt (`50 µA`) Tidak Sinkron dengan Kontrak Data (`380-540 µA`) & Status Keliru Saat Mesin Menyala (HIGH: R-17, C-4, C-5)**.
5. **Target Sentuh Filter Probe `< 44px`, Badge `"TAP SENSOR"` Mati, Baris Tabel Pasif, dan Absennya ARIA Tabs (MEDIUM: R-03, R-26, R-32, R-39)**.
6. **Decorative Status Dot Statis Berwarna Merah & Penomoran Ganda pada Daftar SOP (MEDIUM: R-01, R-09, R-11, R-31)**.
7. **Redundansi Panel "Live Payload (RX)" yang Mempersempit Daftar Unit Sidebar (MEDIUM: R-05, R-14, C-1, C-3)**.

---

## 2. Daftar Temuan Bernomor

| No | Aturan yang Dilanggar | Prioritas | Lokasi File & Baris | Ringkasan Temuan |
|:---:|:---|:---:|:---|:---|
| **#1** | **R-24, R-36, R-38, C-5** | **HIGH** | `TopNav.tsx` L14, `CommandPaletteModal.tsx` L40 & L434, `dashboard.tsx` L25-28 & L40, `index.tsx` L90-91/184/295/395/530/557, `Stage3D.tsx` | Nama menu masih `"Digital Twin 3D"`, teks pemasaran/metadata masih menyebut model 3D, `Alt+1..Alt+5` tertinggal dari 6 modul, dan file `Stage3D.tsx` (408 baris) masih ada sebagai dead code. |
| **#2** | **R-17, R-36, R-38, C-2, C-5** | **HIGH** | `VehicleTopologyMap.tsx` L67 & L125, `ComponentNodeInspector.tsx` L753 & L933 | Ketika user memilih `XFORCE`, `XPANDER`, `TRITON`, atau `L300`, topologi dan inspektor tetap menampilkan `"MITSUBISHI PAJERO SPORT HARNESS TOPOLOGY"`, `"4D56 / 4N15"`, `"70Ah"`, dan `"130A"` secara statis. |
| **#3** | **R-17, R-36, C-5** | **HIGH** | `VehicleTopologyMap.tsx` L82 & L458, `ComponentNodeInspector.tsx` L344 & L711 | Tegangan terminal B+ alternator di-hardcode `"13.80V"` saat pengisian aktif dan `"0.0V"` saat standby, mengabaikan nilai aktual `t.ecu_v` dan `t.v_bat` dari unit aktif. |
| **#4** | **R-17, C-4, C-5** | **HIGH** | `ComponentNodeInspector.tsx` L335-337 & L80, `VehicleTopologyMap.tsx` L75 | Data sehat armada memiliki `shunt_sleep_ua` 380-410 µA, sedangkan ambang dikunci `< 50.0 µA` sehingga semua unit sehat dicap `EXCESS_DRAIN`. Saat `engine_on`, `shunt_sleep_ua = 0` justru dianggap `PASS` padahal sirkuit shunt sedang di-bypass. |
| **#5** | **R-03, R-26, R-32, R-39** | **MEDIUM** | `VehicleTopologyMap.tsx` L151 & L760, `ComponentNodeInspector.tsx` L447-484 & L493-571 | Filter probe di header `min-h-[32px]` (< 44px di mobile); label `TAP SENSOR` tampak seperti tombol tapi non-interaktif; baris tabel `Matriks Data Stream` tidak bisa diklik (prop `onSelectNode` tidak dipakai); dan tab switcher belum memakai `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`. |
| **#6** | **R-01, R-09, R-11, R-31** | **MEDIUM** | `VehicleTopologyMap.tsx` L124, `ComponentNodeInspector.tsx` L969-979 | Titik merah statis `bg-crimson` muncul terus di header walau kendaraan sehat; daftar langkah Tab 3 menampilkan angka bulat `{idx + 1}` di sebelah teks yang sudah bernomor (`1.`, `SOP B.1:`). |
| **#7** | **R-05, R-14, C-1, C-3** | **MEDIUM** | `ShowroomModule.tsx` L196 & L256-310, `styles.css` L301 | Panel `Live Payload (RX)` mengulang 13 metrik yang sudah tampil di peta topologi dan memakan hampir setengah tinggi sidebar (`minmax(0, 1.2fr) minmax(0, 1fr)`), mempersempit daftar unit; tombol clear `X` hanya 32x32px. |

---

## 3. Rencana Eksekusi

Perbaikan dikerjakan berurutan mulai dari penamaan Menu 01 (`Topologi & Transduser`) dan pembersihan `Stage3D.tsx`, lalu profil kelistrikan dinamis per model kendaraan, pengikatan telemetri nyata untuk alternator dan sleep shunt, pembaruan interaktivitas & aksesibilitas ARIA, perapihan status LED & SOP, serta penataan ulang rasio sidebar pada `ShowroomModule.tsx` dan `styles.css`.
