# ORION Telemetry & Digital Twin Workbench

ORION (_Onboard Reporting for Inventory & Operational Notifications_) is a vehicle stock-yard telemetry platform combining an ESP32 OBD-II / battery piggyback node (PCB v1.0 & PCB v2.0 Step 2.1), a PHP 8 / MySQL REST API (`backend/dipo_api`), a React 19 + TanStack Start HMI console (`/dashboard`), and a Docusaurus v3.10.2 technical documentation site (`/docs/`).

## Repository Layout

- `src/`: TanStack Start frontend landing page (`/`), 6-module HMI workbench (`/dashboard`: `Showroom`, `Fleet`, `Warmup`, `Diagnostics`, `Presence`, `Config`), shared state (`TelemetryContext`), and hardware blueprint SSOT (`src/data/hardwareBlueprint.ts`).
- `backend/dipo_api/`: PHP/PDO REST API (`simpan_data.php`, `get_data.php`, `get_live_status.php`, `update_config.php`, `export_csv.php`, `export_excel.php`, `db.php`), idempotent schema (`schema_production.sql`), and CLI/token-guarded migration helper (`migrate.php`).
- `firmware/sketch_oct16aa/`: ESP32 v1.6.0 firmware implementing duty-cycled 40ms high-side ADC sampling, `DS3231SN` RTC wakeup/temp, `WCMCU-230` TWAI CAN read-only Mode `0x01`/`0x03` polling + loopback self-test, 4-zone Wi-Fi handover, 2-tier offline buffering (`20` RTC SRAM + `2.000` LittleFS `/tier2_queue.bin`), and Piggyback ACK sync.
- `docs/`: Docusaurus v3.10.2 documentation portal covering end-to-end DFDs, PCB v2.0 Step 2.1 layout diagrams (`PNG`, `SVG`, `.md` export), electrical flow analysis, firmware, PHP/MySQL contracts, OLS/Arrhenius algorithms, and operator guides.
- `scripts/`: Repository hygiene guard (`check-repo-hygiene.mjs`) and Heroku production packaging (`prepare-heroku.mjs`).

## Local Development

```sh
npm install
npm run dev
```

To preview the documentation site independently:

```sh
npm run docs:start
```

## Verification & Production Build

```sh
npm run check:hygiene
npm run docs:typecheck
npm run typecheck
npm run lint:ci
npm test
npm run build
```
