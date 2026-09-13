import { parseISO } from "date-fns";
import { BABY_BLUE_THEME } from "@isbabyoutyet/backend/src/theme";
// Inline theme CSS (?raw) so we can inject via route `head.styles`.
// External `head.links` stylesheets get React 19 `precedence` via TanStack's
// Asset helper and can stay in the document after navigating away.
import violetBloomCss from "@/styles/themes/violet-bloom.css?raw";
import babyBlueCss from "@/styles/themes/baby-blue.css?raw";
import bubblegumCss from "@/styles/themes/bubblegum.css?raw";
import catppuccinCss from "@/styles/themes/catppuccin.css?raw";
import mochaMousseCss from "@/styles/themes/mocha-mousse.css?raw";
import quantumRoseCss from "@/styles/themes/quantum-rose.css?raw";
import sunnyDaysCss from "@/styles/themes/sunny-days.css?raw";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import type { TranslationKey } from "@/lib/i18n";

export const THEME_OPTIONS = [
  {
    colors: ["#ea580c", "#fef3c7", "#fed7aa"],
    css: null,
    labelKey: "Mango",
    value: null,
  }, // orange primary
  {
    colors: ["#7033ff", "#fdfdfd", "#e2ebff"],
    css: violetBloomCss,
    labelKey: "Violet Bloom",
    value: "violet-bloom",
  },
  {
    colors: ["#1e9df1", "#ffffff", "#e3ecf6"],
    css: babyBlueCss,
    labelKey: "Baby Blue",
    value: BABY_BLUE_THEME,
  },
  {
    colors: ["#d04f99", "#f6e6ee", "#fbe2a7"],
    css: bubblegumCss,
    labelKey: "Bubblegum",
    value: "bubblegum",
  },
  {
    colors: ["#8839ef", "#eff1f5", "#04a5e5"],
    css: catppuccinCss,
    labelKey: "Catppuccin",
    value: "catppuccin",
  },
  {
    colors: ["#a37764", "#f1f0e5", "#e4c7b8"],
    css: mochaMousseCss,
    labelKey: "Mocha Mousse",
    value: "mocha-mousse",
  },
  {
    colors: ["#e6067a", "#fff0f8", "#ffc1e3"],
    css: quantumRoseCss,
    labelKey: "Quantum Rose",
    value: "quantum-rose",
  },
  {
    colors: ["#f2a614", "#fff9e8", "#8ed1c5"],
    css: sunnyDaysCss,
    labelKey: "Sunny Days",
    value: "sunny-days",
  },
] as const satisfies ReadonlyArray<{
  colors: ReadonlyArray<string>;
  css: string | null;
  labelKey: TranslationKey;
  value: string | null;
}>;

export function getThemeOption(theme: string | null | undefined) {
  return THEME_OPTIONS.find((option) => option.value === (theme ?? null));
}

export function getThemeColors(theme: string | null | undefined) {
  return getThemeOption(theme)?.colors ?? THEME_OPTIONS[0].colors;
}

/** Raw CSS for a theme preset, or null for the default (app) theme. */
export function getThemeCss(theme: string | null | undefined): string | null {
  if (!theme) {
    return null;
  }
  return getThemeOption(theme)?.css ?? null;
}

export function getThemePrimaryColor(theme: string | null | undefined): string {
  return getThemeColors(theme)[0];
}

function parseDate(dateString: string): Date {
  return parseISO(dateString);
}

function parseCalendarDate(dateString: string): Date {
  const calendarDate = dateString.slice(0, 10);
  return new Date(`${calendarDate}T00:00:00.000Z`);
}

type DateTimeFormatOptions = {
  locale: SupportedLocale;
  timeZone: string;
};

export function formatDate(dateString: string, opts: DateTimeFormatOptions): string {
  const date = parseDate(dateString);
  const formatter = new Intl.DateTimeFormat(opts.locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: opts.timeZone,
  });
  return formatter.format(date);
}

export function getRelativeTime(dateString: string, locale: SupportedLocale): string {
  const date = parseDate(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const intervals = [
    { seconds: 31_536_000, unit: "year" as const },
    { seconds: 2_592_000, unit: "month" as const },
    { seconds: 604_800, unit: "week" as const },
    { seconds: 86_400, unit: "day" as const },
    { seconds: 3600, unit: "hour" as const },
    { seconds: 60, unit: "minute" as const },
  ];

  for (const { seconds, unit } of intervals) {
    const interval = Math.floor(Math.abs(diffInSeconds) / seconds);
    if (interval >= 1) {
      return rtf.format(diffInSeconds > 0 ? interval : -interval, unit);
    }
  }

  return rtf.format(0, "second");
}

export function formatDueDate(dateString: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(parseCalendarDate(dateString));
}

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return null;
  }
  return {
    day: Number.parseInt(day),
    month: Number.parseInt(month),
    year: Number.parseInt(year),
  };
}

export function getDaysUntilDueDate(dueDate: string, timeZone: string): number {
  const now = new Date();
  const current = datePartsInTimeZone(now, timeZone);
  const due = datePartsInTimeZone(parseCalendarDate(dueDate), "UTC");
  if (!current || !due) {
    return 0;
  }
  const currentDate = Date.UTC(current.year, current.month - 1, current.day);
  const dueDateUtc = Date.UTC(due.year, due.month - 1, due.day);
  return Math.round((dueDateUtc - currentDate) / (1000 * 60 * 60 * 24));
}

export function getOverdueDays(dueDate: string, timeZone: string): number {
  const daysUntil = getDaysUntilDueDate(dueDate, timeZone);
  return Math.max(0, -daysUntil);
}
