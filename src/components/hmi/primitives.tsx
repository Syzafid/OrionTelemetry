import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { VehicleUnit } from "@/data/mockTelemetry";

export type Tone = "emerald" | "crimson" | "amber" | "cyan" | "dim";

const toneText: Record<Tone, string> = {
  emerald: "text-emerald", crimson: "text-crimson", amber: "text-amber", cyan: "text-cyan", dim: "text-dim",
};

export function Led({ tone = "emerald", pulse = false, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return <span className={cn("led", toneText[tone], pulse && "animate-led", className)} />;
}

export function Panel({ title, code, right, children, className }: {
  title: string; code?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("hmi-panel panel relative flex min-w-0 flex-col", className)} aria-label={title}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {code && <span className="num text-[11px] font-semibold text-crimson">{code}</span>}
          <h3 className="label-hmi text-foreground">{title}</h3>
        </div>
        {right}
      </header>
      <div className="panel-body flex-1 p-4" tabIndex={0}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, unit, tone = "dim" }: { label: string; value: ReactNode; unit?: string; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-hmi">{label}</span>
      <span className={cn("num text-lg leading-none font-medium", tone === "dim" ? "text-foreground" : toneText[tone])}>
        {value}
        {unit && <span className="ml-1 text-xs text-muted-foreground font-normal">{unit}</span>}
      </span>
    </div>
  );
}

export function Pill({ active, onClick, children, tone = "cyan" }: {
  active?: boolean; onClick?: () => void; children: ReactNode; tone?: Tone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "num inline-flex min-h-[32px] items-center justify-center rounded-[2px] border px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors",
        active
          ? cn("border-current bg-current/10 font-medium", toneText[tone])
          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function unitTone(u: VehicleUnit, critV = 11.8): Tone {
  if (u.state === "DEPARTED" || !u.in_yard) return "cyan";
  if (u.telemetry.crit_alert || u.telemetry.v_bat < critV) return "crimson";
  if (u.telemetry.engine_on) return "emerald";
  if (u.telemetry.v_bat < 12.3) return "amber";
  return "emerald";
}

export const fmtV = (v: number) => v.toFixed(2);
