import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  technicalSidebar: [
    {
      type: "doc",
      id: "intro",
      label: "1. Ikhtisar Sistem ORION",
    },
    {
      type: "category",
      label: "2. Hardware & Kelistrikan PCB",
      collapsed: false,
      items: [
        "hardware/electrical-schematic",
        "hardware/pinout-and-wiring",
        "hardware/power-budget",
      ],
    },
    {
      type: "category",
      label: "3. Firmware ESP32 v1.6.0",
      collapsed: false,
      items: [
        "firmware/telemetry-struct",
        "firmware/two-tier-buffer",
        "firmware/wifi-zone-handover",
        "firmware/obd2-can-protocol",
      ],
    },
    {
      type: "category",
      label: "4. Backend PHP & Skema MySQL",
      collapsed: false,
      items: [
        "backend-api/database-schema",
        "backend-api/ingest-and-piggyback",
        "backend-api/live-polling-and-guard",
        "backend-api/mutations-and-exports",
      ],
    },
    {
      type: "category",
      label: "5. Algoritma & Prognostik",
      collapsed: false,
      items: [
        "algorithms/adc-ols-calibration",
        "algorithms/battery-prognostics",
        "algorithms/pre-ntp-clock-pairing",
      ],
    },
    {
      type: "category",
      label: "6. Panduan HMI & Operasional",
      collapsed: false,
      items: [
        "hmi-operations/module-01-topology",
        "hmi-operations/module-02-fleet-pdi",
        "hmi-operations/module-03-warmup",
        "hmi-operations/module-04-diagnostics",
        "hmi-operations/module-05-presence",
        "hmi-operations/module-06-config",
        "hmi-operations/deployment-ci-cd",
      ],
    },
  ],
};

export default sidebars;
