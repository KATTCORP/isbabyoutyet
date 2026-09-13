export type TemperatureUnit = "c" | "f";

export function isTemperatureUnit(value: string): value is TemperatureUnit {
  return value === "c" || value === "f";
}

function celsiusToFahrenheit(temperatureC: number) {
  return (temperatureC * 9) / 5 + 32;
}

type FormatTemperatureOptions = {
  unit: TemperatureUnit;
  locale: string;
};

/** Format a Celsius source temperature for display in °C or °F. */
export function formatTemperature(temperatureC: number, options: FormatTemperatureOptions) {
  const value = options.unit === "f" ? celsiusToFahrenheit(temperatureC) : temperatureC;
  const rounded = options.unit === "f" ? Math.round(value) : Math.round(value * 10) / 10;
  const formatted = new Intl.NumberFormat(options.locale, {
    maximumFractionDigits: options.unit === "f" ? 0 : 1,
  }).format(rounded);
  const suffix = options.unit === "f" ? "°F" : "°C";
  return `${formatted}${suffix}`;
}

/** Default unit: Fahrenheit for American English, Celsius otherwise. */
export function defaultTemperatureUnit(locale: string): TemperatureUnit {
  return locale === "en-US" ? "f" : "c";
}
