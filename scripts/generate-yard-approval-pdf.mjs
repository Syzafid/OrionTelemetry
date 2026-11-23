import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * ============================================================================
 * MEMO & SINGLE SOURCE OF TRUTH: DOKUMEN PERIZINAN GUDANG (ORION STOCK YARD)
 * ============================================================================
 * Cara memperbarui PDF setelah ada revisi perangkat, kabel, atau foto Cirkit:
 * 1. (Opsional) Jika sudah mengekspor diagram visual dari app.cirkitdesigner.com,
 *    simpan gambar tersebut sebagai `docs/static/img/cirkit-wiring-v2.png` (atau .jpg).
 *    Skrip ini otomatis mengganti Diagram Vektor B dengan gambar Cirkit Anda.
 * 2. Ubah teks, tanggal, atau angka spesifikasi pada objek `APPROVAL_DOC_MEMO` di bawah.
 * 3. Jalankan `npm run pdf:yard-approval` untuk menerbitkan ulang berkas PDF ke
 *    `docs/static/pdf/ORION_Dokumen_Izin_Teknis_Gudang.pdf`.
 */
export const APPROVAL_DOC_MEMO = {
  docCode: "ORION-SOP-YARD-01 / Rev 1.0",
  hardwareRef: "PCB ORION v2.0 Step 2.1 (70 x 50 mm) · Firmware v1.6.0",
  dateLabel: "November 2026",
  title: "Proposal Teknis & Jaminan Keselamatan Pemasangan Modul Pantau Aki ORION",
  subtitle: "Dokumen Ringkas Perizinan Uji Coba di Unit Kendaraan Stock Yard",
  boardSizeLabel: "70 x 50 mm (seukuran kotak korek api, dipasang di konektor OBD-II)",
  fuseSpec: "Sekring Inline 500 mA Time-Lag",
  sleepCurrent: "< 0,5 mA (0,41 mA tipikal; jalur ukur diputus sakelar fisik)",
  wakeDuration: "~2 detik aktif / siklus (40 ms ukur aki)",
  ecuPolicy: "100% Read-Only (Hanya Baca Mode 01/03; Mode 04 Hapus DTC Dikunci Mati)",
  batteryDrain60Days: {
    batteryCapAh: 65,
    orionAh: 0.88,
    orionPct: "1,4%",
    conventionalDongleMa: 40,
    conventionalAh: 57.6,
    conventionalPct: "88,6%",
  },
  pilotTerms: {
    unitCount: "1 Unit Kendaraan Stock Yard (Tahap Uji Coba Awal)",
    durationDays: "14 Hari Pemantauan",
    installTime: "+/- 10 Detik (Plug-and-Play tanpa kupas kabel pabrik)",
  },
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
const CIRKIT_IMG_CANDIDATES = [
  path.join(ROOT, "docs", "static", "img", "cirkit-wiring-v2.png"),
  path.join(ROOT, "docs", "static", "img", "cirkit-wiring-v2.jpg"),
];

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

function buildObdConnectorSvg() {
  const activePins = new Map([
    [4, { label: "GND", color: "#1f2937" }],
    [5, { label: "GND", color: "#1f2937" }],
    [6, { label: "CAN-H", color: "#d97706" }],
    [14, { label: "CAN-L", color: "#15803d" }],
    [16, { label: "+12V", color: "#b91c1c" }],
  ]);

  const drawRow = (startPin, y, rowLabel) => {
    let items = `<text x="14" y="${y + 17}" font-size="9.2" fill="#475569" font-weight="600">${rowLabel}</text>`;
    for (let idx = 0; idx < 8; idx++) {
      const pin = startPin + idx;
      const x = 112 + idx * 51;
      const active = activePins.get(pin);
      const fill = active ? active.color : "#e2e8f0";
      const stroke = active ? active.color : "#94a3b8";
      const textFill = active ? "#ffffff" : "#64748b";
      items += `
        <rect x="${x}" y="${y}" width="40" height="26" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
        <text x="${x + 20}" y="${y + 13}" text-anchor="middle" font-size="10" font-weight="700" fill="${textFill}">${pin}</text>
        <text x="${x + 20}" y="${y + 23}" text-anchor="middle" font-size="7.2" font-weight="600" fill="${active ? "#fef2f2" : "#94a3b8"}">${active ? active.label : "KOSONG"}</text>
      `;
    }
    return items;
  };

  return `
    <svg viewBox="0 0 540 128" width="100%" height="128" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pinout Soket OBD-II 16-Pin">
      <rect x="4" y="4" width="532" height="120" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
      <path d="M 98 16 L 522 16 L 512 104 L 106 104 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5" />
      ${drawRow(1, 24, "Pin Atas (1-8)")}
      ${drawRow(9, 66, "Pin Bawah (9-16)")}
      <text x="270" y="118" text-anchor="middle" font-size="9.2" font-weight="600" fill="#334155">
        12 Pin Dibiarkan Kosong Tanpa Kontak · Hanya 4 Jalur Aktif (Pin 16 +12V, Pin 4/5 GND, Pin 6 CAN-H, Pin 14 CAN-L)
      </text>
    </svg>
  `;
}

function buildModularWiringSvg() {
  return `
    <svg viewBox="0 0 760 282" width="100%" height="262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Skema Visual Wiring Modul ORION v2.0">
      <rect x="2" y="2" width="756" height="278" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />

      <!-- Colored orthogonal harness & internal wires -->
      <!-- +12V Red: enters Box 1 at x=166, splits right of Box 1 at x=330 to Buck & Q2 Switch -->
      <path d="M 110 56 H 166" fill="none" stroke="#dc2626" stroke-width="2.6" />
      <path d="M 314 56 H 352" fill="none" stroke="#dc2626" stroke-width="2.6" />
      <path d="M 332 56 V 136 H 352" fill="none" stroke="#dc2626" stroke-width="2.2" />
      <circle cx="332" cy="56" r="3.2" fill="#dc2626" />
      <!-- +3.3V Orange -->
      <path d="M 480 62 H 558" fill="none" stroke="#ea580c" stroke-width="2.6" />
      <path d="M 510 62 V 206 H 480" fill="none" stroke="#ea580c" stroke-width="2.0" />
      <path d="M 526 62 V 206 H 558" fill="none" stroke="#ea580c" stroke-width="2.0" />
      <!-- ADC Blue -->
      <path d="M 480 144 H 558" fill="none" stroke="#2563eb" stroke-width="2.2" />
      <!-- Gate Control Purple -->
      <path d="M 558 164 H 480" fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-dasharray="4 3" />
      <path d="M 558 228 H 480" fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-dasharray="4 3" />
      <!-- CAN Yellow & Green -->
      <path d="M 110 92 H 152 V 230 H 352" fill="none" stroke="#ca8a04" stroke-width="2.2" />
      <path d="M 110 108 H 140 V 244 H 352" fill="none" stroke="#16a34a" stroke-width="2.2" />
      <path d="M 480 232 H 558" fill="none" stroke="#0d9488" stroke-width="2.2" />
      <!-- I2C & Wakeup Cyan -->
      <path d="M 480 198 H 558" fill="none" stroke="#0284c7" stroke-width="2.0" />
      <!-- GND Black -->
      <path d="M 110 124 H 126 V 262 H 620 V 242" fill="none" stroke="#1e293b" stroke-width="2.4" />
      <path d="M 416 96 V 262" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="3 2" />

      <!-- Block 0: OBD Input J1 -->
      <rect x="14" y="34" width="96" height="104" rx="6" fill="#ffffff" stroke="#334155" stroke-width="1.6" />
      <text x="62" y="50" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">SOKET OBD-II</text>
      <text x="22" y="64" font-size="8.5" font-weight="700" fill="#b91c1c">Pin 16: +12V Aki</text>
      <text x="22" y="96" font-size="8.5" font-weight="700" fill="#a16207">Pin 6: CAN-H</text>
      <text x="22" y="112" font-size="8.5" font-weight="700" fill="#15803d">Pin 14: CAN-L</text>
      <text x="22" y="128" font-size="8.5" font-weight="700" fill="#1e293b">Pin 4/5: Ground</text>

      <!-- Callout 1: Fuse + Diode + TVS -->
      <rect x="166" y="24" width="148" height="72" rx="6" fill="#fef2f2" stroke="#dc2626" stroke-width="1.6" />
      <circle cx="174" cy="24" r="10" fill="#dc2626" />
      <text x="174" y="28" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">1</text>
      <text x="244" y="42" text-anchor="middle" font-size="9.5" font-weight="700" fill="#991b1b">PINTU PENGAMAN MASUK</text>
      <text x="240" y="56" text-anchor="middle" font-size="8.5" fill="#7f1d1d">Sekring 500 mA Time-Lag</text>
      <text x="240" y="69" text-anchor="middle" font-size="8.5" fill="#7f1d1d">Dioda Anti-Balik 1N5819</text>
      <text x="240" y="82" text-anchor="middle" font-size="8.5" fill="#7f1d1d">TVS P6KE18A + Shunt R5/JP</text>

      <!-- MP1584 Buck Converter -->
      <rect x="352" y="28" width="128" height="68" rx="6" fill="#fff7ed" stroke="#ea580c" stroke-width="1.6" />
      <text x="416" y="46" text-anchor="middle" font-size="9.5" font-weight="700" fill="#9a3412">PENURUN TEGANGAN</text>
      <text x="416" y="60" text-anchor="middle" font-size="9" font-weight="700" fill="#c2410c">Buck MP1584 (3.3V Fix)</text>
      <text x="416" y="75" text-anchor="middle" font-size="8" fill="#7c2d12">12V -&gt; 3.3V Stabil &amp; Aman</text>
      <text x="416" y="88" text-anchor="middle" font-size="7.5" fill="#7c2d12">+ Kapasitor 100uF ESP32 Base</text>

      <!-- Callout 2: High-Side ADC Switch -->
      <rect x="352" y="108" width="128" height="68" rx="6" fill="#eff6ff" stroke="#2563eb" stroke-width="1.6" />
      <circle cx="360" cy="108" r="10" fill="#2563eb" />
      <text x="360" y="112" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">2</text>
      <text x="420" y="125" text-anchor="middle" font-size="9" font-weight="700" fill="#1e40af">SAKELAR UKUR AKI</text>
      <text x="416" y="139" text-anchor="middle" font-size="8" fill="#1e3a8a">Q3 (2N3904) + Q2 (AO3401A)</text>
      <text x="416" y="152" text-anchor="middle" font-size="8" fill="#1e3a8a">Divider 100k / 27k + 100nF</text>
      <text x="416" y="165" text-anchor="middle" font-size="7.8" font-weight="700" fill="#1d4ed8">PUTUS (0 uA) SAAT TIDUR</text>

      <!-- Callout 3 & 4: CAN Gate + RTC -->
      <rect x="352" y="186" width="128" height="68" rx="6" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.6" />
      <circle cx="360" cy="186" r="10" fill="#16a34a" />
      <text x="360" y="190" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">3</text>
      <text x="420" y="202" text-anchor="middle" font-size="8.8" font-weight="700" fill="#166534">SAKELAR CAN &amp; JAM RTC</text>
      <text x="416" y="216" text-anchor="middle" font-size="8" fill="#14532d">Q1 Gate -&gt; WCMCU-230 CAN</text>
      <text x="416" y="229" text-anchor="middle" font-size="8" fill="#14532d">DS3231SN (Jadwal Bangun)</text>
      <text x="416" y="243" text-anchor="middle" font-size="7.8" font-weight="700" fill="#15803d">READ-ONLY ECU · NO MODE 04</text>

      <!-- Callout 4: ESP32 Controller -->
      <rect x="558" y="34" width="184" height="214" rx="8" fill="#f5f3ff" stroke="#6d28d9" stroke-width="1.8" />
      <circle cx="566" cy="34" r="10" fill="#6d28d9" />
      <text x="566" y="38" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">4</text>
      <text x="650" y="54" text-anchor="middle" font-size="10.5" font-weight="700" fill="#4c1d95">KONTROLER ESP32</text>
      <text x="650" y="68" text-anchor="middle" font-size="8.5" fill="#5b21b6">ESP32 DevKit V1 + Wi-Fi 2.4GHz</text>

      <line x1="570" y1="80" x2="730" y2="80" stroke="#ddd6fe" stroke-width="1" />
      <text x="572" y="96" font-size="8.3" fill="#334155">· 3V3 / GND: Daya utama dari Buck</text>
      <text x="572" y="114" font-size="8.3" fill="#1d4ed8">· GPIO 34: Baca Voltase Aki (mV)</text>
      <text x="572" y="132" font-size="8.3" fill="#6d28d9">· GPIO 27: Pulsa Ukur Aki (40 ms)</text>
      <text x="572" y="150" font-size="8.3" fill="#0369a1">· GPIO 21/22: I2C Jam &amp; Suhu RTC</text>
      <text x="572" y="168" font-size="8.3" fill="#0369a1">· GPIO 32: Sinyal Bangun Tidur</text>
      <text x="572" y="186" font-size="8.3" fill="#6d28d9">· GPIO 26: Sakelar Chip CAN (0V)</text>
      <text x="572" y="204" font-size="8.3" fill="#0f766e">· GPIO 4/5: Baca RPM &amp; Coolant</text>
      <rect x="572" y="216" width="156" height="22" rx="4" fill="#ede9fe" />
      <text x="650" y="230" text-anchor="middle" font-size="8.2" font-weight="700" fill="#4c1d95">Tidur 99,9% Waktu · Kirim ~2 dtk</text>
    </svg>
  `;
}

function buildHtmlDocument() {
  const pcbTopUri = fileToDataUri(PCB_TOP_IMG_PATH, "image/jpeg");
  const customCirkitPath = CIRKIT_IMG_CANDIDATES.find((p) => existsSync(p));
  const cirkitSectionHtml = customCirkitPath
    ? `<div class="cirkit-img-wrap">
         <img src="${fileToDataUri(
           customCirkitPath,
           customCirkitPath.endsWith(".png") ? "image/png" : "image/jpeg",
         )}" alt="Diagram Wiring Rangkaian ORION dari Cirkit Designer" />
         <div class="callout-strip">
           <span><strong>[1]</strong> Sekring 500mA + 1N5819 + TVS</span>
           <span><strong>[2]</strong> Sakelar Pemutus Aki (Q2/Q3)</span>
           <span><strong>[3]</strong> Sakelar CAN (Q1) + RTC</span>
           <span><strong>[4]</strong> ESP32 (Read-Only + Deep Sleep)</span>
         </div>
       </div>`
    : buildModularWiringSvg();

  const b = APPROVAL_DOC_MEMO.batteryDrain60Days;

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
    color: #0f172a;
    background: #ffffff;
    font-size: 9.6pt;
    line-height: 1.42;
  }
  .page {
    page-break-after: always;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .page:last-child {
    page-break-after: auto;
  }
  .header-banner {
    border-left: 5px solid #c92a30;
    padding: 8px 12px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    border-radius: 0 6px 6px 0;
  }
  .header-meta {
    font-size: 7.8pt;
    font-weight: 700;
    color: #9e1f24;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  h1 {
    font-size: 14.2pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
  }
  .subtitle {
    font-size: 9pt;
    color: #475569;
    margin-top: 2px;
  }
  h2 {
    font-size: 10.6pt;
    font-weight: 700;
    color: #0f172a;
    border-bottom: 1.5px solid #cbd5e1;
    padding-bottom: 3px;
    margin-top: 2px;
    margin-bottom: 4px;
  }
  p {
    margin-bottom: 5px;
    color: #1e293b;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .card {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 9px 11px;
    background: #ffffff;
  }
  .card-title {
    font-size: 9.2pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .card-muted {
    background: #f8fafc;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.6pt;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 5px 7px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f1f5f9;
    font-weight: 700;
    color: #0f172a;
  }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 7.8pt;
    font-weight: 700;
  }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .figure-box {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 7px 9px;
    background: #ffffff;
  }
  .figure-caption {
    font-size: 8pt;
    color: #475569;
    margin-top: 4px;
    text-align: center;
  }
  .cirkit-img-wrap img {
    width: 100%;
    max-height: 258px;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }
  .callout-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #e2e8f0;
    font-size: 7.8pt;
    color: #1e293b;
  }
  .pcb-wrap {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 10px;
    align-items: center;
  }
  .pcb-wrap img {
    width: 100%;
    max-height: 196px;
    object-fit: contain;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
  }
  .steps-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px;
  }
  .step-box {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 7px 8px;
    background: #f8fafc;
  }
  .step-num {
    font-size: 8pt;
    font-weight: 800;
    color: #c92a30;
    margin-bottom: 2px;
  }
  .step-title {
    font-size: 8.8pt;
    font-weight: 700;
    margin-bottom: 3px;
  }
  .step-desc {
    font-size: 8pt;
    color: #334155;
  }
  .bar-row {
    margin: 5px 0;
  }
  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 8.3pt;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .bar-track {
    width: 100%;
    height: 14px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
  }
  .bar-fill-green {
    height: 100%;
    background: #16a34a;
  }
  .bar-fill-red {
    height: 100%;
    background: #dc2626;
  }
  .approval-box {
    border: 1.5px solid #334155;
    border-radius: 6px;
    padding: 9px 12px;
    background: #ffffff;
  }
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 8px;
  }
  .sig-col {
    text-align: center;
    font-size: 8.5pt;
  }
  .sig-space {
    height: 44px;
    border-bottom: 1px solid #64748b;
    margin: 6px 14px 4px;
  }
  .footer-note {
    font-size: 7.5pt;
    color: #64748b;
    text-align: right;
    margin-top: auto;
  }
