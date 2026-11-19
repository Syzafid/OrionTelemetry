import { useMemo, useState } from "react";
import {
  getUnitConnectionState,
  voltageHistory,
  type PiggybackConfig,
  type VehicleUnit,
  type VoltagePoint,
} from "@/data/mockTelemetry";
import { fmtV, Led, type Tone } from "./primitives";
import { cn } from "@/lib/utils";
import {
  formatDurationCompact,
  formatSleepInterval,
  getVehicleElectricalProfile,
  type TopologyNodeId,
  type VehicleElectricalProfile,
} from "@/lib/vehicle-topology";

interface ComponentNodeInspectorProps {
  unit: VehicleUnit;
  activeNode: TopologyNodeId;
  onSelectNode?: ((node: TopologyNodeId) => void) | undefined;
  config?: PiggybackConfig | undefined;
  historyPoints?: VoltagePoint[] | undefined;
  isLiveApi?: boolean | undefined;
  className?: string;
}

interface ChannelRow {
  channelId: string;
  nodeKey: TopologyNodeId;
  parameter: string;
  readout: string;
  subReadout?: string;
  range: string;
  status: string;
  tone: Tone;
  waveformType: "battery" | "shunt" | "alternator" | "rpm" | "coolant" | "can" | "rtc" | "rf";
}

interface ChannelTelemetryVisualProps {
  type: ChannelRow["waveformType"];
  tone: Tone;
  historyPoints: VoltagePoint[];
  vBat: number;
  engineOn: boolean;
  rpm: number;
  tempC: number;
  rtcTempC: number;
  rssi: number;
  isOnline: boolean;
  canOk: boolean;
  dtcCnt: number;
  shuntUa: number;
}

/**
 * Honest Telemetry Sparkline & Proportional Channel Meter.
 * Renders real MySQL/simulator voltage history for V_BAT without synthetic sine waves,
 * and proportional measured bars for digital/scalar hardware channels.
 */
