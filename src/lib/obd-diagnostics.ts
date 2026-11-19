import {
  WARMUP_SESSION,
  WIRING,
  type PiggybackConfig,
  type VehicleUnit,
  type VoltagePoint,
} from "@/data/mockTelemetry";

export interface GaugeGeometry {
  baseArcPath: string;
  redlineArcPath: string;
  valueArcPath: string | null;
  needleEnd: [number, number];
  ticks: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isMajor: boolean;
    isRedline: boolean;
  }>;
  labels: Array<{
    key: number;
    x: number;
    y: number;
    text: string;
  }>;
}

/**
 * Computes SVG geometry for a 270-degree analog automotive gauge (`viewBox="0 0 280 250"`).
 * Clamps incoming values to `[0, max]` so high RPM spikes never rotate the needle past full scale.
 */
export function computeGaugeGeometry(value: number, max: number, redline: number): GaugeGeometry {
  const safeMax = Math.max(1, max);
  const safeRedline = Math.min(safeMax, Math.max(0, redline));
  const clampedValue = Number.isFinite(value) ? Math.min(safeMax, Math.max(0, value)) : 0;

  const radius = 110;
  const cx = 140;
  const cy = 140;
  const startDeg = 135;
  const sweepDeg = 270;

  const toRad = (v: number) => ((startDeg + (v / safeMax) * sweepDeg) * Math.PI) / 180;
  const pointAt = (v: number, r: number): [number, number] => {
    const a = toRad(v);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const arcPath = (from: number, to: number, r: number) => {
    const [x1, y1] = pointAt(from, r);
    const [x2, y2] = pointAt(to, r);
    const largeArc = ((to - from) / safeMax) * sweepDeg > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const steps = 40;
  const ticks: GaugeGeometry["ticks"] = [];
  const labels: GaugeGeometry["labels"] = [];

  for (let i = 0; i <= steps; i++) {
    const val = (i / steps) * safeMax;
    const isMajor = i % 5 === 0;
    const [x1, y1] = pointAt(val, radius - 12);
    const [x2, y2] = pointAt(val, radius - (isMajor ? 24 : 17));
    ticks.push({
      x1,
      y1,
      x2,
      y2,
      isMajor,
      isRedline: val >= safeRedline,
    });

    if (i % 10 === 0) {
      const [lx, ly] = pointAt(val, radius - 38);
      labels.push({
        key: i,
        x: lx,
        y: ly,
        text: String(Math.round(val)),
      });
    }
  }

  return {
    baseArcPath: arcPath(0, safeMax, radius),
    redlineArcPath: arcPath(safeRedline, safeMax, radius),
    valueArcPath: value >= 0 && clampedValue > 0.5 ? arcPath(0, clampedValue, radius) : null,
    needleEnd: pointAt(value < 0 ? 0 : clampedValue, radius - 18),
    ticks,
    labels,
  };
}

/** Formats OBD-II PID `0x1F` engine run-time seconds into compact Indonesian notation. */
export function formatRunTimeCompact(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  if (safe < 60) return `${String(safe).padStart(2, "0")}d`;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}j ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}d`;
  }
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}d`;
}

export interface DiagnosticsChartPoint {
  t: string;
  rpm: number;
  temp: number;
  v: number;
}

export interface DiagnosticsTrendResult {
  points: DiagnosticsChartPoint[];
  hasEngineActivity: boolean;
  maxRpmDomain: number;
  sourceLabel: string;
}

/**
 * Builds the Dual-Axis RPM & Coolant trend series for Menu 04.
 * In `LIVE_API` mode, uses exclusively real MySQL `telemetry_logs` history + live poll samples,
 * never substituting synthetic `WARMUP_SESSION` dummy data.
 */