</style>
</head>
<body>

  <!-- HALAMAN 1 -->
  <section class="page">
    <div class="header-banner">
      <div class="header-meta">${APPROVAL_DOC_MEMO.docCode} · ${APPROVAL_DOC_MEMO.dateLabel} · Dokumen Perizinan Stock Yard</div>
      <h1>${APPROVAL_DOC_MEMO.title}</h1>
      <div class="subtitle">${APPROVAL_DOC_MEMO.subtitle} (${APPROVAL_DOC_MEMO.hardwareRef})</div>
    </div>

    <div>
      <h2>1. Tujuan &amp; Manfaat Langsung untuk Operasional Gudang</h2>
      <div class="grid-2">
        <div class="card card-muted">
          <div class="card-title">Masalah yang Ingin Dicegah</div>
          <p>Kendaraan baru di stock yard yang terparkir berminggu-minggu berisiko mengalami aki lemah atau soak mendadak menjelang pengiriman (PDI). Pemeriksaan manual dengan multimeter satu per satu ke seluruh baris parkir memakan banyak waktu teknisi.</p>
        </div>
        <div class="card card-muted">
          <div class="card-title">Manfaat Sistem ORION</div>
          <p>Modul ORION mengirim laporan voltase aki dan suhu kendaraan langsung ke layar pantau gudang tanpa petugas perlu membuka kap mesin. Sistem juga mengurutkan unit mana yang perlu dipanaskan 10 menit dan mencatat kapan unit keluar-masuk area gudang.</p>
        </div>
      </div>
    </div>

    <div>
      <h2>2. Alur Pemasangan Luar &amp; Koneksi Soket OBD-II (Non-Invasif)</h2>
      <p>Pemasangan <strong>100% Plug-and-Play</strong>: perangkat hanya dicolokkan ke soket diagnostik standar OBD-II (16-pin) di bawah dasbor pengemudi. Tidak ada pemotongan, pengupasan, maupun penyolderan kabel asli pabrik. Saat unit hendak dikirim ke konsumen, alat tinggal dicabut kembali dalam <strong>5 detik</strong>.</p>
      <div class="figure-box">
        ${buildObdConnectorSvg()}
        <div class="figure-caption">Gambar 1: Pemanfaatan pin konektor OBD-II mobil. Dari 16 pin pabrikan, 12 pin dibiarkan kosong dan hanya 4 jalur standar yang tersambung melewati sekring luar.</div>
      </div>
    </div>

    <div>
      <h2>3. Ringkasan Spesifikasi Keamanan Perangkat Keras</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 30%;">Aspek Pemeriksaan Gudang</th>
            <th>Spesifikasi Teknis di Perangkat ORION</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Ukuran &amp; Penempatan</strong></td>
            <td>${APPROVAL_DOC_MEMO.boardSizeLabel}; ditempatkan aman di bawah dasbor dengan kabel pita standar.</td>
          </tr>
          <tr>
            <td><strong>Proteksi Arus Lebih &amp; Polaritas</strong></td>
            <td>${APPROVAL_DOC_MEMO.fuseSpec} pada kabel masuk <code>+12V</code>, dioda anti-balik <code>1N5819</code>, dan penahan surja <code>TVS</code>.</td>
          </tr>
          <tr>
            <td><strong>Konsumsi Arus Saat Mobil Parkir</strong></td>
            <td>${APPROVAL_DOC_MEMO.sleepCurrent}. Tidak menyedot aki selama parkir panjang.</td>
          </tr>
          <tr>
            <td><strong>Izin Komunikasi Komputer (ECU)</strong></td>
            <td>${APPROVAL_DOC_MEMO.ecuPolicy}.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="footer-note">Halaman 1 dari 3 · ORION Telemetry Stock Yard Approval</div>
  </section>

  <!-- HALAMAN 2 -->
  <section class="page">
    <div class="header-banner">
      <div class="header-meta">Halaman 2 · Gambaran Fisik Modul &amp; Jalur Kelistrikan</div>
      <h1>Gambaran Perangkat Nyata &amp; Alur Kelistrikan Internal</h1>
      <div class="subtitle">Susunan modul, letak sekring pelindung, serta dua sakelar pemutus arus selama kendaraan terparkir</div>
    </div>

    <div class="figure-box">
      ${cirkitSectionHtml}
      <div class="figure-caption">Gambar 2: Skema aliran kabel dan pengaman dari soket OBD-II (kiri) menuju ESP32 (kanan). Setiap jalur daya memiliki sakelar pemutus fisik saat tidur.</div>
    </div>

    <div class="pcb-wrap">
      <div class="figure-box">
        <img src="${pcbTopUri}" alt="Tata Letak Papan PCB ORION v2.0 70x50mm" />
        <div class="figure-caption">Gambar 3: Wujud rakitan papan kompak 70 x 50 mm (semua modul tertancap di soket tanpa kabel semrawut).</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Jalur Kabel</th>
            <th>Fungsi &amp; Pengaman</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge badge-red">+12V Aki (Merah)</span></td>
            <td>Masuk lewat sekring <code>500 mA</code> dan dioda <code>1N5819</code> [1], turun ke <code>3,3V</code> via <code>MP1584</code>. Jalur ukur aki diputus oleh sakelar [2] ketika tidur.</td>
          </tr>
          <tr>
            <td><span class="badge badge-green">CAN-L</span> / <span class="badge badge-amber">CAN-H</span></td>
            <td>Masuk ke chip pembaca <code>WCMCU-230</code> yang dayanya ikut dimatikan (<code>0V</code>) oleh sakelar [3] saat kendaraan parkir.</td>
          </tr>
          <tr>
            <td><strong>Ground (Hitam)</strong></td>
            <td>Jalur balik negatif standar ke sasis mobil (Pin 4/5 OBD-II).</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card card-muted">
      <div class="card-title">Penjelasan Singkat Empat Titik Pengaman Utama ([1] sampai [4])</div>
      <p><strong>[1] Pintu Masuk Berpengaman:</strong> Apabila terjadi hubung singkat di dalam alat, sekring <code>500 mA</code> langsung putus di dalam harness ORION sehingga sekring mobil dan kabel pabrik tetap utuh. <strong>[2] Sakelar Pemutus Pengukur Aki:</strong> Rangkaian pengukur voltase tidak menempel terus ke aki; jalur tersebut terbuka secara fisik dan hanya menyambung selama <code>40 milidetik</code> saat jadwal ukur tiba. <strong>[3] Sakelar Chip CAN &amp; Jam RTC:</strong> Chip transceiver OBD dimatikan ke <code>0 Volt</code> saat parkir sehingga tidak mengganggu komunikasi komputer mobil. <strong>[4] ESP32 Controller:</strong> Mengirim data singkat lewat Wi-Fi lalu segera masuk kembali ke mode tidur dalam.</p>
    </div>
    <div class="footer-note">Halaman 2 dari 3 · ORION Telemetry Stock Yard Approval</div>
  </section>

  <!-- HALAMAN 3 -->
  <section class="page">
    <div class="header-banner">
      <div class="header-meta">Halaman 3 · Siklus Pengambilan Data &amp; Lembar Persetujuan Uji Coba</div>
      <h1>Alur Pengambilan Data, Keamanan Aki &amp; Rencana Uji Coba</h1>
      <div class="subtitle">Bagaimana alat mengambil data tanpa membuat aki soak, panas di kabin, atau mengubah setelan ECU</div>
    </div>

    <div>
      <h2>1. Empat Langkah Siklus Pengambilan Data dari Kendaraan</h2>
      <div class="steps-4">
        <div class="step-box">
          <div class="step-num">LANGKAH 1</div>
          <div class="step-title">Mode Tidur (Standby)</div>
          <div class="step-desc">Alat tidur lelap sepanjang waktu parkir (arus &lt; 0,5 mA). Jalur ukur aki dan modul CAN diputus fisik.</div>
        </div>
        <div class="step-box">
          <div class="step-num">LANGKAH 2</div>
          <div class="step-title">Bangun 40 ms Ukur Aki</div>
          <div class="step-desc">Jam internal RTC membangunkan ESP32 sesuai jadwal. Sakelar dibuka 40 ms untuk membaca voltase aki, lalu ditutup lagi.</div>
        </div>
        <div class="step-box">
          <div class="step-num">LANGKAH 3</div>
          <div class="step-title">Cek Pemanasan Mesin</div>
          <div class="step-desc">Jika mesin sedang dinyalakan staf (&gt; 13,5V), alat membaca putaran mesin (RPM) dan suhu radiator secara read-only.</div>
        </div>
        <div class="step-box">
          <div class="step-num">LANGKAH 4</div>
          <div class="step-title">Kirim Wi-Fi (~2 Detik)</div>
          <div class="step-desc">Data dikirim ke layar pantau gudang lewat Wi-Fi, atau disimpan di memori cadangan jika di luar area, lalu tidur kembali.</div>
        </div>
      </div>
    </div>

    <div>
      <h2>2. Simulasi Pemakaian Aki selama 60 Hari Parkir Penuh (Aki 65 Ah)</h2>
      <div class="card card-muted">
        <div class="bar-row">
          <div class="bar-label">
            <span>Perangkat ORION (Tidur &lt; 0,5 mA + Bangun tiap 6 Jam)</span>
            <span>Terpakai ${b.orionAh} Ah dari 65 Ah (${b.orionPct} - Aki Tetap Prima)</span>
          </div>
          <div class="bar-track"><div class="bar-fill-green" style="width: 3%;"></div></div>
        </div>
        <div class="bar-row">
          <div class="bar-label">
            <span>OBD Dongle / Pelacak Biasa (Menyala Terus ~40 mA)</span>
            <span>Terpakai ${b.conventionalAh} Ah dari 65 Ah (${b.conventionalPct} - Aki Soak dalam 3-4 Minggu)</span>
          </div>
          <div class="bar-track"><div class="bar-fill-red" style="width: 89%;"></div></div>
        </div>
      </div>
    </div>

    <div>
      <h2>3. Empat Jaminan Keselamatan bagi Pihak Gudang</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 28%;">Jaminan</th>
            <th>Bukti Mekanisme Pengaman pada Perangkat</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Garansi &amp; Kabel Pabrik Utuh</strong></td>
            <td>Menggunakan konektor standar OBD-II tanpa potong atau kupas satu helai kabel pun; bisa dilepas dalam 5 detik.</td>
          </tr>
          <tr>
            <td><strong>Anti-Korsleting &amp; Suhu Kabin Aman</strong></td>
            <td>Dilindungi sekring <code>500 mA</code> di jalur masuk. Karena tidur 99,9% waktu dan aktif hanya ~2 detik, modul tidak menimbulkan panas di kabin tertutup.</td>
          </tr>
          <tr>
            <td><strong>Tidak Menguras Aki Mobil Baru</strong></td>
            <td>Konsumsi energi 60 hari di bawah <code>1,5%</code> kapasitas aki normal berkat sakelar pemutus fisik di jalur ukur.</td>
          </tr>
          <tr>
            <td><strong>ECU 100% Read-Only</strong></td>
            <td>Driver CAN bus dikunci hanya menerima perintah baca dasar; tidak dapat menghapus atau menulis memori komputer mesin mobil.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="approval-box">
      <div class="card-title">Rencana Uji Coba Terbatas (Pilot Test) &amp; Kolom Persetujuan Pihak Gudang</div>
      <p style="font-size: 8.3pt; margin-bottom: 4px;">
        <strong>Cakupan Uji Coba:</strong> ${APPROVAL_DOC_MEMO.pilotTerms.unitCount} ·
        <strong>Durasi:</strong> ${APPROVAL_DOC_MEMO.pilotTerms.durationDays} ·
        <strong>Instalasi:</strong> ${APPROVAL_DOC_MEMO.pilotTerms.installTime} di bawah pengawasan staf PDI / Gudang.
      </p>
      <div class="sig-grid">
        <div class="sig-col">
          <div>Diajukan Oleh (Tim Pengembang ORION),</div>
          <div class="sig-space"></div>
          <div>Nama &amp; Tanggal: ___________________________</div>
        </div>
        <div class="sig-col">
          <div>Disetujui Oleh (Kepala Gudang / Penanggung Jawab Unit),</div>
          <div class="sig-space"></div>
          <div>Nama, Tanda Tangan &amp; Tanggal: _________________</div>
        </div>
      </div>
    </div>
    <div class="footer-note">Halaman 3 dari 3 · ORION Telemetry Stock Yard Approval</div>
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
