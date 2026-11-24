import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * ============================================================================
 * MEMO & SINGLE SOURCE OF TRUTH: DOKUMEN TEKNIS UJI COBA ORION v2.0 (MONOKROM)
 * ============================================================================
 * Cara memperbarui PDF setelah ada revisi data uji atau diagram modul:
 * 1. Aset modul fisik monokrom (OBD-II, Fuse, MP1584, ZS-042, WCMCU-230, ESP32)
 *    berada di `docs/static/img/cirkit-modules/*.png` dan dirangkai otomatis ke Lampiran C.
 *    Foto PCB tampak atas & tampak bawah cermin berada di `docs/static/img/pcb-v2-tampak-*.jpg`.
 * 2. Ubah angka terukur atau status gerbang pada objek `APPROVAL_DOC_MEMO` di bawah.
 * 3. Jalankan `npm run pdf:yard-approval` untuk mencetak ulang 7 halaman PDF ke:
 *    `docs/static/pdf/ORION_Dokumen_Izin_Teknis_Gudang.pdf`.
 */
export const APPROVAL_DOC_MEMO = {
  docCode: "ORION-DOC-YARD-02 / Rev 3.1",
  dateLabel: "November 2026",
  hardwareRef: "Perangkat Keras PCB ORION v2.0 Step 2.1 (70 x 50 mm) · Firmware v1.6.0",
  title:
    'Dokumen Teknis Uji Coba Perangkat Pemantau Aki & Diagnostik OBD-II "ORION v2.0" pada Unit Kendaraan Gudang',
  executiveSummary:
    "Dokumen ini merangkum cara kerja, jalur kabel, hasil pengujian meja, dan langkah keselamatan perangkat ORION v2.0 sebelum uji coba terbatas pada unit kendaraan operasional di gudang. Uji coba bertujuan memverifikasi pembacaan data diagnostik CAN bus / OBD-II, pemantauan tegangan aki 12V, serta mode tidur hemat daya (deep sleep) secara non-invasif tanpa memotong atau mengubah kabel asli kendaraan. Seluruh angka di bawah dipisahkan tegas antara hasil pengukuran meja (bench test) yang sudah tercatat dan parameter yang wajib diukur saat integrasi Tahap C.",
  architectureItems: [
    {
      block: "Mikrokontroler Utama",
      spec: "ESP32 DevKit V1 (30-Pin Base)",
      detail:
        "Mengelola pembacaan berkala tegangan aki, komunikasi I2C/CAN, penyimpanan data cadangan lokal, serta aturan keselamatan H8: suplai +12V kendaraan/PSU dan kabel USB pemrograman ke ESP32 Base dilarang terpasang bersamaan.",
    },
    {
      block: "Transceiver CAN Bus",
      spec: "WCMCU-230 (SN65HVD230) · CRX=GPIO4, CTX=GPIO5",
      detail:
        "Terhubung ke jalur CAN_H (pin 6) dan CAN_L (pin 14) pada mode pemantauan pasif/diagnostik baca (Mode 0x01/0x03; tanpa perintah tulis atau hapus memori ECU Mode 0x04).",
    },
    {
      block: "Regulator Daya",
      spec: "Buck Converter MP1584 (+12V ke +3,3V)",
      detail:
        "Jalur ground disatukan (common ground) dari pin 4 dan 5 soket OBD-II ke seluruh modul (tidak memakai isolasi terpisah).",
    },
    {
      block: "Real-Time Clock (RTC)",
      spec: "ZS-042 (DS3231) · SDA=GPIO21, SCL=GPIO22, SQW=GPIO32",
      detail:
        "Modul sudah dimodifikasi fisik dengan melepas LED indikator daya dan rangkaian pengisi baterai koin CR2032 untuk mencegah pemborosan daya dan pengisian berlebih (overcharge).",
    },
    {
      block: "Power Gating (Hemat Daya)",
      spec: "Q1 AO3401A (CAN, GPIO26 aktif-LOW) & Q2 AO3401A + Q3 2N3904 (ADC, GPIO27 aktif-HIGH)",
      detail:
        "Q1 memutus suplai 3V3_CAN ke WCMCU-230 saat tidur. Q2/Q3 memutus jalur pembagi tegangan R1 100 kOhm & R2 27 kOhm ke ADC_OUT (GPIO34). Saat tidur, jalur pembagi terputus (0 mA) dan modul CAN dimatikan.",
    },
  ],
  testResults: [
    {
      parameter: "Output MP1584 tanpa beban",
      status: "TERUJI MEJA + TAHAP C",
      result:
        "Terukur 3,33 V pada input 11,91 V (masuk rentang toleransi 3,2-3,4 V). Rencana pengujian lanjutan di 12,6 V dan sekitar 14 V dengan batas arus awal 100 mA dijadwalkan sebelum integrasi unit.",
      meaning:
        "Tegangan suplai logika tercatat stabil di 3,33 V pada pengukuran awal. Pengujian di 12,6 V dan sekitar 14 V diperlukan untuk mengecek kestabilan saat pengisian alternator bekerja.",
    },
    {
      parameter: "Proteksi arus lebih (sekring)",
      status: "DESAIN / SIAP PASANG",
      result:
        "Sekring 500 mA time-lag (slow-blow) pada jalur masuk +12V untuk perkiraan beban kerja nominal ORION sekitar 0,20-0,25 A, atau opsi sekring 500 mA fast-blow / 1 A fast-blow yang tersedia.",
      meaning:
        "Jika terjadi korsleting pada modul, sekring putus di batas pengaman (di atas beban 0,20-0,25 A) sebelum arus berlebih membebani jalur kelistrikan mobil.",
    },
    {
      parameter: "Proteksi polaritas & lonjakan transien",
      status: "TERUJI KOMPONEN",
      result:
        "Dioda Schottky D1 1N5819 terukur pada uji komponen 0,15-0,35 V untuk proteksi polaritas terbalik, dipasangkan dengan dioda TVS P6KE18A paralel ke GND.",
      meaning:
        "Dioda D1 menahan aliran arus bila pemasangan +12V dan GND tertukar, sedangkan dioda TVS membuang lonjakan tegangan sesaat di atas 18 V menuju ground.",
    },
    {
      parameter: "Sakelar daya CAN (Q1 / GPIO26)",
      status: "TERUJI MEJA",
      result: "Terukur OFF = 0,00 V dan ON = 3,33 V.",
      meaning:
        "Berdasarkan pengujian meja, suplai ke chip transceiver WCMCU-230 turun hingga 0,00 V saat GPIO26 nonaktif sehingga tidak membebani bus CAN ketika tidur.",
    },
    {
      parameter: "Integritas MOSFET AO3401A (Q1 & Q2)",
      status: "TERUJI KOMPONEN",
      result:
        "Uji dioda body D-S terbaca ~0,5 V (probe merah di D, hitam di S) dan OL saat dibalik. Terpasang pada adaptor SOT-23 (2-3-1 = S-D-G) tanpa hubung singkat antarkaki.",
      meaning:
        "Mengecek fungsi sakelar elektronik agar bekerja searah sesuai polaritas sebelum dialiri tegangan kendaraan 12V.",
    },
    {
      parameter: "Modifikasi fisik RTC ZS-042",
      status: "TERVERIFIKASI FISIK",
      result:
        "Jalur LED indikator daya dan rangkaian pengisian baterai koin sudah dilepas secara fisik dari modul.",
      meaning:
        "Pelepasan komponen LED dan charger menghentikan pemborosan daya statis serta arus balik ke baterai koin CR2032 saat papan mendapat suplai 3,3 V.",
    },
    {
      parameter: "Sakelar pembagi tegangan ADC (Q2/Q3 / GPIO27)",
      status: "TARGET UJI TAHAP C",
      result:
        "Kontrol aktif-HIGH; jalur pembagi terbuka saat tidur (0 mA bocor). Target Vgs pada v2.0 berada di kisaran -7,6 V pada 11,9 V dan -9,1 V pada 14,4 V (diukur ulang pada v2.0 saat Tahap C).",
      meaning:
        "Pengukuran ulang Vgs pada Tahap C mengecek apakah Q2 beroperasi aman di bawah batas Vgs maksimum +/- 12 V sekaligus membuktikan arus pembagi tetap 0 mA saat tidur.",
    },
    {
      parameter: "Arus tidur (E5) & Kalibrasi ADC",
      status: "WAJIB UJI TAHAP C",
      result:
        "Pengukuran arus deep sleep gabungan DevKit + Base (melintasi shunt R5 10 Ohm) dan kalibrasi 4-titik ADC dijadwalkan sebagai uji wajib pada Tahap C sebelum/saat pengujian unit.",
      meaning:
        "Angka konsumsi arus tidur aktual pada prototipe v2.0 dicatat langsung melalui uji E5 sebelum perangkat dipasang lebih lama pada kendaraan parkir.",
    },
  ],
  riskMatrix: [
    {
      risk: "Korsleting atau salah colok antara kabel daya (+12V/GND) dan jalur sinyal CAN",
      mitigation:
        "Dipisahkan menjadi dua konektor terkunci (JST-XH 2-pin daya dan JST-XH 2-pin sinyal CAN) dengan pelabelan jelas dan anti-tertukar, serta pemasangan sekring 500 mA pada kabel masuk +12V.",
    },
    {
      risk: "Penurunan muatan aki berlebih saat kendaraan terparkir di gudang",
      mitigation:
        "Mode tidur berkala disertai pemutusan suplai transceiver CAN via Q1 (teruji 0,00 V saat OFF), pemutusan pembagi tegangan via Q2/Q3, dan modifikasi hemat daya ZS-042. Besaran arus tidur final diukur pada uji E5 Tahap C.",
    },
    {
      risk: "Getaran kabin kendaraan atau kontak pin longgar saat uji jalan",
      mitigation:
        "Konektor terkunci, kotak pelindung plastik (non-konduktif) dengan penopang modul kaku, isolasi Kapton pada area rawan, serta pemeriksaan kontinuitas dan isolasi penuh tanpa daya sebelum perangkat dipasang ke unit.",
    },
    {
      risk: "Kesalahan prosedur saat debugging atau pemrograman ulang",
      mitigation:
        "Penerapan aturan keselamatan H8: larangan menyalakan suplai +12V kendaraan/PSU bersamaan dengan kabel USB pemrograman ke ESP32 Base.",
    },
  ],
  bomItems: [
    { ref: "U1", name: "ESP32 DevKit V1 (30-Pin Base)", qty: "1", role: "Pengendali utama, baca ADC/I2C/CAN, simpan log lokal, patuh aturan H8." },
    { ref: "U2", name: "Modul RTC DS3231 (ZS-042 Modifikasi)", qty: "1", role: "Pewaktu akurat & sinyal bangun SQW; LED power & charger CR2032 dilepas." },
    { ref: "U3", name: "Transceiver CAN WCMCU-230 (SN65HVD230)", qty: "1", role: "Antarmuka CAN_H/CAN_L 500 kbps mode pemantauan pasif/baca ECU." },
    { ref: "U4", name: "Buck Converter MP1584 (3,3 V Fix)", qty: "1", role: "Penurun tegangan +12V ke 3,33 V dengan konfigurasi common ground." },
    { ref: "J_PWR, J_CAN", name: "Konektor Terkunci JST-XH 2-Pin", qty: "2", role: "Pemisah fisik konektor daya (+12V/GND) dan konektor data CAN anti-tertukar." },
    { ref: "F1", name: "Sekring In-Line 500 mA Time-Lag (opsi Fast-Blow)", qty: "1", role: "Pengaman arus berlebih di jalur masuk +12V di atas beban 0,20-0,25 A." },
    { ref: "D1, TVS1", name: "Dioda Schottky 1N5819 & TVS P6KE18A", qty: "2", role: "Penahan polaritas terbalik (D1) dan peredam lonjakan > 18 V ke GND (TVS1)." },
    { ref: "R5, JP1", name: "Resistor Shunt 10 Ohm & Header Jumper 2-Pin", qty: "2", role: "Titik ukur arus deep sleep Tahap C (E5) dan jumper bypass operasi normal." },
    { ref: "Q1, R3", name: "MOSFET Kanal-P AO3401A + Pull-Up 47 kOhm", qty: "2", role: "Sakelar high-side pemutus rel 3V3_CAN via GPIO26 aktif-LOW." },
    { ref: "Q2, Q3", name: "MOSFET AO3401A + NPN 2N3904", qty: "2", role: "Sakelar high-side pemutus jalur pembagi tegangan aki via GPIO27 aktif-HIGH." },
    { ref: "R4, R6, R7, R8", name: "Jaringan Resistor Bias Gate (47k, 27k, 10k, 100k)", qty: "4", role: "Pengendali bias sakelar Q2/Q3 agar Vgs bekerja aman di bawah batas +/- 12 V." },
    { ref: "R1, R2", name: "Pembagi Tegangan Aki (100 kOhm & 27 kOhm)", qty: "2", role: "Penurun skala tegangan 12-14,4 V agar aman dibaca pin ADC GPIO34." },
    { ref: "C1, C2, C3", name: "Kapasitor Filter (2x 100 nF Keramik, 1x 100 uF)", qty: "3", role: "Filter ADC (C1), penyangga 3V3 ESP32 Base (C2), peredam riak 3V3_CAN (C3)." },
    { ref: "PCB & Kotak", name: "PCB Matriks 70 x 50 mm (24 x 18) + Kotak Pelindung", qty: "1 set", role: "Dudukan kaku tahan getaran di dalam kotak pelindung plastik non-konduktif." },
  ],
  onlineRefs: [
    { label: "Dashboard & Aplikasi Web", url: "https://www.oriontelemetry.tech" },
    { label: "Dokumentasi Teknis Lengkap", url: "https://www.oriontelemetry.tech/docs/" },
  ],
};

