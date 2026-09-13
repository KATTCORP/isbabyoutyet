import { expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { DEFAULT_MILESTONE_VISIBILITY } from "@baby-outlet/backend/src/types";
import {
  babySeoHead,
  babyStatusDetail,
  babyStatusLabel,
  getBabySeo,
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

function seoBaby<T extends object>(baby: T) {
  return { ogImageHash: "testoghash", timeZone: "Europe/London", ...baby };
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

  const seo = babySeoHead(
    seoBaby({
      babyBorn: null,
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      laborStarted: null,
      locale: "en-GB",
      name: "Juniper",
      publicId: "juniper-hale",
      theme: "sunny-days",
      wentToHospital: null,
    }),
  );

  expect(seo.title).toContain("21 days until due date");
  expect(seo.title).toContain("Juniper");
  expect(seo.description).toContain("Juniper");
  expect(seo.canonical).toBe(`${CANONICAL_ORIGIN}/baby/juniper-hale`);
  expect(new URL(seo.imageUrl).pathname).toBe("/og/baby/juniper-hale-testoghash-20260811");
  expect(seo.indexable).toBe(true);
});

test("baby OG image URL version changes with rendered baby data and the calendar day", async () => {
  const baby = seoBaby({
    babyBorn: null,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact" as const,
    laborStarted: null,
    locale: "en-GB" as const,
    name: "Avery",
    publicId: "baby-waiting",
    theme: null,
    wentToHospital: null,
  });
  await using _dayOne = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const mangoUrl = new URL(babySeoHead(baby).imageUrl);
  const babyBlueUrl = new URL(babySeoHead({ ...baby, ogImageHash: "themehash" }).imageUrl);

  expect(mangoUrl.pathname).toBe("/og/baby/baby-waiting-testoghash-20260811");
  expect(mangoUrl.search).toBe("");
  expect(babyBlueUrl.pathname).toBe("/og/baby/baby-waiting-themehash-20260811");
  expect(babySeoHead(baby).imageUrl).toBe(mangoUrl.toString());

  await using _dayTwo = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  expect(new URL(babySeoHead(baby).imageUrl).pathname).toBe(
    "/og/baby/baby-waiting-testoghash-20260812",
  );
});

test("custom due date text replaces countdown metadata", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const baby = seoBaby({
    babyBorn: null,
    dueDateDisplayMode: "message" as const,
    laborStarted: null,
    locale: "en-GB" as const,
    name: "Juniper",
    publicDueDateText: "Any day now",
    publicId: "juniper-hale",
    theme: "sunny-days",
    wentToHospital: null,
  });

  const seo = babySeoHead(baby);
  expect(seo.title).toContain("Is Juniper out yet?");
  expect(seo.title).not.toContain("until due date");
  expect(babyStatusDetail({ baby, status: { type: "not_yet" } })).toBe("Any day now");

  const exactModeSeo = babySeoHead(
    seoBaby({
      babyBorn: baby.babyBorn,
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      laborStarted: baby.laborStarted,
      locale: baby.locale,
      name: baby.name,
      publicId: baby.publicId,
      theme: baby.theme,
      wentToHospital: baby.wentToHospital,
    }),
  );
  expect(exactModeSeo.title).toContain("21 days until due date");
});

test("baby SEO description changes when the baby is born", () => {
  const seo = babySeoHead(
    seoBaby({
      babyBorn: "2026-08-10T10:00:00.000Z",
      dueDate: "2026-08-01",
      dueDateDisplayMode: "exact",
      laborStarted: "2026-08-10T02:00:00.000Z",
      locale: "en-GB",
      name: "Milo",
      publicId: "baby-born",
      theme: null,
      wentToHospital: "2026-08-10T06:00:00.000Z",
    }),
  );

  expect(seo.description).toContain("arrived");
  expect(seo.indexable).toBe(false);
  expect(babyStatusLabel({ locale: "en-GB", status: { date: "2026-08-10", type: "born" } })).toBe(
    "Yes! Baby is out",
  );
});

