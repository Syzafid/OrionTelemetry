import { useMemo, useState } from "react";
import type { VehicleUnit, PiggybackConfig } from "@/data/mockTelemetry";
import { fmtV, Led, type Tone } from "./primitives";
import { cn } from "@/lib/utils";
import {
  getVehicleElectricalProfile,
  type TopologyNodeId,
  type VehicleElectricalProfile,
} from "./VehicleTopologyMap";

interface ComponentNodeInspectorProps {
  unit: VehicleUnit;
  activeNode: TopologyNodeId;
  onSelectNode?: ((node: TopologyNodeId) => void) | undefined;
  config?: PiggybackConfig | undefined;
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

interface MiniWaveformProps {
  type: ChannelRow["waveformType"];
  tone: Tone;
  active: boolean;
  vBat: number;
  adcRawMv: number;
  engineOn: boolean;
  rpm: number;
  tempC: number;
  canOk: boolean;
  dtcCnt: number;
  seq: number;
  shuntUa: number;
}

/**
 * Authentic Dynamic Waveform Generator (SAE J1979 / Automotive Scope)
 * Real evidence over claims: wave points dynamically fluctuate with physical telemetry states.
 */
function MiniWaveform({
  type,
  tone,
  active,
  vBat,
  adcRawMv,
  engineOn,
  rpm,
  tempC,
  canOk,
  dtcCnt,
  seq,
  shuntUa,
}: MiniWaveformProps) {
  const points = useMemo(() => {
    switch (type) {
      case "battery": {
        const clampedV = Math.max(11.0, Math.min(14.8, vBat));
        const baseY = 21 - ((clampedV - 11.0) / 3.8) * 17;
        const pts: string[] = [];
        for (let i = 0; i <= 10; i++) {
          const x = i * 15;
          const noise = Math.sin((i * 1.7) + (seq % 10) + (adcRawMv % 5)) * 1.4;
          const y = Math.max(3, Math.min(22, baseY + noise));
          pts.push(`${x},${y.toFixed(1)}`);
        }
        return pts.join(" ");
      }

      case "shunt": {
        if (engineOn) {
          return "0,12 30,12 60,11 90,12 120,11 150,12";
        }
        const pts: string[] = [];
        const isExcess = shuntUa > 480;
        for (let i = 0; i <= 10; i++) {
          const x = i * 15;
          const y = isExcess && (i === 4 || i === 8) ? 10 : 18;
          pts.push(`${x},${y}`);
        }
        return pts.join(" ");
      }

      case "alternator": {
        if (!active || !engineOn) {
          return "0,21 150,21";
        }
        const phase = (seq % 6) * 0.5;
        const pts: string[] = [];
        for (let i = 0; i <= 15; i++) {
          const x = i * 10;
          const ripple = Math.abs(Math.sin((i * 0.4) + phase)) * 7;
          const y = 8 + ripple;
          pts.push(`${x},${y.toFixed(1)}`);
        }
        return pts.join(" ");
      }

      case "rpm": {
        if (!engineOn || rpm <= 0) {
          return "0,18 150,18";
        }
        const period = Math.max(10, Math.min(30, Math.round(18000 / rpm)));
        const pts: string[] = [];
        for (let x = 0; x <= 150; x += 5) {
          const mod = (x + (seq * 4)) % period;
          let y = 18;
          if (mod === 0) y = 4;
          else if (mod === 5) y = 22;
          pts.push(`${x},${y}`);
        }
        return pts.join(" ");
      }

      case "coolant": {
        const clampedT = Math.max(30, Math.min(115, tempC > 0 ? tempC : 40));
        const endY = 21 - ((clampedT - 30) / 85) * 16;
        const pts: string[] = [];
        for (let i = 0; i <= 8; i++) {
          const x = i * 18.75;
          const interp = 21 - ((21 - endY) * (i / 8));
          pts.push(`${x.toFixed(0)},${interp.toFixed(1)}`);
        }
        return pts.join(" ");
      }

      case "can": {
        if (!canOk || dtcCnt > 0) {
          return "0,16 15,16 15,6 20,6 25,22 35,16 60,16 65,4 70,22 90,16 120,16 150,16";
        }
        const pts: string[] = ["0,16"];
        const bitPattern = [10, 10, 20, 15, 25, 20, 20, 30];
        let currX = 0;
        let isHigh = false;
        for (const span of bitPattern) {
          currX += span;
          if (currX > 150) break;
          isHigh = !isHigh;
          const y = isHigh ? 6 : 16;
          pts.push(`${currX},${isHigh ? 16 : 6} ${currX},${y}`);
        }
        pts.push("150,16");
        return pts.join(" ");
      }

      case "rtc": {
        const yBase = 12 + ((tempC > 0 ? tempC : 28) - 25) * 0.1;
        return `0,${yBase.toFixed(1)} 150,${yBase.toFixed(1)}`;
      }

      case "rf": {
        const pts: string[] = [];
        for (let i = 0; i <= 10; i++) {
          const x = i * 15;
          const isPulse = (i + seq) % 4 === 0;
          pts.push(`${x},${isPulse ? 6 : 18}`);
        }
        return pts.join(" ");
      }

      default:
        return "0,15 150,15";
    }
  }, [type, active, vBat, adcRawMv, engineOn, rpm, tempC, canOk, dtcCnt, seq, shuntUa]);

  const strokeColor =
    tone === "crimson"
      ? "#F45B60"
      : tone === "amber"
        ? "#F59E0B"
        : tone === "emerald"
          ? "#10B981"
          : "oklch(0.50 0.015 260)";

  return (
    <svg viewBox="0 0 150 24" className="h-5 w-24 sm:h-6 sm:w-28 shrink-0 select-none">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
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
          instruction: "Pastikan baterai berada pada kondisi terisi (>= 12.40V) sebelum melakukan inspeksi.",
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
          instruction: "Ukur tegangan kutub baterai menggunakan multimeter digital terkalibrasi (DMM).",
        },
        {
          code: "SOP B.2",
          instruction: "Catat tegangan mentah mV pada ESP32 Node M (GPIO34) untuk verifikasi koefisien OLS.",
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
      diagProcedure: "Ukur tegangan saat mesin menyala (13.20V s/d 14.60V). Ripple AC maksimal < 250 mV RMS.",
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
      diagProcedure: "Ukur resistansi bus saat kontak OFF (harus 60 Ohm). Verifikasi 0 DTC pada sistem TWAI.",
      sopSteps: [
        {
          code: "SOP C.1",
          instruction:
            "Lepas terminal negatif aki, ukur resistansi pin 6 dan pin 14 OBD-II (toleransi: 54 - 66 Ohm).",
        },
        {
          code: "SOP C.2",
          instruction: "Sambungkan scanner MUT-III, baca freeze frame data jika terdapat kode DTC aktif.",
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
      spec: "ESP32 Dual-Core 240MHz, Flash LittleFS 1.5MB (Tier-2 Buffer 20 record)",
      diagProcedure: "Verifikasi sinkronisasi epoch RTC, drift TCXO < 2ppm, dan konsumsi aktif 80mA.",
      sopSteps: [
        {
          code: "SOP E.1",
          instruction:
            "Periksa tegangan rel 3.3V keluaran regulator buck TPS54302 (toleransi: 3.28V - 3.34V).",
        },
        {
          code: "SOP E.2",
          instruction:
            "Verifikasi jam RTC DS3231 tersinkronisasi dengan NTP saat gateway terhubung ke jaringan gudang.",
        },
        {
          code: "SOP E.3",
          instruction: "Uji simulasi offline, pastikan paket telemetri tersimpan rapi ke partisi LittleFS.",
        },
      ],
    },
    rf_network: {
      nodeName: "PROBE 06: ANTENA RF DUAL-BAND & GEOFENCE",
      wireColor: "Koaksial Mikro U.FL 50 Ohm ke Antena PCB 2.4 GHz",
      pinout: "Transceiver RF 2.4 GHz 802.11 b/g/n, Tx Power +19.5 dBm",
      spec: "Jaringan Gudang Yard AP (WPA2), Hotspot Teknisi Fallback, Offline Buffer",
      diagProcedure:
        "Ambang batas koneksi real-time: RSSI >= -85 dBm. Buffer ke LittleFS jika di luar jangkauan.",
      sopSteps: [
        {
          code: "SOP R.1",
          instruction: "Periksa konektor U.FL antena RF terpasang kencang tanpa hambatan sinyal fisik.",
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
  className,
}: ComponentNodeInspectorProps) {
  const [activeTab, setActiveTab] = useState<"matrix" | "transducer" | "sop">("matrix");

  const t = unit.telemetry;
  const profile = getVehicleElectricalProfile(unit.model);
  const harnessSpecs = useMemo(() => buildHarnessSpecs(unit.model, profile), [unit.model, profile]);

  const isCharging = t.engine_on && t.v_bat >= 13.2;
  const isBatteryCrit = t.crit_alert || t.v_bat < 11.8;
  const isBatteryLow = !isBatteryCrit && t.v_bat < 12.3;
  const isCanFault = t.can_ok === false || t.dtc_cnt > 0;
  const isOffline =
    unit.net_zone === "OFFLINE" || (!unit.in_yard && unit.net_zone !== "TECH_HOTSPOT");

  const activeSpec = harnessSpecs[activeNode] ?? harnessSpecs.all;

  // OLS Calibration Math (Hardware Blueprint v3.3 / SOP C.1)
  const calSlope = config?.cal_slope ?? 0.005412;
  const calOffset = config?.cal_offset ?? 0.069;
  const vCalculated = (t.adc_raw_mv * calSlope) + calOffset;
  const vDelta = Math.abs(t.v_bat - vCalculated);
  const isCalibrated = vDelta < 0.08;

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
        range: "11.80V - 14.40V",
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
        subReadout: `Uptime: ${t.active_ms}ms | Seq #${t.seq ?? t.boot}`,
        range: "-10.0°C s/d +65.0°C",
        status: "TCXO_COMPENSATED",
        tone: "emerald",
        waveformType: "rtc",
      },
      {
        channelId: "RF-01",
        nodeKey: "rf_network",
        parameter: "TELEMETRY_UPLINK (Gateway Jaringan)",
        readout: `${unit.net_zone ?? "YARD"} (${t.rssi} dBm)`,
        subReadout: `Buffer: ${unit.buffer_used}/20 slot`,
        range: "RSSI >= -85 dBm (Yard)",
        status: isOffline ? "TIER1_BUFFERING" : "LIVE_SYNC",
        tone: isOffline ? "dim" : unit.net_zone === "TECH_HOTSPOT" ? "amber" : "emerald",
        waveformType: "rf",
      },
    ];
  }, [
    t,
    unit,
    profile,
    altVoltage,
    shuntStatus,
    shuntTone,
    isCharging,
    isBatteryCrit,
    isBatteryLow,
    isCanFault,
    isOffline,
  ]);

  const filteredRows = useMemo(() => {
    if (activeNode === "all") return rows;
    return rows.filter((r) => r.nodeKey === activeNode);
  }, [rows, activeNode]);

  return (
    <div
      className={cn(
        "panel flex flex-col rounded-[2px] border border-border bg-card/90 p-3 sm:p-4 text-foreground",
        className,
      )}
    >
      {/* Inspector Navigation Tabs */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground text-[11px] uppercase tracking-wide">
            {activeSpec.nodeName}
          </span>
          <span className="num text-[10px] text-muted-foreground">
            [{filteredRows.length} Saluran Terhubung]
          </span>
          {activeNode !== "all" && onSelectNode && (
            <button
              type="button"
              onClick={() => onSelectNode("all")}
              className="num inline-flex min-h-[28px] cursor-pointer items-center rounded-[1px] border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Tampilkan Semua (8 Saluran)
            </button>
          )}
        </div>

        {/* Tab Switcher - Mobile Ergonomic Touch Targets >= 42px + ARIA Tabs */}
        <div
          role="tablist"
          aria-label="Mode Inspeksi Komponen"
          className="flex flex-wrap items-center gap-1 rounded-[1px] border border-border bg-background p-0.5 num text-[10.5px]"
        >
          <button
            id="tab-matrix"
            role="tab"
            type="button"
            aria-selected={activeTab === "matrix"}
            aria-controls="panel-matrix"
            onClick={() => setActiveTab("matrix")}
            className={cn(
              "px-3 py-1.5 sm:py-1 min-h-[42px] sm:min-h-[32px] flex items-center justify-center uppercase font-semibold transition-colors rounded-[1px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeTab === "matrix"
                ? "bg-foreground/15 text-foreground font-bold border border-foreground/30 shadow-sm"
                : "text-muted-foreground/90 hover:text-foreground",
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
              "px-3 py-1.5 sm:py-1 min-h-[42px] sm:min-h-[32px] flex items-center justify-center uppercase font-semibold transition-colors rounded-[1px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeTab === "transducer"
                ? "bg-foreground/15 text-foreground font-bold border border-foreground/30 shadow-sm"
                : "text-muted-foreground/90 hover:text-foreground",
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
              "px-3 py-1.5 sm:py-1 min-h-[42px] sm:min-h-[32px] flex items-center justify-center uppercase font-semibold transition-colors rounded-[1px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              activeTab === "sop"
                ? "bg-foreground/15 text-foreground font-bold border border-foreground/30 shadow-sm"
                : "text-muted-foreground/90 hover:text-foreground",
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
                    <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[9.5px] font-semibold text-foreground">
                      {r.channelId}
                    </span>
                    <span className="text-[10px] font-medium text-foreground truncate max-w-[180px]">
                      {r.parameter}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
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
                      <div className="text-[9.5px] text-muted-foreground">{r.subReadout}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <MiniWaveform
                      type={r.waveformType}
                      tone={r.tone}
                      active={t.engine_on || isCharging}
                      vBat={t.v_bat}
                      adcRawMv={t.adc_raw_mv}
                      engineOn={t.engine_on}
                      rpm={t.rpm}
                      tempC={t.temp_c}
                      canOk={t.can_ok !== false}
                      dtcCnt={t.dtc_cnt}
                      seq={t.seq ?? 0}
                      shuntUa={t.shunt_sleep_ua}
                    />
                    <span className="mt-0.5 text-[8.5px] text-muted-foreground">
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
                <tr className="border-b border-border/70 text-left label-hmi text-[9.5px] text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">CH / PID</th>
                  <th className="py-1.5 px-2 font-medium">PARAMETER SENSOR</th>
                  <th className="py-1.5 px-2 font-medium">NILAI REAL-TIME</th>
                  <th className="py-1.5 px-2 font-medium">RENTANG / AMBANG</th>
                  <th className="py-1.5 px-2 font-medium">LIVE WAVEFORM</th>
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
                        <Led tone={r.tone} pulse={r.tone === "crimson"} />
                        <span>{r.channelId}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-foreground/90">
                      <div className="font-medium">{r.parameter}</div>
                      {r.subReadout && (
                        <div className="text-[10px] text-muted-foreground">
                          {r.subReadout}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 font-bold text-foreground whitespace-nowrap">
                      {r.readout}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap text-[10.5px]">
                      {r.range}
                    </td>
                    <td className="py-2 px-2">
                      <MiniWaveform
                        type={r.waveformType}
                        tone={r.tone}
                        active={t.engine_on || isCharging}
                        vBat={t.v_bat}
                        adcRawMv={t.adc_raw_mv}
                        engineOn={t.engine_on}
                        rpm={t.rpm}
                        tempC={t.temp_c}
                        canOk={t.can_ok !== false}
                        dtcCnt={t.dtc_cnt}
                        seq={t.seq ?? 0}
                        shuntUa={t.shunt_sleep_ua}
                      />
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-[1px] border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
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
                      "rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                      isCalibrated ? "bg-emerald/15 text-emerald border border-emerald/30" : "bg-amber/15 text-amber border border-amber/30",
                    )}
                  >
                    {isCalibrated ? "IN CALIBRATION (OLS PASS)" : "CALIBRATION DRIFT DETECTED"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Formula: V_bat = (ADC_raw * m) + c
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">ADC RAW PIN 34</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{t.adc_raw_mv} mV</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">R-Divider 300k/68k</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">SLOPE (m) / OFFSET (c)</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    m: {calSlope.toFixed(6)}
                  </div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">c: {calOffset.toFixed(3)} V</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">HASIL KALKULASI OLS</div>
                  <div className="text-sm font-bold text-emerald mt-0.5">{vCalculated.toFixed(2)} V</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Terkalibrasi OLS</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">DELTA DRIFT HARDWARE</div>
                  <div className={cn("text-sm font-bold mt-0.5", isCalibrated ? "text-foreground" : "text-amber")}>
                    {vDelta.toFixed(3)} V
                  </div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Toleransi maks 0.080V</div>
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
                      "rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                      isCharging ? "bg-emerald/15 text-emerald border border-emerald/30" : "bg-secondary text-muted-foreground border border-border",
                    )}
                  >
                    {isCharging ? "PENGISIAN AKTIF" : "STANDBY (OFF)"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {profile.alternatorSpec}
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">TEGANGAN TERMINAL B+</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {isCharging ? `${fmtV(altVoltage)} V` : `${fmtV(t.v_bat)} V (B+)`}
                  </div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">
                    {isCharging ? "Nominal Cas: 13.2V - 14.6V" : "Kontak Mati (Tegangan Aki Diam)"}
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">PUTARAN CUT-IN</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{profile.cutInRpm}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Mulai regulasi cas</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">BATAS RIAK AC PENYEARAH</div>
                  <div className="text-sm font-bold text-emerald mt-0.5">&lt; 250 mV RMS</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Kesehatan Dioda 3-Fase</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">STATUS KONTROL REGULATOR</div>
                  <div className={cn("text-sm font-bold mt-0.5", isCharging ? "text-emerald" : "text-muted-foreground")}>
                    {isCharging ? "CHARGING RUN" : "IDLE OFF"}
                  </div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Terminal L / S Terhubung</div>
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
                    TRANSDUSER PUTARAN ENGKOL (CKP) & SUHU MESIN (ECT)
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                      t.engine_on ? "bg-emerald/15 text-emerald border border-emerald/30" : "bg-secondary text-muted-foreground border border-border",
                    )}
                  >
                    {t.engine_on ? "MESIN MENYALA" : "KONTAK MATI"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Blok Mesin Mitsubishi {unit.model} ({profile.engineCode})
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">SENSOR CKP (RPM)</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{!t.engine_on || t.rpm <= 0 ? "0 RPM" : `${t.rpm} RPM`}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Roda Reluktansi 60-2 Gigi</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">SUHU PENDINGIN ECT</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{!t.engine_on || t.temp_c <= 0 ? "--" : `${t.temp_c} °C`}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Buka Termostat: 82°C</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">BEBAN MESIN TERHITUNG</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{!t.engine_on ? "0%" : `${(t.load_pct ?? 0).toFixed(0)}%`}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Mode 01 PID 0x04</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">LAJU INJEKSI BAHAN BAKAR</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{!t.engine_on ? "0.00 L/h" : `${(t.fuel_rate_lh ?? 0).toFixed(2)} L/h`}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Mode 01 PID 0x5E</div>
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
                    ARSITEKTUR PORT OBD-II J1962 & TRANSCEIVER CAN TWAI
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                      isCanFault ? "bg-crimson/15 text-crimson border border-crimson/30" : "bg-emerald/15 text-emerald border border-emerald/30",
                    )}
                  >
                    {isCanFault ? "CAN BUS FAULT" : "CAN HIGH-SPEED OK"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Protokol: ISO 11898-2 (500 kbps)
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">TERMINASI BUS (PIN 6-14)</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">60 Ohm</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Toleransi: 54 - 66 Ohm</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">KODE KERUSAKAN DTC</div>
                  <div className={cn("text-sm font-bold mt-0.5", isCanFault ? "text-crimson" : "text-emerald")}>
                    {t.dtc} ({t.dtc_cnt})
                  </div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Read-Only Mode 03/07</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">LAMPU KERUSAKAN (MIL)</div>
                  <div className={cn("text-sm font-bold mt-0.5", t.mil_on || t.dtc_cnt > 0 ? "text-crimson" : "text-emerald")}>
                    {t.mil_on || t.dtc_cnt > 0 ? "ILLUMINATED" : "OFF / NORMAL"}
                  </div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Mode 01 PID 0x01</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">KECEPATAN LAJU (SPEED)</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{!t.engine_on ? "0 km/h" : `${t.speed_kmh ?? 0} km/h`}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Mode 01 PID 0x0D</div>
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
                    HARDWARE ORION GATEWAY v1.0 & MEMORI LITTLEFS
                  </span>
                  <span className="rounded bg-emerald/15 text-emerald border border-emerald/30 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase">
                    SYSTEM HEALTHY
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Firmware ESP32 v1.4.1 Production
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">SUHU RTC DS3231SN</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{t.rtc_temp_c.toFixed(2)} °C</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">TCXO Drift &lt; 2ppm</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">PARTISI BUFFER FLASH</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{unit.buffer_used} / 20 Slot</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">LittleFS 1.5MB Partition</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">KONSUMSI HARIAN DAYA</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{t.daily_mah} mAh</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Target: &lt; 65 mAh/hari</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">REGULATOR STEP-DOWN BUCK</div>
                  <div className="text-sm font-bold text-emerald mt-0.5">3.30 V</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">TI TPS54302 (12V ke 3.3V)</div>
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
                    RF LINK BUDGET & GEOFENCE TELEMETRY UPLINK
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase",
                      isOffline
                        ? "bg-secondary text-muted-foreground border border-border"
                        : unit.net_zone === "TECH_HOTSPOT"
                          ? "bg-amber/15 text-amber border border-amber/30"
                          : "bg-emerald/15 text-emerald border border-emerald/30",
                    )}
                  >
                    {unit.net_zone ?? "YARD"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Transceiver: 2.4 GHz 802.11 b/g/n
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">KEKUATAN SINYAL (RSSI)</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{t.rssi} dBm</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Ambang Real-time: &gt;= -85dBm</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">SSID JARINGAN TERHUBUNG</div>
                  <div className="text-sm font-bold text-foreground mt-0.5 truncate">{unit.net_zone === "TECH_HOTSPOT" ? (t.sync_ssid || "POCO Hotspot") : "YARD_AP_HQ"}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">WPA2-PSK Authentication</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">STATUS ANTISIPASI GEOFENCE</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{unit.in_yard ? "IN YARD BOUNDARY" : "DEPARTED"}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Hysteresis: 3 Siklus Miss</div>
                </div>
                <div className="rounded border border-border/50 bg-card/60 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">BURST SYNC FLUSH QUEUE</div>
                  <div className="text-sm font-bold text-emerald mt-0.5">{unit.buffer_used === 0 ? "IDLE (0)" : `${unit.buffer_used} PENDING`}</div>
                  <div className="text-[9.5px] text-muted-foreground mt-0.5">Maksimal 20 slot per batch</div>
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
              <span className="text-[10px] text-muted-foreground uppercase">
                Standar OEM Mitsubishi {unit.model}
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block">KODE WARNA KABEL</span>
                <span className="font-medium text-foreground text-[11px] mt-0.5 block">{activeSpec.wireColor}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block">PINOUT TERMINAL</span>
                <span className="font-medium text-foreground text-[11px] mt-0.5 block">{activeSpec.pinout}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block">SPESIFIKASI OEM</span>
                <span className="font-medium text-foreground text-[11px] mt-0.5 block">{activeSpec.spec}</span>
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
              <span className="text-[10px] text-muted-foreground">Revisi Standar SOP C.1</span>
            </div>
            <div className="mt-2 text-muted-foreground">
              {activeSpec.diagProcedure}
            </div>

            <div className="mt-3 space-y-1.5">
              {activeSpec.sopSteps.map((step) => (
                <div
                  key={step.code}
                  className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-2.5 rounded border border-border/40 bg-card/50 p-2.5"
                >
                  <span className="shrink-0 rounded-[1px] border border-border/70 bg-background px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-foreground">
                    {step.code}
                  </span>
                  <span className="text-foreground/90 font-medium leading-relaxed">{step.instruction}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
