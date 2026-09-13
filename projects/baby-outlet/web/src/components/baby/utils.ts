import { parseISO } from "date-fns";
import { BABY_BLUE_THEME } from "@baby-outlet/backend/src/theme";
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
import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import type { TranslationKey } from "@/lib/i18n";

export const THEME_OPTIONS = [
  {
    value: null,
    labelKey: "Default",
    colors: ["#ea580c", "#fef3c7", "#fed7aa"],
    css: null,
  }, // orange primary
  {
    value: "violet-bloom",
    labelKey: "Violet Bloom",
    css: violetBloomCss,
    colors: ["#7033ff", "#fdfdfd", "#e2ebff"],
  },
  {
    value: BABY_BLUE_THEME,
    labelKey: "Baby Blue",
    css: babyBlueCss,
    colors: ["#1e9df1", "#ffffff", "#e3ecf6"],
  },
  {
    value: "bubblegum",
    labelKey: "Bubblegum",
    css: bubblegumCss,
    colors: ["#d04f99", "#f6e6ee", "#fbe2a7"],
  },
  {
    value: "catppuccin",
    labelKey: "Catppuccin",
    css: catppuccinCss,
    colors: ["#8839ef", "#eff1f5", "#04a5e5"],
  },
  {
    value: "mocha-mousse",
    labelKey: "Mocha Mousse",
    css: mochaMousseCss,
    colors: ["#a37764", "#f1f0e5", "#e4c7b8"],
  },
  {
    value: "quantum-rose",
    labelKey: "Quantum Rose",
    css: quantumRoseCss,
    colors: ["#e6067a", "#fff0f8", "#ffc1e3"],
  },
  {
    value: "sunny-days",
    labelKey: "Sunny Days",
    css: sunnyDaysCss,
    colors: ["#f2a614", "#fff9e8", "#8ed1c5"],
  },
] as const satisfies ReadonlyArray<{
  value: string | null;
  labelKey: TranslationKey;
  colors: readonly string[];
  css: string | null;
}>;

export function getThemeOption(theme: string | null | undefined) {
  return THEME_OPTIONS.find((option) => option.value === (theme ?? null));
}

export function getThemeColors(theme: string | null | undefined) {
  return getThemeOption(theme)?.colors ?? THEME_OPTIONS[0].colors;
}

const TIMEZONE = "Europe/Stockholm";

/** Raw CSS for a theme preset, or null for the default (app) theme. */
export function getThemeCss(theme: string | null | undefined): string | null {
  if (!theme) return null;
  return getThemeOption(theme)?.css ?? null;
}

export function getThemePrimaryColor(theme: string | null | undefined): string {
  return getThemeColors(theme)[0];
}

function parseDate(dateString: string): Date {
  return parseISO(dateString);
}

export function formatDate(dateString: string, locale: SupportedLocale): string {
  const date = parseDate(dateString);
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    dateStyle: "long",
    timeStyle: "short",
  });
  return formatter.format(date);
}

export function getRelativeTime(dateString: string, locale: SupportedLocale): string {
  const date = parseDate(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const intervals = [
    { unit: "year" as const, seconds: 31536000 },
    { unit: "month" as const, seconds: 2592000 },
    { unit: "week" as const, seconds: 604800 },
    { unit: "day" as const, seconds: 86400 },
    { unit: "hour" as const, seconds: 3600 },
    { unit: "minute" as const, seconds: 60 },
  ];

  for (const { unit, seconds } of intervals) {
    const interval = Math.floor(Math.abs(diffInSeconds) / seconds);
    if (interval >= 1) {
      return rtf.format(diffInSeconds > 0 ? interval : -interval, unit);
    }
  }

  return rtf.format(0, "second");
}

export function formatDueDate(dateString: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    dateStyle: "long",
  }).format(parseDate(dateString));
}

export function getDaysUntilDueDate(dueDate: string): number {
  const now = new Date();
  const due = parseDate(dueDate);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const nowParts = formatter.formatToParts(now);
  const currentYearPart = nowParts.find((p) => p.type === "year");
  const currentMonthPart = nowParts.find((p) => p.type === "month");
  const currentDayPart = nowParts.find((p) => p.type === "day");
  if (!currentYearPart || !currentMonthPart || !currentDayPart) {
    return 0;
  }
  const currentYear = parseInt(currentYearPart.value);
  const currentMonth = parseInt(currentMonthPart.value);
  const currentDay = parseInt(currentDayPart.value);

  const dueParts = formatter.formatToParts(due);
  const dueYearPart = dueParts.find((p) => p.type === "year");
  const dueMonthPart = dueParts.find((p) => p.type === "month");
  const dueDayPart = dueParts.find((p) => p.type === "day");
  if (!dueYearPart || !dueMonthPart || !dueDayPart) {
    return 0;
  }
  const dueYear = parseInt(dueYearPart.value);
  const dueMonth = parseInt(dueMonthPart.value);
  const dueDay = parseInt(dueDayPart.value);

  const currentDate = new Date(currentYear, currentMonth - 1, currentDay);
  const dueDateObj = new Date(dueYear, dueMonth - 1, dueDay);

  const diffInMs = dueDateObj.getTime() - currentDate.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  return diffInDays;
}

export function getOverdueDays(dueDate: string): number {
  const daysUntil = getDaysUntilDueDate(dueDate);
  return Math.max(0, -daysUntil);
}
