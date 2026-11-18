import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { UNITS, DEFAULT_CONFIG, type VehicleUnit } from "@/data/mockTelemetry";
import {
  formatDurationCompact,
  formatSleepInterval,
  getVehicleElectricalProfile,
} from "@/lib/vehicle-topology";
import { VehicleTopologyMap } from "@/components/hmi/VehicleTopologyMap";
import { ComponentNodeInspector } from "@/components/hmi/ComponentNodeInspector";

afterEach(() => {
  cleanup();
});

function buildBaseUnit(overrides?: Partial<VehicleUnit>): VehicleUnit {
  const base = UNITS[0]!;
  return {
    ...base,
    ...overrides,
    telemetry: {
      ...base.telemetry,
      ...(overrides?.telemetry ?? {}),
    },
  };
}

describe("Menu 01 Utilities (vehicle-topology.ts)", () => {
  it("resolves accurate OEM electrical profiles across Mitsubishi models", () => {
    const pajero = getVehicleElectricalProfile("PAJERO SPORT");
    expect(pajero.alternatorAmps).toBe("130A");
    expect(pajero.batteryAh).toBe("70Ah");
    expect(pajero.engineCode).toContain("4N15");

    const xforce = getVehicleElectricalProfile("XFORCE");
    expect(xforce.alternatorAmps).toBe("90A");
    expect(xforce.batteryAh).toBe("55Ah");
    expect(xforce.engineCode).toContain("4A91");

    const l300 = getVehicleElectricalProfile("L300");
    expect(l300.alternatorAmps).toBe("110A");
    expect(l300.batteryAh).toBe("65Ah");
    expect(l300.engineCode).toContain("4N14");
  });

  it("formats elapsed durations and deep-sleep intervals cleanly", () => {
    expect(formatDurationCompact(null)).toBe("");
    expect(formatDurationCompact(42)).toBe("42d lalu");
    expect(formatDurationCompact(125)).toBe("2m 5d lalu");
    expect(formatDurationCompact(3720)).toBe("1j 2m lalu");
    expect(formatDurationCompact(90000)).toBe("1h 1j lalu");

    expect(formatSleepInterval(0)).toBe("300 Detik");
    expect(formatSleepInterval(45)).toBe("45 Detik");
    expect(formatSleepInterval(300)).toBe("5 Menit");
    expect(formatSleepInterval(21600)).toBe("6 Jam");
  });
});

describe("VehicleTopologyMap (Menu 01 Orthographic Map)", () => {
  it("renders model badge, 7 filter buttons, and dispatches node selection from buttons and SVG probes", () => {
    const unit = buildBaseUnit({ model: "PAJERO SPORT" });
    const onSelectNode = vi.fn();

    render(
      <VehicleTopologyMap
        unit={unit}
        activeNode="battery"
        onSelectNode={onSelectNode}
        config={DEFAULT_CONFIG(unit.unit_id)}
      />,
    );

    expect(screen.getByText(/TOPOLOGI KELISTRIKAN MITSUBISHI PAJERO SPORT/i)).toBeInTheDocument();

    for (const label of [
      "SEMUA",
      "AKI 12V",
      "ALTERNATOR",
      "MESIN / RPM",
      "CAN BUS",
      "ESP32",
      "GATEWAY RF",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") }),
      ).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /^ALTERNATOR$/i }));
    expect(onSelectNode).toHaveBeenCalledWith("alternator");

    fireEvent.click(screen.getByRole("button", { name: "Probe Sensor Putaran Mesin dan Coolant" }));
    expect(onSelectNode).toHaveBeenCalledWith("powertrain");
  });
});

