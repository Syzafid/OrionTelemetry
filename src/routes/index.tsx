import { createFileRoute, Link } from "@tanstack/react-router";
import { Cable, CheckCircle2, Cpu, Gauge, Server, Wifi } from "lucide-react";
import { OrionLogo } from "@/components/hmi/OrionLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import yard from "@/assets/yard-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ORION: Sistem Telemetri & Digital Twin Stok Kendaraan" },
      {
        name: "description",
        content:
          "ORION Telemetry Platform: Pengawasan voltase baterai 12V, parameter OBD-II CAN bus, antrean prioritas pemanasan mesin, dan pelacakan fisik stock yard real-time.",
      },
      { property: "og:title", content: "ORION: Sistem Telemetri & Digital Twin Stok Kendaraan" },
      {
        property: "og:description",
        content: "Battery voltage, OBD-II data and yard presence for every stock unit.",
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
    hardware: "Konektor J1962 16-Pin + 1A Fuse + SMBJ15A TVS",
    pinout: "Pin 16 (12V BATT), Pin 4/5 (GND), Pin 6/14 (CAN)",
    protocol: "SAE J1962 / ISO 15031",
    signals: ["12V Baterai Mentah (11.0V - 14.4V)", "CAN-H & CAN-L Diferensial"],
    description:
      "Mengambil daya langsung dari aki kendaraan tanpa memotong kabel asli. Dilengkapi dioda 1N5819 proteksi polaritas terbalik dan TVS 15V peredam lonjakan induktif alternator.",
    Icon: Cable,
  },
  {
    step: "02",
    stageName: "Pengkondisian Sinyal & Power Gate",
    domain: "FRONT-END ANALOG",
    hardware: "AO3401A P-MOSFET + SN65HVD230 + MP1584 Buck",
    pinout: "GPIO27 (ADC Switch), GPIO26 (CAN Gate), ADC Pin 34",
    protocol: "Voltage Divider R1/R2 (PCB v1.0 300k/68k · v2.0 100k/27k)",
    signals: ["Pulsa Settling 40ms", "Arus Tidur Shunt < 500 µA", "Regulasi 3.3V Locked"],
    description:
      "Sirkuit pembagi tegangan diputus secara fisik via transistor high-side saat ESP32 tidur. Diberi pulsa 40ms saat sampling ADC agar aki tidak terkuras selama parkir.",
    Icon: Gauge,
  },
  {
    step: "03",
    stageName: "Edge Processing & Buffer Presisi",
    domain: "KONTROLER EDGE",
    hardware: "ESP32-WROOM-32D Dual-Core + DS3231SN RTC",
    pinout: "I2C SDA (GPIO21) / SCL (GPIO22), CAN TX/RX",
    protocol: "ISO 15765-4 CAN (11-bit / 500 kbps)",
    signals: [
      "PID 010C RPM Mesin",
      "PID 0105 Suhu Coolant",
      "2.020 Slot Buffer (20 RTC + 2.000 LittleFS)",
    ],
    description:
      "Membaca putaran mesin dan suhu coolant saat kontak aktif. Saat Wi-Fi blind-spot, buffer dua lapis menyimpan 20 rekaman RTC SRAM dan 2.000 rekaman LittleFS sebelum burst sync.",
    Icon: Cpu,
  },
  {
    step: "04",
    stageName: "Telemetri RF & Access Point Gudang",
    domain: "TELEMETRI NIRKABEL",
    hardware: "Transceiver Wi-Fi 2.4 GHz 802.11 b/g/n",
    pinout: "AP Gateway (AP-GUDANG-01, Channel 11)",
    protocol: "WPA2-PSK Enterprise / HTTP JSON Payload",
    signals: ["RSSI -40 dBm s/d -85 dBm", "Heartbeat 300s (Fast Poll 10s)"],
    description:
      "Node bangun dari deep-sleep berkala untuk mengirim paket heartbeat JSON ke AP gudang. Mendukung debounce 3 kali gagal sebelum status keluar divalidasi.",
    Icon: Wifi,
  },
  {
    step: "05",
    stageName: "Database Ingest & Konsol HMI",
    domain: "SERVER & WORKSPACE",
    hardware: "MySQL Server (dipo_telemetry) + TanStack HMI",
    pinout: "Endpoint simpan_data.php & get_data.php",
    protocol: "Two-Way JSON REST Synchronization",
    signals: ["Topologi Kelistrikan & Transduser", "Antrean Pemanasan Mesin", "Remote Config ACK"],
    description:
      "Server mencatat riwayat telemetri ke database relasional, memperbarui topologi sasis, memetakan bay parkir, dan memicu peringatan jika voltase aki di bawah ambang kritis.",
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
      "Standby pasif. Pemeriksaan berkala 14 hari. Siap serah terima PDI tanpa perlu pemanasan alternator.",
  },
  {
    level: "Tier 2: Pre-Alert",
    voltageRange: "11.80 V s/d 12.39 V",
    tone: "amber",
    statusText: "Peringatan Drop",
    sampleBay: "Bay A-04",
    sampleModel: "Xforce Ultimate CVT",
    sampleVoltage: "12.18 V",
    shuntCurrent: "440 µA",
    sopProcedure:
      "Status kuning pada konsol. Masuk antrean pemanasan mesin preventif dalam tenggat 48 jam ke depan.",
  },
  {
    level: "Tier 3: Kritis",
    voltageRange: "< 11.80 V",
    tone: "crimson",
    statusText: "Intervensi Darurat",
    sampleBay: "Bay B-02",
    sampleModel: "Xpander Cross Elite",
    sampleVoltage: "11.65 V",
    shuntCurrent: "490 µA",
    sopProcedure:
      "Alarm merah aktif otomatis. Wajib dispatch staf untuk pemanasan mesin via alternator 13.5V minimal 15 menit.",
  },
];

