import { expect, test } from "vitest";
import { formatDate, getDaysUntilDueDate } from "./utils";

test("due-date countdown uses the baby's calendar day", () => {
  const now = Date.parse("2026-08-21T00:30:00.000Z");

  expect(getDaysUntilDueDate("2026-08-21", { now, timeZone: "Europe/London" })).toBe(0);
  expect(getDaysUntilDueDate("2026-08-21", { now, timeZone: "America/Los_Angeles" })).toBe(1);
});

test("milestone timestamps format in the baby's time zone", () => {
  const instant = "2026-08-21T00:30:00.000Z";

  expect(formatDate(instant, { locale: "en-GB", timeZone: "Europe/London" })).toContain("01:30");
  expect(formatDate(instant, { locale: "en-GB", timeZone: "America/Los_Angeles" })).toContain(
    "20 August 2026",
  );
});
