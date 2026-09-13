import { expect, test } from "vitest";
import type { TranslationFunction } from "@/lib/i18n";
import { htmlDate, htmlDateTime, htmlDateTimeNow, optionalHtmlDateTime } from "@/lib/html-date";

// SAFETY: Test fixture is a subset of the production type.
const t = ((key: string) => key) as TranslationFunction;
const dateCodec = htmlDate(t);
const dateTimeCodec = htmlDateTime(t, "Europe/London");
const optionalDateTimeCodec = optionalHtmlDateTime(t, "Europe/London");

test("calendar date decode/encode roundtrips a YYYY-MM-DD picker value", () => {
  expect(dateCodec.decode("2026-09-01")).toBe("2026-09-01T00:00:00.000Z");
  expect(dateCodec.encode(dateCodec.decode("2026-09-01"))).toBe("2026-09-01");
});

test("calendar date encode accepts a stored ISO instant", () => {
  expect(dateCodec.encode("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
});

test("calendar date encode leaves a YYYY-MM-DD value unchanged", () => {
  expect(dateCodec.encode("2026-09-01")).toBe("2026-09-01");
});

test("optional calendar date maps an empty picker to null", () => {
  expect(dateCodec.decode("")).toBeNull();
  expect(dateCodec.encode(null)).toBe("");
});

test("optional calendar date roundtrips a selected date", () => {
  expect(dateCodec.decode("2026-09-01")).toBe("2026-09-01T00:00:00.000Z");
  expect(dateCodec.encode("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
});

test("datetime-local roundtrips an instant through the baby's timezone", () => {
  const iso = "2026-08-10T07:30:00.000Z";
  expect(dateTimeCodec.encode(iso)).toBe("2026-08-10T08:30");
  expect(dateTimeCodec.decode(dateTimeCodec.encode(iso))).toBe(iso);
});

test("datetime-local display changes with the baby's timezone", () => {
  const iso = "2026-08-10T07:30:00.000Z";
  expect(htmlDateTime(t, "Asia/Tokyo").encode(iso)).toBe("2026-08-10T16:30");
  expect(htmlDateTime(t, "America/New_York").encode(iso)).toBe("2026-08-10T03:30");
});

test("datetime-local rejects a wall time skipped by daylight saving", () => {
  expect(htmlDateTime(t, "Europe/London").safeDecode("2026-03-29T01:30").success).toBe(false);
});

test("empty optional time means now (null)", () => {
  expect(optionalDateTimeCodec.decode("")).toBe(null);
  expect(optionalDateTimeCodec.encode(null)).toBe("");
});

test("optional time roundtrips a minute-precision instant", () => {
  const ms = Date.parse("2026-08-10T07:30:00.000Z");
  expect(optionalDateTimeCodec.decode(optionalDateTimeCodec.encode(ms))).toBe(ms);
});

test("optional time rejects a garbled value", () => {
  const result = optionalDateTimeCodec.safeDecode("not-a-date");
  expect(result.success).toBe(false);
});

test("datetime-local now is a picker-shaped baby-local value", () => {
  expect(htmlDateTimeNow("Europe/London")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("calendar date rejects a non-date", () => {
  expect(dateCodec.safeDecode("nope").success).toBe(false);
});

test("datetime-local rejects an empty picker", () => {
  expect(dateTimeCodec.safeDecode("").success).toBe(false);
});

test("codec error messages come from t", () => {
  // SAFETY: Test fixture is a subset of the production type.
  const swedish = ((key: string) =>
    key === "Pick a date" ? "Välj ett datum" : key) as TranslationFunction;
  const result = htmlDate(swedish).safeDecode("nope");
  const message = result.success === false ? result.error.issues[0]?.message : undefined;
  expect(result.success).toBe(false);
  expect(message).toBe("Välj ett datum");
});