const EDGE_FAILSAFE_SPECS = [
  {
    param: "Buffer Memori Offline",
    val: "2.020 Slot",
    sub: "20 RTC SRAM + 2.000 LittleFS",
    desc: "Menyimpan paket telemetri saat kendaraan di blind-spot Wi-Fi gudang agar riwayat log tidak hilang.",
  },
  {
    param: "Debounce Yard Presence",
    val: "3 Siklus Miss",
    sub: "15 Menit (Interval 300s)",
    desc: "Toleransi paket gagal berturut-turut sebelum sistem memvalidasi kendaraan telah berpindah posisi.",
  },
  {
    param: "Kalibrasi Regresi ADC",
    val: "±0.02 V Akurasi",
    sub: "Linear OLS (SOP C.1)",
    desc: "Formula V_bat = ADC_raw × cal_slope + cal_offset terkalibrasi per-node untuk kompensasi toleransi resistor.",
  },
];

const SOP_TONE_STYLES: Record<
  "emerald" | "amber" | "crimson",
  { text: string; led: string; badge: string }
> = {
  emerald: {
    text: "text-emerald",
    led: "text-emerald",
    badge: "border-emerald/30 text-emerald bg-emerald/10",
  },
  amber: {
    text: "text-amber",
    led: "text-amber",
    badge: "border-amber/30 text-amber bg-amber/10",
  },
  crimson: {
    text: "text-crimson",
    led: "text-crimson",
    badge: "border-crimson/30 text-crimson bg-crimson/10",
  },
};

