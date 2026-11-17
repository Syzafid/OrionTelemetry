import type { VehicleUnit } from "@/data/mockTelemetry";
import { fmtV, Led, type Tone } from "./primitives";
import { cn } from "@/lib/utils";
import type { TopologyNodeId } from "./VehicleTopologyMap";
import {
  Activity,
  AlertOctagon,
  BatteryCharging,
  Cpu,
  Gauge,
  Info,
  Radio,
  Sliders,
  Sparkles,
  Thermometer,
  Wrench,
  Zap,
} from "lucide-react";

interface ComponentNodeInspectorProps {
  unit: VehicleUnit;
  activeNode: TopologyNodeId;
  className?: string;
}

export function ComponentNodeInspector({
  unit,
  activeNode,
  className,
}: ComponentNodeInspectorProps) {
  const t = unit.telemetry;
  const isCharging = t.engine_on && t.v_bat >= 13.2;
  const isBatteryCrit = t.crit_alert || t.v_bat < 11.8;
  const isBatteryLow = !isBatteryCrit && t.v_bat < 12.3;
  const isCanFault = t.can_ok === false || t.dtc_cnt > 0;
  const isOffline = unit.net_zone === "OFFLINE" || (!unit.in_yard && unit.net_zone !== "TECH_HOTSPOT");

  return (
    <div
      className={cn(
        "panel flex flex-col rounded-[2px] border border-border bg-card/90 p-3.5 sm:p-4 text-foreground",
        className,
      )}
    >
      {/* Node Title & Live Diagnostic Status */}
      <div className="mb-3 flex items-start justify-between gap-2 border-b border-border pb-2.5">
        <div>
          <div className="label-hmi text-[10px] text-muted-foreground">
            INSPEKTOR SALURAN DIAGNOSTIK
          </div>
          <h3 className="font-display text-base font-semibold uppercase tracking-wider text-foreground">
            {activeNode === "battery" && "Sub-sistem Aki 12V & Shunt Sensor"}
            {activeNode === "alternator" && "Sirkuit Alternator & Regulator Pengisian"}
            {activeNode === "can_obd" && "Antarmuka Bus CAN & Port OBD-II (J1962)"}
            {activeNode === "powertrain" && "Transduser Powertrain & Sensor Mesin"}
            {activeNode === "esp32_core" && "Modul Gateway ESP32 & Precision RTC"}
            {activeNode === "rf_network" && "Antarmuka RF Radio & Penjejak Geofence"}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 rounded-[2px] border border-border bg-background px-2.5 py-1 num text-[10.5px]">
          <span className="text-muted-foreground">STATUS:</span>
          <span className="font-semibold text-foreground uppercase">
            {activeNode === "battery" && (isBatteryCrit ? "KRITIS" : isBatteryLow ? "PERINGATAN" : "NORMAL")}
            {activeNode === "alternator" && (isCharging ? "MENGISI" : t.engine_on ? "STANDBY" : "OFF")}
            {activeNode === "can_obd" && (isCanFault ? "FAULT / DTC" : "SEHAT")}
            {activeNode === "powertrain" && (t.engine_on ? "AKTIF" : "MATI")}
            {activeNode === "esp32_core" && "ONLINE"}
            {activeNode === "rf_network" && (isOffline ? "BUFFERED" : "CONNECTED")}
          </span>
        </div>
      </div>

      {/* Dynamic Content based on Active Node */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {activeNode === "battery" && (
          <>
            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">TEGANGAN TERMINAL</span>
              <div className="mt-1 flex items-baseline gap-1.5 num">
                <span className={cn("text-xl font-bold", isBatteryCrit ? "text-crimson" : isBatteryLow ? "text-amber" : "text-emerald")}>
                  {fmtV(t.v_bat)} V
                </span>
                <span className="text-[11px] text-muted-foreground">({t.adc_raw_mv} mV ADC)</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Dihitung dari pembagi tegangan 300k/68k di Pin 16.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">ARUS PARASITIC SLEEP</span>
              <div className="mt-1 num text-xl font-bold text-foreground">
                {t.shunt_sleep_ua} µA
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Arus bocor saat unit deep sleep diukur via shunt 10Ω.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">KALIBRASI OLS AKTIF</span>
              <div className="mt-1 num text-xs font-semibold text-foreground">
                m = 0.005412 | c = 0.069
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Konstanta kalibrasi linier PCB v1.0 unit {unit.unit_id}.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">AMBANG CRITICAL ALERT</span>
              <div className="mt-1 num text-xs font-semibold text-crimson">
                Batas Kritis: 11.80 V
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Mencegah kerusakan permanen sulfasi pada sel timbal-asam.
              </p>
            </div>
          </>
        )}

        {activeNode === "alternator" && (
          <>
            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">STATUS REGULATOR</span>
              <div className="mt-1 num text-xl font-bold text-foreground">
                {isCharging ? "13.8V - 14.4V" : "0.0 V (OFF)"}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {isCharging ? "Alternator aktif menyuplai arus pengisian ke aki." : "Alternator tidak menghasilkan daya saat mesin mati."}
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">KONDISI MESIN</span>
              <div className="mt-1 flex items-center gap-1.5 num text-base font-bold text-foreground">
                <Led tone={t.engine_on ? "emerald" : "dim"} pulse={t.engine_on} />
                {t.engine_on ? "MESIN MENYALA (RUN)" : "KONTAK MATI (STANDBY)"}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Dideteksi otomatis dari lonjakan tegangan dan pulsa CAN.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">PUTARAN POROS ENGKOL</span>
              <div className="mt-1 num text-xl font-bold text-foreground">
                {!t.engine_on || t.rpm <= 0 ? "0 RPM" : `${t.rpm} RPM`}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Kecepatan rotasi alternator sebanding dengan putaran idle mesin.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">PROTEKSI RELAY STARTER</span>
              <div className="mt-1 num text-xs font-semibold text-emerald">
                NORMAL / ARMED
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Sirkuit start aman dari drop voltage transien saat cranking.
              </p>
            </div>
          </>
        )}

        {activeNode === "can_obd" && (
          <>
            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">TRANSCEIVER CAN TWAI</span>
              <div className="mt-1 num text-base font-bold text-foreground">
                {t.can_ok === false ? "FAULT / UNREACHABLE" : "WCMCU-230 READY (500 kbps)"}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Koneksi SN65HVD230 ke GPIO 4/5 controller ESP32.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">DIAGNOSTIC TROUBLE CODE</span>
              <div className={cn("mt-1 num text-base font-bold", t.dtc_cnt > 0 ? "text-crimson" : "text-emerald")}>
                {t.dtc} ({t.dtc_cnt} Terdeteksi)
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t.dtc_cnt > 0 ? "Kode kerusakan aktif terbaca dari ECU kendaraan." : "Tidak ada kode gangguan aktif pada memori ECU."}
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">PINOUT KONEKTOR J1962</span>
              <div className="mt-1 num text-xs font-semibold text-foreground">
                Pin 6 (CAN-H) / Pin 14 (CAN-L)
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Pin 4/5 ground referensi, Pin 16 catu 12V permanen.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">MODE OPERASI OBD-II</span>
              <div className="mt-1 num text-xs font-semibold text-emerald">
                Mode 0x01 / 0x03 Read-Only
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Aman 100%, pasif mendengarkan tanpa menulis ke bus kendaraan.
              </p>
            </div>
          </>
        )}

        {activeNode === "powertrain" && (
          <>
            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">TACHOMETER MESIN</span>
              <div className="mt-1 num text-xl font-bold text-foreground">
                {!t.engine_on || t.rpm <= 0 ? "0 RPM" : `${t.rpm} RPM`}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Kecepatan putaran idle mesin Mitsubishi Pajero / Xforce.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">TEMPERATUR COOLANT</span>
              <div className="mt-1 num text-xl font-bold text-foreground">
                {!t.engine_on || t.temp_c <= 0 ? "--" : `${t.temp_c}°C`}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Sensor suhu pendingin mesin (ambang normal 82°C - 95°C).
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">BEBAN KALKULASI MESIN</span>
              <div className="mt-1 num text-base font-bold text-foreground">
                {t.load_pct ?? 0} % (MAP: {t.map_kpa ?? 101} kPa)
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Beban mesin dan tekanan absolut manifold intake.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">STATUS PEMANASAN UNIT</span>
              <div className="mt-1 num text-xs font-semibold text-foreground">
                {t.engine_on ? "Pemanasan Aktif" : "Menunggu Jadwal Pemanasan"}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Memastikan oli tersirkulasi dan aki terisi selama di stockyard.
              </p>
            </div>
          </>
        )}

        {activeNode === "esp32_core" && (
          <>
            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">PRECISION RTC DS3231</span>
              <div className="mt-1 num text-xl font-bold text-foreground">
                {t.rtc_temp_c.toFixed(2)} °C
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Sensor suhu kristal internal DS3231SN (kompensasi drift waktu).
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">UPTIME & DAYA HARIAN</span>
              <div className="mt-1 num text-base font-bold text-foreground">
                {t.active_ms} ms | {t.daily_mah} mAh
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Durasi siklus komputasi aktif dan konsumsi energi harian.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">BOOT & COUNTER SIKLUS</span>
              <div className="mt-1 num text-base font-bold text-foreground">
                Boot #{t.boot} | Seq #{t.seq}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Jumlah siklus deep sleep dan urutan record telemetri.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">INTERVAL TIDUR TERKONFIGURASI</span>
              <div className="mt-1 num text-xs font-semibold text-emerald">
                {t.sleep_cfg} detik ({Math.round(t.sleep_cfg / 60)} menit)
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Dapat diperbarui secara OTA via piggyback response ACK.
              </p>
            </div>
          </>
        )}

        {activeNode === "rf_network" && (
          <>
            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">ZONA JARINGAN SAAT INI</span>
              <div className="mt-1 num text-base font-bold text-foreground">
                {unit.net_zone ?? "YARD"} ({t.rssi} dBm)
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Status deteksi batas gerbang (Gudang, Hotspot Teknisi, atau Offline).
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">SSID KONEKSI AKTIF</span>
              <div className="mt-1 num text-base font-bold text-foreground">
                {unit.sync_ssid || "DIPO Ruijie"}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Access point yang digunakan node untuk mengirimkan data.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">ANTREAN OFFLINE BURST SYNC</span>
              <div className="mt-1 num text-base font-bold text-foreground">
                {unit.buffer_used} / 20 slot (Tier-1)
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Disimpan di RTC Fast SRAM saat offline, di-flush otomatis saat online.
              </p>
            </div>

            <div className="rounded border border-border/80 bg-background/60 p-2.5">
              <span className="label-hmi text-[10px]">HYSTERESIS & ANTI-FLAPPING</span>
              <div className="mt-1 num text-xs font-semibold text-emerald">
                Ambang Keluar: 3-Miss | Masuk: 2-Hit
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Mencegah flapping status saat kendaraan melintasi portal gerbang.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
