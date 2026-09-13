import { describe, expect, it } from "vitest";

import { defaultTemperatureUnit, formatTemperature, isTemperatureUnit } from "./temperature";

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

describe("isTemperatureUnit", () => {
  it("accepts only c and f", () => {
    expect(isTemperatureUnit("c")).toBe(true);
    expect(isTemperatureUnit("f")).toBe(true);
    expect(isTemperatureUnit("k")).toBe(false);
  });
});

describe("formatTemperature", () => {
  it("formats Celsius and Fahrenheit", () => {
    expect(formatTemperature(60, { unit: "c", locale: "en-GB" })).toBe("60°C");
    expect(formatTemperature(60, { unit: "f", locale: "en-US" })).toBe("140°F");
  });
});
