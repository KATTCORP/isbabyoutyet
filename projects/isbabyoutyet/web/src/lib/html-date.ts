import { parseISO } from "date-fns";
import { z } from "zod";
import type { TranslationFunction } from "@/lib/i18n";

function zonedDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const minute = value("minute");
  const second = value("second");
  if (!year || !month || !day || !hour || !minute || !second) {
    return null;
  }
  return { day, hour, minute, month, second, year };
}

/** `datetime-local` value (`YYYY-MM-DDTHH:mm`) in the baby's timezone. */
function toDatetimeLocalValue(date: Date, timeZone: string): string {
  const parts = zonedDateTimeParts(date, timeZone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : "";
}

function dateTimeLocalToEpochMs(value: string, timeZone: string): number {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/.exec(value);
  const groups = match?.groups;
  if (!groups) {
    return Number.NaN;
  }
  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  const hour = Number(groups.hour);
  const minute = Number(groups.minute);
  if ([year, month, day, hour, minute].some(Number.isNaN)) {
    return Number.NaN;
  }

  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let epoch = targetUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedDateTimeParts(new Date(epoch), timeZone);
    if (!rendered) {
      return Number.NaN;
    }
    const renderedUtc = Date.UTC(
      Number(rendered.year),
      Number(rendered.month) - 1,
      Number(rendered.day),
      Number(rendered.hour),
      Number(rendered.minute),
      Number(rendered.second),
    );
    epoch += targetUtc - renderedUtc;
  }
  return toDatetimeLocalValue(new Date(epoch), timeZone) === value ? epoch : Number.NaN;
}

function utcCalendarDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Optional `<input type="date">`: empty ↔ null, otherwise UTC midnight ISO.
 * Use `.encode` for defaultValues and let the resolver `.decode` on submit.
 */
export function htmlDate(t: TranslationFunction) {
  const pickerDate = z
    .string()
    .refine((value) => value === "" || z.iso.date().safeParse(value).success, t("Pick a date"));
  return z.codec(pickerDate, z.union([z.string(), z.null()]), {
    decode: (value) => (value === "" ? null : `${value}T00:00:00.000Z`),
    encode: (iso) => {
      if (iso === null) {
        return "";
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return iso;
      }
      return utcCalendarDate(parseISO(iso));
    },
  });
}

/**
 * `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) ↔ ISO instant.
 */
export function htmlDateTime(t: TranslationFunction, timeZone: string) {
  return z.codec(z.string().min(1, t("Pick a date and time")), z.string(), {
    decode: (local, payload) => {
      const epoch = dateTimeLocalToEpochMs(local, timeZone);
      if (Number.isNaN(epoch)) {
        payload.issues.push({
          code: "custom",
          input: local,
          message: t("Pick a date and time"),
        });
        return z.NEVER;
      }
      return new Date(epoch).toISOString();
    },
    encode: (iso) => toDatetimeLocalValue(parseISO(iso), timeZone),
  });
}

/**
 * Optional event time: empty means "now" (`null`), a filled picker is epoch ms.
 */
export function optionalHtmlDateTime(t: TranslationFunction, timeZone: string) {
  return z.codec(z.string(), z.number().nullable(), {
    decode: (value, payload) => {
      if (value === "") {
        return null;
      }
      const ms = dateTimeLocalToEpochMs(value, timeZone);
      if (Number.isNaN(ms)) {
        payload.issues.push({
          code: "custom",
          input: value,
          message: t("Pick a valid time — or leave it blank for now"),
        });
        return z.NEVER;
      }
      return ms;
    },
    encode: (ms) => (ms == null ? "" : toDatetimeLocalValue(new Date(ms), timeZone)),
  });
}

/** `datetime-local` max/default for "now" in the baby's timezone. */
export function htmlDateTimeNow(timeZone: string): string {
  return toDatetimeLocalValue(new Date(), timeZone);
}
