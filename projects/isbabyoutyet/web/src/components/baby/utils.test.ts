import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { formatDate, getDaysUntilDueDate } from "./utils";

function useFakeTimersResource(now: Date) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

test("due-date countdown uses the baby's calendar day", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-21T00:30:00.000Z"));

  expect(getDaysUntilDueDate("2026-08-21", "Europe/London")).toBe(0);
  expect(getDaysUntilDueDate("2026-08-21", "America/Los_Angeles")).toBe(1);
});

test("milestone timestamps format in the baby's time zone", () => {
  const instant = "2026-08-21T00:30:00.000Z";

  expect(formatDate(instant, { locale: "en-GB", timeZone: "Europe/London" })).toContain("01:30");
  expect(formatDate(instant, { locale: "en-GB", timeZone: "America/Los_Angeles" })).toContain(
    "20 August 2026",
  );
});
