import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import {
  babySeoHead,
  babyStatusDetail,
  babyStatusLabel,
  homepageOgImagePath,
  openGraphImageMeta,
  robotsNoIndexMeta,
} from "@/lib/seo";
import { CANONICAL_ORIGIN, absoluteUrl, canonicalUrl } from "@/lib/site-url";

function useFakeTimersResource(now: Date) {
  vi.useFakeTimers({ now });
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

test("canonical URLs always point at production", () => {
  expect(canonicalUrl("/")).toBe(`${CANONICAL_ORIGIN}/`);
  expect(canonicalUrl("/baby/juniper-hale")).toBe(`${CANONICAL_ORIGIN}/baby/juniper-hale`);
});

test("absolute asset URLs accept an explicit origin", () => {
  expect(absoluteUrl(homepageOgImagePath(), "http://localhost:3000")).toBe(
    "http://localhost:3000/og",
  );
  expect(absoluteUrl("/og/baby/juniper-hale", "http://localhost:3000")).toBe(
    "http://localhost:3000/og/baby/juniper-hale",
  );
});

test("baby SEO head includes countdown title, description, and dynamic OG image", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));

  const seo = babySeoHead({
    name: "Juniper",
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    publicId: "juniper-hale",
    theme: "sunny-days",
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: null,
    laborStarted: null,
  });

  expect(seo.title).toContain("21 days until due date");
  expect(seo.title).toContain("Juniper");
  expect(seo.description).toContain("Juniper");
  expect(seo.canonical).toBe(`${CANONICAL_ORIGIN}/baby/juniper-hale`);
  expect(seo.imageUrl).toContain("/og/baby/juniper-hale");
  expect(seo.indexable).toBe(true);
});

test("custom due date text replaces countdown metadata", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const baby = {
    name: "Juniper",
    dueDateDisplayMode: "message" as const,
    publicDueDateText: "Any day now",
    publicId: "juniper-hale",
    theme: "sunny-days",
    locale: "en-GB" as const,
    babyBorn: null,
    wentToHospital: null,
    laborStarted: null,
  };

  const seo = babySeoHead(baby);
  expect(seo.title).toContain("Is Juniper out yet?");
  expect(seo.title).not.toContain("until due date");
  expect(babyStatusDetail({ baby, status: { type: "not_yet" } })).toBe("Any day now");

  const exactModeSeo = babySeoHead({
    name: baby.name,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    publicId: baby.publicId,
    theme: baby.theme,
    locale: baby.locale,
    babyBorn: baby.babyBorn,
    wentToHospital: baby.wentToHospital,
    laborStarted: baby.laborStarted,
  });
  expect(exactModeSeo.title).toContain("21 days until due date");
});

test("baby SEO description changes when the baby is born", () => {
  const seo = babySeoHead({
    name: "Milo",
    dueDate: "2026-08-01",
    dueDateDisplayMode: "exact",
    publicId: "baby-born",
    theme: null,
    locale: "en-GB",
    babyBorn: "2026-08-10T10:00:00.000Z",
    wentToHospital: "2026-08-10T06:00:00.000Z",
    laborStarted: "2026-08-10T02:00:00.000Z",
  });

  expect(seo.description).toContain("arrived");
  expect(seo.indexable).toBe(false);
  expect(babyStatusLabel({ status: { type: "born", date: "2026-08-10" }, locale: "en-GB" })).toBe(
    "Yes! Baby is out",
  );
});

test("baby SEO descriptions cover labour and hospital stages", () => {
  const inLabor = babySeoHead({
    name: "Frankie",
    dueDate: "2026-08-20",
    dueDateDisplayMode: "exact",
    publicId: "baby-in-labor",
    theme: null,
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: null,
    laborStarted: "2026-08-14T01:00:00.000Z",
  });
  const atHospital = babySeoHead({
    name: "Rowan",
    dueDate: "2026-08-20",
    dueDateDisplayMode: "exact",
    publicId: "baby-at-hospital",
    theme: null,
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: "2026-08-14T02:00:00.000Z",
    laborStarted: "2026-08-14T01:00:00.000Z",
  });

  expect(inLabor.description).toContain("labour");
  expect(atHospital.description).toContain("hospital");
  expect(
    babyStatusLabel({
      status: { type: "labor_started", date: "2026-08-14T01:00:00.000Z" },
      locale: "en-GB",
    }),
  ).toBe("Labour started");
});

test("hidden milestone data does not appear in public SEO copy", () => {
  const seo = babySeoHead({
    name: "River",
    dueDate: "2026-08-20",
    dueDateDisplayMode: "exact",
    publicId: "river",
    theme: null,
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: "2026-08-14T02:00:00.000Z",
    laborStarted: "2026-08-14T01:00:00.000Z",
    milestoneVisibility: { showLabor: false, showHospital: false },
  });

  expect(seo.description).not.toContain("labour");
  expect(seo.description).not.toContain("hospital");
  expect(seo.description).toContain("River");
});

