import { createFileRoute, Link } from "@tanstack/react-router";
import { Cable, CheckCircle2, Cpu, Database, Radio, Server, ShieldCheck, Wifi, Zap } from "lucide-react";
import { OrionLogo } from "@/components/hmi/OrionLogo";
import { Button } from "@/components/ui/button";
import yard from "@/assets/yard-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ORION: Onboard Reporting for Inventory & Operational Notifications" },
      {
        name: "description",
        content:
          "ORION (Onboard Reporting for Inventory & Operational Notifications): Stock yard fleet telemetry, 12V battery voltage monitoring, warm-up queue, and yard presence tracking.",
      },
      { property: "og:title", content: "ORION: Onboard Reporting for Inventory & Operational Notifications" },
      { property: "og:description", content: "Battery voltage, OBD-II data and yard presence for every stock unit." },
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
  Icon: typeof Zap;
}

const HARDWARE_PIPELINE: PipelineStage[] = [
  {
    step: "01",
    stageName: "Port OBD-II & Proteksi Input",
    domain: "VEHICLE HARNESS",
    hardware: "Konektor J1962 16-Pin + 1A Fuse + SMBJ15A TVS",
    pinout: "Pin 16 (12V BATT), Pin 4/5 (GND), Pin 6/14 (CAN)",
    protocol: "SAE J1962 / ISO 15031",
    signals: ["12V Baterai Mentah (11.0V - 14.4V)", "CAN-H & CAN-L Diferensial"],
    description: "Mengambil daya langsung dari aki kendaraan tanpa memotong kabel asli. Dilengkapi dioda 1N5819 proteksi polaritas terbalik dan TVS 15V peredam lonjakan induktif alternator.",
    Icon: Cable,
  },
  {
    step: "02",
    stageName: "Pengkondisian Sinyal & Power Gate",
    domain: "ANALOG FRONT-END",
    hardware: "AO3401A P-MOSFET + SN65HVD230 + MP1584 Buck",
    pinout: "GPIO27 (ADC Switch), GPIO26 (CAN Gate), ADC Pin 34",
    protocol: "Voltage Divider R1/R2 (100kΩ / 20kΩ)",
    signals: ["Pulsa Settling 40ms", "Arus Tidur Shunt < 500 µA", "Regulasi 3.3V Locked"],
    description: "Sirkuit pembagi tegangan diputus secara fisik via transistor high-side saat ESP32 tidur. Diberi pulsa 40ms saat sampling ADC untuk memastikan tidak ada pengurasan aki selama parkir.",
    Icon: Zap,
  },
  {
    step: "03",
    stageName: "Edge Processing & Buffer Presisi",
    domain: "EDGE CONTROLLER",
    hardware: "ESP32-WROOM-32D Dual-Core + DS3231SN RTC",
    pinout: "I2C SDA (GPIO21) / SCL (GPIO22), CAN TX/RX",
    protocol: "ISO 15765-4 CAN (11-bit / 500 kbps)",
    signals: ["PID 010C RPM Mesin", "PID 0105 Suhu Coolant", "20 Snapshot Offline Buffer"],
    description: "Membaca data putaran mesin dan suhu coolant saat kontak kendaraan aktif. Jika Wi-Fi blind-spot terjadi, 20 snapshot log telemetri disimpan aman di memori non-volatile RTC.",
    Icon: Cpu,
  },
  {
    step: "04",
    stageName: "RF Telemetry & Access Point Gudang",
    domain: "WIRELESS TELEMETRY",
    hardware: "Transceiver Wi-Fi 2.4 GHz 802.11 b/g/n",
    pinout: "AP Gateway (AP-GUDANG-01, Channel 11)",
    protocol: "WPA2-PSK Enterprise / HTTP JSON Payload",
    signals: ["RSSI -40 dBm s/d -85 dBm", "Heartbeat 300s (Fast Poll 10s)"],
    description: "Node bangun dari deep-sleep setiap 5-30 menit untuk mengirimkan paket heartbeat JSON ke AP gudang. Mendukung mekanisme debounce 3 kali miss sebelum status keluar divalidasi.",
    Icon: Wifi,
  },
  {
    step: "05",
    stageName: "Database Ingest & Konsol HMI",
    domain: "SERVER & WORKSPACE",
    hardware: "MySQL Server (dipo_telemetry) + TanStack HMI",
    pinout: "Endpoint simpan_data.php & get_data.php",
    protocol: "Two-Way JSON REST Synchronization",
    signals: ["Digital Twin 3D Status", "Antrean Pemanasan Mesin", "Remote Config ACK"],
    description: "Server mencatat riwayat telemetri ke database relasional dan memperbarui digital twin 3D, memetakan unit ke bay parkir fisik, serta memicu peringatan jika voltase aki < 11.80 V.",
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
    sopProcedure: "Standby pasif. Pemeriksaan berkala 14 hari. Siap serah terima PDI tanpa perlu pemanasan alternator.",
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
    sopProcedure: "Status kuning pada konsol. Masuk antrean pemanasan mesin preventif dalam tenggat 48 jam ke depan.",
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
    sopProcedure: "Alarm merah aktif otomatis. Wajib dispatch staf untuk pemanasan mesin via alternator 13.5V minimal 15 menit.",
  },
];

