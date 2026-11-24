import { createFileRoute, Link } from "@tanstack/react-router";
import { Cable, CheckCircle2, Cpu, Gauge, Server, Wifi } from "lucide-react";
import { LandingWelcomeModal } from "@/components/LandingWelcomeModal";
import { OrionLogo } from "@/components/hmi/OrionLogo";
import { Button } from "@/components/ui/button";
import { requestAppFullscreen } from "@/hooks/useFullscreen";
import { cn } from "@/lib/utils";
import yard from "@/assets/yard-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ORION: Sistem Telemetri & Digital Twin Stok Kendaraan" },
      {
        name: "description",
        content:
          "ORION Telemetry Platform: Pemantauan tegangan aki 12V, data diagnostik OBD-II CAN bus, jadwal pemanasan mesin, dan pelacakan posisi unit di area gudang secara real-time.",
      },
      { property: "og:title", content: "ORION: Sistem Telemetri & Digital Twin Stok Kendaraan" },
      {
        property: "og:description",
        content:
          "Pemantauan tegangan aki 12V, data diagnostik OBD-II, jadwal pemanasan mesin, dan posisi kendaraan di area gudang.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

interface PipelineStage {
  step: string;
  stageName: string;
  domain: string;
  hardware: string;
  pinout: string;
  protocol: string;
  signals: string[];
  description: string;
  Icon: typeof Gauge;
}

const HARDWARE_PIPELINE: PipelineStage[] = [
  {
    step: "01",
    stageName: "Port OBD-II & Proteksi Input",
    domain: "HARNESS KENDARAAN",
    hardware: "Konektor J1962 16-Pin + Fuse 500mA/1A + P6KE18A / SMBJ15A TVS",
    pinout: "J1 (c2r1-r4): GND (W3), CANL (W7), CANH (W4), +12V_F (W9)",
    protocol: "SAE J1962 / ISO 15031 + Shunt R5 10Ω / JP",
    signals: ["12V Baterai Mentah (11.0V - 14.4V)", "CAN-H & CAN-L Diferensial"],
    description:
      "Tersambung langsung ke port OBD-II lewat kabel crimp JST-XH tanpa memotong atau mengupas kabel asli mobil. Dioda 1N5819 menahan arus terbalik, TVS meredam lonjakan tegangan, dan shunt R5 / jumper JP dipakai untuk mengecek arus tidur.",
    Icon: Cable,
  },
  {
    step: "02",
    stageName: "Pembagi Tegangan & Sakelar Daya",
    domain: "RANGKAIAN DEPAN",
    hardware: "AO3401A (S-D-G) + 2N3904 + WCMCU-230 + MP1584",
    pinout: "Header 1x14 c23 (12 Pin Aktif): GPIO27 (ADC), GPIO26 (CAN), GPIO34",
    protocol: "Pembagi Tegangan R1/R2 (PCB v1.0 300k/68k · v2.0 100k/27k)",
    signals: ["Pulsa Ukur 40ms", "Arus Tidur Shunt < 500 µA", "Regulasi 3.3V Fix"],
    description:
      "Pembagi tegangan 100k/27k diputus fisik oleh MOSFET Q2 AO3401A saat ESP32 masuk mode tidur agar aki tidak tersedot, dan hanya aktif sesaat (40 ms) ketika membaca tegangan aki lewat ADC.",
    Icon: Gauge,
  },
  {
    step: "03",
    stageName: "Pengolahan Data & Memori Cadangan",
    domain: "MODUL UTAMA",
    hardware: "ESP32-WROOM-32D Dual-Core + DS3231SN RTC",
    pinout: "I2C SDA (GPIO21) / SCL (GPIO22), CAN TX/RX",
    protocol: "ISO 15765-4 CAN (11-bit / 500 kbps)",
    signals: [
      "PID 010C Putaran Mesin (RPM)",
      "PID 0105 Suhu Coolant",
      "2.020 Slot Memori (20 RTC + 2.000 Flash)",
    ],
    description:
      "Membaca putaran mesin dan suhu coolant saat kunci kontak menyala. Ketika sinyal Wi-Fi terputus, memori dua lapis menyimpan hingga 20 data di RTC SRAM dan 2.000 data di LittleFS lalu mengirimkannya saat tersambung kembali.",
    Icon: Cpu,
  },
  {
    step: "04",
    stageName: "Pengiriman Nirkabel Wi-Fi Gudang",
    domain: "JARINGAN WI-FI",
    hardware: "Transceiver Wi-Fi 2.4 GHz 802.11 b/g/n",
    pinout: "AP Gateway (AP-GUDANG-01, Channel 11)",
    protocol: "WPA2-PSK Enterprise / HTTP JSON",
    signals: ["RSSI -40 dBm s/d -85 dBm", "Kirim Tiap 300s (Cepat 10s)"],
    description:
      "Perangkat bangun secara berkala dari mode tidur untuk mengirim pembaruan status dalam format JSON ke AP gudang. Perpindahan lokasi baru dicatat setelah 3 kali gagal sambung berturut-turut.",
    Icon: Wifi,
  },
  {
    step: "05",
    stageName: "Server Data & Tampilan Dashboard",
    domain: "SERVER & DASHBOARD",
    hardware: "MySQL Server (dipo_telemetry) + Dashboard Web",
    pinout: "Endpoint simpan_data.php & get_data.php",
    protocol: "Sinkronisasi REST JSON Dua Arah",
    signals: [
      "Peta Kelistrikan & Sensor",
      "Antrean Pemanasan Mesin",
      "Pembaruan Setelan Jarak Jauh",
    ],
    description:
      "Server menyimpan riwayat bacaan ke basis data MySQL, memperbarui peta kelistrikan tiap unit, melacak posisi bay parkir, dan menampilkan peringatan saat tegangan aki turun di bawah batas.",
    Icon: Server,
  },
];

interface BatterySopTier {
  level: string;
  voltageRange: string;
  tone: "emerald" | "amber" | "crimson";
  statusText: string;
  sampleBay: string;
  sampleModel: string;
  sampleVoltage: string;
  shuntCurrent: string;
  sopProcedure: string;
}

const BATTERY_SOP_MATRIX: BatterySopTier[] = [
  {
    level: "Tier 1: Normal",
    voltageRange: "≥ 12.40 V",
    tone: "emerald",
    statusText: "Kondisi Sehat",
    sampleBay: "Bay A-01",
    sampleModel: "Pajero Sport Dakar 4x4",
    sampleVoltage: "12.60 V",
    shuntCurrent: "410 µA",
    sopProcedure:
      "Siap siaga pasif dengan pengecekan berkala 14 hari. Kondisi baterai mencukupi untuk serah terima PDI.",
  },
  {
    level: "Tier 2: Peringatan",
    voltageRange: "11.80 V s/d 12.39 V",
    tone: "amber",
    statusText: "Tegangan Mulai Turun",
    sampleBay: "Bay A-04",
    sampleModel: "Xforce Ultimate CVT",
    sampleVoltage: "12.18 V",
    shuntCurrent: "440 µA",
    sopProcedure:
      "Tanda kuning muncul di dashboard. Unit dijadwalkan untuk pemanasan mesin dalam 48 jam ke depan.",
  },
  {
    level: "Tier 3: Kritis",
    voltageRange: "< 11.80 V",
    tone: "crimson",
    statusText: "Perlu Pemanasan Segera",
    sampleBay: "Bay B-02",
    sampleModel: "Xpander Cross Elite",
    sampleVoltage: "11.65 V",
    shuntCurrent: "490 µA",
    sopProcedure:
      "Peringatan merah aktif. Unit diprioritaskan untuk pemanasan mesin minimal 10 menit (pengisian alternator >= 13,5 V).",
  },
];

const EDGE_FAILSAFE_SPECS = [
  {
    param: "Memori Cadangan Offline",
    val: "2.020 Slot",
    sub: "20 RTC SRAM + 2.000 LittleFS",
    desc: "Menyimpan data saat kendaraan berada di area tanpa sinyal Wi-Fi gudang agar riwayat catatan tidak hilang.",
  },
  {
    param: "Toleransi Hilang Sinyal",
    val: "3 Kali Gagal",
    sub: "15 Menit (Interval 300s)",
    desc: "Menahan perubahan status hingga 3 siklus kirim gagal beruntun sebelum kendaraan ditandai keluar area.",
  },
  {
    param: "Kalibrasi Pembacaan Aki",
    val: "±0.02 V Akurasi",
    sub: "Regresi Linear OLS (SOP C.1)",
    desc: "Rumus V_bat = ADC_raw × cal_slope + cal_offset disesuaikan per unit untuk mengoreksi selisih toleransi resistor.",
  },
];

const SOP_TONE_STYLES: Record<
  "emerald" | "amber" | "crimson",
  { text: string; led: string; badge: string }
> = {
  emerald: {
    text: "text-emerald",
    led: "text-emerald",
    badge: "border-emerald/45 text-emerald bg-emerald/12",
  },
  amber: {
    text: "text-amber",
    led: "text-amber",
    badge: "border-amber/45 text-amber bg-amber/12",
  },
  crimson: {
    text: "text-crimson",
    led: "text-crimson",
    badge: "border-crimson/45 text-crimson bg-crimson/12",
  },
};

const FEATURES = [
  "Peta kelistrikan dan sensor tiap kendaraan dengan status voltase per bay",
  "Daftar prioritas pemanasan mesin agar penurunan aki terdeteksi lebih awal",
  "Catatan riwayat keluar-masuk area parkir dan grafik tegangan 24 jam",
  "Bisa dijalankan dengan data simulasi lokal maupun terhubung langsung ke MySQL API",
];

function Landing() {
  const handleOpenDashboard = () => {
    void requestAppFullscreen();
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-crimson/30">
      {/* Sticky Header (Sole backdrop-blur element on Landing Page) */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
          <Link
            to="/"
            className="flex min-h-[44px] items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Beranda ORION Telemetry"
          >
            <OrionLogo variant="icon" className="h-8 w-8 shrink-0" />
            <div className="leading-tight">
              <span className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                ORION
              </span>
              <span className="hidden sm:inline-block text-xs text-muted-foreground border-l border-border/80 ml-2.5 pl-2.5">
                Pemantauan Baterai &amp; Telemetri Stock Yard
              </span>
            </div>
          </Link>

          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-5 text-xs text-muted-foreground"
          >
            <a
              href="#alur"
              className="inline-flex min-h-[44px] items-center px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cara Kerja
            </a>
            <a
              href="#metrik"
              className="inline-flex min-h-[44px] items-center px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Batas Tegangan
            </a>
            <a
              href="#operasional"
              className="inline-flex min-h-[44px] items-center px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Operasional
            </a>
            <a
              href="/docs/"
              className="inline-flex min-h-[44px] items-center px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Dokumentasi
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button
              asChild
              size="sm"
              className="min-h-[44px] md:min-h-[38px] px-4 text-xs font-medium bg-foreground hover:bg-foreground/90 text-background rounded-[2px] transition-colors"
            >
              <Link to="/dashboard" onClick={handleOpenDashboard}>
                Buka Dashboard
              </Link>
            </Button>
          </div>
        </div>
        <nav
          aria-label="Navigasi bagian seluler"
          className="flex md:hidden items-center justify-around border-t border-border/70 px-4 text-xs text-muted-foreground"
        >
          <a
            href="#alur"
            className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cara Kerja
          </a>
          <a
            href="#metrik"
            className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Batas Tegangan
          </a>
          <a
            href="#operasional"
            className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Operasional
          </a>
          <a
            href="/docs/"
            className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Dokumentasi
          </a>
        </nav>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative isolate flex py-14 sm:py-16 md:min-h-[82dvh] items-center md:items-end overflow-hidden md:pb-20 md:pt-24">
          <img
            src={yard}
            alt="Armada SUV Mitsubishi di stock yard Dipo pada malam hari"
            width={1920}
            height={1088}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 -z-10 h-full w-full object-cover object-[65%_center]"
          />
          {/* Layered Scrim for High Typography Contrast */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/90 to-background/45" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_25%_65%,_rgba(14,17,22,0.95)_0%,_rgba(14,17,22,0.72)_60%,_transparent_100%)]" />

          <div className="mx-auto w-full max-w-6xl px-5">
            <h1 className="max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl text-foreground">
              Sistem Telemetri &amp; Pemantauan Stok Kendaraan
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/90 md:text-base">
              Memantau tegangan aki 12V, membaca data diagnostik OBD-II CAN bus, menyusun antrean
              pemanasan mesin, dan melacak posisi unit di area gudang secara langsung.
            </p>

            {/* Structured Technical Specification Strip */}
            <div className="mt-6 inline-flex flex-wrap items-center divide-y sm:divide-y-0 sm:divide-x divide-border/80 rounded-[2px] border border-border bg-card/90 p-1 text-xs">
              <div className="px-3 py-1 font-mono text-xs text-foreground">
                <span className="text-muted-foreground mr-1.5">CAN:</span>ISO 15765-4 500k
              </div>
              <div className="px-3 py-1 font-mono text-xs text-foreground">
                <span className="text-muted-foreground mr-1.5">Sensing:</span>High-Side AO3401A
              </div>
              <div className="px-3 py-1 font-mono text-xs text-foreground">
                <span className="text-muted-foreground mr-1.5">Buffer:</span>DS3231SN RTC
              </div>
              <div className="px-3 py-1 font-mono text-xs text-foreground">
                <span className="text-muted-foreground mr-1.5">Tidur:</span>&lt; 500 µA
              </div>
            </div>

            {/* Primary launch action + Secondary pipeline anchor + Mode capability spec */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="min-h-[44px] px-6 font-medium bg-foreground hover:bg-foreground/90 text-background rounded-[2px] transition-colors"
              >
                <Link to="/dashboard" onClick={handleOpenDashboard}>
                  Buka Dashboard
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-[44px] px-5 font-medium border-border bg-card/95 text-foreground hover:bg-card rounded-[2px] transition-colors"
              >
                <a href="#alur">Lihat Cara Kerja</a>
              </Button>
              <div className="flex min-h-[44px] items-center gap-1.5 panel px-3.5 py-2">
                <span className="num text-xs text-foreground font-medium">Live MySQL API</span>
                <span className="text-xs text-muted-foreground">· Memori 2.020 Slot</span>
              </div>
            </div>
          </div>
        </section>

        {/* Hardware & Network Architecture: Data Flow Pipeline */}
        <section id="alur" className="border-t border-border bg-background py-12 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-border">
              <div className="max-w-2xl">
                <span className="label-hmi text-muted-foreground">Alur Perangkat &amp; Data</span>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
                  Alur Pengambilan Data dari Kendaraan ke Dashboard
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Urutan pembacaan data mulai dari port OBD-II di kendaraan, pengolahan di modul
                  ESP32, pengiriman lewat Wi-Fi gudang, hingga tampil di layar pemantauan.
                </p>
              </div>
              <div className="panel px-3.5 py-2.5 bg-card num text-xs text-foreground shrink-0">
                J1962 -&gt; AO3401A -&gt; ESP32 -&gt; 2.4GHz -&gt; MySQL
              </div>
            </div>

            {/* 5-Stage Interconnected Hardware Flow Cards */}
            <div className="mt-8 md:mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {HARDWARE_PIPELINE.map((p) => {
                const Icon = p.Icon;
                const isCoreUnit = p.step === "03";
                return (
                  <div
                    key={p.step}
                    className={cn(
                      "panel p-4 flex flex-col justify-between relative group transition-colors duration-200",
                      isCoreUnit
                        ? "border-foreground/70 bg-card ring-1 ring-foreground/25 lg:-translate-y-1.5"
                        : "hover:border-foreground/60",
                    )}
                  >
                    <div>
                      {/* Stage Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-border/80">
                        <div className="flex items-center gap-1.5">
                          <span className="num text-xs font-bold text-foreground">
                            {p.step} / 05
                          </span>
                          {isCoreUnit && (
                            <span className="rounded-[2px] border border-border bg-foreground/10 px-1.5 py-0.5 num text-[11px] font-semibold uppercase text-foreground">
                              Edge Node
                            </span>
                          )}
                        </div>
                        <span className="label-hmi text-[11px] text-muted-foreground">
                          {p.domain}
                        </span>
                      </div>

                      {/* Stage Title & Icon */}
                      <div className="mt-3.5 flex items-center gap-2">
                        <div
                          className={cn(
                            "rounded-[2px] p-1.5 border shrink-0",
                            isCoreUnit
                              ? "bg-foreground/10 border-foreground/50 text-foreground"
                              : "bg-secondary border-border text-foreground",
                          )}
                        >
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-foreground leading-snug">
                          {p.stageName}
                        </h3>
                      </div>

                      {/* Hardware & Pinout Callout */}
                      <div className="mt-3 rounded-[2px] bg-secondary/80 border border-hairline p-2.5 text-[11px] space-y-1">
                        <div
                          className="num font-medium text-foreground truncate"
                          title={p.hardware}
                        >
                          {p.hardware}
                        </div>
                        <div
                          className="num text-muted-foreground text-[11px] truncate"
                          title={p.pinout}
                        >
                          {p.pinout}
                        </div>
                      </div>

                      {/* Signals Bullet List */}
                      <div className="mt-3 space-y-1">
                        {p.signals.map((sig) => (
                          <div
                            key={sig}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          >
                            <span
                              aria-hidden="true"
                              className="h-1 w-1 rounded-full bg-muted-foreground shrink-0"
                            />
                            <span className="truncate">{sig}</span>
                          </div>
                        ))}
                      </div>

                      {/* Description */}
                      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                        {p.description}
                      </p>
                    </div>

                    {/* Stage Footer: Protocol */}
                    <div className="mt-4 pt-3 border-t border-border/70 flex items-center justify-between text-[11px]">
                      <span className="num text-muted-foreground">{p.protocol}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Signal Trace Bus Strip */}
            <div className="mt-6 panel p-4 bg-card border border-border">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 num text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-hmi text-[11px] text-muted-foreground">JALUR DATA:</span>
                  <span className="text-foreground font-medium">OBD-II Pin 16 (12V)</span>
                  <span className="text-muted-foreground font-mono">
                    --[Fuse 500mA/1A &amp; TVS]--&gt;
                  </span>
                  <span className="text-foreground font-medium">AO3401A (Pulsa 40ms)</span>
                  <span className="text-muted-foreground font-mono">--[ADC Pin 34]--&gt;</span>
                  <span className="text-foreground font-medium">ESP32 &amp; DS3231</span>
                  <span className="text-muted-foreground font-mono">--[Wi-Fi 802.11n]--&gt;</span>
                  <span className="text-foreground font-medium">AP-GUDANG-01</span>
                  <span className="text-muted-foreground font-mono">--[REST API]--&gt;</span>
                  <span className="text-foreground font-medium">MySQL &amp; Dashboard</span>
                </div>
                <div className="text-muted-foreground text-xs shrink-0">
                  SOP Blueprint v3.3, Firmware v1.6.0
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Operating Thresholds: Battery SOP Matrix */}
        <section id="metrik" className="border-y border-border bg-card/70 py-12 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-3xl pb-8 border-b border-border">
              <span className="label-hmi text-muted-foreground">Acuan Kondisi Aki</span>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
                Batas Tegangan Aki &amp; Panduan Penanganan
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Klasifikasi status tegangan aki 12V untuk inspeksi stok gudang (toleransi kalibrasi
                ±0,02 V). Angka kendaraan di bawah ini adalah contoh acuan skenario pengecekan,
                bukan pembacaan unit yang sedang terpasang.
              </p>
            </div>

            {/* Matrix Table */}
            <div className="mt-8 overflow-hidden rounded-[2px] border border-border bg-card">
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3.5 border-b border-border bg-secondary/70 text-[11px] font-semibold tracking-wider text-foreground uppercase font-display">
                <div className="col-span-3">Tingkat &amp; Batas Voltase</div>
                <div className="col-span-3">Contoh Skenario Acuan</div>
                <div className="col-span-2">Arus Tidur (Shunt 10Ω)</div>
                <div className="col-span-4">Tindakan Penanganan &amp; PDI</div>
              </div>

              <div className="divide-y divide-border/70">
                {BATTERY_SOP_MATRIX.map((row) => {
                  const styles = SOP_TONE_STYLES[row.tone];
                  return (
                    <div
                      key={row.level}
                      className="p-5 lg:px-5 lg:py-4.5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start lg:items-center hover:bg-secondary/40 transition-colors"
                    >
                      {/* Status Level & Voltage Range */}
                      <div className="lg:col-span-3">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                            {row.level}
                          </span>
                          <span
                            className={`text-[11px] num font-medium px-1.5 py-0.5 rounded-[2px] border ${styles.badge}`}
                          >
                            {row.statusText}
                          </span>
                        </div>
                        <div className={`mt-1 num text-base font-bold ${styles.text}`}>
                          {row.voltageRange}
                        </div>
                      </div>

                      {/* SOP Scenario Reference */}
                      <div className="lg:col-span-3 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/60">
                        <div className="text-[11px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
                          Contoh Skenario:
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="num font-semibold text-foreground text-xs">
                            {row.sampleBay}
                          </span>
                          <span className="text-muted-foreground text-xs">/</span>
                          <span className="text-xs text-foreground font-medium truncate">
                            {row.sampleModel}
                          </span>
                        </div>
                        <div className="num text-xs text-muted-foreground mt-0.5">
                          Contoh Tegangan:{" "}
                          <span className={`font-semibold ${styles.text}`}>
                            {row.sampleVoltage}
                          </span>
                        </div>
                      </div>

                      {/* Shunt Sleep Current */}
                      <div className="lg:col-span-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/60">
                        <div className="text-[11px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
                          Arus Tidur:
                        </div>
                        <div className="num text-xs font-medium text-foreground">
                          {row.shuntCurrent}
                        </div>
                        <div className="num text-xs text-muted-foreground">
                          Batas Acuan: &lt; 500 µA
                        </div>
                      </div>

                      {/* Field SOP Action */}
                      <div className="lg:col-span-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/60">
                        <div className="text-[11px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
                          Tindakan Penanganan:
                        </div>
                        <p className="text-[13px] leading-relaxed text-muted-foreground">
                          {row.sopProcedure}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unified Horizontal Spec Strip */}
            <dl className="mt-6 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border rounded-[2px] border border-border bg-background/85">
              {EDGE_FAILSAFE_SPECS.map((spec) => (
                <div key={spec.param} className="p-4 sm:p-5">
                  <dt className="label-hmi text-[11px] text-muted-foreground">{spec.param}</dt>
                  <dd className="mt-1.5 flex flex-wrap items-baseline gap-2">
                    <span className="num text-xl font-bold text-foreground">{spec.val}</span>
                    <span className="num text-xs text-muted-foreground">({spec.sub})</span>
                  </dd>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {spec.desc}
                  </p>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Operations & Workspace Launcher */}
        <section id="operasional" className="py-12 md:py-24">
          <div className="mx-auto max-w-6xl px-5 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-center">
            <div className="md:col-span-7">
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
                Tampilan Pemantauan untuk Tim Gudang &amp; PDI
              </h2>
              <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
                Membantu memantau kondisi aki unit stok secara berkala agar penurunan tegangan
                terdeteksi lebih awal sebelum jadwal pengiriman kendaraan.
              </p>

              <div className="mt-6 space-y-3">
                {FEATURES.map((feat) => (
                  <div key={feat} className="flex items-start gap-3">
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 text-emerald shrink-0"
                    />
                    <span className="text-sm text-foreground">{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="panel p-6 sm:p-8 flex flex-col justify-between gap-6 border-hairline bg-card">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <span className="label-hmi text-[11px]">Dashboard Pemantauan</span>
                    <span className="num text-xs font-semibold text-emerald">
                      Mode Live &amp; Simulasi
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-medium text-foreground">
                    Masuk ke Halaman Pemantauan Unit
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Lihat peta kelistrikan tiap kendaraan, daftar antrean pemanasan mesin, grafik
                    tegangan 24 jam, serta pengaturan kalibrasi alat.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <Button
                    asChild
                    className="min-h-[44px] w-full justify-center px-5 text-xs font-semibold uppercase tracking-wider bg-foreground hover:bg-foreground/90 text-background rounded-[2px] transition-colors"
                  >
                    <Link to="/dashboard" onClick={handleOpenDashboard}>
                      Buka Dashboard
                    </Link>
                  </Button>
                  <p className="num text-center text-xs text-muted-foreground">
                    Mendukung mode Live MySQL API dan data simulasi lokal.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-10">
        <div className="mx-auto max-w-6xl px-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <OrionLogo variant="icon" className="h-6 w-6 shrink-0" />
              <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                ORION
              </span>
              <span className="num text-xs text-muted-foreground">
                v3.3 (Telemetri Aki &amp; Stock Yard)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span>Pemantauan Stock Yard &amp; PDI</span>
              <span className="hidden sm:inline-block text-muted-foreground">/</span>
              <a
                href="#alur"
                className="inline-flex min-h-[44px] items-center px-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cara Kerja
              </a>
              <span className="hidden sm:inline-block text-muted-foreground">/</span>
              <Link
                to="/dashboard"
                className="inline-flex min-h-[44px] items-center px-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Dashboard
              </Link>
            </div>
          </div>
          <p className="border-t border-border/70 pt-3 text-center sm:text-left num text-xs text-muted-foreground">
            Proyek ORION (Magang D4 TRPL TI: Sistem Pemantauan Stock Yard). Perangkat dan dashboard
            independen; bukan produk resmi dari dan tidak berafiliasi dengan Mitsubishi Motors.
          </p>
        </div>
      </footer>
      <LandingWelcomeModal />
    </div>
  );
}
