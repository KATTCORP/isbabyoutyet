import { expect, test } from "vitest";
import {
  babyOgImageFileName,
  babyOgImageHash,
  babyOgImagePublicIdFromFileName,
  calendarDayKey,
  parseBabyOgImageFileName,
} from "./babyOgImage";
import { DEFAULT_MILESTONE_VISIBILITY } from "./types";

const waitingBaby = {
  babyBorn: null,
  dueDate: "2026-09-01",
  dueDateDisplayMode: "exact" as const,
  laborStarted: null,
  locale: "en-GB",
  milestoneVisibility: DEFAULT_MILESTONE_VISIBILITY,
  name: "Avery",
  photoId: null,
  publicDueDateText: null,
  theme: null,
  wentToHospital: null,
};

test("baby OG image hashes are stable for the same public page", () => {
  expect(babyOgImageHash(waitingBaby)).toBe(babyOgImageHash({ ...waitingBaby }));
});

test("baby OG image hashes change when the rendered page would change", () => {
  const themeHash = babyOgImageHash({ ...waitingBaby, theme: "baby-blue" });
  const photoHash = babyOgImageHash({ ...waitingBaby, photoId: "storage-photo-id" });
  const bornHash = babyOgImageHash({
    ...waitingBaby,
    babyBorn: "2026-08-10T10:00:00.000Z",
  });

  expect(themeHash).not.toBe(babyOgImageHash(waitingBaby));
  expect(photoHash).not.toBe(babyOgImageHash(waitingBaby));
  expect(bornHash).not.toBe(babyOgImageHash(waitingBaby));
  expect(themeHash).not.toBe(photoHash);
});

test("calendar day keys follow the baby's time zone across midnight UTC", () => {
  const justAfterUtcMidnight = Date.parse("2026-09-04T01:00:00.000Z");
  expect(calendarDayKey({ now: justAfterUtcMidnight, timeZone: "Europe/London" })).toBe("20260904");
  expect(calendarDayKey({ now: justAfterUtcMidnight, timeZone: "America/Los_Angeles" })).toBe(
    "20260903",
  );
});

test("OG image file names put the public id, content hash, and day in the path", () => {
  expect(
    babyOgImageFileName({
      asOfDay: "20260904",
      ogImageHash: "abc123",
      publicId: "baby-smith",
    }),
  ).toBe("baby-smith-abc123-20260904");
  expect(parseBabyOgImageFileName("baby-smith-abc123-20260904")).toEqual({
    asOfDay: "20260904",
    ogImageHash: "abc123",
    publicId: "baby-smith",
  });
  expect(parseBabyOgImageFileName("baby-smith")).toBeNull();
  expect(babyOgImagePublicIdFromFileName("baby-smith-abc123-20260904")).toBe("baby-smith");
  expect(babyOgImagePublicIdFromFileName("baby-smith")).toBe("baby-smith");
});
