/**
 * Thermal colour ramp for the guide: every temperature maps to one hue so a
 * row's colour alone says "cold fish bath" or "hot vegetable bath".
 *
 * The ramp runs the long way round the wheel — blue → violet → magenta → red →
 * orange — so it never passes through green, which does not read as heat.
 */

/** Coldest / hottest bath in the source data; values outside clamp to the ends. */
export const THERMAL_RANGE_C = { max: 90, min: 40 } as const;

const HUE_START = 250;
const HUE_SWEEP = 135;

function clampTemperature(temperatureC: number) {
  return Math.min(THERMAL_RANGE_C.max, Math.max(THERMAL_RANGE_C.min, temperatureC));
}

/** Position of a temperature on the ramp, `0` at the cold end and `1` at the hot end. */
export function thermalPosition(temperatureC: number) {
  const span = THERMAL_RANGE_C.max - THERMAL_RANGE_C.min;
  return (clampTemperature(temperatureC) - THERMAL_RANGE_C.min) / span;
}

/** OKLCH hue in degrees, `[0, 360)`. */
export function temperatureHue(temperatureC: number) {
  return (HUE_START + HUE_SWEEP * thermalPosition(temperatureC)) % 360;
}

export type ThermalSwatch = {
  /** Saturated colour for numerals and accents. */
  ink: string;
  /** Mid-strength colour for bars and dots. */
  solid: string;
  /** Pale tint for card backgrounds. */
  wash: string;
};

export function temperatureSwatch(temperatureC: number): ThermalSwatch {
  const hue = temperatureHue(temperatureC).toFixed(1);
  return {
    ink: `oklch(0.5 0.15 ${hue})`,
    solid: `oklch(0.66 0.15 ${hue})`,
    wash: `oklch(0.95 0.03 ${hue})`,
  };
}

/** Left-to-right CSS `linear-gradient` sweeping the ramp between two temperatures. */
export function thermalGradient(range: { max: number; min: number }) {
  const stops = 5;
  const parts: Array<string> = [];
  for (let index = 0; index < stops; index += 1) {
    const temperatureC = range.min + ((range.max - range.min) * index) / (stops - 1);
    parts.push(temperatureSwatch(temperatureC).solid);
  }
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}
