import { expect, test } from "vitest";
import { notificationScheduleDelayMs } from "../src/notificationTiming";

test("uses a 60 second production cancellation window", () => {
  expect(notificationScheduleDelayMs("production", "production")).toBe(60_000);
});

test("uses a 10 second preview cancellation window despite production Node mode", () => {
  expect(notificationScheduleDelayMs("preview", "production")).toBe(10_000);
});

test("uses a 10 second local development cancellation window", () => {
  expect(notificationScheduleDelayMs(undefined, "development")).toBe(10_000);
});

test("keeps existing production deployments safe before Vercel environment sync", () => {
  expect(notificationScheduleDelayMs(undefined, "production")).toBe(60_000);
});