const EDGE_FAILSAFE_SPECS = [
  {
    param: "Buffer Memori Offline",
    val: "20 Snapshot",
    sub: "DS3231SN RTC RAM",
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

const SOP_TONE_STYLES: Record<"emerald" | "amber" | "crimson", { text: string; led: string; badge: string }> = {
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
  "Digital Twin 3D interaktif dengan indikator status voltase per-bay",
  "Antrean pemanasan mesin otomatis untuk mencegah aki drop saat serah terima",
  "Pencatatan riwayat pergerakan kendaraan dan log telemetri 24 jam",
  "Dukungan dua mode: Simulator Sandbox lokal dan MySQL REST Live API",
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-crimson/30">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link to="/" className="flex items-center gap-3" aria-label="Beranda ORION Telemetry">
            <OrionLogo variant="icon" className="h-8 w-8 shrink-0" />
            <div className="leading-tight">
              <span className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-foreground">
                ORION
              </span>
              <span className="hidden sm:inline-block text-[11px] text-muted-foreground/80 border-l border-border/70 ml-2.5 pl-2.5">
                Onboard Reporting for Inventory &amp; Operational Notifications
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#alur" className="transition-colors hover:text-foreground">Alur Sistem</a>
            <a href="#metrik" className="transition-colors hover:text-foreground">Ambang Batas</a>
            <a href="#operasional" className="transition-colors hover:text-foreground">Operasional</a>
          </nav>

          <div className="flex items-center gap-3">
            <Button asChild size="sm" className="h-8 px-3.5 text-xs font-medium bg-crimson hover:bg-crimson/90 text-white rounded-[2px] transition-colors">
              <Link to="/dashboard">
                Buka Konsol HMI
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative isolate flex min-h-[85vh] md:min-h-[88vh] items-center md:items-end overflow-hidden pb-16 md:pb-20 pt-20">
        <img
          src={yard}
          alt="Mitsubishi SUV fleet in Dipo stock yard at night"
          width={1920}
          height={1088}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[65%_center]"
        />
        {/* Layered Scrim for 100% Crisp Typography Contrast */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/25" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_25%_65%,_rgba(15,17,21,0.92)_0%,_rgba(15,17,21,0.55)_60%,_transparent_100%)]" />

        <div className="mx-auto w-full max-w-6xl px-5">
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="h-2 w-2 rounded-full bg-crimson" />
            <span className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-foreground/90">
              ORION Telemetry Platform
            </span>
            <span className="hidden sm:inline-block text-[11px] text-muted-foreground/75 border-l border-border/70 pl-2.5 num">
              Onboard Reporting for Inventory &amp; Operational Notifications
            </span>
          </div>

          <h1 className="max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl text-foreground">
            Sistem Telemetri &amp; Digital Twin Stok Kendaraan
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Pengawasan voltase baterai 12V, pembacaan parameter OBD-II CAN bus, antrean prioritas pemanasan mesin, dan pelacakan unit fisik stock yard secara real-time.
          </p>

          {/* Quick Hardware Spec Badges */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="panel px-3 py-1 text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
              ISO 15765-4 CAN 500k
            </span>
            <span className="panel px-3 py-1 text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
              High-Side AO3401A Sensing
            </span>
            <span className="panel px-3 py-1 text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              DS3231SN RTC Buffer
            </span>
            <span className="panel px-3 py-1 text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-dim" />
              Arus Tidur &lt; 500 µA
            </span>
          </div>

          {/* Varied CTAs: Primary launch action + Secondary signal pipeline anchor + Fleet status pill */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild className="h-11 px-6 font-medium bg-crimson hover:bg-crimson/90 text-white shadow-lg shadow-crimson/25 transition-all rounded-[2px]">
              <Link to="/dashboard">
                Luncurkan Workbench HMI
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-5 font-medium border-border/80 bg-card/60 backdrop-blur text-foreground hover:bg-card rounded-[2px] transition-colors">
              <a href="#alur">
                Periksa Alur Sinyal
              </a>
            </Button>
            <div className="flex items-center gap-2 panel px-3.5 py-2.5">
              <span className="led text-emerald" />
              <span className="num text-xs text-foreground font-medium">3 Unit Terhubung</span>
              <span className="text-xs text-muted-foreground">(Bay A-01, A-04, B-02)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Hardware & Network Architecture: Industrial Signal Flow Pipeline */}
      <section id="alur" className="border-t border-border bg-background py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-border">
            <div className="max-w-2xl">
              <span className="label-hmi text-crimson">Arsitektur Instrumentasi &amp; Sinyal</span>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
                Diagram Alur Sinyal Hardware Industri
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Arsitektur transmisi data end-to-end dari konektor fisik OBD-II kendaraan di stock yard hingga visualisasi digital twin 3D pada konsol server gudang.
              </p>
            </div>
            {/* Pipeline Stage Summary Pill */}
            <div className="panel px-3.5 py-2.5 bg-card/40 flex items-center gap-2 num text-[11px] text-muted-foreground shrink-0">
              <span className="led text-emerald" />
              <span>J1962 → AO3401A → ESP32 → 2.4GHz → MySQL</span>
            </div>
          </div>

          {/* 5-Stage Interconnected Hardware Flow Cards */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {HARDWARE_PIPELINE.map((p, idx) => {
              const Icon = p.Icon;
              return (
                <div
                  key={p.step}
                  className="panel p-4 flex flex-col justify-between relative group hover:border-crimson/50 transition-colors"
                >
                  <div>
                    {/* Stage Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-border/70">
                      <span className="num text-xs font-bold text-crimson">{p.step} / 05</span>
                      <span className="label-hmi text-[9px] text-muted-foreground">{p.domain}</span>
                    </div>

                    {/* Stage Title & Icon */}
                    <div className="mt-3.5 flex items-center gap-2">
                      <div className="rounded-sm bg-card p-1.5 border border-border shrink-0">
                        <Icon size={14} className="text-foreground" />
                      </div>
                      <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-foreground leading-snug">
                        {p.stageName}
                      </h3>
                    </div>

                    {/* Hardware & Pinout Callout */}
                    <div className="mt-3 rounded-[2px] bg-card/60 border border-hairline p-2 text-[10px] space-y-1">
                      <div className="num font-medium text-foreground/90 truncate" title={p.hardware}>
                        {p.hardware}
                      </div>
                      <div className="num text-muted-foreground text-[9px] truncate" title={p.pinout}>
                        {p.pinout}
                      </div>
                    </div>

                    {/* Signals Bullet List */}
                    <div className="mt-3 space-y-1">
                      {p.signals.map((sig) => (
                        <div key={sig} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="h-1 w-1 rounded-full bg-crimson shrink-0" />
                          <span className="truncate">{sig}</span>
                        </div>
                      ))}
                    </div>

                    {/* Description */}
                    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/90">
                      {p.description}
                    </p>
                  </div>

                  {/* Stage Footer: Protocol */}
                  <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-[10px]">
                    <span className="num text-muted-foreground">{p.protocol}</span>
                    {idx < HARDWARE_PIPELINE.length - 1 && (
                      <span className="hidden lg:inline-block text-muted-foreground/40 font-mono">→</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Schematic Signal Trace Bus Strip */}
          <div className="mt-6 panel p-4 bg-card/50 border border-border">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 num text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-hmi text-[10px] text-muted-foreground">SIGNAL BUS:</span>
                <span className="text-foreground font-medium">OBD-II Pin 16 (12V)</span>
                <span className="text-muted-foreground font-mono">──[1A Fuse &amp; TVS]──&gt;</span>
                <span className="text-cyan font-medium">AO3401A (40ms Pulse)</span>
                <span className="text-muted-foreground font-mono">──[ADC Pin 34]──&gt;</span>
                <span className="text-amber font-medium">ESP32 &amp; DS3231</span>
                <span className="text-muted-foreground font-mono">──[Wi-Fi 802.11n]──&gt;</span>
                <span className="text-emerald font-medium">AP-GUDANG-01</span>
                <span className="text-muted-foreground font-mono">──[REST API]──&gt;</span>
                <span className="text-crimson font-medium">MySQL &amp; HMI 3D</span>
              </div>
              <div className="text-muted-foreground text-[10px] shrink-0">
                SOP Blueprint v3.3, Firmware v1.4.2
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operating Thresholds: Yard Battery SOP Reference Matrix */}
      <section id="metrik" className="border-y border-border bg-card/60 py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-border">
            <div className="max-w-2xl">
              <span className="label-hmi text-crimson">Standar Operasional Prosedur</span>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
                Matriks Ambang Batas Baterai &amp; Toleransi Yard
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Klasifikasi status kesehatan aki 12V berdasarkan SOP PDI Dipo Stock Yard, disandingkan langsung dengan data armada riil di lapangan dan spesifikasi fail-safe modul piggyback.
              </p>
            </div>
            <div className="panel px-3.5 py-2.5 bg-card/40 flex items-center gap-2 num text-[11px] text-muted-foreground shrink-0">
              <span className="led text-emerald" />
              <span>Standar PDI Mitsubishi, Toleransi ±0.02 V</span>
            </div>
          </div>

          {/* Matrix Table: Desktop Header & Multi-Column Rows */}
          <div className="mt-8 overflow-hidden rounded-[2px] border border-border bg-card/40">
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3.5 border-b border-border bg-card text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-display">
              <div className="col-span-3">Klasifikasi &amp; Batas Voltase</div>
              <div className="col-span-3">Unit Riil di Stock Yard</div>
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
                    <div className="lg:col-span-3 flex items-start gap-3">
                      <span className={`led ${styles.led} mt-1`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                            {row.level}
                          </span>
                          <span className={`text-[10px] num font-medium px-1.5 py-0.5 rounded-[2px] border ${styles.badge}`}>
                            {row.statusText}
                          </span>
                        </div>
                        <div className={`mt-1 num text-base font-bold ${styles.text}`}>
                          {row.voltageRange}
                        </div>
                      </div>
                    </div>

                    {/* Sample Real Vehicle */}
                    <div className="lg:col-span-3 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/40">
                      <div className="text-[10px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
                        Armada Lapangan:
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="num font-semibold text-foreground text-xs">{row.sampleBay}</span>
                        <span className="text-muted-foreground text-xs">/</span>
                        <span className="text-xs text-foreground/90 font-medium truncate">{row.sampleModel}</span>
                      </div>
                      <div className="num text-[11px] text-muted-foreground mt-0.5">
                        Voltase Terukur: <span className={`font-semibold ${styles.text}`}>{row.sampleVoltage}</span>
                      </div>
                    </div>

                    {/* Shunt Sleep Current */}
                    <div className="lg:col-span-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/40">
                      <div className="text-[10px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
                        Arus Tidur:
                      </div>
                      <div className="num text-xs font-medium text-foreground">
                        {row.shuntCurrent}
                      </div>
                      <div className="num text-[10px] text-muted-foreground">
                        Batas SOP: &lt; 500 µA
                      </div>
                    </div>

                    {/* Field SOP Action */}
                    <div className="lg:col-span-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-border/40">
                      <div className="text-[10px] text-muted-foreground uppercase lg:hidden mb-1 font-display">
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

          {/* Secondary Edge Fail-Safe & Tolerances Grid */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {EDGE_FAILSAFE_SPECS.map((spec) => (
              <div key={spec.param} className="panel p-5 flex flex-col justify-between">
                <div>
                  <div className="label-hmi text-[10px] text-muted-foreground">{spec.param}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="num text-xl font-bold text-foreground">{spec.val}</span>
                  </div>
                  <div className="num text-[11px] text-cyan mt-1">{spec.sub}</div>
                  <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                    {spec.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Operations & Workspace Launcher */}
      <section id="operasional" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5 grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl text-foreground">
              Integrasi Operasional Pengawas Lapangan &amp; PDI
            </h2>
            <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
              Memastikan setiap unit Mitsubishi siap kirim ke konsumen tanpa kendala baterai drop. Menghubungkan node fisik dengan visualisasi digital twin 3D, diagnostik OBD-II, dan antrean pemanasan terstruktur.
            </p>

            <div className="mt-6 space-y-3">
              {FEATURES.map((feat) => (
                <div key={feat} className="flex items-start gap-3">
                  <CheckCircle2 size={16} className="mt-0.5 text-emerald shrink-0" />
                  <span className="text-xs text-foreground/90">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="panel p-6 sm:p-8 flex flex-col justify-between gap-6 border-hairline bg-card/70">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <span className="label-hmi text-[10px]">Konsol HMI Workspace</span>
                  <div className="flex items-center gap-1.5">
                    <span className="led text-emerald" />
                    <span className="num text-[11px] text-emerald">READY</span>
                  </div>
                </div>
                <h3 className="font-display text-lg font-medium text-foreground">
                  Akses Konsol Pengawasan Armada
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Buka workbench interaktif untuk melihat model 3D kendaraan, antrean pemanasan, log riwayat baterai 24 jam, dan konfigurasi node.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <Button asChild className="h-11 w-full justify-center px-5 text-xs font-semibold uppercase tracking-wider bg-crimson hover:bg-crimson/90 text-white rounded-[2px] transition-colors">
                  <Link to="/dashboard">
                    Masuk ke HMI Workspace
                  </Link>
                </Button>
                <p className="num text-center text-[11px] text-muted-foreground">
                  Kompatibel dengan MySQL Live API &amp; Simulator Sandbox.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/80 py-10">
        <div className="mx-auto max-w-6xl px-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <OrionLogo variant="icon" className="h-6 w-6 shrink-0" />
              <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                ORION
              </span>
              <span className="num text-[11px] text-muted-foreground">
                v3.3 (Onboard Reporting for Inventory &amp; Operational Notifications)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <span>Stock Yard Operations &amp; PDI Telemetry</span>
              <span className="hidden sm:inline-block text-border">/</span>
              <a href="#alur" className="hover:text-foreground transition-colors">Arsitektur</a>
              <span className="hidden sm:inline-block text-border">/</span>
              <Link to="/dashboard" className="hover:text-foreground transition-colors">Workspace</Link>
            </div>
          </div>
          <p className="border-t border-border/50 pt-3 text-center sm:text-left num text-[10.5px] text-muted-foreground/75">
            ORION Project (D4 TRPL IT Internship: Stock Yard Monitoring System). Independent telemetry platform; not an official product of or affiliated with Mitsubishi Motors.
          </p>
        </div>
      </footer>
    </div>
  );
}
