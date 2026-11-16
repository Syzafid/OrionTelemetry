# ORION Telemetry & Digital Twin Workbench

**ORION (Onboard Reporting for Inventory & Operational Notifications)** is a real-time IoT vehicle stock-yard monitoring platform combining an ESP32 OBD-II / battery piggyback node, a PHP/MySQL telemetry API (`dipo_api`), and a React 19 + Three.js + TanStack Start HMI dashboard.

## Project Structure

- `src/` — Frontend HMI application (`Showroom`, `Fleet`, `Diagnostics`, `Presence`, `Config`), state management (`TelemetryContext`), and unit tests (`vitest`).
- `backend/dipo_api/` — PHP/PDO REST API (`simpan_data.php`, `get_data.php`, `get_live_status.php`, `update_config.php`, `export_csv.php`, `export_excel.php`) and MySQL schema (`schema.sql`).
- `firmware/sketch_oct16aa/` — ESP32 firmware implementing ADC sampling, DS3231SN RTC, WCMCU-230 TWAI CAN loopback, Tier-1 RTC + Tier-2 LittleFS offline buffering, and Piggyback ACK sync.

## Local Development

```sh
npm install
npm run dev
```

## Verification & Build

```sh
npx tsc --noEmit
npm test
npm run build
```