export function buildDiagnosticsTrendSeries({
  historyPoints,
  unit,
  isLiveApi,
  liveSamples,
}: {
  historyPoints: VoltagePoint[] | undefined;
  unit: VehicleUnit;
  isLiveApi: boolean;
  liveSamples: DiagnosticsChartPoint[];
}): DiagnosticsTrendResult {
  const t = unit.telemetry;
  const activeTemp = t.temp_c > -40 ? Math.max(0, t.temp_c) : 0;

  if (isLiveApi) {
    const dbSeries: DiagnosticsChartPoint[] = (historyPoints ?? []).map((pt) => ({
      t: pt.t,
      rpm: typeof pt.rpm === "number" && Number.isFinite(pt.rpm) ? Math.max(0, pt.rpm) : 0,
      temp:
        typeof pt.temp_c === "number" && Number.isFinite(pt.temp_c) ? Math.max(0, pt.temp_c) : 0,
      v: Number((pt.v ?? t.v_bat).toFixed(2)),
    }));

    const points =
      liveSamples.length > 0
        ? [...dbSeries.slice(-18), ...liveSamples.slice(-12)]
        : dbSeries.length > 0
          ? dbSeries
          : [
              {
                t: unit.last_seen ? unit.last_seen.slice(11, 16) : "LIVE",
                rpm: t.engine_on ? Math.max(0, t.rpm) : 0,
                temp: t.engine_on ? activeTemp : 0,
                v: Number(t.v_bat.toFixed(2)),
              },
            ];

    const peakRpm = points.reduce((acc, p) => Math.max(acc, p.rpm), t.engine_on ? t.rpm : 0);
    return {
      points,
      hasEngineActivity: points.some((p) => p.rpm > 0 || p.temp > 0),
      maxRpmDomain: Math.max(1600, Math.ceil(peakRpm / 500) * 500 + 500),
      sourceLabel: `Riwayat Nyata DB (${points.length} titik)`,
    };
  }

  if (t.engine_on) {
    const points: DiagnosticsChartPoint[] = [
      ...WARMUP_SESSION.slice(0, -1).map((pt) => ({
        t: pt.t,
        rpm: pt.rpm,
        temp: pt.temp,
        v: pt.v,
      })),
      {
        t: "LIVE",
        rpm: Math.max(0, t.rpm),
        temp: activeTemp,
        v: Number(t.v_bat.toFixed(2)),
      },
    ];
    const peakRpm = points.reduce((acc, p) => Math.max(acc, p.rpm), 0);
    return {
      points,
      hasEngineActivity: true,
      maxRpmDomain: Math.max(1600, Math.ceil(peakRpm / 500) * 500 + 500),
      sourceLabel: "Simulasi Kurva Pemanasan",
    };
  }

  const idlePoints: DiagnosticsChartPoint[] = (
    historyPoints && historyPoints.length > 0 ? historyPoints : [{ t: "STANDBY", v: t.v_bat }]
  ).map((pt) => ({
    t: pt.t,
    rpm: 0,
    temp: 0,
    v: Number(pt.v.toFixed(2)),
  }));

  return {
    points: idlePoints,
    hasEngineActivity: false,
    maxRpmDomain: 1600,
    sourceLabel: "Mode Standby (Mesin Mati)",
  };
}

export interface WiringDiagnosticRow {
  id: string;
  wire: string;
  path: string;
  signal: string;
  sourceKind: "SENSOR" | "REFERENSI";
  liveReading: string;
  liveStatus: "OK" | "WARN" | "FAULT";
  statusLabel: string;
}

/**
 * Resolves Tab 03 hardware pinout rows aligned with firmware `sketch_oct16aa.ino` v1.6.0:
 * explicitly separates live sensor measurements from hardware reference specifications,
 * reflects 40ms GPIO27 ADC & GPIO26 CAN loopback cycle pulses, and applies unit `crit_v`.
 */
export function resolveWiringRows(
  unit: VehicleUnit,
  critV: number,
  config?: PiggybackConfig,
): WiringDiagnosticRow[] {
  const t = unit.telemetry;
  const slope = config?.cal_slope ?? 0.005412;

  return WIRING.map((w) => {
    let sourceKind: "SENSOR" | "REFERENSI" = "SENSOR";
    let liveReading = w.reading;
    let liveStatus: "OK" | "WARN" | "FAULT" = w.status;
    let statusLabel: string = w.status;

    if (w.id === "W-01") {
      const isCrit = t.crit_alert || t.v_bat < critV;
      liveReading = `${t.v_bat.toFixed(2)} V (Batas ${critV.toFixed(2)}V)`;
      liveStatus = isCrit ? "WARN" : "OK";
      statusLabel = isCrit ? "WARN" : "OK";
    } else if (w.id === "W-02") {
      sourceKind = "REFERENSI";
      liveReading = "0.00 Ohm (Nominal Referensi)";
    } else if (w.id === "W-03") {
      sourceKind = "REFERENSI";
      liveReading = "3.30 V (Nominal Regulator)";
    } else if (w.id === "W-04") {
      liveReading = t.adc_raw_mv > 0 ? "Pulsa 40ms / Siklus (Aktif)" : "0.00 V (Idle)";
      statusLabel = t.engine_on ? "OK" : "PULSA";
    } else if (w.id === "W-05") {
      liveReading = `${t.adc_raw_mv} mV (m=${slope.toFixed(6)})`;
    } else if (w.id === "W-06") {
      if (t.can_ok === false) {
        liveStatus = "FAULT";
        statusLabel = "FAULT";
        liveReading = "Gagal Inisialisasi Rail 3.3V";
      } else if (t.engine_on) {
        liveReading = "3.3V Aktif (Polling ECU)";
      } else {
        liveReading = "Pulsa Siklus (Uji Loopback) / Gated 0V";
        statusLabel = "SLEEP";
      }
    } else if (w.id === "W-07") {
      if (t.can_ok === false) {
        liveStatus = "FAULT";
        statusLabel = "FAULT";
        liveReading = "Gangguan Transceiver / Loopback";
      } else if (t.engine_on) {
        liveReading = "500 kbps (ECU Terhubung)";
      } else {
        liveReading = "500 kbps (Loopback OK, ECU Standby)";
        statusLabel = "STANDBY";
      }
    } else if (w.id === "W-08") {
      liveReading = `${t.rtc_temp_c.toFixed(2)} °C (DS3231SN)`;
    }

    return {
      id: w.id,
      wire: w.wire,
      path: w.path,
      signal: w.signal,
      sourceKind,
      liveReading,
      liveStatus,
      statusLabel,
    };
  });
}
