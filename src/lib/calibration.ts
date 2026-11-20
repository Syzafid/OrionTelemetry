export interface CalPoint {
  /** DMM-measured battery terminal voltage, in V */
  dmm: number;
  /** ESP32 GPIO34 Node M raw reading, in mV */
  mv: number;
}

export interface CalResult {
  /** V per mV */
  slope: number;
  /** V, intercept: V_bat = adc_raw_mv * slope + offset */
  offset: number;
  rSquared: number;
}

/**
 * SOP C.1: ordinary least squares linear regression of DMM voltage (y)
 * against raw ADC millivolts (x). Computed in real time from the 4-point table.
 */
export function olsCalibration(points: CalPoint[]): CalResult {
  const valid = points.filter((p) => Number.isFinite(p.dmm) && Number.isFinite(p.mv));
  const n = valid.length;
  if (n < 2) return { slope: 0, offset: 0, rSquared: 0 };
  const mx = valid.reduce((s, p) => s + p.mv, 0) / n;
  const my = valid.reduce((s, p) => s + p.dmm, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (const p of valid) {
    const dx = p.mv - mx;
    const dy = p.dmm - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return { slope: 0, offset: my, rSquared: 0 };
  const slope = sxy / sxx;
  const offset = my - slope * mx;
  const rSquared = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, offset, rSquared };
}