test("baby SEO descriptions cover labour and hospital stages", () => {
  const inLabor = babySeoHead(
    seoBaby({
      babyBorn: null,
      dueDate: "2026-08-20",
      dueDateDisplayMode: "exact",
      laborStarted: "2026-08-14T01:00:00.000Z",
      locale: "en-GB",
      name: "Frankie",
      publicId: "baby-in-labor",
      theme: null,
      wentToHospital: null,
    }),
  );
  const atHospital = babySeoHead(
    seoBaby({
      babyBorn: null,
      dueDate: "2026-08-20",
      dueDateDisplayMode: "exact",
      laborStarted: "2026-08-14T01:00:00.000Z",
      locale: "en-GB",
      name: "Rowan",
      publicId: "baby-at-hospital",
      theme: null,
      wentToHospital: "2026-08-14T02:00:00.000Z",
    }),
  );

  expect(inLabor.description).toContain("labour");
  expect(atHospital.description).toContain("hospital");
  expect(
    babyStatusLabel({
      locale: "en-GB",
      status: { date: "2026-08-14T01:00:00.000Z", type: "labor_started" },
    }),
  ).toBe("Labour started");
});

test("hidden milestone data does not appear in public SEO copy", () => {
  const seo = babySeoHead(
    seoBaby({
      babyBorn: null,
      dueDate: "2026-08-20",
      dueDateDisplayMode: "exact",
      laborStarted: "2026-08-14T01:00:00.000Z",
      locale: "en-GB",
      milestoneVisibility: { showHospital: false, showLabor: false },
      name: "River",
      publicId: "river",
      theme: null,
      wentToHospital: "2026-08-14T02:00:00.000Z",
    }),
  );

  expect(seo.description).not.toContain("labour");
  expect(seo.description).not.toContain("hospital");
  expect(seo.description).toContain("River");
});

test("overdue baby titles use the overdue copy", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-20T12:00:00.000Z"));

  const seo = babySeoHead(
    seoBaby({
      babyBorn: null,
      dueDate: "2026-08-11",
      dueDateDisplayMode: "exact",
      laborStarted: null,
      locale: "en-GB",
      name: "Avery",
      publicId: "baby-waiting",
      theme: null,
      wentToHospital: null,
    }),
  );

  expect(seo.title).toContain("overdue");
  expect(robotsNoIndexMeta()[0]?.content).toContain("noindex");
});

test("baby titles use singular day copy for one-day overdue and one day until due", async () => {
  await using _untilTimers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const untilDue = babySeoHead(
    seoBaby({
      babyBorn: null,
      dueDate: "2026-08-12",
      dueDateDisplayMode: "exact",
      laborStarted: null,
      locale: "en-GB",
      name: "Sage",
      publicId: "baby-waiting",
      theme: null,
      wentToHospital: null,
    }),
  );
  expect(untilDue.title).toContain("1 day until due date");

  await using _overdueTimers = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  const overdue = babySeoHead(
    seoBaby({
      babyBorn: null,
      dueDate: "2026-08-11",
      dueDateDisplayMode: "exact",
      laborStarted: null,
      locale: "en-GB",
      name: "Sage",
      publicId: "baby-waiting",
      theme: null,
      wentToHospital: null,
    }),
  );
  expect(overdue.title).toContain("1 day overdue");
});

test("born babies keep the base title without a due-date countdown", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-20T12:00:00.000Z"));
  const seo = babySeoHead(
    seoBaby({
      babyBorn: "2026-08-10T10:00:00.000Z",
      dueDate: "2026-08-01",
      dueDateDisplayMode: "exact",
      laborStarted: "2026-08-10T02:00:00.000Z",
      locale: "en-GB",
      name: "Milo",
      publicId: "baby-born",
      theme: null,
      wentToHospital: "2026-08-10T06:00:00.000Z",
    }),
  );
  expect(seo.title).toContain("Is Milo out yet?");
  expect(seo.title).not.toContain("overdue");
  expect(seo.title).not.toContain("until due date");
});

test("baby status labels cover hospital and waiting states", () => {
  expect(
    babyStatusLabel({
      locale: "en-GB",
      status: { date: "2026-08-14T02:00:00.000Z", type: "gone_to_hospital" },
    }),
  ).toBe("Gone to hospital");
  expect(babyStatusLabel({ locale: "en-GB", status: { type: "not_yet" } })).toBe("Not yet");
});