describe("ComponentNodeInspector (Menu 01 Telemetry Matrix & Tabs)", () => {
  it("displays all 8 channels when activeNode='all' and filters to 2 channels when activeNode='battery'", () => {
    const unit = buildBaseUnit();
    const onSelectNode = vi.fn();

    const { rerender } = render(
      <ComponentNodeInspector
        unit={unit}
        activeNode="all"
        onSelectNode={onSelectNode}
        config={DEFAULT_CONFIG(unit.unit_id)}
      />,
    );

    expect(screen.getByText("[8 Saluran Terhubung]")).toBeInTheDocument();
    const matrixPanel = screen.getByRole("tabpanel");
    const table = within(matrixPanel).getByRole("table");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(8);
    expect(within(table).getAllByRole("button")).toHaveLength(8);

    rerender(
      <ComponentNodeInspector
        unit={unit}
        activeNode="battery"
        onSelectNode={onSelectNode}
        config={DEFAULT_CONFIG(unit.unit_id)}
      />,
    );

    expect(screen.getByText("[2 Saluran Terhubung]")).toBeInTheDocument();
    const filteredTable = within(screen.getByRole("tabpanel")).getByRole("table");
    expect(filteredTable.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(within(filteredTable).getAllByRole("button")).toHaveLength(2);

    const resetBtn = screen.getByRole("button", { name: /Tampilkan Semua \(8 Saluran\)/i });
    fireEvent.click(resetBtn);
    expect(onSelectNode).toHaveBeenCalledWith("all");
  });

  it("switches ARIA tabs between Matriks, Transduser & OLS, and Manual Servis (SOP)", () => {
    const xforceUnit = buildBaseUnit({ model: "XFORCE" });
    const onSelectNode = vi.fn();

    const { rerender } = render(
      <ComponentNodeInspector
        unit={xforceUnit}
        activeNode="battery"
        onSelectNode={onSelectNode}
        config={DEFAULT_CONFIG(xforceUnit.unit_id)}
      />,
    );

    const tabTransducer = screen.getByRole("tab", { name: /Transduser & OLS/i });
    fireEvent.click(tabTransducer);

    expect(tabTransducer).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/KALIBRASI OLS ADC \(GPIO34 NODE M\)/i)).toBeInTheDocument();
    expect(screen.getByText("ADC RAW PIN 34")).toBeInTheDocument();
    expect(screen.getByText("KALKULASI OLS vs AKTUAL")).toBeInTheDocument();

    rerender(
      <ComponentNodeInspector
        unit={xforceUnit}
        activeNode="alternator"
        onSelectNode={onSelectNode}
        config={DEFAULT_CONFIG(xforceUnit.unit_id)}
      />,
    );
    expect(screen.getByText(/ANALISIS SIRKUIT PENGISIAN ALTERNATOR 90A/i)).toBeInTheDocument();

    const tabSop = screen.getByRole("tab", { name: /Manual Servis \(SOP\)/i });
    fireEvent.click(tabSop);
    expect(tabSop).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/STANDAR OPERASIONAL PROSEDUR DIAGNOSTIK/i)).toBeInTheDocument();
  });

  it("enforces backend DEEP_SLEEP_HOLD, real sync_ssid, and MySQL history sparkline in LIVE_API mode", () => {
    const base = buildBaseUnit();
    const liveOfflineUnit = buildBaseUnit({
      online_status: "OFFLINE",
      connection_badge: "OFFLINE / DEEP SLEEP",
      last_seen: "2026-11-17 16:25:22",
      last_seen_sec: 1200,
      sync_ssid: "POCOF6",
      telemetry: {
        ...base.telemetry,
        v_bat: 12.01,
        adc_raw_mv: 2206,
        sync_ssid: "POCOF6",
      },
    });

    const { container } = render(
      <ComponentNodeInspector
        unit={liveOfflineUnit}
        activeNode="all"
        isLiveApi={true}
        config={DEFAULT_CONFIG(liveOfflineUnit.unit_id)}
        historyPoints={[
          { t: "16:20", v: 11.98 },
          { t: "16:25", v: 12.01 },
        ]}
      />,
    );

    expect(screen.getAllByText("DEEP_SLEEP_HOLD").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("LIVE_SYNC")).not.toBeInTheDocument();
    expect(screen.getAllByText(/POCOF6/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2026-11-17 16:25:22/).length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector("polyline")).not.toBeNull();
  });
});
