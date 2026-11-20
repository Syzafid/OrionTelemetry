import type { ComponentType } from "react";
import type { ModuleId } from "@/context/TelemetryContext";

export const loadFleetModule = () =>
  import("@/components/hmi/FleetModule").then((m) => ({ default: m.FleetModule }));

export const loadWarmupQueueModule = () =>
  import("@/components/hmi/WarmupQueueModule").then((m) => ({ default: m.WarmupQueueModule }));

export const loadDiagnosticsModule = () =>
  import("@/components/hmi/DiagnosticsModule").then((m) => ({ default: m.DiagnosticsModule }));

export const loadPresenceModule = () =>
  import("@/components/hmi/PresenceModule").then((m) => ({ default: m.PresenceModule }));

export const loadConfigModule = () =>
  import("@/components/hmi/ConfigModule").then((m) => ({ default: m.ConfigModule }));

export const loadCommandPaletteModal = () =>
  import("@/components/hmi/CommandPaletteModal").then((m) => ({
    default: m.CommandPaletteModal,
  }));

const MODULE_PREFETCH_LOADERS: Partial<
  Record<ModuleId, () => Promise<{ default: ComponentType }>>
> = {
  "02": loadFleetModule,
  "03": loadWarmupQueueModule,
  "04": loadDiagnosticsModule,
  "05": loadPresenceModule,
  "06": loadConfigModule,
};

const prefetchedKeys = new Set<string>();

/** Idempotently preloads a lazy HMI module chunk on tab hover or keyboard focus. */
export function prefetchHmiModule(id: ModuleId): void {
  if (id === "01" || prefetchedKeys.has(id)) return;
  const loader = MODULE_PREFETCH_LOADERS[id];
  if (!loader) return;
  prefetchedKeys.add(id);
  void loader().catch(() => {
    prefetchedKeys.delete(id);
  });
}

/** Idempotently preloads the command palette modal chunk on button hover or focus. */
export function prefetchCommandPalette(): void {
  if (prefetchedKeys.has("command-palette")) return;
  prefetchedKeys.add("command-palette");
  void loadCommandPaletteModal().catch(() => {
    prefetchedKeys.delete("command-palette");
  });
}