test("baby status detail covers born, in-progress, overdue, and due-date copy", async () => {
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: "2026-08-10T10:00:00.000Z",
        dueDate: "2026-08-01",
        dueDateDisplayMode: "exact",
        locale: "en-GB",
        timeZone: undefined,
      },
      status: { date: "2026-08-10", type: "born" },
    }),
  ).toBe("Yes! Baby is out");
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDate: "2026-08-20",
        dueDateDisplayMode: "exact",
        locale: "en-GB",
        timeZone: undefined,
      },
      status: { date: "2026-08-14T01:00:00.000Z", type: "labor_started" },
    }),
  ).toBe("Labour started");
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDate: "2026-08-20",
        dueDateDisplayMode: "exact",
        locale: "en-GB",
        timeZone: undefined,
      },
      status: { date: "2026-08-14T02:00:00.000Z", type: "gone_to_hospital" },
    }),
  ).toBe("Gone to hospital");

  await using _untilTimers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDate: "2026-08-12",
        dueDateDisplayMode: "exact",
        locale: "en-GB",
        timeZone: undefined,
      },
      status: { type: "not_yet" },
    }),
  ).toBe("1 day until due date");
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDate: "2026-09-01",
        dueDateDisplayMode: "exact",
        locale: "en-GB",
        timeZone: undefined,
      },
      status: { type: "not_yet" },
    }),
  ).toBe("21 days until due date");

  await using _overdueTimers = useFakeTimersResource(new Date("2026-08-20T12:00:00.000Z"));
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDate: "2026-08-19",
        dueDateDisplayMode: "exact",
        locale: "en-GB",
        timeZone: undefined,
      },
      status: { type: "not_yet" },
    }),
  ).toBe("1 day overdue");
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDate: "2026-08-11",
        dueDateDisplayMode: "exact",
        locale: "en-GB",
        timeZone: undefined,
      },
      status: { type: "not_yet" },
    }),
  ).toBe("9 days overdue");
});

test("blank message-mode status detail falls back to not yet", () => {
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDateDisplayMode: "message",
        locale: "en-GB",
        publicDueDateText: "",
        timeZone: undefined,
      },
      status: { type: "not_yet" },
    }),
  ).toBe("Not yet");
  expect(
    babyStatusDetail({
      baby: {
        babyBorn: null,
        dueDateDisplayMode: "message",
        locale: "en-GB",
        publicDueDateText: "   ",
        timeZone: undefined,
      },
      status: { type: "not_yet" },
    }),
  ).toBe("Not yet");
});

test("Open Graph image meta includes dimensions and a large Twitter card", () => {
  const tags = openGraphImageMeta({
    alt: "Is Baby Out Yet?",
    imageUrl: "https://isbabyoutyet.com/og",
  });
  expect(tags).toEqual(
    expect.arrayContaining([
      { content: "https://isbabyoutyet.com/og", property: "og:image" },
      { content: "1200", property: "og:image:width" },
      { content: "630", property: "og:image:height" },
      { content: "summary_large_image", name: "twitter:card" },
    ]),
  );
});

type PublicBabyDoc = NonNullable<FunctionReturnType<typeof api.baby.getByPublicId>>;

const publicBabyBase = {
  _creationTime: 1,
  // SAFETY: Seeded convex-test document id.
  _id: "baby-1" as Id<"baby">,
  babyBorn: null,
  blurDataUrl: null,
  laborStarted: null,
  locale: "en-GB" as const,
  milestoneVisibility: DEFAULT_MILESTONE_VISIBILITY,
  name: "Juniper Hale",
  ogImageHash: "abc123",
  photoUrl: null,
  publicId: "juniper-hale-1",
  resolvedLocale: "en-GB" as const,
  theme: "baby-blue",
  thumbnailUrl: null,
  timeZone: "Europe/London",
  wentToHospital: null,
};

test("getBabySeo maps exact mode onto the canonical route slug", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const doc = {
    ...publicBabyBase,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact" as const,
  } satisfies PublicBabyDoc;

  const seo = getBabySeo(doc, "juniper-hale");

  expect(seo.title).toContain("21 days until due date");
  expect(seo.canonical).toBe("https://isbabyoutyet.com/baby/juniper-hale");
  expect(new URL(seo.imageUrl).pathname).toBe("/og/baby/juniper-hale-abc123-20260811");
});

test("getBabySeo coalesces omitted public due date text", () => {
  const doc = {
    ...publicBabyBase,
    dueDateDisplayMode: "message" as const,
    publicDueDateText: undefined,
  } satisfies PublicBabyDoc;

  const seo = getBabySeo(doc, "juniper-hale");

  expect(seo.title).toContain("Is Juniper Hale out yet?");
  expect(seo.title).not.toContain("until due date");
  expect(seo.canonical).toBe("https://isbabyoutyet.com/baby/juniper-hale");
});

test("getBabySeo keeps custom public due date text out of the title countdown", () => {
  const doc = {
    ...publicBabyBase,
    dueDateDisplayMode: "message" as const,
    publicDueDateText: "Any day now",
  } satisfies PublicBabyDoc;

  const seo = getBabySeo(doc, "juniper-hale");

  expect(seo.title).toContain("Is Juniper Hale out yet?");
  expect(seo.title).not.toContain("until due date");
  expect(seo.description).toContain("Juniper Hale");
});