test("overdue baby titles use the overdue copy", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-20T12:00:00.000Z"));

  const seo = babySeoHead({
    name: "Avery",
    dueDate: "2026-08-11",
    dueDateDisplayMode: "exact",
    publicId: "baby-waiting",
    theme: null,
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: null,
    laborStarted: null,
  });

  expect(seo.title).toContain("overdue");
  expect(robotsNoIndexMeta()[0]?.content).toContain("noindex");
});

test("baby titles use singular day copy for one-day overdue and one day until due", async () => {
  await using _untilTimers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const untilDue = babySeoHead({
    name: "Sage",
    dueDate: "2026-08-12",
    dueDateDisplayMode: "exact",
    publicId: "baby-waiting",
    theme: null,
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: null,
    laborStarted: null,
  });
  expect(untilDue.title).toContain("1 day until due date");

  await using _overdueTimers = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  const overdue = babySeoHead({
    name: "Sage",
    dueDate: "2026-08-11",
    dueDateDisplayMode: "exact",
    publicId: "baby-waiting",
    theme: null,
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: null,
    laborStarted: null,
  });
  expect(overdue.title).toContain("1 day overdue");
});

test("born babies keep the base title without a due-date countdown", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-20T12:00:00.000Z"));
  const seo = babySeoHead({
    name: "Milo",
    dueDate: "2026-08-01",
    dueDateDisplayMode: "exact",
    publicId: "baby-born",
    theme: null,
    locale: "en-GB",
    babyBorn: "2026-08-10T10:00:00.000Z",
    wentToHospital: "2026-08-10T06:00:00.000Z",
    laborStarted: "2026-08-10T02:00:00.000Z",
  });
  expect(seo.title).toContain("Is Milo out yet?");
  expect(seo.title).not.toContain("overdue");
  expect(seo.title).not.toContain("until due date");
});

test("baby status labels cover hospital and waiting states", () => {
  expect(
    babyStatusLabel({
      status: { type: "gone_to_hospital", date: "2026-08-14T02:00:00.000Z" },
      locale: "en-GB",
    }),
  ).toBe("Gone to hospital");
  expect(babyStatusLabel({ status: { type: "not_yet" }, locale: "en-GB" })).toBe("Not yet");
});

test("baby status detail covers born, in-progress, overdue, and due-date copy", async () => {
  expect(
    babyStatusDetail({
      baby: {
        dueDate: "2026-08-01",
        dueDateDisplayMode: "exact",
        babyBorn: "2026-08-10T10:00:00.000Z",
        locale: "en-GB",
      },
      status: { type: "born", date: "2026-08-10" },
    }),
  ).toBe("Yes! Baby is out");
  expect(
    babyStatusDetail({
      baby: {
        dueDate: "2026-08-20",
        dueDateDisplayMode: "exact",
        babyBorn: null,
        locale: "en-GB",
      },
      status: { type: "labor_started", date: "2026-08-14T01:00:00.000Z" },
    }),
  ).toBe("Labour started");
  expect(
    babyStatusDetail({
      baby: {
        dueDate: "2026-08-20",
        dueDateDisplayMode: "exact",
        babyBorn: null,
        locale: "en-GB",
      },
      status: { type: "gone_to_hospital", date: "2026-08-14T02:00:00.000Z" },
    }),
  ).toBe("Gone to hospital");

  await using _untilTimers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  expect(
    babyStatusDetail({
      baby: {
        dueDate: "2026-08-12",
        dueDateDisplayMode: "exact",
        babyBorn: null,
        locale: "en-GB",
      },
      status: { type: "not_yet" },
    }),
  ).toBe("1 day until due date");
  expect(
    babyStatusDetail({
      baby: {
        dueDate: "2026-09-01",
        dueDateDisplayMode: "exact",
        babyBorn: null,
        locale: "en-GB",
      },
      status: { type: "not_yet" },
    }),
  ).toBe("21 days until due date");

  await using _overdueTimers = useFakeTimersResource(new Date("2026-08-20T12:00:00.000Z"));
  expect(
    babyStatusDetail({
      baby: {
        dueDate: "2026-08-19",
        dueDateDisplayMode: "exact",
        babyBorn: null,
        locale: "en-GB",
      },
      status: { type: "not_yet" },
    }),
  ).toBe("1 day overdue");
  expect(
    babyStatusDetail({
      baby: {
        dueDate: "2026-08-11",
        dueDateDisplayMode: "exact",
        babyBorn: null,
        locale: "en-GB",
      },
      status: { type: "not_yet" },
    }),
  ).toBe("9 days overdue");
});

test("Open Graph image meta includes dimensions and a large Twitter card", () => {
  const tags = openGraphImageMeta({
    imageUrl: "https://isbabyoutyet.com/og",
    alt: "Is Baby Out Yet?",
  });
  expect(tags).toEqual(
    expect.arrayContaining([
      { property: "og:image", content: "https://isbabyoutyet.com/og" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ]),
  );
});
