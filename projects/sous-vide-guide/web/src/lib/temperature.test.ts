import { describe, expect, it } from "vitest";

import {
  defaultTemperatureUnit,
  formatTemperature,
  temperatureUnitSearchSchema,
} from "./temperature";

describe("defaultTemperatureUnit", () => {
  it("uses Fahrenheit for US English and other US region tags", () => {
    expect(defaultTemperatureUnit("en-US")).toBe("f");
    expect(defaultTemperatureUnit("en-us")).toBe("f");
    expect(defaultTemperatureUnit("es-US")).toBe("f");
  });

  it("uses Celsius for non-US locales (browser / Accept-Language defaults)", () => {
    expect(defaultTemperatureUnit("en-GB")).toBe("c");
    expect(defaultTemperatureUnit("sv")).toBe("c");
    expect(defaultTemperatureUnit("en")).toBe("c");
    expect(defaultTemperatureUnit("de-DE")).toBe("c");
  });
});

describe("temperatureUnitSearchSchema", () => {
  it("accepts only c and f, dropping anything else", () => {
    expect(temperatureUnitSearchSchema.parse("c")).toBe("c");
    expect(temperatureUnitSearchSchema.parse("f")).toBe("f");
    expect(temperatureUnitSearchSchema.parse("k")).toBeUndefined();
    expect(temperatureUnitSearchSchema.parse(undefined)).toBeUndefined();
  });
});

describe("formatTemperature", () => {
  it("formats Celsius and Fahrenheit", () => {
    expect(formatTemperature(60, { locale: "en-GB", unit: "c" })).toBe("60°C");
    expect(formatTemperature(60, { locale: "en-US", unit: "f" })).toBe("140°F");
  });
});
