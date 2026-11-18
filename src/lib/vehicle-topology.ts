export type TopologyNodeId =
  "all" | "battery" | "alternator" | "powertrain" | "can_obd" | "esp32_core" | "rf_network";

export interface VehicleElectricalProfile {
  engineCode: string;
  batterySpec: string;
  alternatorSpec: string;
  alternatorAmps: string;
  batteryAh: string;
  idleRpmRange: string;
  cutInRpm: string;
  chassisLabel: string;
}

/**
 * Resolves OEM electrical & engine parameters by Mitsubishi vehicle model.
 */
export function getVehicleElectricalProfile(model: string): VehicleElectricalProfile {
  const upper = model.toUpperCase();
  if (upper.includes("XFORCE") || upper.includes("XPANDER")) {
    return {
      engineCode: "1.5L 4A91 MIVEC DOHC",
      batterySpec: "Aki 12V 55Ah (55B24L)",
      alternatorSpec: "Alternator 12V 90A",
      alternatorAmps: "90A",
      batteryAh: "55Ah",
      idleRpmRange: "650 - 750 RPM (Idle)",
      cutInRpm: "600 RPM",
      chassisLabel: "MPV / Compact SUV Unibody",
    };
  }
  if (upper.includes("L300")) {
    return {
      engineCode: "2.2L 4N14 Euro-4 Turbo Diesel",
      batterySpec: "Aki 12V 65Ah (75D26R)",
      alternatorSpec: "Alternator Denso 12V 110A",
      alternatorAmps: "110A",
      batteryAh: "65Ah",
      idleRpmRange: "700 - 800 RPM (Idle)",
      cutInRpm: "650 RPM",
      chassisLabel: "Cab-Over Ladder Frame",
    };
  }
  return {
    engineCode: "2.4L 4N15 MIVEC / 2.5L 4D56 Diesel",
    batterySpec: "Aki 12V 70Ah (80D26L)",
    alternatorSpec: "Alternator Denso 12V 130A",
    alternatorAmps: "130A",
    batteryAh: "70Ah",
    idleRpmRange: "700 - 800 RPM (Idle)",
    cutInRpm: "650 RPM",
    chassisLabel: "Ladder Frame Chassis",
  };
}

/**
 * Formats an elapsed duration in seconds into compact Indonesian telemetry notation.
 */
export function formatDurationCompact(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "";
  if (sec < 60) return `${sec}d lalu`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}d lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}j ${Math.floor((sec % 3600) / 60)}m lalu`;
  return `${Math.floor(sec / 86400)}h ${Math.floor((sec % 86400) / 3600)}j lalu`;
}

/**
 * Formats ESP32 deep-sleep configuration seconds into human-readable Indonesian intervals.
 */
export function formatSleepInterval(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "300 Detik";
  if (sec >= 3600 && sec % 3600 === 0) {
    return `${Math.round(sec / 3600)} Jam`;
  }
  if (sec >= 60 && sec % 60 === 0) {
    return `${Math.round(sec / 60)} Menit`;
  }
  return `${Math.round(sec)} Detik`;
}
