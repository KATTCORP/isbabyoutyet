import { describe, expect, it } from "vitest";

import { getSousVideEntries } from "@/data/sousVide";
import {
  THERMAL_RANGE_C,
  temperatureHue,
  temperatureSwatch,
  thermalGradient,
  thermalPosition,
} from "@/lib/temperature-color";
import { createContentT } from "@/lib/content-t";

describe("thermal ramp", () => {
  it("covers every temperature in the data", () => {
    for (const entry of getSousVideEntries(createContentT("en-GB"))) {
      expect(entry.temperatureC).toBeGreaterThanOrEqual(THERMAL_RANGE_C.min);
      expect(entry.temperatureC).toBeLessThanOrEqual(THERMAL_RANGE_C.max);
    }
  });

  it("clamps outside the range", () => {
    expect(thermalPosition(-10)).toBe(0);
    expect(thermalPosition(THERMAL_RANGE_C.min)).toBe(0);
    expect(thermalPosition(THERMAL_RANGE_C.max)).toBe(1);
    expect(thermalPosition(500)).toBe(1);
    expect(thermalPosition(65)).toBeCloseTo(0.5);
  });

  it("sweeps blue → violet → red → orange without passing green", () => {
    expect(temperatureHue(40)).toBe(250);
    expect(temperatureHue(65)).toBeCloseTo(317.5);
    expect(temperatureHue(90)).toBeCloseTo(25);

    // Hue increases monotonically (mod 360) as it gets hotter, and the
    // green band (≈110–190°) is never visited.
    let previous = -1;
    for (let temperatureC = 40; temperatureC <= 90; temperatureC += 1) {
      const unwrapped = temperatureHue(temperatureC) + (temperatureC >= 81 ? 360 : 0);
      expect(unwrapped).toBeGreaterThan(previous);
      previous = unwrapped;
      const hue = temperatureHue(temperatureC);
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
