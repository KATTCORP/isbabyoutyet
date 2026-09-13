import { describe, expect, it } from "vitest";

import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { THERMAL_RANGE_C, temperatureSwatch, thermalGradient } from "@/lib/temperature-color";

/** Hue in degrees read back from the swatch's `oklch(L C H)` ink colour. */
function hueOf(temperatureC: number) {
  const match = /^oklch\(0\.5 0\.15 (\d+(?:\.\d)?)\)$/.exec(temperatureSwatch(temperatureC).ink);
  if (match === null || match[1] === undefined) {
    throw new Error(`unexpected swatch: ${temperatureSwatch(temperatureC).ink}`);
  }
  return Number(match[1]);
}

describe("thermal ramp", () => {
  it("covers every temperature in the data", () => {
    for (const entry of getSousVideEntries(createContentT("en-GB"))) {
      expect(entry.temperatureC).toBeGreaterThanOrEqual(THERMAL_RANGE_C.min);
      expect(entry.temperatureC).toBeLessThanOrEqual(THERMAL_RANGE_C.max);
    }
  });

  it("clamps outside the range", () => {
    expect(hueOf(-10)).toBe(hueOf(THERMAL_RANGE_C.min));
    expect(hueOf(500)).toBe(hueOf(THERMAL_RANGE_C.max));
    expect(hueOf(65)).toBeCloseTo((hueOf(40) + 360 + hueOf(90)) / 2, 0);
  });

  it("sweeps blue → violet → red → orange without passing green", () => {
    expect(hueOf(40)).toBe(250);
    expect(hueOf(65)).toBeCloseTo(317.5);
    expect(hueOf(90)).toBeCloseTo(25);

    // Hue increases monotonically (mod 360) as it gets hotter, and the
    // green band (≈110–190°) is never visited.
    let previous = -1;
    for (let temperatureC = 40; temperatureC <= 90; temperatureC += 1) {
      const hue = hueOf(temperatureC);
      const unwrapped = hue + (temperatureC >= 81 ? 360 : 0);
      expect(unwrapped).toBeGreaterThan(previous);
      previous = unwrapped;
      expect(hue < 110 || hue > 190).toBe(true);
    }
  });

  it("emits valid oklch() strings and gradients", () => {
    const swatch = temperatureSwatch(54);
    expect(swatch.ink).toMatch(/^oklch\(0\.5 0\.15 \d+(\.\d)?\)$/);
    expect(swatch.wash).toMatch(/^oklch\(0\.95 0\.03 \d+(\.\d)?\)$/);
    expect(swatch.solid).toMatch(/^oklch\(0\.66 0\.15 \d+(\.\d)?\)$/);

    const gradient = thermalGradient({ max: 55, min: 41 });
    expect(gradient.startsWith("linear-gradient(90deg, oklch(")).toBe(true);
    expect(gradient.match(/oklch\(/g)).toHaveLength(5);
  });
});
