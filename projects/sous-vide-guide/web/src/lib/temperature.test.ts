import { describe, expect, it } from "vitest";

import {
  defaultTemperatureUnit,
  formatTemperature,
  temperatureUnitSearchSchema,
  unitSearchMiddleware,
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

describe("unitSearchMiddleware", () => {
  type UnitSearch = Partial<Record<"unit", "c" | "f">>;
  const inBritishEnglish = unitSearchMiddleware(() => "en-GB");
  const navigate = (from: UnitSearch, to: UnitSearch) =>
    inBritishEnglish({ next: () => to, search: from });

  it("keeps the current unit when the navigation doesn't mention it", () => {
    expect(navigate({ unit: "f" }, {})).toEqual({ unit: "f" });
  });

  it("drops the locale's default unit, whether set or retained", () => {
    expect(navigate({ unit: "f" }, { unit: "c" })).toEqual({});
    expect(navigate({ unit: "c" }, {})).toEqual({});
  });

  it("drops the unit when it is explicitly cleared", () => {
    expect(navigate({ unit: "f" }, { unit: undefined })).toEqual({});
  });
});

describe("formatTemperature", () => {
  it("formats Celsius and Fahrenheit", () => {
    expect(formatTemperature(60, { locale: "en-GB", unit: "c" })).toBe("60°C");
    expect(formatTemperature(60, { locale: "en-US", unit: "f" })).toBe("140°F");
  });
});