const FEATURES = [
  "Topologi kelistrikan & transduser interaktif dengan indikator status voltase per-bay",
  "Antrean pemanasan mesin otomatis untuk mencegah aki drop saat serah terima",
  "Pencatatan riwayat pergerakan kendaraan dan log telemetri 24 jam",
  "Dukungan dua mode: Simulator Sandbox lokal dan MySQL REST Live API",
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-crimson/30">
      {/* Sticky Header (Sole backdrop-blur element on Landing Page) */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
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
              <span className="hidden sm:inline-block text-[11px] text-muted-foreground border-l border-border/70 ml-2.5 pl-2.5">
                Sistem Monitoring Baterai &amp; Telemetri Stock Yard
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
              Alur Sistem
            </a>
            <a
              href="#metrik"
              className="inline-flex min-h-[44px] items-center px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ambang Batas
            </a>
            <a
              href="#operasional"
              className="inline-flex min-h-[44px] items-center px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Operasional
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button
              asChild
              size="sm"
              className="min-h-[44px] md:min-h-[38px] px-4 text-xs font-medium bg-foreground hover:bg-foreground/90 text-background rounded-[2px] transition-colors"
            >
              <Link to="/dashboard">Buka Konsol HMI</Link>
            </Button>
          </div>
        </div>
        <nav
          aria-label="Navigasi bagian seluler"
          className="flex md:hidden items-center justify-around border-t border-border/60 px-4 text-xs text-muted-foreground"
        >
          <a
            href="#alur"
            className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Alur Sistem
          </a>
          <a
            href="#metrik"
            className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ambang Batas
          </a>
          <a
            href="#operasional"
            className="inline-flex min-h-[44px] items-center px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Operasional
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
          {/* Layered Scrim for 100% Crisp Typography Contrast */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/85 to-background/30" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_25%_65%,_rgba(15,17,21,0.92)_0%,_rgba(15,17,21,0.58)_60%,_transparent_100%)]" />

          <div className="mx-auto w-full max-w-6xl px-5">
            <h1 className="max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl text-foreground">
              Sistem Telemetri &amp; Digital Twin Stok Kendaraan
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Pengawasan voltase baterai 12V, pembacaan parameter OBD-II CAN bus, antrean prioritas
              pemanasan mesin, dan pelacakan unit fisik stock yard secara real-time.
            </p>

            {/* Structured Industrial Technical Specification Strip */}
            <div className="mt-6 inline-flex flex-wrap items-center divide-y sm:divide-y-0 sm:divide-x divide-border/70 rounded-[2px] border border-border bg-card/85 p-1 text-xs">
              <div className="px-3 py-1 font-mono text-[11px] text-foreground">
                <span className="text-muted-foreground mr-1.5">CAN:</span>ISO 15765-4 500k
              </div>
              <div className="px-3 py-1 font-mono text-[11px] text-foreground">
                <span className="text-muted-foreground mr-1.5">Sensing:</span>High-Side AO3401A
              </div>
              <div className="px-3 py-1 font-mono text-[11px] text-foreground">
                <span className="text-muted-foreground mr-1.5">Buffer:</span>DS3231SN RTC
              </div>
              <div className="px-3 py-1 font-mono text-[11px] text-foreground">
                <span className="text-muted-foreground mr-1.5">Tidur:</span>&lt; 500 µA
              </div>
            </div>

            {/* Primary launch action + Secondary signal pipeline anchor + Mode capability spec */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="min-h-[44px] px-6 font-medium bg-foreground hover:bg-foreground/90 text-background rounded-[2px] transition-colors"
              >
                <Link to="/dashboard">Luncurkan Workbench HMI</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-[44px] px-5 font-medium border-border bg-card/95 text-foreground hover:bg-card rounded-[2px] transition-colors"
              >
                <a href="#alur">Periksa Alur Sinyal</a>
              </Button>
              <div className="flex min-h-[44px] items-center gap-1.5 panel px-3.5 py-2">
                <span className="num text-xs text-foreground font-medium">Live MySQL API</span>
                <span className="text-xs text-muted-foreground">· Two-Tier 2.020 Slot</span>
              </div>
            </div>
          </div>
        </section>

        {/* Hardware & Network Architecture: Industrial Signal Flow Pipeline */}
        <section id="alur" className="border-t border-border bg-background py-12 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-border">
              <div className="max-w-2xl">
                <span className="label-hmi text-muted-foreground">
                  Arsitektur Instrumentasi &amp; Sinyal
                </span>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
                  Diagram Alur Sinyal Hardware Industri
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Arsitektur transmisi data end-to-end dari konektor fisik OBD-II kendaraan di stock
                  yard hingga HMI Topologi Sasis pada konsol server gudang.
                </p>
              </div>
              <div className="panel px-3.5 py-2.5 bg-card/60 num text-[11px] text-foreground shrink-0">
                J1962 -&gt; AO3401A -&gt; ESP32 -&gt; 2.4GHz -&gt; MySQL
              </div>
            </div>

            {/* 5-Stage Interconnected Hardware Flow Cards with Hierarchical Core Highlight */}
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
                        ? "border-foreground/60 bg-card ring-1 ring-foreground/25 lg:-translate-y-1.5"
                        : "hover:border-foreground/50",
                    )}
                  >
                    <div>
                      {/* Stage Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-border/70">
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
                              ? "bg-foreground/10 border-foreground/40 text-foreground"
                              : "bg-card border-border text-foreground",
                          )}
                        >
                          <Icon size={14} aria-hidden="true" />
                        </div>
                        <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-foreground leading-snug">
                          {p.stageName}
                        </h3>
                      </div>

                      {/* Hardware & Pinout Callout */}
                      <div className="mt-3 rounded-[2px] bg-card/70 border border-hairline p-2.5 text-[11px] space-y-1">
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
                            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
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
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {p.description}
                      </p>
                    </div>

                    {/* Stage Footer: Protocol */}
                    <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
                      <span className="num text-muted-foreground">{p.protocol}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Schematic Signal Trace Bus Strip */}
            <div className="mt-6 panel p-4 bg-card/60 border border-border">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 num text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-hmi text-[11px] text-muted-foreground">SIGNAL BUS:</span>
                  <span className="text-foreground font-medium">OBD-II Pin 16 (12V)</span>
                  <span className="text-muted-foreground font-mono">
                    --[1A Fuse &amp; TVS]--&gt;
                  </span>
                  <span className="text-foreground font-medium">AO3401A (40ms Pulse)</span>
                  <span className="text-muted-foreground font-mono">--[ADC Pin 34]--&gt;</span>
                  <span className="text-foreground font-medium">ESP32 &amp; DS3231</span>
                  <span className="text-muted-foreground font-mono">--[Wi-Fi 802.11n]--&gt;</span>
                  <span className="text-foreground font-medium">AP-GUDANG-01</span>
                  <span className="text-muted-foreground font-mono">--[REST API]--&gt;</span>
                  <span className="text-foreground font-medium">MySQL &amp; HMI Topologi</span>
                </div>
                <div className="text-muted-foreground text-[11px] shrink-0">
                  SOP Blueprint v3.3, Firmware v1.6.0
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Operating Thresholds: Yard Battery SOP Reference Matrix */}
        <section id="metrik" className="border-y border-border bg-card/60 py-12 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-3xl pb-8 border-b border-border">
              <span className="label-hmi text-muted-foreground">Standar Operasional Prosedur</span>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
                Matriks Ambang Batas Baterai &amp; Toleransi Yard
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Klasifikasi status kesehatan aki 12V berdasarkan SOP PDI Dipo Stock Yard (toleransi
                kalibrasi +/- 0,02 V). Baris di bawah adalah contoh skenario referensi SOP dan
                batasan fail-safe piggyback, bukan pembacaan armada live.
              </p>
            </div>

            {/* Matrix Table: Desktop Header & Multi-Column Rows */}
            <div className="mt-8 overflow-hidden rounded-[2px] border border-border bg-card/40">
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3.5 border-b border-border bg-card text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-display">
                <div className="col-span-3">Klasifikasi &amp; Batas Voltase</div>
                <div className="col-span-3">Contoh Skenario SOP (Referensi)</div>
                <div className="col-span-2">Arus Tidur (Shunt 10Ω)</div>
                <div className="col-span-4">Prosedur Lapangan &amp; PDI</div>
              </div>

              <div className="divide-y divide-border/60">
                {BATTERY_SOP_MATRIX.map((row) => {
                  const styles = SOP_TONE_STYLES[row.tone];
                  return (
                    <div
                      key={row.level}
                      className="p-5 lg:px-5 lg:py-4.5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start lg:items-center hover:bg-card/70 transition-colors"
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
                      <div className="lg:col-span-3 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/50">
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
                        <div className="num text-[11px] text-muted-foreground mt-0.5">
                          Contoh Referensi:{" "}
                          <span className={`font-semibold ${styles.text}`}>
                            {row.sampleVoltage}
                          </span>
                        </div>
                      </div>

                      {/* Shunt Sleep Current */}
                      <div className="lg:col-span-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/50">
                        <div className="text-[11px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
                          Arus Tidur:
                        </div>
                        <div className="num text-xs font-medium text-foreground">
                          {row.shuntCurrent}
                        </div>
                        <div className="num text-[11px] text-muted-foreground">
                          Batas SOP: &lt; 500 µA
                        </div>
                      </div>

                      {/* Field SOP Action */}
                      <div className="lg:col-span-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/50">
                        <div className="text-[11px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
                          Tindakan Lapangan:
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {row.sopProcedure}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unified Horizontal Spec Strip (Varies composition from separate card grids) */}
            <dl className="mt-6 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border rounded-[2px] border border-border bg-background/70">
              {EDGE_FAILSAFE_SPECS.map((spec) => (
                <div key={spec.param} className="p-4 sm:p-5">
                  <dt className="label-hmi text-[11px] text-muted-foreground">{spec.param}</dt>
                  <dd className="mt-1.5 flex flex-wrap items-baseline gap-2">
                    <span className="num text-xl font-bold text-foreground">{spec.val}</span>
                    <span className="num text-[11px] text-muted-foreground">({spec.sub})</span>
                  </dd>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{spec.desc}</p>
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
                Integrasi Operasional Pengawas Lapangan &amp; PDI
              </h2>
              <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
                Memastikan setiap unit Mitsubishi siap kirim ke konsumen tanpa kendala baterai drop.
                Menghubungkan node fisik dengan skema topologi kelistrikan &amp; transduser,
                diagnostik OBD-II, dan antrean pemanasan terstruktur.
              </p>

              <div className="mt-6 space-y-3">
                {FEATURES.map((feat) => (
                  <div key={feat} className="flex items-start gap-3">
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 text-muted-foreground shrink-0"
                    />
                    <span className="text-xs text-foreground">{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="panel p-6 sm:p-8 flex flex-col justify-between gap-6 border-hairline bg-card/80">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <span className="label-hmi text-[11px]">Konsol HMI Workspace</span>
                    <span className="num text-[11px] font-semibold text-emerald">
                      Mode Live &amp; Sandbox
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-medium text-foreground">
                    Akses Konsol Pengawasan Armada
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Buka workbench interaktif untuk memeriksa skema topologi kelistrikan kendaraan,
                    antrean pemanasan, log riwayat baterai 24 jam, dan konfigurasi node.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <Button
                    asChild
                    className="min-h-[44px] w-full justify-center px-5 text-xs font-semibold uppercase tracking-wider bg-foreground hover:bg-foreground/90 text-background rounded-[2px] transition-colors"
                  >
                    <Link to="/dashboard">Masuk ke HMI Workspace</Link>
                  </Button>
                  <p className="num text-center text-[11px] text-muted-foreground">
                    Kompatibel dengan MySQL Live API &amp; Simulator Sandbox.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/80 py-10">
        <div className="mx-auto max-w-6xl px-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <OrionLogo variant="icon" className="h-6 w-6 shrink-0" />
              <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                ORION
              </span>
              <span className="num text-[11px] text-muted-foreground">
                v3.3 (Sistem Telemetri &amp; PDI Stock Yard)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span>Operasional Stock Yard &amp; Telemetri PDI</span>
              <span className="hidden sm:inline-block text-muted-foreground">/</span>
              <a
                href="#alur"
                className="inline-flex min-h-[44px] items-center px-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Arsitektur
              </a>
              <span className="hidden sm:inline-block text-muted-foreground">/</span>
              <Link
                to="/dashboard"
                className="inline-flex min-h-[44px] items-center px-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Workspace
              </Link>
            </div>
          </div>
          <p className="border-t border-border/60 pt-3 text-center sm:text-left num text-[11px] text-muted-foreground">
            Proyek ORION (Magang D4 TRPL TI: Sistem Pemantauan Stock Yard). Platform telemetri
            independen; bukan produk resmi dari dan tidak berafiliasi dengan Mitsubishi Motors.
          </p>
        </div>
      </footer>
    </div>
  );
}
