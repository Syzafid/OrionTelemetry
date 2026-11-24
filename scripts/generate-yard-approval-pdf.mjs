import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * ============================================================================
 * MEMO & SINGLE SOURCE OF TRUTH: DOKUMEN PROPOSAL UJI COBA ORION v2.0 (MONOKROM)
 * ============================================================================
 * Cara memperbarui PDF setelah ada revisi data uji atau gambar Cirkit:
 * 1. (Opsional) Jika diagram wiring dari app.cirkitdesigner.com sudah selesai,
 *    simpan gambar tersebut sebagai `docs/static/img/cirkit-wiring-v2.png` (atau .jpg).
 *    Skrip akan otomatis memakainya dalam mode monokrom (grayscale kontras tinggi).
 * 2. Ubah angka terukur atau status gerbang pada objek `APPROVAL_DOC_MEMO` di bawah.
 * 3. Jalankan `npm run pdf:yard-approval` untuk mencetak ulang PDF ke:
 *    `docs/static/pdf/ORION_Dokumen_Izin_Teknis_Gudang.pdf`.
 */
export const APPROVAL_DOC_MEMO = {
  docCode: "ORION-DOC-YARD-02 / Rev 2.0",
  dateLabel: "November 2026",
  audience: "Kepala Gudang dan Tim Teknisi Kendaraan",
  hardwareRef: "Perangkat Keras PCB ORION v2.0 Step 2.1 (70 x 50 mm) · Firmware v1.6.0",
  title:
    'Proposal Pengajuan Izin Uji Coba Perangkat Telemetri & Diagnostik OBD-II "ORION v2.0" pada Unit Kendaraan Gudang',
  executiveSummary:
    "Dokumen ini disusun sebagai acuan teknis bagi Kepala Gudang dan Tim Teknisi Kendaraan sebelum pelaksanaan uji coba terbatas perangkat pemantau kelistrikan dan diagnostik OBD-II ORION v2.0 pada unit kendaraan operasional di area gudang. Uji coba bertujuan memverifikasi pembacaan data diagnostik CAN bus / OBD-II, pemantauan tegangan aki 12V, serta fungsi hemat daya tidur (deep sleep) secara non-invasif tanpa memotong atau mengubah kabel asli kendaraan. Seluruh angka di dalam dokumen ini dipisahkan tegas antara hasil pengukuran meja (bench test) yang sudah tercatat dan parameter yang wajib diukur saat integrasi Tahap C.",
  architectureItems: [
    {
      block: "Mikrokontroler Utama",
      spec: "ESP32 DevKit V1 (30-Pin Base)",
      detail:
        "Mengelola sampling tegangan, komunikasi I2C/CAN, penyimpanan cadangan offline, serta aturan keselamatan H8: suplai +12V kendaraan/PSU dan kabel USB pemrograman ke ESP32 Base dilarang terpasang bersamaan.",
    },
    {
      block: "Transceiver CAN Bus",
      spec: "WCMCU-230 (SN65HVD230) · CRX=GPIO4, CTX=GPIO5",
      detail:
        "Terhubung ke jalur CAN_H (pin 6) dan CAN_L (pin 14) dengan mode pemantauan pasif (hanya baca Mode 0x01/0x03; tanpa perintah tulis atau hapus memori ECU Mode 0x04).",
    },
    {
      block: "Regulator Daya",
      spec: "Buck Converter MP1584 (+12V ke +3,3V)",
      detail:
        "Menggunakan topologi common ground yang menyatukan GND pin 4 dan 5 soket OBD-II dengan ground seluruh modul (bukan isolasi galvanik).",
    },
    {
      block: "Real-Time Clock (RTC)",
      spec: "ZS-042 (DS3231) · SDA=GPIO21, SCL=GPIO22, SQW=GPIO32",
      detail:
        "Modul sudah dimodifikasi fisik dengan melepas LED indikator daya dan rangkaian pengisi baterai koin CR2032 untuk mencegah arus bocor dan pengisian berlebih (overcharge).",
    },
    {
      block: "Power Gating (Hemat Daya)",
      spec: "Q1 AO3401A (CAN, GPIO26 aktif-LOW) & Q2 AO3401A + Q3 2N3904 (ADC, GPIO27 aktif-HIGH)",
      detail:
        "Q1 memutus rel 3V3_CAN saat tidur. Q2/Q3 memutus jalur pembagi tegangan R1 100 kOhm dan R2 27 kOhm menuju ADC_OUT (GPIO34). Saat tidur, jalur pembagi terputus (0 mA) dan transceiver CAN dimatikan.",
    },
  ],
  testResults: [
    {
      parameter: "Output MP1584 tanpa beban",
      status: "TERUJI MEJA + TAHAP C",
      result:
        "Terukur 3,33 V pada input 11,91 V (berada di dalam rentang 3,2-3,4 V). Verifikasi lanjutan di 12,6 V dan +/- 14 V dengan batas arus awal 100 mA dijadwalkan sebelum integrasi unit.",
      meaning:
        "Berdasarkan pengujian awal, tegangan suplai logika stabil pada 3,33 V. Pengujian pada 12,6 V dan +/- 14 V memastikan kestabilan saat mesin pengisian alternator aktif.",
    },
    {
      parameter: "Proteksi arus lebih (sekring)",
      status: "DESAIN / SIAP PASANG",
      result:
        "Estimasi beban kerja nominal +/- 0,20-0,25 A. Jalur masuk +12V menggunakan sekring 500 mA time-lag (slow-blow), atau opsi 500 mA fast-blow / 1 A fast-blow yang tersedia sesuai penampang kabel.",
      meaning:
        "Memberikan batas pemutusan arus berlebih di atas beban kerja +/- 0,20-0,25 A sehingga gangguan pada modul putus di sekring pengaman sebelum membebani jalur mobil.",
    },
    {
      parameter: "Proteksi polaritas & lonjakan transien",
      status: "TERUJI KOMPONEN",
      result:
        "Dioda Schottky D1 1N5819 terukur pada uji dioda +/- 0,15-0,35 V untuk menahan polaritas terbalik, dipasangkan dengan dioda TVS P6KE18A paralel ke GND.",
      meaning:
        "Mencegah aliran arus apabila pemasangan +12V dan GND tertukar, sekaligus menyediakan jalur buang lonjakan tegangan transien di atas 18 V menuju ground.",
    },
    {
      parameter: "Sakelar daya CAN (Q1 / GPIO26)",
      status: "TERUJI MEJA",
      result: "Terukur 0,00 V pada kondisi OFF dan 3,33 V pada kondisi ON.",
      meaning:
        "Berdasarkan pengujian meja, suplai ke chip transceiver WCMCU-230 benar-benar terputus ke 0,00 V saat GPIO26 nonaktif sehingga tidak membebani bus CAN saat tidur.",
    },
    {
      parameter: "Integritas MOSFET AO3401A (Q1 & Q2)",
      status: "TERUJI KOMPONEN",
      result:
        "Uji dioda body D-S terbaca ~0,5 V (probe merah di D, hitam di S) dan OL saat dibalik. Terpasang pada adaptor SOT-23 (2-3-1 = S-D-G) tanpa hubung singkat antarkaki.",
      meaning:
        "Memastikan komponen sakelar elektronik bekerja searah sesuai polaritas sebelum dialiri tegangan kendaraan 12V.",
    },
    {
      parameter: "Modifikasi fisik RTC ZS-042",
      status: "TERVERIFIKASI FISIK",
      result:
        "Jalur LED indikator daya dan rangkaian pengisian baterai (dioda/resistor charger) sudah dilepas secara fisik dari modul.",
      meaning:
        "Menghilangkan konsumsi LED statis dan menghentikan arus balik ke baterai koin non-isi ulang CR2032 saat modul mendapat suplai 3,3 V.",
    },
    {
      parameter: "Sakelar pembagi tegangan ADC (Q2/Q3 / GPIO27)",
      status: "TARGET UJI TAHAP C",
      result:
        "Kontrol aktif-HIGH; jalur pembagi terbuka saat tidur (0 mA). Target Vgs pada v2.0 berada di kisaran -7,6 V pada 11,9 V dan -9,1 V pada 14,4 V (diukur ulang pada v2.0 saat Tahap C).",
      meaning:
        "Verifikasi ulang Vgs pada Tahap C memastikan Q2 beroperasi aman di bawah batas Vgs maksimum +/- 12 V sekaligus membuktikan arus pembagi tetap 0 mA saat tidur.",
    },
    {
      parameter: "Arus tidur (E5) & Kalibrasi ADC",
      status: "WAJIB UJI TAHAP C",
      result:
        "Pengukuran arus deep sleep gabungan DevKit + Base (melintasi shunt R5 10 Ohm) dan kalibrasi 4-titik ADC dijadwalkan sebagai syarat wajib Tahap C.",
      meaning:
        "Menghasilkan angka arus tidur terukur secara aktual di prototipe v2.0 sebelum perangkat ditinggalkan terpasang pada unit kendaraan parkir.",
    },
  ],
  riskMatrix: [
    {
      risk: "Korsleting atau salah colok antara kabel daya (+12V/GND) dan jalur data CAN",
      mitigation:
        "Pemisahan fisik memakai dua konektor terkunci (JST-XH 2-pin khusus daya dan JST-XH 2-pin khusus CAN) disertai pelabelan permanen yang anti-tertukar, serta pemasangan sekring 500 mA pada kabel masuk +12V.",
    },
    {
      risk: "Penurunan muatan aki berlebih selama kendaraan terparkir di gudang",
      mitigation:
        "Arsitektur deep sleep berkala dipadukan dengan pemutusan catu daya transceiver CAN oleh Q1 (teruji 0,00 V saat OFF), pemutusan pembagi R1/R2 oleh Q2/Q3, dan pelepasan sirkuit LED/charger ZS-042. Besaran arus tidur final diverifikasi pada uji E5 Tahap C.",
    },
    {
      risk: "Getaran kabin kendaraan atau kontak pin menjadi longgar saat uji unit",
      mitigation:
        "Menggunakan konektor berkait (locked header), penopang mekanis non-konduktif di bawah modul, pelapis isolasi Kapton pada area sempit, serta uji kontinuitas dan isolasi penuh tanpa daya (Tahap B) sebelum perangkat dipasang ke mobil.",
    },
    {
      risk: "Kesalahan prosedur saat debugging atau pemrograman ulang di bengkel",
      mitigation:
        "Menerapkan aturan keselamatan H8 secara tertulis: dilarang menyalakan suplai 12V (aki kendaraan atau PSU) bersamaan dengan kabel USB komputer ke ESP32 Base.",
    },
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
        <text x="${x + 20}" y="${y + 20}" text-anchor="middle" font-size="6.8" font-weight="600" fill="${lblFill}">${active ? active.label : "TIDAK DIISI"}</text>
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
        Koneksi Non-Invasif: Pin 16 (+12V), Pin 4/5 (GND), Pin 6 (CAN_H), Pin 14 (CAN_L). 12 pin lain tidak digunakan.
      </text>
    </svg>
  `;
}

function buildMonochromeWiringSvg() {
  return `
    <svg viewBox="0 0 760 250" width="100%" height="232" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Skema Aliran Kelistrikan dan Wiring ORION v2.0 Monokrom">
      <rect x="2" y="2" width="756" height="246" rx="4" fill="#ffffff" stroke="#111111" stroke-width="1.4" />

      <!-- Wire paths: thick solid = Power, thin solid = CAN/Signal, dashed = Gate/Wakeup -->
      <!-- Power +12V & +3.3V (thick solid #111) -->
      <path d="M 118 46 H 192" fill="none" stroke="#111111" stroke-width="2.2" />
      <path d="M 332 46 H 368" fill="none" stroke="#111111" stroke-width="2.2" />
      <path d="M 350 46 V 126 H 368" fill="none" stroke="#111111" stroke-width="2.0" />
      <circle cx="350" cy="46" r="3" fill="#111111" />
      <path d="M 504 46 H 572" fill="none" stroke="#111111" stroke-width="2.2" />
      <path d="M 532 46 V 196 H 504" fill="none" stroke="#111111" stroke-width="1.8" />
      <path d="M 548 46 V 196 H 572" fill="none" stroke="#111111" stroke-width="1.8" />

      <!-- CAN Signals CAN_H & CAN_L (thin solid #222) -->
      <path d="M 118 168 H 192" fill="none" stroke="#222222" stroke-width="1.4" />
      <path d="M 118 184 H 192" fill="none" stroke="#222222" stroke-width="1.4" />
      <path d="M 332 176 H 368" fill="none" stroke="#222222" stroke-width="1.4" />
      <path d="M 504 204 H 572" fill="none" stroke="#222222" stroke-width="1.4" />

      <!-- ADC Voltage & I2C Signals (thin solid #333) -->
      <path d="M 504 128 H 572" fill="none" stroke="#333333" stroke-width="1.3" />
      <path d="M 504 176 H 572" fill="none" stroke="#333333" stroke-width="1.3" />

      <!-- Control Gates & SQW Wakeup (dashed #444) -->
      <path d="M 572 146 H 504" fill="none" stroke="#444444" stroke-width="1.2" stroke-dasharray="4 3" />
      <path d="M 572 220 H 504" fill="none" stroke="#444444" stroke-width="1.2" stroke-dasharray="4 3" />

      <!-- Common GND Return Bus (thick double/bottom rail) -->
      <path d="M 118 70 H 148 V 234 H 660 V 218" fill="none" stroke="#111111" stroke-width="2.2" />
      <path d="M 436 82 V 234" fill="none" stroke="#555555" stroke-width="1.1" stroke-dasharray="2 2" />
      <text x="410" y="244" text-anchor="middle" font-size="7.6" font-weight="700" fill="#111111">
        COMMON GROUND (OBD Pin 4/5 menyatu ke GND seluruh modul; bukan isolasi galvanik)
      </text>

      <!-- Block 0A: Konektor Daya JST-XH 2-Pin -->
      <rect x="14" y="24" width="104" height="58" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.5" />
      <text x="66" y="38" text-anchor="middle" font-size="8.4" font-weight="700" fill="#111111">KONEKTOR DAYA</text>
      <text x="66" y="49" text-anchor="middle" font-size="7.4" fill="#333333">JST-XH 2-Pin Terkunci</text>
      <text x="22" y="63" font-size="7.6" font-weight="700" fill="#111111">Pin A: +12V (OBD 16)</text>
      <text x="22" y="75" font-size="7.6" font-weight="700" fill="#111111">Pin B: GND (OBD 4/5)</text>

      <!-- Block 0B: Konektor CAN JST-XH 2-Pin -->
      <rect x="14" y="148" width="104" height="52" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.5" />
      <text x="66" y="162" text-anchor="middle" font-size="8.4" font-weight="700" fill="#111111">KONEKTOR CAN</text>
      <text x="66" y="173" text-anchor="middle" font-size="7.4" fill="#333333">JST-XH 2-Pin Terpisah</text>
      <text x="22" y="187" font-size="7.6" fill="#111111">CAN_H (OBD Pin 6)</text>
      <text x="22" y="196" font-size="7.6" fill="#111111">CAN_L (OBD Pin 14)</text>

      <!-- Block 1: Input Protection -->
      <rect x="192" y="18" width="140" height="68" rx="3" fill="#f4f4f4" stroke="#111111" stroke-width="1.4" />
      <rect x="192" y="18" width="18" height="14" fill="#111111" />
      <text x="201" y="28" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">1</text>
      <text x="270" y="29" text-anchor="middle" font-size="8.3" font-weight="700" fill="#111111">PROTEKSI MASUK</text>
      <text x="262" y="43" text-anchor="middle" font-size="7.8" fill="#111111">Sekring 500 mA Time-Lag</text>
      <text x="262" y="55" text-anchor="middle" font-size="7.8" fill="#111111">Dioda D1 1N5819 (Anti-Balik)</text>
      <text x="262" y="67" text-anchor="middle" font-size="7.8" fill="#111111">TVS P6KE18A (&gt;18V ke GND)</text>
      <text x="262" y="79" text-anchor="middle" font-size="7.2" fill="#444444">+ Shunt R5 10 Ohm / Bypass JP</text>

      <!-- Block CAN Bus Filter / Direct -->
      <rect x="192" y="152" width="140" height="46" rx="3" fill="#ffffff" stroke="#555555" stroke-width="1.2" />
      <text x="262" y="169" text-anchor="middle" font-size="8.1" font-weight="700" fill="#111111">JALUR CAN DIFERENSIAL</text>
      <text x="262" y="182" text-anchor="middle" font-size="7.5" fill="#333333">500 kbps Mode Baca Pasif</text>
      <text x="262" y="192" text-anchor="middle" font-size="7.1" fill="#555555">Terpisah Fisik dari Jalur Daya</text>

      <!-- Buck Regulator U4 -->
      <rect x="368" y="18" width="136" height="64" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.4" />
      <text x="436" y="33" text-anchor="middle" font-size="8.4" font-weight="700" fill="#111111">REGULATOR MP1584</text>
      <text x="436" y="46" text-anchor="middle" font-size="7.8" fill="#111111">+12V -&gt; 3,33 V (Teruji Meja)</text>
      <text x="436" y="59" text-anchor="middle" font-size="7.3" fill="#333333">Uji Lanjut: 12,6V &amp; +/-14V</text>
      <text x="436" y="71" text-anchor="middle" font-size="7.1" fill="#555555">+ Kapasitor 100uF ESP32 Base</text>

      <!-- Block 2: High-Side ADC Gate -->
      <rect x="368" y="94" width="136" height="62" rx="3" fill="#f4f4f4" stroke="#111111" stroke-width="1.4" />
      <rect x="368" y="94" width="18" height="14" fill="#111111" />
      <text x="377" y="104" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">2</text>
      <text x="444" y="105" text-anchor="middle" font-size="8.2" font-weight="700" fill="#111111">SAKELAR ADC Q2/Q3</text>
      <text x="436" y="119" text-anchor="middle" font-size="7.6" fill="#111111">AO3401A + 2N3904 (GPIO27)</text>
      <text x="436" y="131" text-anchor="middle" font-size="7.6" fill="#111111">Divider R1 100k / R2 27k</text>
      <text x="436" y="144" text-anchor="middle" font-size="7.4" font-weight="700" fill="#111111">Saat Tidur: Terputus (0 mA)</text>

      <!-- Block 3: CAN Power Gate + RTC -->
      <rect x="368" y="166" width="136" height="60" rx="3" fill="#f4f4f4" stroke="#111111" stroke-width="1.4" />
      <rect x="368" y="166" width="18" height="14" fill="#111111" />
      <text x="377" y="176" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">3</text>
      <text x="444" y="177" text-anchor="middle" font-size="8.1" font-weight="700" fill="#111111">SAKELAR CAN Q1 &amp; RTC</text>
      <text x="436" y="191" text-anchor="middle" font-size="7.5" fill="#111111">Q1 GPIO26 (0,00V / 3,33V)</text>
      <text x="436" y="203" text-anchor="middle" font-size="7.5" fill="#111111">WCMCU-230 + ZS-042 RTC</text>
      <text x="436" y="216" text-anchor="middle" font-size="7.1" fill="#333333">LED &amp; Charger ZS-042 Dilepas</text>

      <!-- Block 4: ESP32 Controller -->
      <rect x="572" y="24" width="172" height="196" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.6" />
      <rect x="572" y="24" width="18" height="14" fill="#111111" />
      <text x="581" y="34" text-anchor="middle" font-size="8.5" font-weight="700" fill="#ffffff">4</text>
      <text x="666" y="36" text-anchor="middle" font-size="8.8" font-weight="700" fill="#111111">ESP32 DEVKIT BASE</text>
      <text x="658" y="50" text-anchor="middle" font-size="7.3" fill="#333333">Aturan H8: Dilarang 12V + USB Serentak</text>
      <line x1="582" y1="56" x2="734" y2="56" stroke="#cccccc" stroke-width="1" />
      <text x="582" y="72" font-size="7.8" fill="#111111">3V3 / GND : Suplai MP1584</text>
      <text x="582" y="90" font-size="7.8" fill="#111111">GPIO 34 : ADC_OUT Aki</text>
      <text x="582" y="108" font-size="7.8" fill="#111111">GPIO 27 : ADC_TRIG (Aktif-HIGH)</text>
      <text x="582" y="126" font-size="7.8" fill="#111111">GPIO 21/22 : I2C RTC DS3231</text>
      <text x="582" y="144" font-size="7.8" fill="#111111">GPIO 32 : Bangun SQW RTC</text>
      <text x="582" y="162" font-size="7.8" fill="#111111">GPIO 26 : CAN_EN (Aktif-LOW)</text>
      <text x="582" y="180" font-size="7.8" fill="#111111">GPIO 4/5 : CRX / CTX (WCMCU)</text>
      <rect x="582" y="190" width="152" height="22" rx="2" fill="#f4f4f4" stroke="#555555" stroke-width="0.9" />
      <text x="658" y="204" text-anchor="middle" font-size="7.3" font-weight="700" fill="#111111">Garis Putus-Putus = Kontrol Gate &amp; IRQ</text>
    </svg>
  `;
}

function buildHtmlDocument() {
  const pcbTopUri = fileToDataUri(PCB_TOP_IMG_PATH, "image/jpeg");
  const customCirkitPath = CIRKIT_IMG_CANDIDATES.find((p) => existsSync(p));
  const diagramBHtml = customCirkitPath
    ? `<div class="cirkit-wrap">
         <img class="mono-img" src="${fileToDataUri(
           customCirkitPath,
           customCirkitPath.endsWith(".png") ? "image/png" : "image/jpeg",
         )}" alt="Diagram Wiring Rangkaian ORION v2.0 (Monokrom)" />
       </div>`
    : buildMonochromeWiringSvg();

  const archRows = APPROVAL_DOC_MEMO.architectureItems
    .map(
      (item) => `
      <tr>
        <td style="width: 22%;"><strong>${item.block}</strong><br /><span class="mono-muted">${item.spec}</span></td>
        <td>${item.detail}</td>
      </tr>`,
    )
    .join("\n");

  const testRows = APPROVAL_DOC_MEMO.testResults
    .map(
      (row) => `
      <tr>
        <td style="width: 21%;"><strong>${row.parameter}</strong></td>
        <td style="width: 15%;"><span class="tag">${row.status}</span></td>
        <td style="width: 34%;">${row.result}</td>
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
    font-size: 9pt;
    line-height: 1.38;
    font-variant-numeric: tabular-nums;
  }
  .page {
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
    padding: 7px 0 6px;
  }
  .doc-meta-top {
    display: flex;
    justify-content: space-between;
    font-size: 7.8pt;
    font-weight: 700;
    color: #333333;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 3px;
  }
  h1 {
    font-size: 13pt;
    font-weight: 800;
    color: #000000;
    line-height: 1.22;
    margin-bottom: 3px;
  }
  .doc-recipient {
    font-size: 8.6pt;
    color: #222222;
  }
  h2 {
    font-size: 10pt;
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
    font-size: 8.2pt;
  }
  th, td {
    border: 0.75pt solid #444444;
    padding: 4.5px 6px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #efefef;
    font-weight: 700;
    color: #000000;
  }
  .mono-muted {
    font-size: 7.5pt;
    color: #444444;
  }
  .tag {
    display: inline-block;
    border: 0.75pt solid #222222;
    background: #f5f5f5;
    color: #111111;
    font-size: 7pt;
    font-weight: 700;
    padding: 1px 4px;
    white-space: nowrap;
  }
  .figure-box {
    border: 0.75pt solid #444444;
    padding: 5px 7px;
    background: #ffffff;
  }
  .figure-caption {
    font-size: 7.6pt;
    color: #333333;
    margin-top: 3px;
    text-align: center;
  }
  .mono-img {
    filter: grayscale(100%) contrast(1.16);
    width: 100%;
    display: block;
    margin: 0 auto;
  }
  .cirkit-wrap img {
    max-height: 225px;
    object-fit: contain;
  }
  .grid-pcb-row {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 8px;
    align-items: start;
  }
  .grid-pcb-row img {
    max-height: 170px;
    object-fit: contain;
    border: 0.75pt solid #cccccc;
  }
  .notice-box {
    border: 1pt solid #111111;
    background: #f6f6f6;
    padding: 7px 9px;
    font-size: 8.4pt;
  }
  .checklist-ul {
    margin-left: 16px;
    font-size: 8.4pt;
  }
  .checklist-ul li {
    margin-bottom: 3px;
  }
  .footer-note {
    border-top: 0.6pt solid #999999;
    padding-top: 3px;
    display: flex;
    justify-content: space-between;
    font-size: 7.3pt;
    color: #444444;
    margin-top: auto;
  }
</style>
</head>
<body>

  <!-- HALAMAN 1: JUDUL, RINGKASAN EKSEKUTIF & ARSITEKTUR PERANGKAT -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>${APPROVAL_DOC_MEMO.hardwareRef} · ${APPROVAL_DOC_MEMO.dateLabel}</span>
      </div>
      <h1>${APPROVAL_DOC_MEMO.title}</h1>
      <div class="doc-recipient"><strong>Ditujukan Kepada:</strong> ${APPROVAL_DOC_MEMO.audience}</div>
    </div>

    <div>
      <h2>1. Ringkasan Eksekutif &amp; Tujuan Uji Coba</h2>
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
            <th style="width: 28%;">Blok Modul / Komponen</th>
            <th>Spesifikasi, Koneksi Pin &amp; Fungsi Keselamatan</th>
          </tr>
        </thead>
        <tbody>
          ${archRows}
        </tbody>
      </table>
    </div>

    <div class="footer-note">
      <span>${APPROVAL_DOC_MEMO.docCode} (Dokumen Informasi Teknis Non-Kontrak)</span>
      <span>Halaman 1 dari 3</span>
    </div>
  </section>

  <!-- HALAMAN 2: ALUR WIRING, PETA GRID PCB v2.0 & DATA PENGUJIAN (BAGIAN 1) -->
  <section class="page">
    <div class="doc-header">
      <div class="doc-meta-top">
        <span>${APPROVAL_DOC_MEMO.docCode}</span>
        <span>Skema Wiring, Tata Letak PCB v2.0 &amp; Data Hasil Uji</span>
      </div>
    </div>

    <div class="figure-box">
      ${diagramBHtml}
      <div class="figure-caption">Gambar 2: Skema aliran kabel dari dua konektor terkunci (kiri) melewati proteksi [1], buck MP1584, serta dua sakelar pemutus daya [2] dan [3] menuju ESP32 [4].</div>
    </div>

    <div class="grid-pcb-row">
      <div class="figure-box">
        <img class="mono-img" src="${pcbTopUri}" alt="Peta Grid Lubang PCB ORION v2.0 Step 2.1 Monokrom" />
        <div class="figure-caption">Gambar 3: Tata letak fisik papan matriks 70 x 50 mm (grid 24 x 18 lubang) untuk perakitan rapi dan penempatan pilar non-konduktif.</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Keterangan Tata Letak PCB v2.0</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Seluruh modul utama (MP1584, WCMCU-230, ZS-042) ditancapkan pada soket dan pilar penyangga tanpa kawat menggantung bebas.</td>
          </tr>
          <tr>
            <td>Jalur daya (+12V dan GND) masuk dari sisi kiri papan, sedangkan sinyal kontrol menuju ESP32 Base keluar melalui strip header kanan (kolom c23).</td>
          </tr>
          <tr>
            <td>Resistor R5 (10 Ohm) dan jumper bypass JP di sisi kiri atas digunakan khusus untuk menguji arus tidur aktual pada Tahap C.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <h2>3. Data Pengujian (Uji Meja/Komponen vs Target Validasi Tahap C)</h2>
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

    <div class="footer-note">
      <span>${APPROVAL_DOC_MEMO.docCode} (Dokumen Informasi Teknis Non-Kontrak)</span>
      <span>Halaman 2 dari 3</span>
    </div>
  </section>

  <!-- HALAMAN 3: LANJUTAN TABEL PENGUJIAN & MATRIKS MITIGASI RISIKO -->
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
        <li>Menguji ulang keluaran regulator MP1584 tanpa beban pada tegangan input <strong>12,6 V</strong> dan <strong>+/- 14 V</strong> menggunakan PSU berbatas arus awal <strong>100 mA</strong>.</li>
        <li>Menjalankan pemeriksaan kontinuitas serta isolasi penuh antar-jalur PCB dalam kondisi tanpa modul dan tanpa daya sebelum perakitan akhir.</li>
        <li>Mengukur ulang tegangan gerbang (<strong>Vgs</strong>) Q2 saat aktif pada prototipe v2.0 (target <strong>-7,6 V</strong> di 11,9 V dan <strong>-9,1 V</strong> di 14,4 V), mengukur arus deep sleep aktual (<strong>E5</strong>), dan melakukan kalibrasi ADC 4-titik.</li>
        <li>Memastikan kepatuhan prosedur <strong>H8</strong> selama pengujian bengkel (suplai 12V dan kabel USB pemrograman tidak pernah dihubungkan bersamaan ke ESP32 Base).</li>
      </ol>
    </div>

    <div class="footer-note">
      <span>${APPROVAL_DOC_MEMO.docCode} (Lembar Informasi Teknis Resmi - Tanpa Kolom Kontrak)</span>
      <span>Halaman 3 dari 3</span>
    </div>
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
