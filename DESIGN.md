# ORION Design Direction

Dial: ENERGY 1 / RHYTHM 2 / MOTION 1

## Visual & Operational Identity
- **Product**: ORION (Onboard Reporting for Inventory & Operational Notifications), an automotive workshop & PDI stock-yard HMI workbench built for field technicians and service advisors inspecting 12V battery health, OBD-II CAN bus parameters, engine warm-up priority, and gate presence.
- **Theme Choice (R-21)**: Fixed dark UI (`#0E1116` charcoal base) designed to minimize screen glare under workshop lighting and night-time stock-yard inspections (`yard-night.jpg` hero). Light print stylesheet (`@media print`) overrides to `#FFFFFF` / `#0E1116` for printable PDI certificates.
- **Palette (R-25, R-29)**:
  - Core surfaces: Background `#0E1116`, Panel Carbon `oklch(0.17 0.008 265)` (`#0E0F13`), Secondary `oklch(0.21 0.01 265)` (`#16181D`).
  - Core ink: Cream `#F2EFE9` (`16.48:1` on background, `16.69:1` on carbon), Muted ink `oklch(0.75 0.012 260)` (`#AAAEB6`, `8.50:1`+), Dim `#9499A0` (`6.59:1`+).
  - Interactive Borders (WCAG 1.4.11 >= 3.0:1): `--border` / `--input` `#5C6370` (`3.13:1` on `#0E1116`, `3.17:1` on `#0E0F13`), Chart grid `--chart-grid` `#5A6270` (`3.12:1` on `#0E0F13`), subtle panel divider `--hairline` `#3B4250`.
  - Brand Crimson Accent (`--primary` / `--crimson`): `#F45B60` (`5.86:1` on `#0E1116`) paired with `#0E1116` `--primary-foreground` (`5.86:1` PASS WCAG AA). Used strictly for ORION brand mark, critical battery alerts (`< crit_v`), and MIL/DTC warnings.
  - Functional Status Tones (never decorative): Emerald `oklch(0.76 0.155 163)` (`#2ACF94`, `9.53:1` on carbon) for healthy/charging/online; Amber `oklch(0.81 0.165 75)` (`#FEAF1E`, `10.37:1` on carbon) for pre-alert/fallback/offline-buffer.
- **Typography (R-06)**:
  - `Outfit` (`--font-display`) for structured uppercase industrial section & module headers (`tracking-[0.06em]` to `tracking-[0.14em]`).
  - `Space Grotesk` (`--font-sans`) for readable Indonesian technical body copy.
  - `JetBrains Mono` (`--font-mono` / `.num`) with `tabular-nums` for aligned voltase, RPM, coolant, mAh, and timestamp readouts. Minimum interactive/telemetry font floor is `11px`.
- **Radius & Elevation (R-11, R-12)**: Crisp `2px` (`1px`-`2px`) machined corners across panels, buttons, and inputs; flat dark planes separated by hairline borders rather than floating shadows.
- **Dose Caps & Restraint (R-02, R-10, R-13, R-19)**:
  - Zero em dashes (U+2014) in any UI copy, label, or documentation prose.
  - Maximum 1 translucent `backdrop-blur` sticky header surface on a route; modals use solid scrims (`bg-black/80`) without backdrop blur.
  - Zero glowing LED box-shadows and zero infinite pulsing loops; critical transitions fire only as a one-shot attention border flash (`CriticalFlash`) via `MotionConfig reducedMotion="user"`.
  - Charts state the specific engineering question they answer, show real units & thresholds without requiring hover, and never plot synthetic waveforms when real history is absent.