function ChannelTelemetryVisual({
  type,
  tone,
  historyPoints,
  vBat,
  engineOn,
  rpm,
  tempC,
  rtcTempC,
  rssi,
  isOnline,
  canOk,
  dtcCnt,
  shuntUa,
}: ChannelTelemetryVisualProps) {
  const strokeColor =
    tone === "crimson"
      ? "var(--crimson)"
      : tone === "amber"
        ? "var(--amber)"
        : tone === "emerald"
          ? "var(--emerald)"
          : "var(--muted-foreground)";

  const fillBarClass =
    tone === "crimson"
      ? "bg-crimson"
      : tone === "amber"
        ? "bg-amber"
        : tone === "emerald"
          ? "bg-emerald"
          : "bg-muted-foreground/50";

  const batterySpark = useMemo(() => {
    if (type !== "battery") return null;
    const pts = historyPoints.length > 0 ? historyPoints : [{ t: "NOW", v: vBat }];
    let minV = pts[0]!.v;
    let maxV = pts[0]!.v;
    for (const p of pts) {
      if (p.v < minV) minV = p.v;
      if (p.v > maxV) maxV = p.v;
    }
    const span = Math.max(0.05, maxV - minV);
    const coords = pts.map((p, idx) => {
      const x = pts.length === 1 ? 75 : (idx / (pts.length - 1)) * 150;
      const y = 20 - ((p.v - minV) / span) * 16;
      return `${x.toFixed(1)},${Math.max(3, Math.min(21, y)).toFixed(1)}`;
    });
    if (pts.length === 1) {
      const ySingle = coords[0]!.split(",")[1];
      return {
        pointsAttr: `0,${ySingle} 150,${ySingle}`,
        count: 1,
        minV,
        maxV,
      };
    }
    return {
      pointsAttr: coords.join(" "),
      count: pts.length,
      minV,
      maxV,
    };
  }, [type, historyPoints, vBat]);

  if (type === "battery" && batterySpark) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <svg
          viewBox="0 0 150 24"
          className="h-5 w-24 sm:h-6 sm:w-28 shrink-0 select-none"
          aria-hidden="true"
        >
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={batterySpark.pointsAttr}
          />
        </svg>
        <span className="text-[11px] text-muted-foreground num">
          {batterySpark.count} sampel ({batterySpark.minV.toFixed(2)}V..
          {batterySpark.maxV.toFixed(2)}V)
        </span>
      </div>
    );
  }

  let pct = 0;
  let meterLabel = "";
  if (type === "shunt") {
    if (engineOn) {
      pct = 0;
      meterLabel = "BYPASSED (0 µA)";
    } else {
      pct = Math.max(0, Math.min(100, Math.round((shuntUa / 600) * 100)));
      meterLabel = `${shuntUa} / 450 µA`;
    }
  } else if (type === "alternator") {
    pct = Math.max(0, Math.min(100, Math.round(((vBat - 11.0) / 3.8) * 100)));
    meterLabel = `${vBat.toFixed(2)} V Bus`;
  } else if (type === "rpm") {
    pct = engineOn ? Math.max(0, Math.min(100, Math.round((rpm / 3000) * 100))) : 0;
    meterLabel = engineOn ? `${rpm} RPM` : "0 RPM (OFF)";
  } else if (type === "coolant") {
    pct = engineOn && tempC > 0 ? Math.max(0, Math.min(100, Math.round((tempC / 120) * 100))) : 0;
    meterLabel = engineOn && tempC > 0 ? `${tempC}°C / 120°C` : "OFF / --";
  } else if (type === "can") {
    pct = canOk ? 100 : 15;
    meterLabel = `${canOk ? "TRANSCEIVER OK" : "BUS FAULT"} · ${dtcCnt} DTC`;
  } else if (type === "rtc") {
    pct = Math.max(0, Math.min(100, Math.round((rtcTempC / 65) * 100)));
    meterLabel = `${rtcTempC.toFixed(1)}°C / 65°C`;
  } else if (type === "rf") {
    pct = isOnline ? Math.max(0, Math.min(100, Math.round(((rssi + 100) / 60) * 100))) : 12;
    meterLabel = `${rssi} dBm · ${isOnline ? "ONLINE" : "SLEEP"}`;
  }

  return (
    <div className="flex w-28 sm:w-32 flex-col items-end gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-[1px] bg-secondary">
        <div
          className={cn("h-full transition-all duration-300", fillBarClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground num truncate max-w-full">
        {meterLabel}
      </span>
    </div>
  );
}

// Authentic OEM Mitsubishi Pinout & Harness Diagnostic Knowledge Base (C-2 & C-5)
interface SopStep {
  code: string;
  instruction: string;
}

interface HarnessSpec {
  nodeName: string;
  wireColor: string;
  pinout: string;
  spec: string;
  diagProcedure: string;
  sopSteps: SopStep[];
}

function buildHarnessSpecs(
  unitModel: string,
  profile: VehicleElectricalProfile,
): Record<TopologyNodeId, HarnessSpec> {
  return {
    all: {
      nodeName: `SISTEM TOPOLOGI KELISTRIKAN MITSUBISHI ${unitModel}`,
      wireColor: "Kombinasi Standar OEM Mitsubishi Harness",
      pinout: "6 Titik Sadap Transduser (Engine Bay + Cabin + DLC)",
      spec: `Arsitektur 12V DC Negatif Ground (${profile.chassisLabel}), High-Speed CAN 500 kbps`,
      diagProcedure:
        "Pilih salah satu probe pada peta sasis atau klik baris saluran di bawah untuk menampilkan detail pinout dan prosedur uji.",
      sopSteps: [
        {
          code: "STEP 01",
          instruction:
            "Pastikan baterai berada pada kondisi terisi (>= 12.40V) sebelum melakukan inspeksi.",
        },
        {
          code: "STEP 02",
          instruction:
            "Verifikasi resistansi terminasi bus CAN sebesar 60 Ohm pada port OBD-II pin 6 dan 14 saat kunci kontak OFF.",
        },
        {
          code: "STEP 03",
          instruction:
            "Pastikan kebocoran arus tidur berada <= 450 uA pada resistor shunt R-Sense saat unit masuk deep sleep.",
        },
      ],
    },
    battery: {
      nodeName: `PROBE 01: AKI 12V ${profile.batteryAh} & RESISTOR SHUNT`,
      wireColor: "Merah 16mm² (Terminal B+), Hitam 16mm² (Ground Shunt Return)",
      pinout: "Terminal M8 B+ -> Pembagi Tegangan 300k/68k -> GPIO34 ADC ESP32",
      spec: `${profile.batterySpec}. Shunt 10 Ohm R-Sense arus parasitik.`,
      diagProcedure:
        "Periksa tegangan terminal (>= 12.40V nominal) dan arus deep-sleep (nominal <= 450 uA, waspada > 450 uA).",
      sopSteps: [
        {
          code: "SOP B.1",
          instruction:
            "Ukur tegangan kutub baterai menggunakan multimeter digital terkalibrasi (DMM).",
        },
        {
          code: "SOP B.2",
          instruction:
            "Catat tegangan mentah mV pada ESP32 Node M (GPIO34) untuk verifikasi koefisien OLS.",
        },
        {
          code: "SOP B.3",
          instruction:
            "Matikan kunci kontak, tunggu 120 detik hingga ECU tidur, pastikan shunt membaca <= 450 uA.",
        },
      ],
    },
    alternator: {
      nodeName: `PROBE 02: ALTERNATOR ${profile.alternatorAmps} & REGULATOR`,
      wireColor: "Merah Tebal (Terminal B+ Output), Putih/Biru (Terminal L Lampu)",
      pinout: "Terminal B+ (Output Cas), Terminal L (Indikator Speedometer), Terminal S (Sense)",
      spec: `${profile.alternatorSpec} Internal IC Regulator, Cut-in Speed ${profile.cutInRpm}`,
      diagProcedure:
        "Ukur tegangan saat mesin menyala (13.20V s/d 14.60V). Ripple AC maksimal < 250 mV RMS.",
      sopSteps: [
        {
          code: "SOP A.1",
          instruction: `Hidupkan mesin pada putaran ${profile.idleRpmRange}, periksa lampu peringatan aki padam.`,
        },
        {
          code: "SOP A.2",
          instruction:
            "Nyalakan beban listrik penuh (lampu utama, AC blower maks), tegangan harus bertahan >= 13.50V.",
        },
        {
          code: "SOP A.3",
          instruction:
            "Hubungkan osiloskop ke terminal B+, pastikan pola riak penyearah 3-fase simetris (< 250 mV).",
        },
      ],
    },
    powertrain: {
      nodeName: `PROBE 03: TRANSDUSER MESIN (${profile.engineCode})`,
      wireColor: "Shielded Twisted Pair Kuning/Hitam (CKP), Hijau/Putih (Suhu NTC)",
      pinout: "Sensor CKP 2-pin ke ECU Mesin Pin 12/24; ECT Sensor 2-pin ke ECU Pin 42",
      spec: `Mesin ${profile.engineCode}, Reluctance Wheel 60-2 gigi, Thermistor NTC 82°C-95°C.`,
      diagProcedure: `Verifikasi kestabilan ${profile.idleRpmRange}. Cek sinyal analog ECT saat suhu naik.`,
      sopSteps: [
        {
          code: "SOP P.1",
          instruction: "Periksa celah udara sensor poros engkol (air gap CKP: 0.5 mm - 1.2 mm).",
        },
        {
          code: "SOP P.2",
          instruction:
            "Verifikasi kenaikan temperatur bertahap dari kondisi dingin hingga termostat membuka (82°C).",
        },
        {
          code: "SOP P.3",
          instruction:
            "Pastikan putaran mesin stabil tanpa lonjakan sinyal liar pada osiloskop gigi reluktansi.",
        },
      ],
    },
    can_obd: {
      nodeName: "PROBE 04: PORT OBD-II J1962 & CAN BUS TWAI",
      wireColor: "Kuning (CAN-H), Hijau (CAN-L), Merah (Pin 16 +12V Fused 7.5A)",
      pinout: "Pin 16 = B+, Pin 4 = Chassis GND, Pin 5 = Signal GND, Pin 6 = CAN-H, Pin 14 = CAN-L",
      spec: "ISO 11898-2 High-Speed 500 kbps, Resistansi Terminasi 120 Ohm antar CAN-H/L",
      diagProcedure:
        "Ukur resistansi bus saat kontak OFF (harus 60 Ohm). Verifikasi 0 DTC pada sistem TWAI.",
      sopSteps: [
        {
          code: "SOP C.1",
          instruction:
            "Lepas terminal negatif aki, ukur resistansi pin 6 dan pin 14 OBD-II (toleransi: 54 - 66 Ohm).",
        },
        {
          code: "SOP C.2",
          instruction:
            "Sambungkan scanner MUT-III, baca freeze frame data jika terdapat kode DTC aktif.",
        },
        {
          code: "SOP C.3",
          instruction:
            "Periksa tegangan common-mode: CAN-H sekitar 2.5V - 3.5V, CAN-L sekitar 1.5V - 2.5V.",
        },
      ],
    },
    esp32_core: {
      nodeName: "PROBE 05: ORION IOT GATEWAY v1.0 & RTC DS3231",
      wireColor: "Kabel Pita Internal PCB v1.0 (Regulasi DC-DC TPS54302 3.3V)",
      pinout: "I2C SDA (GPIO21), SCL (GPIO22) -> DS3231 TCXO RTC. CAN RX/TX -> SN65HVD230",
      spec: "ESP32 Dual-Core 240MHz, Tier-1 20 RTC SRAM + Tier-2 2.000 LittleFS (176 KB)",
      diagProcedure:
        "Verifikasi sinkronisasi epoch RTC, drift TCXO < 2ppm, dan konsumsi harian daya.",
      sopSteps: [
        {
          code: "SOP E.1",
          instruction:
            "Periksa tegangan rel 3.3V keluaran regulator buck TPS54302 saat pemeliharaan PCB (toleransi: 3.28V - 3.34V).",
        },
        {
          code: "SOP E.2",
          instruction:
            "Verifikasi jam RTC DS3231 tersinkronisasi dengan NTP saat gateway terhubung ke jaringan gudang.",
        },
        {
          code: "SOP E.3",
          instruction:
            "Uji simulasi offline, pastikan paket telemetri tersimpan rapi ke partisi Two-Tier RTC/LittleFS.",
        },
      ],
    },
    rf_network: {
      nodeName: "PROBE 06: ANTENA RF DUAL-BAND & GEOFENCE",
      wireColor: "Koaksial Mikro U.FL 50 Ohm ke Antena PCB 2.4 GHz",
      pinout: "Transceiver RF 2.4 GHz 802.11 b/g/n, Tx Power +19.5 dBm",
      spec: "Jaringan Gudang Yard AP (WPA2), Hotspot Teknisi Fallback, Offline Two-Tier Buffer",
      diagProcedure:
        "Ambang batas koneksi real-time: RSSI >= -85 dBm. Buffer ke RTC SRAM + LittleFS jika di luar jangkauan.",
      sopSteps: [
        {
          code: "SOP R.1",
          instruction:
            "Periksa konektor U.FL antena RF terpasang kencang tanpa hambatan sinyal fisik.",
        },
        {
          code: "SOP R.2",
          instruction: "Ukur kekuatan sinyal RSSI di titik terjauh area gudang (minimal -85 dBm).",
        },
        {
          code: "SOP R.3",
          instruction:
            "Lakukan uji handover: putus koneksi AP gudang dan pastikan gateway beralih ke hotspot teknisi.",
        },
      ],
    },
  };
}

export function ComponentNodeInspector({
  unit,
  activeNode,
  onSelectNode,
  config,
  historyPoints,
  isLiveApi,
  className,
}: ComponentNodeInspectorProps) {
  const [activeTab, setActiveTab] = useState<"matrix" | "transducer" | "sop">("matrix");

  const t = unit.telemetry;
  const profile = getVehicleElectricalProfile(unit.model);
  const harnessSpecs = useMemo(() => buildHarnessSpecs(unit.model, profile), [unit.model, profile]);

  const critV = config?.crit_v ?? 11.8;
  const isCharging = t.engine_on && t.v_bat >= 13.2;
  const isBatteryCrit = t.crit_alert || t.v_bat < critV;
  const isBatteryLow = !isBatteryCrit && t.v_bat < 12.3;
  const isCanFault = t.can_ok === false || t.dtc_cnt > 0;

  const conn = getUnitConnectionState(unit, Boolean(isLiveApi));
  const isOutOfYard =
    unit.net_zone === "OFFLINE" || (!unit.in_yard && unit.net_zone !== "TECH_HOTSPOT");
  const isLinkOffline = !conn.isOnline;
  const resolvedSsid = (t.sync_ssid || unit.sync_ssid || "").trim();

  const activeSpec = harnessSpecs[activeNode] ?? harnessSpecs.all;

  // OLS Calibration Math (Hardware Blueprint v3.3 / SOP C.1)
  const calSlope = config?.cal_slope ?? 0.005412;
  const calOffset = config?.cal_offset ?? 0.069;
  const vCalculated = t.adc_raw_mv * calSlope + calOffset;
  const vDelta = Math.abs(t.v_bat - vCalculated);
  const isCalibrated = vDelta < 0.08;
  const pendingAck = Boolean(
    (config as (PiggybackConfig & { pending_ack?: boolean }) | undefined)?.pending_ack,
  );

  const effectiveHistory = useMemo<VoltagePoint[]>(() => {
    if (historyPoints && historyPoints.length > 0) return historyPoints;
    if (isLiveApi) {
      const label = unit.last_seen ? unit.last_seen.slice(11, 16) : "LIVE";
      return [
        {
          t: label,
          v: t.v_bat,
          ...(typeof t.ts_epoch === "number" ? { ts: t.ts_epoch } : {}),
        },
      ];
    }
    return voltageHistory(t.v_bat, t.engine_on);
  }, [historyPoints, isLiveApi, unit.last_seen, t.v_bat, t.ts_epoch, t.engine_on]);

  const { minHistV, maxHistV } = useMemo(() => {
    if (effectiveHistory.length === 0) return { minHistV: t.v_bat, maxHistV: t.v_bat };
    let min = effectiveHistory[0]!.v;
    let max = effectiveHistory[0]!.v;
    for (const p of effectiveHistory) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    return { minHistV: min, maxHistV: max };
  }, [effectiveHistory, t.v_bat]);

  const altVoltage = t.ecu_v && t.ecu_v > 0 ? t.ecu_v : t.v_bat;

  const shuntStatus = t.engine_on
    ? "SHUNT_BYPASSED"
    : t.shunt_sleep_ua <= 450
      ? "NOMINAL_SLEEP"
      : t.shunt_sleep_ua <= 480
        ? "ELEVATED_DRAIN"
        : "EXCESS_DRAIN";
  const shuntTone: Tone = t.engine_on
    ? "dim"
    : t.shunt_sleep_ua <= 450
      ? "emerald"
      : t.shunt_sleep_ua <= 480
        ? "amber"
        : "crimson";

  const rows: ChannelRow[] = useMemo(() => {
    return [
      {
        channelId: "CH-01",
        nodeKey: "battery",
        parameter: "V_BAT (Tegangan Aki Terminal)",
        readout: `${fmtV(t.v_bat)} V`,
        subReadout: `${t.adc_raw_mv} mV (GPIO34)`,
        range: `${critV.toFixed(2)}V - 14.40V`,
        status: isBatteryCrit ? "CRIT_ALERT" : isBatteryLow ? "LOW_WARN" : "NOMINAL",
        tone: isBatteryCrit ? "crimson" : isBatteryLow ? "amber" : "emerald",
        waveformType: "battery",
      },
      {
        channelId: "CH-02",
        nodeKey: "battery",
        parameter: "SHUNT_SLEEP (Arus Parasitik Tidur)",
        readout: t.engine_on ? "BYPASSED (RUN)" : `${t.shunt_sleep_ua} µA`,
        subReadout: t.engine_on ? "Sirkuit Sleep Shunt Nonaktif" : "Shunt 10 Ohm R-Sense",
        range: "<= 450 µA (Deep Sleep)",
        status: shuntStatus,
        tone: shuntTone,
        waveformType: "shunt",
      },
      {
        channelId: "CH-03",
        nodeKey: "alternator",
        parameter: "ALT_OUTPUT (Regulator Pengisian)",
        readout: isCharging ? `${fmtV(altVoltage)} V` : `${fmtV(t.v_bat)} V (B+)`,
        subReadout: isCharging
          ? `${profile.alternatorSpec} (Regulasi Aktif)`
          : "Mesin Mati (Tegangan Diam B+)",
        range: "13.20V - 14.60V (RUN)",
        status: isCharging ? "ACTIVE_CHARGING" : t.engine_on ? "LOW_REGULATE" : "STANDBY",
        tone: isCharging ? "emerald" : t.engine_on ? "amber" : "dim",
        waveformType: "alternator",
      },
      {
        channelId: "PID 0x0C",
        nodeKey: "powertrain",
        parameter: "ENGINE_RPM (Putaran Poros Engkol)",
        readout: !t.engine_on || t.rpm <= 0 ? "0 RPM" : `${t.rpm} RPM`,
        subReadout: t.engine_on ? `CKP Reluctance (${profile.engineCode})` : "Kontak Mati",
        range: profile.idleRpmRange,
        status: t.engine_on ? "CRANK_RUNNING" : "STOPPED",
        tone: t.engine_on ? "emerald" : "dim",
        waveformType: "rpm",
      },
      {
        channelId: "PID 0x05",
        nodeKey: "powertrain",
        parameter: "COOLANT_TEMP (Suhu Cairan Pendingin)",
        readout: !t.engine_on || t.temp_c <= 0 ? "--" : `${t.temp_c} °C`,
        subReadout: "NTC Engine Block Sensor",
        range: "82°C - 95°C (Target)",
        status:
          !t.engine_on || t.temp_c <= 0
            ? "UNAVAILABLE"
            : t.temp_c > 105
              ? "OVERHEAT_WARN"
              : t.temp_c >= 80
                ? "OPT_TEMP"
                : "COLD_WARMUP",
        tone:
          !t.engine_on || t.temp_c <= 0
            ? "dim"
            : t.temp_c > 105
              ? "crimson"
              : t.temp_c >= 80
                ? "emerald"
                : "amber",
        waveformType: "coolant",
      },
      {
        channelId: "CAN-01",
        nodeKey: "can_obd",
        parameter: "CAN_TWAI (J1962 Bus Transceiver)",
        readout: t.can_ok === false ? "BUS_FAULT" : "500 kbps",
        subReadout: `DTC: ${t.dtc} (${t.dtc_cnt} Fault)`,
        range: "ISO 11898-2 High-Speed",
        status: isCanFault ? "DTC_ACTIVE" : "HEALTHY",
        tone: isCanFault ? "crimson" : "emerald",
        waveformType: "can",
      },
      {
        channelId: "RTC-01",
        nodeKey: "esp32_core",
        parameter: "DS3231_TEMP (Suhu Kristal & Node)",
        readout: `${t.rtc_temp_c.toFixed(2)} °C`,
        subReadout: `Boot #${t.boot} · Seq #${t.seq ?? t.boot} · Wake ${t.active_ms}ms`,
        range: `Sleep: ${formatSleepInterval(t.sleep_cfg)} (${t.sleep_cfg}s)`,
        status: isLinkOffline ? "DEEP_SLEEP" : "TCXO_ACTIVE",
        tone: isLinkOffline ? "dim" : "emerald",
        waveformType: "rtc",
      },
      {
        channelId: "RF-01",
        nodeKey: "rf_network",
        parameter: "TELEMETRY_UPLINK (Gateway Jaringan)",
        readout: `${unit.net_zone ?? "YARD"}${resolvedSsid ? ` · ${resolvedSsid}` : ""} (${t.rssi} dBm)`,
        subReadout: `${conn.badgeText}${
          unit.last_seen
            ? ` · ${unit.last_seen}`
            : conn.lastSeenSec !== null
              ? ` · ${formatDurationCompact(conn.lastSeenSec)}`
              : ""
        } | Antrean: ${unit.buffer_used} rec`,
        range: "RSSI >= -85 dBm | Two-Tier 2.020 Slot",
        status: isOutOfYard ? "TIER1_BUFFERING" : isLinkOffline ? "DEEP_SLEEP_HOLD" : "LIVE_SYNC",
        tone:
          isOutOfYard || isLinkOffline
            ? "dim"
            : unit.net_zone === "TECH_HOTSPOT"
              ? "amber"
              : "emerald",
        waveformType: "rf",
      },
    ];
  }, [
    t,
    unit,
    profile,
    critV,
    conn,
    resolvedSsid,
    altVoltage,
    shuntStatus,
    shuntTone,
    isCharging,
    isBatteryCrit,
    isBatteryLow,
    isCanFault,
    isOutOfYard,
    isLinkOffline,
  ]);

  const filteredRows = useMemo(() => {
    if (activeNode === "all") return rows;
    return rows.filter((r) => r.nodeKey === activeNode);
  }, [rows, activeNode]);

  return (
    <div
      className={cn(
        "shrink-0 flex flex-col rounded-[2px] border border-border bg-card/90 p-3 sm:p-4 text-foreground",
        className,
      )}
    >
      {/* Inspector Navigation Tabs */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground text-[11px] uppercase tracking-wide">
            {activeSpec.nodeName}
          </span>
          <span className="num text-[11px] text-muted-foreground">
            [{filteredRows.length} Saluran Terhubung]
          </span>
          {activeNode !== "all" && onSelectNode && (
            <button
              type="button"
              onClick={() => onSelectNode("all")}
              className="num inline-flex min-h-[44px] sm:min-h-[34px] cursor-pointer items-center rounded-[1px] border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Tampilkan Semua (8 Saluran)
            </button>
          )}
        </div>

        {/* Tab Switcher - Mobile Ergonomic Touch Targets >= 44px + ARIA Tabs */}
        <div
          role="tablist"
          aria-label="Mode Inspeksi Komponen"
          className="flex flex-wrap items-center gap-1 rounded-[1px] border border-border bg-background p-0.5 num text-[11px]"
        >
          <button
            id="tab-matrix"
            role="tab"
            type="button"
            aria-selected={activeTab === "matrix"}
            aria-controls="panel-matrix"
            onClick={() => setActiveTab("matrix")}
            className={cn(
              "px-3 py-1.5 sm:py-1 min-h-[44px] sm:min-h-[34px] flex items-center justify-center uppercase font-semibold transition-colors rounded-[1px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === "matrix"
                ? "bg-foreground/15 text-foreground font-bold border border-foreground/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Matriks Data Stream
          </button>
          <button
            id="tab-transducer"
            role="tab"
            type="button"
            aria-selected={activeTab === "transducer"}
            aria-controls="panel-transducer"
            onClick={() => setActiveTab("transducer")}
            className={cn(
              "px-3 py-1.5 sm:py-1 min-h-[44px] sm:min-h-[34px] flex items-center justify-center uppercase font-semibold transition-colors rounded-[1px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === "transducer"
                ? "bg-foreground/15 text-foreground font-bold border border-foreground/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Transduser &amp; OLS
          </button>
          <button
            id="tab-sop"
            role="tab"
            type="button"
            aria-selected={activeTab === "sop"}
            aria-controls="panel-sop"
            onClick={() => setActiveTab("sop")}
            className={cn(
              "px-3 py-1.5 sm:py-1 min-h-[44px] sm:min-h-[34px] flex items-center justify-center uppercase font-semibold transition-colors rounded-[1px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === "sop"
                ? "bg-foreground/15 text-foreground font-bold border border-foreground/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Manual Servis (SOP)
          </button>
        </div>
      </div>

      {/* Tab 1: Matriks Data Stream (SAE J1979 / MUT-III Format) */}
      {activeTab === "matrix" && (
        <div role="tabpanel" id="panel-matrix" aria-labelledby="tab-matrix">
          {/* Responsive Diagnostic Feed (Mobile View: Cards) */}
          <div className="flex flex-col gap-2 md:hidden">
            {filteredRows.map((r) => (
              <div
                key={r.channelId}
                role={onSelectNode ? "button" : undefined}
                tabIndex={onSelectNode ? 0 : undefined}
                onClick={() => onSelectNode?.(r.nodeKey)}
                onKeyDown={(e) => {
                  if (onSelectNode && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectNode(r.nodeKey);
                  }
                }}
                className={cn(
                  "rounded-[2px] border border-border/70 bg-background/60 p-2.5 num transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  onSelectNode && "cursor-pointer hover:border-foreground/50",
                  activeNode === r.nodeKey && "border-foreground/60 bg-foreground/[0.04]",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                      {r.channelId}
                    </span>
                    <span className="text-[11px] font-medium text-foreground truncate max-w-[180px]">
                      {r.parameter}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                      r.tone === "crimson"
                        ? "bg-crimson/15 text-crimson border border-crimson/30"
                        : r.tone === "amber"
                          ? "bg-amber/15 text-amber border border-amber/30"
                          : r.tone === "emerald"
                            ? "bg-emerald/15 text-emerald border border-emerald/30"
                            : "bg-secondary text-muted-foreground border border-border",
                    )}
                  >
                    {r.status}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-foreground">{r.readout}</div>
                    {r.subReadout && (
                      <div className="text-[11px] text-muted-foreground">{r.subReadout}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <ChannelTelemetryVisual
                      type={r.waveformType}
                      tone={r.tone}
                      historyPoints={effectiveHistory}
                      vBat={t.v_bat}
                      engineOn={t.engine_on}
                      rpm={t.rpm}
                      tempC={t.temp_c}
                      rtcTempC={t.rtc_temp_c}
                      rssi={t.rssi}
                      isOnline={conn.isOnline}
                      canOk={t.can_ok !== false}
                      dtcCnt={t.dtc_cnt}
                      shuntUa={t.shunt_sleep_ua}
                    />
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      Ambang: {r.range}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Diagnostic Matrix Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse num text-[11px]">
              <thead>
                <tr className="border-b border-border/70 text-left label-hmi text-[11px] text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">CH / PID</th>
                  <th className="py-1.5 px-2 font-medium">PARAMETER SENSOR</th>
                  <th className="py-1.5 px-2 font-medium">NILAI REAL-TIME</th>
                  <th className="py-1.5 px-2 font-medium">RENTANG / AMBANG</th>
                  <th className="py-1.5 px-2 font-medium">TREN HISTORI / METER</th>
                  <th className="py-1.5 pl-2 font-medium text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredRows.map((r) => (
                  <tr
                    key={r.channelId}
                    role={onSelectNode ? "button" : undefined}
                    tabIndex={onSelectNode ? 0 : undefined}
                    onClick={() => onSelectNode?.(r.nodeKey)}
                    onKeyDown={(e) => {
                      if (onSelectNode && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSelectNode(r.nodeKey);
                      }
                    }}
                    className={cn(
                      "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      onSelectNode
                        ? "cursor-pointer hover:bg-foreground/[0.04]"
                        : "hover:bg-foreground/[0.02]",
                      activeNode === r.nodeKey && "bg-foreground/[0.05]",
                    )}
                  >
                    <td className="py-2 pr-2 font-semibold text-foreground/90 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Led tone={r.tone} />
                        <span>{r.channelId}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-foreground/90">
                      <div className="font-medium">{r.parameter}</div>
                      {r.subReadout && (
                        <div className="text-[11px] text-muted-foreground">{r.subReadout}</div>
                      )}
                    </td>
                    <td className="py-2 px-2 font-bold text-foreground whitespace-nowrap">
                      {r.readout}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap text-[11px]">
                      {r.range}
                    </td>
                    <td className="py-2 px-2">
                      <ChannelTelemetryVisual
                        type={r.waveformType}
                        tone={r.tone}
                        historyPoints={effectiveHistory}
                        vBat={t.v_bat}
                        engineOn={t.engine_on}
                        rpm={t.rpm}
                        tempC={t.temp_c}
                        rtcTempC={t.rtc_temp_c}
                        rssi={t.rssi}
                        isOnline={conn.isOnline}
                        canOk={t.can_ok !== false}
                        dtcCnt={t.dtc_cnt}
                        shuntUa={t.shunt_sleep_ua}
                      />
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-[1px] border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                          r.tone === "crimson"
                            ? "border-crimson/50 bg-crimson/15 text-crimson"
                            : r.tone === "amber"
                              ? "border-amber/50 bg-amber/15 text-amber"
                              : r.tone === "emerald"
                                ? "border-emerald/50 bg-emerald/15 text-emerald"
                                : "border-border bg-secondary/70 text-muted-foreground",
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Transduser & OLS (Context-Aware Engineering Analysis - Finding #1) */}
      {activeTab === "transducer" && (
        <div
          role="tabpanel"
          id="panel-transducer"
          aria-labelledby="tab-transducer"
          className="space-y-3 num text-[11px]"
        >
          {/* 1. Contextual Card for Battery (battery / all) */}
          {(activeNode === "battery" || activeNode === "all") && (
            <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground uppercase tracking-wider">
                    KALIBRASI OLS ADC (GPIO34 NODE M)
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                      isCalibrated
                        ? "bg-emerald/15 text-emerald border border-emerald/30"
                        : "bg-amber/15 text-amber border border-amber/30",
                    )}
                  >
                    {isCalibrated ? "IN CALIBRATION (OLS PASS)" : "CALIBRATION DRIFT DETECTED"}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Formula: V_bat = (ADC_raw * m) + c
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">ADC RAW PIN 34</div>
                  <div
                    className={cn(
                      "text-sm font-bold mt-0.5",
                      isBatteryCrit ? "text-crimson" : "text-foreground",
                    )}
                  >
                    {t.adc_raw_mv} mV
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    300k/68k · Ambang {critV.toFixed(2)}V
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    KONSTANTA OLS (m &amp; c)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    m: {calSlope.toFixed(6)}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] mt-0.5",
                      pendingAck ? "text-amber" : "text-muted-foreground",
                    )}
                  >
                    c: {calOffset.toFixed(3)}V · {pendingAck ? "PENDING ACK" : "ACK SYNC"}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    KALKULASI OLS vs AKTUAL
                  </div>
                  <div className="text-sm font-bold text-emerald mt-0.5">
                    {vCalculated.toFixed(2)} V
                  </div>
                  <div
                    className={cn(
                      "text-[11px] mt-0.5",
                      isCalibrated ? "text-muted-foreground" : "text-amber",
                    )}
                  >
                    Delta Drift: {vDelta.toFixed(3)}V (Maks 0.080V)
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    ARUS TIDUR &amp; LOG MYSQL
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {t.engine_on ? "BYPASSED (RUN)" : `${t.shunt_sleep_ua} µA`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {effectiveHistory.length} sampel ({minHistV.toFixed(2)}V - {maxHistV.toFixed(2)}
                    V)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Contextual Card for Alternator (alternator) */}
          {activeNode === "alternator" && (
            <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground uppercase tracking-wider">
                    ANALISIS SIRKUIT PENGISIAN ALTERNATOR {profile.alternatorAmps}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                      isCharging
                        ? "bg-emerald/15 text-emerald border border-emerald/30"
                        : "bg-secondary text-muted-foreground border border-border",
                    )}
                  >
                    {isCharging ? "PENGISIAN AKTIF" : "STANDBY (OFF)"}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">{profile.alternatorSpec}</span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    TEGANGAN STUD B+ (GPIO34)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{fmtV(t.v_bat)} V</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Ambang Cas: &gt;= 13.20V
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    TEGANGAN MODUL ECU (PID 0x42)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {t.engine_on && t.ecu_v && t.ecu_v > 0
                      ? `${fmtV(t.ecu_v)} V`
                      : "0.00 V (ECU Standby)"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Mode 01 PID 0x42</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    DROP TEGANGAN HARNESS (B+ KE ECU)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {t.engine_on && t.ecu_v && t.ecu_v > 0
                      ? `${Math.abs(t.v_bat - t.ecu_v).toFixed(2)} V`
                      : "-- (Mesin Mati)"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Batas Toleransi Drop: &lt;= 0.25V
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    WAKTU JALAN MESIN (PID 0x1F)
                  </div>
                  <div
                    className={cn(
                      "text-sm font-bold mt-0.5",
                      isCharging ? "text-emerald" : "text-muted-foreground",
                    )}
                  >
                    {t.engine_on ? `${t.run_time_s ?? 0} detik` : "0 detik (Mesin Mati)"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Cut-in Spec: {profile.cutInRpm}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Contextual Card for Powertrain (powertrain) */}
          {activeNode === "powertrain" && (
            <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground uppercase tracking-wider">
                    TRANSDUSER PUTARAN ENGKOL (CKP) &amp; SUHU MESIN (ECT)
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                      t.engine_on
                        ? "bg-emerald/15 text-emerald border border-emerald/30"
                        : "bg-secondary text-muted-foreground border border-border",
                    )}
                  >
                    {t.engine_on ? "MESIN MENYALA" : "KONTAK MATI"}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Blok Mesin Mitsubishi {unit.model} ({profile.engineCode})
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    PUTARAN MESIN CKP (PID 0x0C)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {!t.engine_on || t.rpm <= 0 ? "0 RPM (Mati)" : `${t.rpm} RPM`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Target: {profile.idleRpmRange}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    SUHU COOLANT &amp; IAT (0x05 / 0x0F)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {!t.engine_on || t.temp_c <= 0 ? "-- °C" : `${t.temp_c} °C`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Suhu Udara Masuk IAT: {!t.engine_on ? "--" : `${t.iat_c ?? 0} °C`}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    BEBAN MESIN &amp; THROTTLE (0x04 / 0x11)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {!t.engine_on ? "0.0%" : `${(t.load_pct ?? 0).toFixed(1)}%`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Posisi TPS: {!t.engine_on ? "0.0%" : `${(t.tps_pct ?? 0).toFixed(1)}%`}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    MAP / MAF / LAJU BBM (0x0B / 0x10 / 0x5E)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {!t.engine_on
                      ? "0 kPa · 0.00 L/h"
                      : `${t.map_kpa ?? 0} kPa · ${(t.fuel_rate_lh ?? 0).toFixed(2)} L/h`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    MAF: {!t.engine_on ? "0.00" : (t.maf_gs ?? 0).toFixed(2)} g/s · Ign:{" "}
                    {!t.engine_on ? "0.0" : (t.ign_deg ?? 0).toFixed(1)}°
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Contextual Card for OBD-II CAN Bus (can_obd) */}
          {activeNode === "can_obd" && (
            <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground uppercase tracking-wider">
                    ARSITEKTUR PORT OBD-II J1962 &amp; TRANSCEIVER CAN TWAI
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                      isCanFault
                        ? "bg-crimson/15 text-crimson border border-crimson/30"
                        : "bg-emerald/15 text-emerald border border-emerald/30",
                    )}
                  >
                    {isCanFault ? "CAN BUS FAULT" : "CAN HIGH-SPEED OK"}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Protokol: ISO 11898-2 (500 kbps)
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    TRANSCEIVER WCMCU-230 (CAN_OK)
                  </div>
                  <div
                    className={cn(
                      "text-sm font-bold mt-0.5",
                      t.can_ok === false ? "text-crimson" : "text-emerald",
                    )}
                  >
                    {t.can_ok === false ? "BUS / LOOPBACK FAULT" : "LOOPBACK / BUS OK"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    ISO 11898-2 · 500 kbps
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    KODE KERUSAKAN DTC (MODE 03)
                  </div>
                  <div
                    className={cn(
                      "text-sm font-bold mt-0.5",
                      isCanFault ? "text-crimson" : "text-emerald",
                    )}
                  >
                    {t.dtc} ({t.dtc_cnt} Kode)
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Status MIL PID 0x01:{" "}
                    {t.mil_on || t.dtc_cnt > 0 ? "MENYALA (ON)" : "PADAM (OFF)"}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    SENSOR O2 &amp; FUEL TRIM (0x14 / 0x06)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {!t.engine_on
                      ? "-- V · --%"
                      : `${(t.o2_v ?? 0).toFixed(2)} V · ${(t.stft_pct ?? 0).toFixed(1)}%`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Tegangan ECU 0x42: {!t.engine_on || !t.ecu_v ? "--" : `${fmtV(t.ecu_v)}V`}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    LAJU &amp; JARAK SEJAK CLEAR (0x0D / 0x31)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {!t.engine_on
                      ? "0 km/h (CAN Standby)"
                      : `${t.speed_kmh ?? 0} km/h · ${(t.dist_clr_km ?? 0).toLocaleString("id-ID")} km`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Mode: 100% Read-Only ECU
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. Contextual Card for ESP32 Gateway Core (esp32_core) */}
          {activeNode === "esp32_core" && (
            <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground uppercase tracking-wider">
                    HARDWARE ORION GATEWAY v1.0 &amp; TWO-TIER BUFFER
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase border",
                      isLinkOffline
                        ? "bg-secondary text-muted-foreground border-border"
                        : "bg-emerald/15 text-emerald border-emerald/30",
                    )}
                  >
                    {isLinkOffline ? "DEEP SLEEP STANDBY" : "SYSTEM ACTIVE"}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Firmware ESP32 v1.6.0 Production
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    SUHU DIE RTC DS3231SN
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {t.rtc_temp_c.toFixed(2)} °C
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    I2C 0x68 · Bangun via GPIO32 SQW
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    COUNTER BOOT &amp; SEQUENCE NVS
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    Boot #{t.boot} · Seq #{t.seq ?? t.boot}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Durasi Wake Aktif: {t.active_ms} ms
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    KONFIGURASI SLEEP &amp; ANGGARAN DAYA
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {formatSleepInterval(t.sleep_cfg)} ({t.sleep_cfg}s)
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Konsumsi Harian: {t.daily_mah.toFixed(2)} mAh
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    KAPASITAS TWO-TIER BUFFER
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {unit.buffer_used} Rekaman Aktif
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Tier-1: 20 RTC SRAM + Tier-2: 2.000 LittleFS (176 KB)
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. Contextual Card for RF Network & Uplink (rf_network) */}
          {activeNode === "rf_network" && (
            <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground uppercase tracking-wider">
                    RF LINK BUDGET &amp; GEOFENCE TELEMETRY UPLINK
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase",
                      isOutOfYard || isLinkOffline
                        ? "bg-secondary text-muted-foreground border border-border"
                        : unit.net_zone === "TECH_HOTSPOT"
                          ? "bg-amber/15 text-amber border border-amber/30"
                          : "bg-emerald/15 text-emerald border border-emerald/30",
                    )}
                  >
                    {unit.net_zone ?? "YARD"} · {conn.badgeText}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Transceiver: 2.4 GHz 802.11 b/g/n
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    KEKUATAN SINYAL (RSSI)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{t.rssi} dBm</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Status Koneksi: {conn.badgeText}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    SSID JARINGAN TERHUBUNG
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5 truncate">
                    {resolvedSsid ||
                      (unit.net_zone === "TECH_HOTSPOT"
                        ? "Hotspot Teknisi"
                        : unit.in_yard
                          ? "AP Gudang"
                          : "Offline")}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Header X-Sync-SSID · Zona: {unit.net_zone ?? "YARD"}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    WAKTU TERAKHIR TERLIHAT (LAST SEEN)
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5 truncate">
                    {unit.last_seen ?? (conn.isOnline ? "Live Stream Aktif" : "Mode Simulator")}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Umur Paket:{" "}
                    {conn.lastSeenSec !== null
                      ? formatDurationCompact(conn.lastSeenSec)
                      : "Real-time"}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[11px] text-muted-foreground uppercase">
                    ANTREAN BURST SYNC
                  </div>
                  <div
                    className={cn(
                      "text-sm font-bold mt-0.5",
                      unit.buffer_used > 0 ? "text-amber" : "text-emerald",
                    )}
                  >
                    {unit.buffer_used === 0
                      ? "BERSIH (0 Antrean)"
                      : `${unit.buffer_used} Rekaman Tertunda`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Maksimal 20 rekaman per HTTP Batch POST
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Physical Harness Pinout & Wiring Specifications (Clean Title - Finding #4) */}
          <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <span className="font-semibold text-foreground uppercase tracking-wider">
                SPESIFIKASI WIRING HARNESS & TERMINAL
              </span>
              <span className="text-[11px] text-muted-foreground uppercase">
                Standar OEM Mitsubishi {unit.model}
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <span className="text-[11px] text-muted-foreground uppercase block">
                  KODE WARNA KABEL
                </span>
                <span className="font-medium text-foreground text-[11px] mt-0.5 block">
                  {activeSpec.wireColor}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase block">
                  PINOUT TERMINAL
                </span>
                <span className="font-medium text-foreground text-[11px] mt-0.5 block">
                  {activeSpec.pinout}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase block">
                  SPESIFIKASI OEM
                </span>
                <span className="font-medium text-foreground text-[11px] mt-0.5 block">
                  {activeSpec.spec}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Prosedur Manual Servis OEM (SOP Standar Mitsubishi) */}
      {activeTab === "sop" && (
        <div
          role="tabpanel"
          id="panel-sop"
          aria-labelledby="tab-sop"
          className="space-y-2.5 num text-[11px]"
        >
          <div className="rounded-[2px] border border-border/80 bg-background/80 p-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <span className="font-semibold text-foreground uppercase tracking-wider">
                STANDAR OPERASIONAL PROSEDUR DIAGNOSTIK (MITSUBISHI WORKSHOP MANUAL)
              </span>
              <span className="text-[11px] text-muted-foreground">Revisi Standar SOP C.1</span>
            </div>
            <div className="mt-2 text-muted-foreground">{activeSpec.diagProcedure}</div>

            <div className="mt-3 space-y-1.5">
              {activeSpec.sopSteps.map((step) => (
                <div
                  key={step.code}
                  className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-2.5 rounded border border-border/40 bg-card/50 p-2.5"
                >
                  <span className="shrink-0 rounded-[1px] border border-border/70 bg-background px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-foreground">
                    {step.code}
                  </span>
                  <span className="text-foreground/90 font-medium leading-relaxed">
                    {step.instruction}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
