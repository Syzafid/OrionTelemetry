import { describe, expect, it } from "vitest";
import { olsCalibration } from "@/lib/calibration";

const FOUR_POINT = [
  { dmm: 11.0, mv: 1966 },
  { dmm: 12.0, mv: 2151 },
  { dmm: 13.0, mv: 2336 },
  { dmm: 14.4, mv: 2595 },
];

describe("olsCalibration (SOP C.1)", () => {
  it("fits the four default points with slope, offset and r² = 1", () => {
    const { slope, offset, rSquared } = olsCalibration(FOUR_POINT);
    expect(slope).toBeCloseTo(0.0054054, 5);
    expect(offset).toBeCloseTo(0.37298, 3);
    expect(rSquared).toBeCloseTo(1, 6);
  });

  it("recovers V_bat within 10 mV at every calibration point", () => {
    const { slope, offset } = olsCalibration(FOUR_POINT);
    for (const p of FOUR_POINT) {
      expect(Math.abs(p.mv * slope + offset - p.dmm)).toBeLessThan(0.01);
    }
  });

  it("returns zeros when fewer than two valid points are given", () => {
    expect(olsCalibration([{ dmm: 12, mv: 2151 }])).toEqual({ slope: 0, offset: 0, rSquared: 0 });
    expect(olsCalibration([])).toEqual({ slope: 0, offset: 0, rSquared: 0 });
  });

  it("ignores non-finite entries and still fits the remaining points", () => {
    const { slope, rSquared } = olsCalibration([...FOUR_POINT, { dmm: NaN, mv: NaN }]);
    expect(slope).toBeCloseTo(0.0054054, 5);
    expect(rSquared).toBeCloseTo(1, 6);
  });
});