const ROOT = process.cwd();
const OUTPUT_PDF_PATH = path.join(
  ROOT,
  "docs",
  "static",
  "pdf",
  "ORION_Dokumen_Izin_Teknis_Gudang.pdf",
);
const PCB_TOP_IMG_PATH = path.join(ROOT, "docs", "static", "img", "pcb-v2-tampak-atas.jpg");
const PCB_BOTTOM_IMG_PATH = path.join(
  ROOT,
  "docs",
  "static",
  "img",
  "pcb-v2-tampak-bawah-cermin.jpg",
);
const CIRKIT_MODULES_DIR = path.join(ROOT, "docs", "static", "img", "cirkit-modules");

function findHeadlessBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  throw new Error("Chrome/Edge headless browser not found. Set CHROME_PATH environment variable.");
}

function fileToDataUri(filePath, mimeType) {
  const buf = readFileSync(filePath);
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

function loadCirkitModuleUris() {
  const names = [
    "obd2-plug.png",
    "fuse-holder.png",
    "mp1584-buck.png",
    "zs042-rtc.png",
    "wcmcu230-can.png",
    "esp32-devkit.png",
  ];
  const uris = {};
  for (const name of names) {
    const p = path.join(CIRKIT_MODULES_DIR, name);
    if (!existsSync(p)) {
      throw new Error(`Missing cropped Cirkit module asset: ${p}`);
    }
    uris[name] = fileToDataUri(p, "image/png");
  }
  return uris;
}

function buildMonochromeObdSvg() {
  const activePins = new Map([
    [4, { label: "GND" }],
    [5, { label: "GND" }],
    [6, { label: "CAN_H" }],
    [14, { label: "CAN_L" }],
    [16, { label: "+12V" }],
  ]);

  const drawRow = (startPin, y, rowLabel) => {
    let items = `<text x="14" y="${y + 15}" font-size="8.6" fill="#222222" font-weight="700">${rowLabel}</text>`;
    for (let idx = 0; idx < 8; idx++) {
      const pin = startPin + idx;
      const x = 114 + idx * 51;
      const active = activePins.get(pin);
      const fill = active ? "#111111" : "#ffffff";
      const stroke = active ? "#000000" : "#888888";
      const dash = active ? "" : 'stroke-dasharray="2.5 2"';
      const numFill = active ? "#ffffff" : "#555555";
      const lblFill = active ? "#e5e5e5" : "#888888";
      items += `
        <rect x="${x}" y="${y}" width="40" height="24" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.2" ${dash} />
        <text x="${x + 20}" y="${y + 11}" text-anchor="middle" font-size="9" font-weight="700" fill="${numFill}">${pin}</text>
        <text x="${x + 20}" y="${y + 20}" text-anchor="middle" font-size="6.8" font-weight="600" fill="${lblFill}">${active ? active.label : "KOSONG"}</text>
      `;
    }
    return items;
  };

  return `
    <svg viewBox="0 0 540 112" width="100%" height="106" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pinout Soket OBD-II 16-Pin Monokrom">
      <rect x="3" y="3" width="534" height="106" rx="4" fill="#ffffff" stroke="#222222" stroke-width="1.2" />
      <path d="M 100 12 L 522 12 L 512 90 L 108 90 Z" fill="#f7f7f7" stroke="#555555" stroke-width="1.1" />
      ${drawRow(1, 18, "Pin Atas (1-8)")}
      ${drawRow(9, 54, "Pin Bawah (9-16)")}
      <text x="270" y="102" text-anchor="middle" font-size="8.4" font-weight="600" fill="#111111">
        Koneksi Non-Invasif: Pin 16 (+12V), Pin 4/5 (GND), Pin 6 (CAN_H), Pin 14 (CAN_L). 11 pin lain tidak dihubungkan.
      </text>
    </svg>
  `;
}

function buildMonochromeWiringSvg() {
  return `
    <svg viewBox="0 0 760 284" width="100%" height="266" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Skema Aliran Kelistrikan dan Wiring ORION v2.0 dengan Panah Arah Input-Output">
      <defs>
        <marker id="arr-pwr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.2" markerHeight="5.2" orient="auto">
          <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#111111" />
        </marker>
        <marker id="arr-sig-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#222222" />
        </marker>
        <marker id="arr-sig-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 10 1.2 L 1 5 L 10 8.8 z" fill="#222222" />
        </marker>
        <marker id="arr-ctl" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#444444" />
        </marker>
      </defs>

      <rect x="2" y="2" width="756" height="280" rx="4" fill="#ffffff" stroke="#111111" stroke-width="1.4" />

      <!-- POWER FLOWS (Thick solid lines with arrowheads showing INPUT -> OUTPUT) -->
      <!-- +12V_F from Power Connector to Input Protection [1] -->
      <path d="M 120 44 H 190" fill="none" stroke="#111111" stroke-width="2.2" marker-end="url(#arr-pwr)" />
      <!-- +12V_MP from Input Protection [1] to MP1584 -->
      <path d="M 332 44 H 364" fill="none" stroke="#111111" stroke-width="2.2" marker-end="url(#arr-pwr)" />
      <!-- +12V_D branch from [1] to High-Side ADC Switch [2] -->
      <path d="M 332 66 H 348 V 116 H 364" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#arr-pwr)" />
      <!-- +3V3_MAIN from MP1584 to ESP32 Base -->
      <path d="M 504 44 H 574" fill="none" stroke="#111111" stroke-width="2.2" marker-end="url(#arr-pwr)" />
      <!-- +3V3_MAIN branch down cleanly in left lane x=514 to Q1 CAN Gate & ZS-042 RTC [3] -->
      <path d="M 514 44 V 168 H 504" fill="none" stroke="#111111" stroke-width="1.8" marker-end="url(#arr-pwr)" />
      <circle cx="514" cy="44" r="2.8" fill="#111111" />

      <!-- SIGNAL & DATA FLOWS -->
      <!-- Bidirectional CAN Bus: CAN Connector <-> Differential Block <-> WCMCU-230 [3] <-> ESP32 CRX/CTX -->
      <path d="M 122 186 H 188" fill="none" stroke="#222222" stroke-width="1.5" marker-start="url(#arr-sig-start)" marker-end="url(#arr-sig-end)" />
      <path d="M 334 186 H 362" fill="none" stroke="#222222" stroke-width="1.5" marker-start="url(#arr-sig-start)" marker-end="url(#arr-sig-end)" />
      <path d="M 506 204 H 574" fill="none" stroke="#222222" stroke-width="1.5" marker-start="url(#arr-sig-start)" marker-end="url(#arr-sig-end)" />

      <!-- Unidirectional ADC analog sense: Q2/Q3 Divider [2] -> ESP32 GPIO34 -->
      <path d="M 504 116 H 574" fill="none" stroke="#222222" stroke-width="1.5" marker-end="url(#arr-sig-end)" />

      <!-- Bidirectional I2C Bus: ZS-042 [3] <-> ESP32 GPIO21/22 -->
      <path d="M 506 174 H 574" fill="none" stroke="#222222" stroke-width="1.4" marker-start="url(#arr-sig-start)" marker-end="url(#arr-sig-end)" />

      <!-- CONTROL GATES & WAKEUP INTERRUPTS (Dashed arrows) -->
      <!-- ESP32 GPIO27 -> Q2/Q3 Gate (Active-HIGH) -->
      <path d="M 576 136 H 506" fill="none" stroke="#444444" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#arr-ctl)" />
      <!-- ESP32 GPIO26 -> Q1 Gate (Active-LOW) -->
      <path d="M 576 190 H 506" fill="none" stroke="#444444" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#arr-ctl)" />
      <!-- ZS-042 SQW -> ESP32 GPIO32 (Wakeup IRQ) -->
      <path d="M 504 220 H 574" fill="none" stroke="#444444" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#arr-ctl)" />

      <!-- COMMON GROUND RETURN BUS (left vertical lane x=130 clear of CAN <-> label at x=160) -->
      <path d="M 120 68 H 130 V 242 H 658 V 228" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#arr-pwr)" />
      <path d="M 262 88 V 242" fill="none" stroke="#555555" stroke-width="1.1" stroke-dasharray="2 2" />
      <path d="M 435 82 V 242" fill="none" stroke="#555555" stroke-width="1.1" stroke-dasharray="2 2" />
      <circle cx="262" cy="242" r="2.6" fill="#111111" />
      <circle cx="435" cy="242" r="2.6" fill="#111111" />
      <text x="410" y="253" text-anchor="middle" font-size="7.4" font-weight="700" fill="#111111">
        COMMON GROUND BUS (OBD Pin 4/5 -&gt; GND semua modul &amp; TVS P6KE18A; bukan isolasi galvanik)
      </text>

      <!-- Wire Direction Badges (white-backed & strictly centered in clear gaps) -->
      <rect x="136" y="31" width="42" height="10" rx="2" fill="#ffffff" />
      <text x="157" y="38.8" text-anchor="middle" font-size="6.7" font-weight="700" fill="#111111">+12V IN</text>
      <rect x="136" y="172" width="40" height="10" rx="2" fill="#ffffff" />
      <text x="156" y="179.8" text-anchor="middle" font-size="6.6" font-weight="700" fill="#222222">CAN &lt;-&gt;</text>

      <rect x="520" y="31" width="44" height="10" rx="2" fill="#ffffff" />
      <text x="542" y="38.8" text-anchor="middle" font-size="6.7" font-weight="700" fill="#111111">3V3 OUT</text>
      <rect x="524" y="103" width="38" height="10" rx="2" fill="#ffffff" />
      <text x="543" y="110.8" text-anchor="middle" font-size="6.6" font-weight="700" fill="#111111">ADC -&gt;</text>
      <rect x="522" y="124" width="42" height="9" rx="2" fill="#ffffff" />
      <text x="543" y="131.5" text-anchor="middle" font-size="6.3" font-weight="700" fill="#444444">&lt;- CTRL</text>
      <rect x="522" y="162" width="40" height="9" rx="2" fill="#ffffff" />
      <text x="542" y="169.5" text-anchor="middle" font-size="6.4" font-weight="700" fill="#222222">&lt;-&gt; I2C</text>
      <rect x="526" y="179" width="34" height="8.5" rx="2" fill="#ffffff" />
      <text x="543" y="186" text-anchor="middle" font-size="6.2" font-weight="700" fill="#444444">&lt;- EN</text>
      <rect x="522" y="193" width="40" height="8.5" rx="2" fill="#ffffff" />
      <text x="542" y="200" text-anchor="middle" font-size="6.4" font-weight="700" fill="#222222">&lt;-&gt; CAN</text>
      <rect x="524" y="209" width="36" height="8.5" rx="2" fill="#ffffff" />
      <text x="542" y="216" text-anchor="middle" font-size="6.2" font-weight="700" fill="#444444">IRQ -&gt;</text>

      <!-- LEGEND BAR -->
      <line x1="14" y1="262" x2="746" y2="262" stroke="#bbbbbb" stroke-width="0.9" />
      <text x="20" y="274" font-size="7.1" font-weight="700" fill="#111111">LEGENDA ARAH:</text>
      <line x1="100" y1="271" x2="128" y2="271" stroke="#111111" stroke-width="2.1" marker-end="url(#arr-pwr)" />
      <text x="134" y="274" font-size="7.1" fill="#222222">Aliran Daya (+12V / 3,3V)</text>
      <line x1="258" y1="271" x2="286" y2="271" stroke="#222222" stroke-width="1.5" marker-end="url(#arr-sig-end)" />
      <text x="292" y="274" font-size="7.1" fill="#222222">Sinyal Sensor Searah (ADC)</text>
      <line x1="422" y1="271" x2="454" y2="271" stroke="#222222" stroke-width="1.5" marker-start="url(#arr-sig-start)" marker-end="url(#arr-sig-end)" />
      <text x="460" y="274" font-size="7.1" fill="#222222">Komunikasi Dua Arah (CAN / I2C)</text>
      <line x1="612" y1="271" x2="642" y2="271" stroke="#444444" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#arr-ctl)" />
      <text x="648" y="274" font-size="7.1" fill="#222222">Kontrol Gate / IRQ</text>

      <!-- BLOCKS -->
      <!-- 0A: Konektor Daya -->
      <rect x="14" y="22" width="106" height="58" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.5" />
      <text x="67" y="36" text-anchor="middle" font-size="8.1" font-weight="700" fill="#111111">KONEKTOR DAYA</text>
      <text x="67" y="47" text-anchor="middle" font-size="7.1" fill="#333333">JST-XH 2-Pin Terkunci</text>
      <text x="21" y="61" font-size="7.4" font-weight="700" fill="#111111">OUT: +12V (OBD 16)</text>
      <text x="21" y="73" font-size="7.4" font-weight="700" fill="#111111">RET: GND (OBD 4/5)</text>

      <!-- 0B: Konektor CAN -->
      <rect x="14" y="158" width="106" height="54" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.5" />
      <text x="67" y="172" text-anchor="middle" font-size="8.1" font-weight="700" fill="#111111">KONEKTOR CAN</text>
      <text x="67" y="183" text-anchor="middle" font-size="7.1" fill="#333333">JST-XH 2-Pin Terpisah</text>
      <text x="21" y="196" font-size="7.4" fill="#111111">I/O: CAN_H (OBD 6)</text>
      <text x="21" y="206" font-size="7.4" fill="#111111">I/O: CAN_L (OBD 14)</text>

      <!-- 1: Proteksi Masuk -->
      <rect x="192" y="18" width="140" height="70" rx="3" fill="#f4f4f4" stroke="#111111" stroke-width="1.4" />
      <rect x="192" y="18" width="18" height="14" fill="#111111" />
      <text x="201" y="28" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">1</text>
      <text x="271" y="29" text-anchor="middle" font-size="8.0" font-weight="700" fill="#111111">PROTEKSI MASUK</text>
      <text x="262" y="43" text-anchor="middle" font-size="7.5" fill="#111111">Sekring 500 mA Time-Lag</text>
      <text x="262" y="55" text-anchor="middle" font-size="7.5" fill="#111111">Dioda D1 1N5819 (Anti-Balik)</text>
      <text x="262" y="67" text-anchor="middle" font-size="7.5" fill="#111111">TVS P6KE18A (&gt;18V ke GND)</text>
      <text x="262" y="79" text-anchor="middle" font-size="7.0" fill="#444444">Shunt R5 10 Ohm / Bypass JP</text>

      <!-- CAN Bus Filter -->
      <rect x="192" y="160" width="140" height="50" rx="3" fill="#ffffff" stroke="#555555" stroke-width="1.2" />
      <text x="262" y="177" text-anchor="middle" font-size="7.9" font-weight="700" fill="#111111">JALUR CAN DIFERENSIAL</text>
      <text x="262" y="190" text-anchor="middle" font-size="7.3" fill="#333333">500 kbps Mode Baca Pasif</text>
      <text x="262" y="201" text-anchor="middle" font-size="6.9" fill="#555555">Terpisah Fisik dari Jalur Daya</text>

      <!-- Buck Regulator U4 -->
      <rect x="366" y="18" width="138" height="64" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.4" />
      <text x="435" y="33" text-anchor="middle" font-size="8.1" font-weight="700" fill="#111111">REGULATOR MP1584</text>
      <text x="435" y="46" text-anchor="middle" font-size="7.5" fill="#111111">+12V -&gt; 3,33 V (Teruji Meja)</text>
      <text x="435" y="59" text-anchor="middle" font-size="7.1" fill="#333333">Uji Lanjut: 12,6V &amp; ~14V</text>
      <text x="435" y="71" text-anchor="middle" font-size="6.9" fill="#555555">Kapasitor C2 100uF ESP32 Base</text>

      <!-- Block 2: High-Side ADC Gate -->
      <rect x="366" y="92" width="138" height="60" rx="3" fill="#f4f4f4" stroke="#111111" stroke-width="1.4" />
      <rect x="366" y="92" width="18" height="14" fill="#111111" />
      <text x="375" y="102" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">2</text>
      <text x="444" y="103" text-anchor="middle" font-size="7.9" font-weight="700" fill="#111111">SAKELAR ADC Q2/Q3</text>
      <text x="435" y="117" text-anchor="middle" font-size="7.3" fill="#111111">AO3401A + 2N3904 (GPIO27)</text>
      <text x="435" y="129" text-anchor="middle" font-size="7.3" fill="#111111">Divider R1 100k / R2 27k</text>
      <text x="435" y="142" text-anchor="middle" font-size="7.2" font-weight="700" fill="#111111">Saat Tidur: Terputus (0 mA)</text>

      <!-- Block 3: CAN Gate & RTC -->
      <rect x="366" y="162" width="138" height="68" rx="3" fill="#f4f4f4" stroke="#111111" stroke-width="1.4" />
      <rect x="366" y="162" width="18" height="14" fill="#111111" />
      <text x="375" y="172" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">3</text>
      <text x="444" y="173" text-anchor="middle" font-size="7.8" font-weight="700" fill="#111111">SAKELAR CAN Q1 &amp; RTC</text>
      <text x="435" y="187" text-anchor="middle" font-size="7.3" fill="#111111">Q1 GPIO26 (0,00V / 3,33V)</text>
      <text x="435" y="199" text-anchor="middle" font-size="7.3" fill="#111111">WCMCU-230 + ZS-042 RTC</text>
      <text x="435" y="211" text-anchor="middle" font-size="6.9" fill="#333333">LED &amp; Charger ZS-042 Dilepas</text>
      <text x="435" y="222" text-anchor="middle" font-size="6.9" fill="#333333">SQW Bangun -&gt; GPIO32</text>

      <!-- Block 4: ESP32 Controller -->
      <rect x="576" y="22" width="168" height="206" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.6" />
      <rect x="576" y="22" width="18" height="14" fill="#111111" />
      <text x="585" y="32" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">4</text>
      <text x="670" y="34" text-anchor="middle" font-size="8.5" font-weight="700" fill="#111111">ESP32 DEVKIT BASE</text>
      <text x="660" y="47" text-anchor="middle" font-size="7.0" font-weight="700" fill="#222222">H8: Dilarang 12V + USB Serentak</text>
      <line x1="586" y1="53" x2="734" y2="53" stroke="#cccccc" stroke-width="1" />
      <text x="586" y="68" font-size="7.6" fill="#111111">[IN] 3V3 / GND : Suplai MP1584</text>
      <text x="586" y="88" font-size="7.6" fill="#111111">[IN] GPIO34 : ADC_OUT Aki</text>
      <text x="586" y="108" font-size="7.6" fill="#111111">[OUT] GPIO27 : ADC_TRIG (HIGH)</text>
      <text x="586" y="128" font-size="7.6" fill="#111111">[I/O] GPIO21/22 : I2C ZS-042</text>
      <text x="586" y="148" font-size="7.6" fill="#111111">[OUT] GPIO26 : CAN_EN (LOW)</text>
      <text x="586" y="168" font-size="7.6" fill="#111111">[I/O] GPIO4/5 : CRX / CTX CAN</text>
      <text x="586" y="188" font-size="7.6" fill="#111111">[IN] GPIO32 : Bangun SQW RTC</text>
      <rect x="586" y="198" width="148" height="20" rx="2" fill="#f4f4f4" stroke="#555555" stroke-width="0.9" />
      <text x="660" y="211" text-anchor="middle" font-size="7.0" font-weight="700" fill="#111111">Panah Menunjukkan Arah Sinyal</text>
    </svg>
  `;
}

function buildRealisticCirkitSvg(moduleUris) {
  return `
    <svg viewBox="0 0 760 568" width="100%" height="545" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagram Wiring Realistis ORION v2.0 Berbasis Aset Modul Fisik dan Arah Panah">
      <defs>
        <marker id="c-pwr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.2" markerHeight="5.2" orient="auto">
          <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#111111" />
        </marker>
        <marker id="c-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#222222" />
        </marker>
        <marker id="c-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 10 1.2 L 1 5 L 10 8.8 z" fill="#222222" />
        </marker>
        <marker id="c-ctl" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.8" markerHeight="5.8" orient="auto">
          <path d="M 0 1.4 L 8.5 5 L 0 8.6 z" fill="#444444" />
        </marker>
      </defs>

      <rect x="2" y="2" width="756" height="564" rx="4" fill="#ffffff" stroke="#111111" stroke-width="1.4" />

      <!-- TOP TITLE BAR INSIDE SVG -->
      <rect x="10" y="10" width="740" height="22" rx="2" fill="#f3f3f3" stroke="#666666" stroke-width="0.9" />
      <text x="380" y="24.5" text-anchor="middle" font-size="8.2" font-weight="700" fill="#111111">
        ARAH ALIRAN WIRING ORION v2.0 STEP 2.1: MASUKAN KENDARAAN (KIRI) -&gt; PROTEKSI &amp; SAKELAR (TENGAH) -&gt; ESP32 BASE (KANAN)
      </text>

      <!-- ===================== ZONE 1 (LEFT x=14..156): OBD-II + FUSE + 2x JST-XH ===================== -->
      <rect x="14" y="42" width="142" height="136" rx="3" fill="#ffffff" stroke="#333333" stroke-width="1.1" />
      <text x="85" y="55" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">PORT OBD-II MOBIL (16-PIN)</text>
      <image href="${moduleUris["obd2-plug.png"]}" x="22" y="62" width="126" height="48" preserveAspectRatio="xMidYMid meet" />
      <text x="85" y="121" text-anchor="middle" font-size="6.8" fill="#333333">Pin 16: +12V BATT | Pin 4/5: GND</text>
      <text x="85" y="132" text-anchor="middle" font-size="6.8" fill="#333333">Pin 6: CAN_H | Pin 14: CAN_L</text>

      <rect x="14" y="190" width="142" height="68" rx="3" fill="#f9f9f9" stroke="#333333" stroke-width="1.1" />
      <text x="85" y="203" text-anchor="middle" font-size="7.5" font-weight="700" fill="#111111">SEKRING F1 (500 mA)</text>
      <image href="${moduleUris["fuse-holder.png"]}" x="38" y="208" width="94" height="36" preserveAspectRatio="xMidYMid meet" />
      <text x="85" y="252" text-anchor="middle" font-size="6.6" fill="#444444">Time-Lag (opsi 500mA / 1A Fast)</text>

      <rect x="14" y="274" width="142" height="58" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.4" />
      <text x="85" y="288" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">J_PWR (JST-XH 2-PIN DAYA)</text>
      <rect x="22" y="294" width="126" height="14" fill="#eeeeee" stroke="#555555" stroke-width="0.8" />
      <text x="85" y="304" text-anchor="middle" font-size="6.9" font-weight="700" fill="#111111">Pin 1: +12V_F (Setelah Sekring)</text>
      <rect x="22" y="311" width="126" height="14" fill="#ffffff" stroke="#555555" stroke-width="0.8" />
      <text x="85" y="321" text-anchor="middle" font-size="6.9" fill="#111111">Pin 2: GND (Pin 4 &amp; 5 OBD)</text>

      <rect x="14" y="380" width="142" height="58" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.4" />
      <text x="85" y="394" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">J_CAN (JST-XH 2-PIN CAN)</text>
      <rect x="22" y="400" width="126" height="14" fill="#eeeeee" stroke="#555555" stroke-width="0.8" />
      <text x="85" y="410" text-anchor="middle" font-size="6.9" font-weight="700" fill="#111111">Pin 1: CAN_H (OBD Pin 6)</text>
      <rect x="22" y="417" width="126" height="14" fill="#ffffff" stroke="#555555" stroke-width="0.8" />
      <text x="85" y="427" text-anchor="middle" font-size="6.9" fill="#111111">Pin 2: CAN_L (OBD Pin 14)</text>

      <!-- Separated vertical tracks in left channel x=165 (CAN), x=173 (GND), x=181 (+12V) -->
      <path d="M 85 178 V 190" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#c-pwr)" />
      <path d="M 85 258 V 274" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#c-pwr)" />
      <path d="M 156 150 H 165 V 408 H 158" fill="none" stroke="#222222" stroke-width="1.4" marker-start="url(#c-start)" marker-end="url(#c-end)" />

      <!-- ===================== ZONE 2 TOP (x=192..534, y=42..138): PROTEKSI + MP1584 ===================== -->
      <rect x="192" y="42" width="170" height="96" rx="3" fill="#f6f6f6" stroke="#111111" stroke-width="1.2" />
      <text x="277" y="55" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">PROTEKSI MASUK &amp; SHUNT R5</text>

      <rect x="200" y="64" width="66" height="28" rx="2" fill="#ffffff" stroke="#222222" stroke-width="1.1" />
      <text x="233" y="76" text-anchor="middle" font-size="7.2" font-weight="700" fill="#111111">D1 1N5819</text>
      <text x="233" y="86" text-anchor="middle" font-size="6.3" fill="#333333">A -&gt; K (+12V_D)</text>

      <rect x="202" y="102" width="62" height="28" rx="2" fill="#ffffff" stroke="#222222" stroke-width="1.1" />
      <text x="233" y="114" text-anchor="middle" font-size="7.0" font-weight="700" fill="#111111">TVS P6KE18A</text>
      <text x="233" y="124" text-anchor="middle" font-size="6.2" fill="#333333">Paralel ke GND</text>

      <rect x="284" y="64" width="70" height="44" rx="2" fill="#ffffff" stroke="#222222" stroke-width="1.1" />
      <text x="319" y="76" text-anchor="middle" font-size="7.1" font-weight="700" fill="#111111">R5 10 Ohm</text>
      <text x="319" y="87" text-anchor="middle" font-size="6.7" fill="#222222">// JP1 Bypass</text>
      <text x="319" y="98" text-anchor="middle" font-size="6.0" fill="#444444">(Uji Sleep E5)</text>

      <!-- +12V_F wire J_PWR -> D1 -> R5/JP1 -->
      <path d="M 156 301 H 181 V 78 H 198" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#c-pwr)" />
      <path d="M 266 78 H 284" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#c-pwr)" />
      <path d="M 274 78 V 116 H 264" fill="none" stroke="#222222" stroke-width="1.2" />
      <circle cx="274" cy="78" r="2.6" fill="#111111" />

      <!-- Cropped MP1584 Module Box (ends x=532 so lane x=546..556 stays clean) -->
      <rect x="378" y="42" width="154" height="96" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.3" />
      <text x="455" y="55" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">U4: MP1584 BUCK (3,33 V)</text>
      <image href="${moduleUris["mp1584-buck.png"]}" x="406" y="62" width="96" height="62" preserveAspectRatio="xMidYMid meet" />
      <text x="392" y="79" font-size="6.5" font-weight="700" fill="#111111">IN+</text>
      <text x="392" y="114" font-size="6.5" fill="#333333">IN-</text>
      <text x="506" y="79" font-size="6.5" font-weight="700" fill="#111111">OUT+</text>
      <text x="506" y="114" font-size="6.5" fill="#333333">OUT-</text>

      <!-- Wire R5/JP1 -> MP1584 IN+ ; MP1584 OUT+ -> ESP32 3V3 Rail -->
      <path d="M 354 78 H 378" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#c-pwr)" />
      <path d="M 532 78 H 570" fill="none" stroke="#111111" stroke-width="2.2" marker-end="url(#c-pwr)" />
      <!-- C2 100uF placed at x=542..569 cleanly to the RIGHT of 3V3_MAIN drop line x=537 -->
      <rect x="542" y="96" width="27" height="32" rx="2" fill="#f5f5f5" stroke="#333333" stroke-width="0.9" />
      <text x="555.5" y="108" text-anchor="middle" font-size="6.4" font-weight="700" fill="#111111">C2</text>
      <text x="555.5" y="117" text-anchor="middle" font-size="5.9" fill="#222222">100uF</text>
      <text x="555.5" y="125" text-anchor="middle" font-size="5.5" fill="#444444">3V3-G</text>
      <line x1="555.5" y1="78" x2="555.5" y2="96" stroke="#111111" stroke-width="1.2" />
      <circle cx="555.5" cy="78" r="2.4" fill="#111111" />

      <!-- ===================== ZONE 2 MIDDLE (x=192..532, y=152..274): SAKELAR ADC Q2/Q3 ===================== -->
      <rect x="192" y="152" width="340" height="122" rx="3" fill="#f7f7f7" stroke="#111111" stroke-width="1.2" />
      <text x="362" y="166" text-anchor="middle" font-size="7.7" font-weight="700" fill="#111111">
        BLOK SAKELAR ADC HIGH-SIDE &amp; PEMBAGI TEGANGAN (NOL ARUS BOCOR SAAT TIDUR)
      </text>

      <!-- +12V_D branch routed along LEFT edge x=204 so it NEVER crosses the title text -->
      <path d="M 274 116 V 144 H 204 V 196 H 220" fill="none" stroke="#111111" stroke-width="1.8" marker-end="url(#c-pwr)" />

      <!-- Q2 AO3401A -->
      <rect x="222" y="178" width="104" height="38" rx="2" fill="#ffffff" stroke="#111111" stroke-width="1.2" />
      <text x="274" y="191" text-anchor="middle" font-size="7.3" font-weight="700" fill="#111111">Q2: AO3401A (P-MOS)</text>
      <text x="274" y="201" text-anchor="middle" font-size="6.5" fill="#222222">S=+12V_D | D=R1 | G=R4+R6</text>
      <text x="274" y="211" text-anchor="middle" font-size="6.2" fill="#444444">Pull-Up R4 47 kOhm ke S</text>

      <!-- Q3 2N3904 -->
      <rect x="222" y="226" width="104" height="38" rx="2" fill="#ffffff" stroke="#222222" stroke-width="1.1" />
      <text x="274" y="239" text-anchor="middle" font-size="7.3" font-weight="700" fill="#111111">Q3: 2N3904 (NPN)</text>
      <text x="274" y="249" text-anchor="middle" font-size="6.4" fill="#222222">C -&gt; R6 27k -&gt; Q2 Gate</text>
      <text x="274" y="259" text-anchor="middle" font-size="6.2" fill="#444444">B: R7 10k &amp; R8 100k | E=GND</text>
      <path d="M 274 226 V 216" fill="none" stroke="#444444" stroke-width="1.2" marker-end="url(#c-ctl)" />

      <!-- Divider R1/R2 + C1 -->
      <rect x="356" y="178" width="166" height="50" rx="2" fill="#ffffff" stroke="#111111" stroke-width="1.2" />
      <text x="439" y="191" text-anchor="middle" font-size="7.3" font-weight="700" fill="#111111">PEMBAGI &amp; FILTER ADC</text>
      <text x="439" y="202" text-anchor="middle" font-size="6.8" fill="#111111">R1 (100 kOhm) -&gt; Node_M -&gt; ADC_OUT</text>
      <text x="439" y="213" text-anchor="middle" font-size="6.6" fill="#333333">R2 (27 kOhm) &amp; C1 (100 nF) -&gt; GND</text>
      <text x="439" y="223" text-anchor="middle" font-size="6.3" font-weight="700" fill="#444444">Target Vgs Q2: -7,6V..-9,1V (Tahap C)</text>

      <!-- Wire Q2 Drain -> R1/R2 -> ESP32 GPIO34 & ESP32 GPIO27 -> Q3 Base -->
      <path d="M 326 196 H 354" fill="none" stroke="#111111" stroke-width="1.6" marker-end="url(#c-end)" />
      <path d="M 522 196 H 570" fill="none" stroke="#222222" stroke-width="1.6" marker-end="url(#c-end)" />
      <path d="M 570 245 H 328" fill="none" stroke="#444444" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#c-ctl)" />

      <!-- ===================== ZONE 2 LOWER (x=192..532, y=288..410): Q1 + WCMCU-230 ===================== -->
      <rect x="192" y="288" width="340" height="122" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.2" />
      <text x="362" y="301" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">
        SAKELAR CAN Q1 &amp; MODUL TRANSCEIVER WCMCU-230 (SN65HVD230)
      </text>

      <!-- 3V3_MAIN drop routed in outer vertical gutter x=537 (y=78..281) and along y=312 UNDER title directly into Q1 right edge -->
      <path d="M 537 78 V 281 H 262 V 314" fill="none" stroke="#111111" stroke-width="1.6" marker-end="url(#c-pwr)" />
      <circle cx="537" cy="78" r="2.4" fill="#111111" />

      <!-- Q1 AO3401A Block (y=316..366) so y=281 horizontal bus sits OUTSIDE section heading! -->
      <rect x="206" y="316" width="124" height="50" rx="2" fill="#f6f6f6" stroke="#111111" stroke-width="1.1" />
      <text x="268" y="329" text-anchor="middle" font-size="7.3" font-weight="700" fill="#111111">Q1: AO3401A (3V3_CAN)</text>
      <text x="268" y="340" text-anchor="middle" font-size="6.5" fill="#222222">S=3V3_MAIN | R3 47k Pull-Up</text>
      <text x="268" y="350" text-anchor="middle" font-size="6.4" fill="#333333">C3 100nF (3V3_CAN -&gt; GND)</text>
      <text x="268" y="360" text-anchor="middle" font-size="6.3" font-weight="700" fill="#111111">Teruji: OFF=0,00V / ON=3,33V</text>

      <!-- Cropped WCMCU-230 Physical Image -->
      <rect x="356" y="312" width="166" height="90" rx="2" fill="#fafafa" stroke="#444444" stroke-width="1.0" />
      <text x="439" y="323" text-anchor="middle" font-size="7.2" font-weight="700" fill="#111111">U3: WCMCU-230</text>
      <image href="${moduleUris["wcmcu230-can.png"]}" x="372" y="327" width="58" height="68" preserveAspectRatio="xMidYMid meet" />
      <text x="438" y="339" font-size="6.7" fill="#111111">3V3  &lt;- Q1 Drain</text>
      <text x="438" y="352" font-size="6.7" fill="#111111">GND  -&gt; Common GND</text>
      <text x="438" y="365" font-size="6.7" font-weight="700" fill="#111111">CTX  &lt;- GPIO5 (TX)</text>
      <text x="438" y="378" font-size="6.7" font-weight="700" fill="#111111">CRX  -&gt; GPIO4 (RX)</text>
      <text x="438" y="393" font-size="6.7" fill="#222222">CANH/L &lt;-&gt; J_CAN</text>

      <!-- Wire Q1 -> WCMCU 3V3; J_CAN <-> WCMCU CANH/L; WCMCU <-> ESP32 GPIO4/5; GPIO26 -> Q1 routed cleanly below Q1 -->
      <path d="M 330 338 H 354" fill="none" stroke="#111111" stroke-width="1.7" marker-end="url(#c-pwr)" />
      <path d="M 158 408 H 184 V 390 H 354" fill="none" stroke="#222222" stroke-width="1.5" marker-start="url(#c-start)" marker-end="url(#c-end)" />
      <path d="M 524 371 H 570" fill="none" stroke="#222222" stroke-width="1.5" marker-start="url(#c-start)" marker-end="url(#c-end)" />
      <path d="M 570 302 H 552 V 396 H 268 V 368" fill="none" stroke="#444444" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#c-ctl)" />
      <rect x="278" y="387" width="108" height="10" rx="2" fill="#ffffff" />
      <text x="332" y="395" text-anchor="middle" font-size="6.4" font-weight="700" fill="#444444">Kontrol GPIO26 -&gt; Gate Q1</text>

      <!-- ===================== ZONE 2 BOTTOM (x=192..532, y=422..530): ZS-042 RTC ===================== -->
      <rect x="192" y="422" width="340" height="108" rx="3" fill="#f7f7f7" stroke="#111111" stroke-width="1.2" />
      <text x="362" y="435" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">
        U2: RTC ZS-042 DS3231 (PIN 4-KANAN I2C + SQW KIRI; LED &amp; CHARGER DILEPAS)
      </text>
      <image href="${moduleUris["zs042-rtc.png"]}" x="302" y="441" width="114" height="70" preserveAspectRatio="xMidYMid meet" />
      <text x="200" y="456" font-size="6.8" font-weight="700" fill="#111111">Header 6-Pin (Kiri):</text>
      <text x="200" y="469" font-size="6.7" font-weight="700" fill="#111111">SQW -&gt; GPIO32 (IRQ)</text>
      <text x="200" y="482" font-size="6.5" fill="#444444">32K/Lain: Tidak Dipakai</text>
      <text x="424" y="456" font-size="6.8" font-weight="700" fill="#111111">Header 4-Pin (Kanan):</text>
      <text x="424" y="469" font-size="6.7" fill="#111111">SCL &lt;-&gt; GPIO22</text>
      <text x="424" y="482" font-size="6.7" fill="#111111">SDA &lt;-&gt; GPIO21</text>
      <text x="424" y="495" font-size="6.7" fill="#111111">VCC &lt;- 3V3_MAIN</text>
      <text x="424" y="508" font-size="6.7" fill="#111111">GND -&gt; Common GND</text>

      <!-- Physical SQW path from left 6-pin header under ZS-042 -> ESP32 GPIO32 -->
      <path d="M 304 462 H 294 V 521 H 558 V 508 H 570" fill="none" stroke="#444444" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#c-ctl)" />
      <!-- I2C bus (4-pin right header <-> ESP32 GPIO21/22) -->
      <path d="M 526 474 H 570" fill="none" stroke="#222222" stroke-width="1.5" marker-start="url(#c-start)" marker-end="url(#c-end)" />
      <!-- 3V3_MAIN -> ZS-042 VCC (y=493) cleanly along gutter x=537 -->
      <path d="M 537 281 V 493 H 526" fill="none" stroke="#111111" stroke-width="1.3" marker-end="url(#c-pwr)" />

      <!-- ===================== ZONE 3 RIGHT: ESP32 DEVKIT V1 ===================== -->
      <rect x="572" y="42" width="174" height="488" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.5" />
      <text x="659" y="56" text-anchor="middle" font-size="8.0" font-weight="700" fill="#111111">U1: ESP32 DEVKIT V1</text>
      <image href="${moduleUris["esp32-devkit.png"]}" x="580" y="61" width="158" height="88" preserveAspectRatio="xMidYMid meet" />

      <rect x="580" y="154" width="158" height="22" rx="2" fill="#f0f0f0" stroke="#111111" stroke-width="1.0" />
      <text x="659" y="168" text-anchor="middle" font-size="6.9" font-weight="700" fill="#111111">
        H8: Dilarang +12V &amp; USB Serentak
      </text>

      <!-- Terminal Pin Rows aligned with exact horizontal incoming/outgoing wire heights -->
      <line x1="580" y1="184" x2="738" y2="184" stroke="#dddddd" stroke-width="0.9" />
      <rect x="580" y="188" width="158" height="26" rx="2" fill="#f9f9f9" stroke="#555555" stroke-width="0.8" />
      <text x="586" y="200" font-size="7.3" font-weight="700" fill="#111111">[IN] GPIO34 (ADC_OUT)</text>
      <text x="586" y="210" font-size="6.3" fill="#444444">Pembacaan Pembagi R1/R2</text>

      <rect x="580" y="226" width="158" height="30" rx="2" fill="#f9f9f9" stroke="#555555" stroke-width="0.8" />
      <text x="586" y="239" font-size="7.3" font-weight="700" fill="#111111">[OUT] GPIO27 (ADC_TRIG)</text>
      <text x="586" y="250" font-size="6.3" fill="#444444">Kontrol Aktif-HIGH -&gt; Q3 Base</text>

      <rect x="580" y="286" width="158" height="30" rx="2" fill="#f9f9f9" stroke="#555555" stroke-width="0.8" />
      <text x="586" y="299" font-size="7.3" font-weight="700" fill="#111111">[OUT] GPIO26 (CAN_EN)</text>
      <text x="586" y="310" font-size="6.3" fill="#444444">Kontrol Aktif-LOW -&gt; Q1 Gate</text>

      <rect x="580" y="354" width="158" height="32" rx="2" fill="#f9f9f9" stroke="#555555" stroke-width="0.8" />
      <text x="586" y="368" font-size="7.3" font-weight="700" fill="#111111">[I/O] GPIO4 / GPIO5</text>
      <text x="586" y="379" font-size="6.3" fill="#444444">CRX / CTX &lt;-&gt; WCMCU-230</text>

      <rect x="580" y="458" width="158" height="30" rx="2" fill="#f9f9f9" stroke="#555555" stroke-width="0.8" />
      <text x="586" y="471" font-size="7.3" font-weight="700" fill="#111111">[I/O] GPIO21 / GPIO22</text>
      <text x="586" y="482" font-size="6.3" fill="#444444">I2C SDA / SCL &lt;-&gt; ZS-042</text>

      <rect x="580" y="494" width="158" height="28" rx="2" fill="#f9f9f9" stroke="#555555" stroke-width="0.8" />
      <text x="586" y="506" font-size="7.3" font-weight="700" fill="#111111">[IN] GPIO32 (SQW IRQ)</text>
      <text x="586" y="517" font-size="6.3" fill="#444444">Sinyal Bangun dari ZS-042</text>

      <!-- BOTTOM COMMON GROUND RAIL (uses dedicated left track x=173) -->
      <path d="M 156 318 H 173 V 542 H 659 V 530" fill="none" stroke="#111111" stroke-width="2.0" marker-end="url(#c-pwr)" />
      <line x1="233" y1="130" x2="233" y2="146" stroke="#444444" stroke-width="1.1" />
      <line x1="233" y1="530" x2="233" y2="542" stroke="#444444" stroke-width="1.1" />
      <line x1="455" y1="138" x2="455" y2="146" stroke="#444444" stroke-width="1.1" />
      <line x1="439" y1="530" x2="439" y2="542" stroke="#444444" stroke-width="1.1" />
      <text x="410" y="555" text-anchor="middle" font-size="7.3" font-weight="700" fill="#111111">
        REL COMMON GROUND (OBD Pin 4/5 -&gt; GND U4 MP1584, TVS1, Q3 E, R2/R8, C1/C2/C3, U3 WCMCU-230, U2 ZS-042, U1 ESP32)
      </text>
    </svg>
  `;
}

function buildHtmlDocument() {
  const pcbTopUri = fileToDataUri(PCB_TOP_IMG_PATH, "image/jpeg");
  const pcbBottomUri = fileToDataUri(PCB_BOTTOM_IMG_PATH, "image/jpeg");
  const cirkitModuleUris = loadCirkitModuleUris();

  const wiringSvg = buildMonochromeWiringSvg();
  const realisticWiringSvg = buildRealisticCirkitSvg(cirkitModuleUris);

  const archRows = APPROVAL_DOC_MEMO.architectureItems
    .map(
      (item) => `
      <tr>
        <td style="width: 24%;"><strong>${item.block}</strong><br /><span class="mono-muted">${item.spec}</span></td>
        <td>${item.detail}</td>
      </tr>`,
    )
    .join("\n");

  const testRows = APPROVAL_DOC_MEMO.testResults
    .map(
      (row) => `
      <tr>
        <td style="width: 20%;"><strong>${row.parameter}</strong></td>
        <td style="width: 15%;"><span class="tag">${row.status}</span></td>
        <td style="width: 35%;">${row.result}</td>
        <td style="width: 30%;">${row.meaning}</td>
      </tr>`,
    )
    .join("\n");

  const riskRows = APPROVAL_DOC_MEMO.riskMatrix
    .map(
      (item, idx) => `
      <tr>
        <td style="width: 5%; text-align: center;"><strong>${idx + 1}</strong></td>
        <td style="width: 32%;"><strong>${item.risk}</strong></td>
        <td style="width: 63%;">${item.mitigation}</td>
      </tr>`,
    )
    .join("\n");

  const bomRows = APPROVAL_DOC_MEMO.bomItems
    .map(
      (item) => `
      <tr>
        <td style="width: 14%; font-weight: 700;">${item.ref}</td>
        <td style="width: 34%;"><strong>${item.name}</strong></td>
        <td style="width: 7%; text-align: center;">${item.qty}</td>
        <td style="width: 45%;">${item.role}</td>
      </tr>`,
    )
    .join("\n");

  const renderFooter = (pageNum) => `
    <div class="footer-note">
      <span>${APPROVAL_DOC_MEMO.docCode}</span>
      <span>Halaman ${pageNum} dari 7</span>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<title>${APPROVAL_DOC_MEMO.title}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 9mm 11mm;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    color: #111111;
    background: #ffffff;
    font-size: 8.9pt;
    line-height: 1.36;
    font-variant-numeric: tabular-nums;
  }
  .page {
    height: 277mm;
    page-break-after: always;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .page:last-child {
    page-break-after: auto;
  }
  .doc-header {
    border-top: 2.2pt solid #111111;
    border-bottom: 1pt solid #111111;
    padding: 6px 0 5px;
  }
  .doc-meta-top {
    display: flex;
    justify-content: space-between;
    font-size: 7.7pt;
    font-weight: 700;
    color: #333333;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 2px;
  }
  h1 {
    font-size: 13pt;
    font-weight: 800;
    color: #000000;
    line-height: 1.22;
  }
  h2 {
    font-size: 9.8pt;
    font-weight: 800;
    color: #000000;
    border-bottom: 1pt solid #222222;
    padding-bottom: 2px;
    margin-top: 2px;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  p {
    margin-bottom: 4px;
    color: #1a1a1a;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.05pt;
  }
  th, td {
    border: 0.75pt solid #444444;
    padding: 4.2px 6px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #efefef;
    font-weight: 700;
    color: #000000;
  }
  .mono-muted {
    font-size: 7.4pt;
    color: #444444;
  }
  .tag {
    display: inline-block;
    border: 0.75pt solid #222222;
    background: #f5f5f5;
    color: #111111;
    font-size: 6.9pt;
    font-weight: 700;
    padding: 1px 4px;
    white-space: nowrap;
  }
  .figure-box {
    border: 0.75pt solid #444444;
    padding: 6px 8px;
    background: #ffffff;
  }
  .figure-caption {
    font-size: 7.7pt;
    color: #333333;
    margin-top: 4px;
    text-align: center;
  }
  .mono-img-full {
    filter: grayscale(100%) contrast(1.16);
    width: 100%;
    max-height: 550px;
    object-fit: contain;
    display: block;
    margin: 0 auto;
    border: 0.75pt solid #cccccc;
  }
  .notice-box {
    border: 1pt solid #111111;
    background: #f6f6f6;
    padding: 7px 9px;
    font-size: 8.3pt;
  }
  .checklist-ul {
    margin-left: 16px;
    font-size: 8.2pt;
  }
  .checklist-ul li {
    margin-bottom: 3px;
  }
  .bom-table th, .bom-table td {
    padding: 3.3px 6px;
    font-size: 7.85pt;
  }
  .ref-box {
    border: 0.75pt solid #555555;
    background: #ffffff;
    padding: 5px 8px;
    font-size: 7.9pt;
    line-height: 1.35;
  }
  .footer-note {
    border-top: 0.6pt solid #999999;
    padding-top: 3px;
    display: flex;
    justify-content: space-between;
    font-size: 7.4pt;
    color: #444444;
    margin-top: auto;
  }
</style>
</head>
<body>

  <!-- HALAMAN 1: JUDUL, RINGKASAN NON-INVASIF & ARSITEKTUR 5 BLOK -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>${APPROVAL_DOC_MEMO.hardwareRef} · ${APPROVAL_DOC_MEMO.dateLabel}</span>
      </div>
      <h1>${APPROVAL_DOC_MEMO.title}</h1>
    </div>

    <div>
      <h2>1. Ringkasan &amp; Tujuan Uji Coba</h2>
      <p>${APPROVAL_DOC_MEMO.executiveSummary}</p>
      <div class="figure-box">
        ${buildMonochromeObdSvg()}
        <div class="figure-caption">Gambar 1: Peta koneksi luar pada port OBD-II standar 16-pin kendaraan. Pemasangan tidak memotong maupun mengupas kabel asli mobil.</div>
      </div>
    </div>

    <div>
      <h2>2. Arsitektur Perangkat &amp; Alur Kerja Singkat</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 26%;">Blok Modul / Komponen</th>
            <th>Spesifikasi, Koneksi Pin &amp; Fungsi Keselamatan</th>
          </tr>
        </thead>
        <tbody>
          ${archRows}
        </tbody>
      </table>
    </div>

    ${renderFooter(1)}
  </section>

  <!-- HALAMAN 2: SKEMA WIRING BERPANAH ARAH INPUT/OUTPUT & DATA PENGUJIAN BAGIAN 1 -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>Skema Aliran Kelistrikan (Input-Output) &amp; Data Pengujian</span>
      </div>
    </div>

    <div class="figure-box">
      ${wiringSvg}
      <div class="figure-caption">
        Gambar 2: Skema aliran daya dan sinyal dengan penanda arah input-output dari dua konektor terkunci (kiri) melewati proteksi [1], buck MP1584, serta dua sakelar pemutus daya [2] dan [3] menuju ESP32 [4]. Tata letak PCB dan diagram realistis tersedia pada Lampiran A, B, dan C.
      </div>
    </div>

    <div>
      <h2>3. Data Pengujian (Bench Test, Uji Komponen &amp; Target Validasi Tahap C)</h2>
      <table>
        <thead>
          <tr>
            <th>Parameter / Uji</th>
            <th>Status Saat Ini</th>
            <th>Hasil Terukur / Rencana Uji</th>
            <th>Makna Keselamatan bagi Kendaraan</th>
          </tr>
        </thead>
        <tbody>
          ${testRows.split("</tr>").slice(0, 4).join("</tr>") + "</tr>"}
        </tbody>
      </table>
    </div>

    ${renderFooter(2)}
  </section>

  <!-- HALAMAN 3: LANJUTAN TABEL PENGUJIAN, MATRIKS MITIGASI RISIKO & CEK WAJIB TAHAP C -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>Lanjutan Data Pengujian &amp; Matriks Mitigasi Risiko Instalasi</span>
      </div>
    </div>

    <div>
      <h2>3. Data Pengujian (Lanjutan: Sakelar Aktif, Modifikasi RTC &amp; Target Tahap C)</h2>
      <table>
        <thead>
          <tr>
            <th>Parameter / Uji</th>
            <th>Status Saat Ini</th>
            <th>Hasil Terukur / Rencana Uji</th>
            <th>Makna Keselamatan bagi Kendaraan</th>
          </tr>
        </thead>
        <tbody>
          ${testRows.split("</tr>").slice(4).join("</tr>")}
        </tbody>
      </table>
    </div>

    <div>
      <h2>4. Matriks Mitigasi Risiko &amp; Keselamatan Instalasi di Kendaraan</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">No</th>
            <th style="width: 32%;">Potensi Risiko di Lapangan</th>
            <th style="width: 63%;">Langkah Mitigasi pada Perangkat &amp; Prosedur</th>
          </tr>
        </thead>
        <tbody>
          ${riskRows}
        </tbody>
      </table>
    </div>

    <div class="notice-box">
      <div style="font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">5. Urutan Verifikasi Wajib Sebelum Pemasangan ke Unit Kendaraan (Tahap C)</div>
      <ol class="checklist-ul">
        <li>Menguji ulang keluaran regulator MP1584 tanpa beban pada tegangan input <strong>12,6 V</strong> dan <strong>sekitar 14 V</strong> menggunakan PSU berbatas arus awal <strong>100 mA</strong>.</li>
        <li>Menjalankan pemeriksaan kontinuitas serta isolasi penuh antar-jalur PCB dalam kondisi tanpa modul dan tanpa daya sebelum perakitan akhir.</li>
        <li>Mengukur ulang tegangan gerbang (<strong>Vgs</strong>) Q2 saat aktif pada prototipe v2.0 (target <strong>-7,6 V</strong> di 11,9 V dan <strong>-9,1 V</strong> di 14,4 V), mengukur arus deep sleep aktual (<strong>E5</strong>), dan melakukan kalibrasi ADC 4-titik.</li>
        <li>Menerapkan aturan keselamatan <strong>H8</strong> selama pengujian bengkel (suplai 12V dan kabel USB pemrograman tidak pernah dihubungkan bersamaan ke ESP32 Base).</li>
      </ol>
    </div>

    ${renderFooter(3)}
  </section>

  <!-- HALAMAN 4: LAMPIRAN A - DESAIN PCB TAMPAK ATAS (FULL PAGE) -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>Lampiran A · Desain Tata Letak PCB ORION v2.0 Tampak Atas</span>
      </div>
    </div>

    <div>
      <h2>Lampiran A. Tata Letak Fisik PCB ORION v2.0 Step 2.1 (Tampak Atas)</h2>
      <div class="figure-box">
        <img class="mono-img-full" src="${pcbTopUri}" alt="Desain PCB ORION v2.0 Step 2.1 Tampak Atas Monokrom" />
        <div class="figure-caption">
          Gambar A.1: Peta penempatan komponen pada papan matriks 70 x 50 mm (grid 24 kolom c1-c24 x 18 baris, sisi atas / komponen).
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 28%;">Aspek Tata Letak Tampak Atas</th>
          <th>Keterangan Teknis Perakitan</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Orientasi &amp; Dimensi Papan</strong></td>
          <td>Papan matriks standar 70 x 50 mm dengan urutan kolom c1 di sisi kiri dan kolom c24 di sisi kanan. Keempat sudut papan disisakan bebas lubang komponen untuk baut/pilar penyangga non-konduktif.</td>
        </tr>
        <tr>
          <td><strong>Zona Keep-Out 3 x 3 Lubang</strong></td>
          <td>Adaptor MOSFET SOT-23 Q1 dan Q2 (pinout 2-3-1 = S-D-G) masing-masing diberi ruang bebas 3 x 3 lubang agar solder antarkaki tidak saling berdekatan.</td>
        </tr>
        <tr>
          <td><strong>Alur Daya ke Sinyal (Kiri -&gt; Kanan)</strong></td>
          <td>Jalur masuk +12V, D1 1N5819, TVS P6KE18A, dan shunt R5 10 Ohm ditempatkan di sisi kiri, melewati regulator MP1584 di area tengah atas menuju header keluar ESP32 Base di sisi kanan (kolom c23).</td>
        </tr>
        <tr>
          <td><strong>Ketahanan Mekanis</strong></td>
          <td>Seluruh modul (MP1584, WCMCU-230, ZS-042) ditumpu soket header kaku serta penyangga mekanis dengan isolasi Kapton pada area sempit guna meredam getaran kendaraan.</td>
        </tr>
      </tbody>
    </table>

    ${renderFooter(4)}
  </section>

  <!-- HALAMAN 5: LAMPIRAN B - DESAIN PCB TAMPAK BAWAH CERMIN (FULL PAGE) -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>Lampiran B · Desain Jalur Solder PCB ORION v2.0 Tampak Bawah (Cermin)</span>
      </div>
    </div>

    <div>
      <h2>Lampiran B. Peta Jalur Solder Sisi Bawah Cermin PCB ORION v2.0 Step 2.1</h2>
      <div class="figure-box">
        <img class="mono-img-full" src="${pcbBottomUri}" alt="Desain Jalur Solder Sisi Bawah Cermin PCB ORION v2.0 Monokrom" />
        <div class="figure-caption">
          Gambar B.1: Peta jalur sambungan sisi solder bawah dalam proyeksi cermin (kolom c24 di sisi kiri, kolom c1 di sisi kanan).
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 28%;">Aspek Jalur Sisi Bawah</th>
          <th>Keterangan Teknis &amp; Pemeriksaan Mutu</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Proyeksi Cermin untuk Penyolderan</strong></td>
          <td>Gambar dicerminkan horizontal (c24 di kiri, c1 di kanan) agar teknisi langsung mencocokkan lintasan timah saat papan dibalik selama perakitan dan inspeksi.</td>
        </tr>
        <tr>
          <td><strong>Ringkasan Topologi Routing</strong></td>
          <td>Terdiri atas 22 net kelistrikan/sinyal dalam 237 segmen jalur sisi bawah dengan nol persilangan pada sisi bawah dan hanya 1 kabel jumper atas (JV1 sepanjang 40 mm).</td>
        </tr>
        <tr>
          <td><strong>Pemisahan Jalur Daya &amp; Sinyal</strong></td>
          <td>Jalur rel daya +12V ditempatkan terpisah dari lintasan diferensial CAN serta jalur I2C RTC guna mengurangi risiko gangguan atau hubung singkat saat pemeriksaan.</td>
        </tr>
        <tr>
          <td><strong>Wajib Uji Kontinuitas (Tahap B)</strong></td>
          <td>Sebelum modul aktif ditancapkan, seluruh jalur sisi bawah wajib melewati pemeriksaan kontinuitas dan pengecekan non-hubung-singkat antara +12V, +3,3V, dan GND menggunakan multimeter.</td>
        </tr>
      </tbody>
    </table>

    ${renderFooter(5)}
  </section>

  <!-- HALAMAN 6: LAMPIRAN C - DIAGRAM WIRING REALISTIS BERBASIS ASET MODUL FISIK (FULL PAGE) -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>Lampiran C · Diagram Wiring Realistis Berbasis Aset Modul Fisik</span>
      </div>
    </div>

    <div>
      <h2>Lampiran C. Diagram Wiring Modular ORION v2.0 Step 2.1 (Dengan Panah Arah)</h2>
      <div class="figure-box">
        ${realisticWiringSvg}
        <div class="figure-caption">
          Gambar C.1: Rekonstruksi wiring realistis memakai aset modul fisik monokrom (OBD-II, Sekring, MP1584, WCMCU-230, ZS-042, ESP32) dengan perutean ortogonal dan arah panah input-output sesuai skematik Step 2.1.
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 30%;">Catatan Pembacaan Diagram Wiring (Gambar C.1)</th>
          <th>Penjelasan Jalur &amp; Susunan Modul</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Alur Proteksi &amp; Pemisahan Konektor</strong></td>
          <td>Konektor J_PWR (+12V/GND) dan J_CAN (CAN_H/CAN_L) dipisahkan pada dua soket terkunci JST-XH 2-pin. Sisi proteksi masuk memakai D1 1N5819, TVS P6KE18A ke ground, shunt R5 10 Ohm // JP1, serta tiga kapasitor filter C1, C2, dan C3.</td>
        </tr>
        <tr>
          <td><strong>Susunan Pin RTC ZS-042 &amp; Sakelar CAN Q1</strong></td>
          <td>Modul ZS-042 terhubung ke bus I2C ESP32 melalui header 4-pin kanan (VCC, GND, SDA, SCL), sedangkan interupsi bangun SQW diambil dari header 6-pin kiri ke GPIO32. Suplai transceiver CAN diputus penuh oleh MOSFET Q1 melalui GPIO26.</td>
        </tr>
      </tbody>
    </table>

    ${renderFooter(6)}
  </section>

  <!-- HALAMAN 7: LAMPIRAN D - DAFTAR KOMPONEN (BOM), SOP AMAN & REFERENSI DARING (FULL PAGE) -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>Lampiran D · Daftar Komponen (BOM), SOP Pemasangan &amp; Referensi Daring</span>
      </div>
    </div>

    <div>
      <h2>Lampiran D.1 Daftar Komponen Utama (Bill of Materials - PCB v2.0 Step 2.1)</h2>
      <table class="bom-table">
        <thead>
          <tr>
            <th style="width: 14%;">Ref</th>
            <th style="width: 34%;">Komponen / Spesifikasi</th>
            <th style="width: 7%; text-align: center;">Jml</th>
            <th style="width: 45%;">Fungsi &amp; Peran Keselamatan</th>
          </tr>
        </thead>
        <tbody>
          ${bomRows}
        </tbody>
      </table>
    </div>

    <div class="notice-box" style="margin-top: 1px;">
      <div style="font-weight: 800; margin-bottom: 4px; text-transform: uppercase;">
        Lampiran D.2 Prosedur Pemasangan &amp; Pelepasan Aman pada Unit Kendaraan Gudang
      </div>
      <ol class="checklist-ul">
        <li>Matikan mesin, aktifkan rem parkir, dan posisikan kunci kontak di OFF sebelum membuka atau menyentuh port OBD-II di bawah dasbor.</li>
        <li>Periksa ulang fisik perangkat sebelum dipasang: kabel USB komputer sudah dilepas dari ESP32 Base (aturan <strong>H8</strong>), sekring 500 mA terpasang baik, dan dua konektor JST-XH Daya vs CAN tidak tertukar.</li>
        <li>Colokkan harness OBD-II secara lurus ke soket 16-pin kendaraan hingga mengunci tanpa memotong, menjepit, atau mengupas kabel bawaan mobil.</li>
        <li>Letakkan kotak pelindung plastik (non-konduktif) ORION v2.0 pada lokasi aman agar tidak mengganggu gerak pedal maupun kemudi, lalu lanjutkan pencatatan uji sesuai skenario Tahap C.</li>
        <li>Saat pengujian selesai atau perangkat perlu diprogram ulang lewat USB (<strong>aturan H8</strong>), cabut soket OBD-II ketika kunci kontak OFF agar sistem kelistrikan kendaraan kembali ke kondisi standar pabrik.</li>
      </ol>
    </div>

    <div class="ref-box">
      <div style="font-weight: 700; margin-bottom: 2px; text-transform: uppercase;">Referensi Daring (Opsional)</div>
      <div>
        Dashboard &amp; Aplikasi Web: <strong>${APPROVAL_DOC_MEMO.onlineRefs[0].url}</strong> &nbsp;|&nbsp;
        Dokumentasi Teknis Lengkap: <strong>${APPROVAL_DOC_MEMO.onlineRefs[1].url}</strong>
      </div>
    </div>

    ${renderFooter(7)}
  </section>

</body>
</html>`;
}

function main() {
  mkdirSync(path.dirname(OUTPUT_PDF_PATH), { recursive: true });
  const browserPath = findHeadlessBrowser();
  const tempHtml = path.join(os.tmpdir(), `orion-yard-approval-${Date.now()}.html`);

  const html = buildHtmlDocument();
  writeFileSync(tempHtml, html, "utf8");

  try {
    execFileSync(
      browserPath,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        `--print-to-pdf=${OUTPUT_PDF_PATH}`,
        tempHtml,
      ],
      { stdio: "inherit" },
    );
  } finally {
    if (existsSync(tempHtml)) {
      rmSync(tempHtml, { force: true });
    }
  }

  const sizeKb = (statSync(OUTPUT_PDF_PATH).size / 1024).toFixed(1);
  console.log(`[pdf:yard-approval] Generated ${OUTPUT_PDF_PATH} (${sizeKb} KB)`);
}

main();
