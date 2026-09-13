export type TemperatureUnit = "c" | "f";

export function isTemperatureUnit(value: string): value is TemperatureUnit {
  return value === "c" || value === "f";
}

export function celsiusToFahrenheit(temperatureC: number) {
  return (temperatureC * 9) / 5 + 32;
}

export function formatTemperature(temperatureC: number, unit: TemperatureUnit) {
  if (unit === "f") {
    const fahrenheit = celsiusToFahrenheit(temperatureC);
    const rounded = Math.round(fahrenheit * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}°F` : `${rounded.toFixed(1)}°F`;
  }

  return Number.isInteger(temperatureC) ? `${temperatureC}°C` : `${temperatureC.toFixed(1)}°C`;
}

/** Default unit: Fahrenheit for American English, Celsius otherwise. */
export function defaultTemperatureUnit(locale: string): TemperatureUnit {
  return locale === "en-US" ? "f" : "c";
}
