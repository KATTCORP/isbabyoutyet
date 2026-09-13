import type { TimeRangeMinutes } from "@/data/sousVide";

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** Format a duration stored as whole minutes for the active locale. */
export function formatDurationMinutes(minutes: number, locale: string) {
  if (minutes < 60) {
    return `${formatNumber(minutes, locale)} min`;
  }

  if (minutes % 60 === 0 || minutes % 30 === 0) {
    return `${formatNumber(minutes / 60, locale)} h`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${formatNumber(hours, locale)} h ${formatNumber(remainder, locale)} min`;
}

export function formatDurationRange(range: TimeRangeMinutes, locale: string) {
  if (range.min === range.max) {
    return formatDurationMinutes(range.min, locale);
  }
  return `${formatDurationMinutes(range.min, locale)}–${formatDurationMinutes(range.max, locale)}`;
}
