import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { makeResource } from "./test.resource";
import { createEncouragementArgs, modules, registerComponents } from "./test.setup";
import { getCurrentStatus } from "../src/types";
import { HOMEPAGE_DEMO_BABIES, HOMEPAGE_DEMO_BABY } from "../src/seedCredentials";
import {
  HOMEPAGE_DEMO_FEED_SLOTS,
  HOMEPAGE_DEMO_PHOTO_KEYS,
  homepageDemoFeedFor,
  homepageDemoLocales,
} from "../src/homepageDemoFeed";
import { SUPPORTED_LOCALES } from "../src/i18n";

const FIRST_PAGE = { cursor: null, numItems: 50 };
const HOMEPAGE_DEMO_FEED = homepageDemoFeedFor("en-GB");

const FIXTURE_UPDATES = HOMEPAGE_DEMO_FEED.filter((item) => item.kind === "update");
const FIXTURE_ENCOURAGEMENTS = HOMEPAGE_DEMO_FEED.filter((item) => item.kind === "encouragement");

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

async function storeBlob(t: Awaited<ReturnType<typeof setup>>, bytes: string) {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([bytes], { type: "image/jpeg" }));
  });
}

function useFakeTimersResource() {
  vi.useFakeTimers();
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

async function storeCompletePhotoSet(t: Awaited<ReturnType<typeof setup>>) {
  const photos: Record<
    string,
    {
      blurDataUrl: string;
      photoId: Id<"_storage">;
      pushImageId: Id<"_storage">;
      thumbnailId: Id<"_storage">;
    }
  > = {};
  for (const key of HOMEPAGE_DEMO_PHOTO_KEYS) {
    photos[key] = {
      blurDataUrl: `data:image/jpeg;base64,${key}`,
      photoId: await storeBlob(t, `${key}-photo`),
      pushImageId: await storeBlob(t, `${key}-push`),
      thumbnailId: await storeBlob(t, `${key}-thumb`),
    };
  }
  return photos;
}

test("every locale has copy for every shared feed slot", () => {
  const updateSlots = HOMEPAGE_DEMO_FEED_SLOTS.filter((slot) => slot.kind === "update").length;
  const encouragementSlots = HOMEPAGE_DEMO_FEED_SLOTS.filter(
    (slot) => slot.kind === "encouragement",
  ).length;

  expect(homepageDemoLocales()).toEqual([...SUPPORTED_LOCALES]);

  for (const locale of SUPPORTED_LOCALES) {
    const feed = homepageDemoFeedFor(locale);
    expect(feed).toHaveLength(HOMEPAGE_DEMO_FEED_SLOTS.length);
    expect(feed.filter((item) => item.kind === "update")).toHaveLength(updateSlots);
    expect(feed.filter((item) => item.kind === "encouragement")).toHaveLength(encouragementSlots);
  }

  expect(homepageDemoFeedFor("en-US").some((item) => item.message.includes("labor"))).toBe(true);
  const firstSwedishItem = homepageDemoFeedFor("sv")[0];
  expect(firstSwedishItem?.kind === "update" && firstSwedishItem.message).toContain("Vecka 40");
});

test("refresh creates Juniper Hale as born after a two-day labour with fixture encouragements", async () => {
  const t = await setup();

  const result = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos: {} });
  expect(result.publicId).toBe(HOMEPAGE_DEMO_BABY.publicId);
  expect(result.locale).toBe("en-GB");

  const baby = await t.query(api.baby.getByPublicId, { id: HOMEPAGE_DEMO_BABY.publicId });
  expect(baby).toMatchObject({
    demo: true,
    locale: "en-GB",
    name: HOMEPAGE_DEMO_BABY.name,
    publicId: HOMEPAGE_DEMO_BABY.publicId,
    theme: HOMEPAGE_DEMO_BABY.theme,
  });
  expect(baby).not.toHaveProperty("userId");
  expect(baby).not.toHaveProperty("ownerTokenIdentifier");
  expect(getCurrentStatus(baby!)).toMatchObject({ type: "born" });

  const now = Date.now();
  const laborStartedAt = Date.parse(baby!.laborStarted!);
  const bornAt = Date.parse(baby!.babyBorn!);
  expect(now - laborStartedAt).toBeGreaterThan(40 * 60 * 60_000);
  expect(now - laborStartedAt).toBeLessThan(42 * 60 * 60_000);
  expect(now - bornAt).toBeGreaterThan(2 * 60 * 60_000);
  expect(now - bornAt).toBeLessThan(3 * 60 * 60_000);

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: baby!._id,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toHaveLength(HOMEPAGE_DEMO_FEED.length);
  expect(feed.page[0]?.kind).toBe("encouragement");
  expect(feed.page[0]?.kind === "encouragement" && feed.page[0].encouragement.authorName).toBe(
    "Jess",
  );

  const updates = feed.page.filter((item) => item.kind === "update");
  const encouragements = feed.page.filter((item) => item.kind === "encouragement");
  expect(updates).toHaveLength(FIXTURE_UPDATES.length);
  expect(encouragements).toHaveLength(FIXTURE_ENCOURAGEMENTS.length);
  expect(updates.map((item) => item.kind === "update" && item.update.milestone)).toEqual(
    expect.arrayContaining(["labor_started", "gone_to_hospital", "born"]),
  );
});

test("refresh is idempotent and wipes visitor encouragements", async () => {
  const t = await setup();

  const first = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos: {} });
  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Random Visitor",
      babyId: first.babyId,
      message: "Congrats from the internet!",
      visitorId: "visitor-spam",
    }),
  );

  const before = await t.query(api.timeline.listByBaby, {
    babyId: first.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(before.page).toHaveLength(HOMEPAGE_DEMO_FEED.length + 1);

  const second = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos: {} });
  expect(second.babyId).toBe(first.babyId);

  const babies = await t.run(async (ctx) => {
    return await ctx.db
      .query("baby")
      .withIndex("by_publicId", (q) => q.eq("publicId", HOMEPAGE_DEMO_BABY.publicId))
      .collect();
  });
  expect(babies).toHaveLength(1);

  const after = await t.query(api.timeline.listByBaby, {
    babyId: second.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(after.page).toHaveLength(HOMEPAGE_DEMO_FEED.length);
  expect(
    after.page.some(
      (item) => item.kind === "encouragement" && item.encouragement.authorName === "Random Visitor",
    ),
  ).toBe(false);
});

test("refresh attaches photos to the matching updates and pins the newborn as the page photo", async () => {
  const t = await setup();

  const photos: Record<
    string,
    {
      blurDataUrl: string;
      photoId: Id<"_storage">;
      pushImageId: Id<"_storage"> | null;
      thumbnailId: Id<"_storage">;
    }
  > = {};
  for (const key of HOMEPAGE_DEMO_PHOTO_KEYS) {
    photos[key] = {
      blurDataUrl: `data:image/jpeg;base64,${key}`,
      photoId: await storeBlob(t, `${key}-photo`),
      pushImageId: null,
      thumbnailId: await storeBlob(t, `${key}-thumb`),
    };
  }

  const result = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos });
  const baby = await t.query(api.baby.getByPublicId, { id: result.publicId });
  expect(baby?.photoUrl).toBeTruthy();
  expect(baby?.photoId).toBe(photos.born?.photoId);
  expect(baby?.blurDataUrl).toBe(photos.born?.blurDataUrl);

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: result.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  const photoUpdates = feed.page.filter((item) => item.kind === "update" && item.update.photoUrl);
  expect(photoUpdates).toHaveLength(HOMEPAGE_DEMO_PHOTO_KEYS.length);

  const bornUpdate = feed.page.find(
    (item) => item.kind === "update" && item.update.milestone === "born",
  );
  expect(bornUpdate?.kind === "update" && bornUpdate.update.isCurrentPagePhoto).toBe(true);
  expect(bornUpdate?.kind === "update" && bornUpdate.update.blurDataUrl).toBe(
    photos.born?.blurDataUrl,
  );
});

test("ensureBaby and insertFeed write fixture encouragements that claim will not steal", async () => {
  const t = await setup();
  const photos = await storeCompletePhotoSet(t);
  const babyId = await t.mutation(internal.homepageDemo.ensureBaby, { locale: "en-GB" });
  await t.mutation(internal.homepageDemo.insertFeed, {
    babyId,
    locale: "en-GB",
    photos,
  });
  await t.finishInProgressScheduledFunctions();

  const fixture = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("encouragements")
      .withIndex("by_babyId", (q) => q.eq("babyId", babyId))
      .collect();
    return rows.find((row) => row.demoFixture === true);
  });
  expect(fixture).toBeTruthy();
  if (!fixture) {
    throw new Error("expected a demo fixture encouragement");
  }

  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.encouragements.claimVisitorEncouragements, {
    visitorId: fixture.visitorId,
  });

  const stored = await t.run(async (ctx) => ctx.db.get(fixture._id));
  expect(stored?.author).toEqual({ type: "visitor", visitorId: fixture.visitorId });
  expect(stored?.demoFixture).toBe(true);
});

test("daily reset reuses stored photos and ignores recent fixture encouragements", async () => {
  await using _timers = useFakeTimersResource();
  vi.setSystemTime(new Date("2026-08-20T03:00:00.000Z"));
  const t = await setup();
  const photos = await storeCompletePhotoSet(t);
  const first = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos });

  expect(await t.query(internal.homepageDemo.hasCompletePhotoSet, {})).toBe(false);

  vi.setSystemTime(new Date("2026-08-21T03:00:00.000Z"));
  const result = await t.mutation(internal.homepageDemo.resetIfInactive, {});
  expect(result).toEqual({ resetBabies: SUPPORTED_LOCALES.length, status: "reset" });
  expect(await t.query(internal.homepageDemo.hasCompletePhotoSet, {})).toBe(true);

  const baby = await t.query(api.baby.getByPublicId, { id: first.publicId });
  expect(baby?.photoId).toBe(photos.born?.photoId);
  expect(baby?.thumbnailId).toBe(photos.born?.thumbnailId);

  for (const locale of SUPPORTED_LOCALES) {
    const localeBaby = await t.query(api.baby.getByPublicId, {
      id: HOMEPAGE_DEMO_BABIES[locale].publicId,
    });
    expect(localeBaby?.photoId).toBe(photos.born?.photoId);
  }
});

test("daily reset protects only the baby with a recent visitor encouragement", async () => {
  await using _timers = useFakeTimersResource();
  vi.setSystemTime(new Date("2026-08-20T03:00:00.000Z"));
  const t = await setup();
  const photos = await storeCompletePhotoSet(t);
  const demo = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos });
  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Recent Visitor",
      babyId: demo.babyId,
      message: "Still here!",
      visitorId: "homepage-demo-spoofed-client",
    }),
  );

  vi.setSystemTime(new Date("2026-08-20T03:59:00.000Z"));
  const result = await t.mutation(internal.homepageDemo.resetIfInactive, {});
  expect(result).toEqual({
    resetBabies: SUPPORTED_LOCALES.length - 1,
    status: "reset",
  });
  expect(await t.query(internal.homepageDemo.hasCompletePhotoSet, {})).toBe(true);

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: demo.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(
    feed.page.some(
      (item) => item.kind === "encouragement" && item.encouragement.authorName === "Recent Visitor",
    ),
  ).toBe(true);
});

test("daily reset skips when every demo baby has a recent visitor encouragement", async () => {
  await using _timers = useFakeTimersResource();
  vi.setSystemTime(new Date("2026-08-20T03:00:00.000Z"));
  const t = await setup();
  const photos = await storeCompletePhotoSet(t);

  for (const locale of SUPPORTED_LOCALES) {
    const demo = await t.mutation(internal.homepageDemo.refresh, { locale, photos });
    await t.mutation(
      api.encouragements.create,
      createEncouragementArgs({
        authorName: `Recent Visitor ${locale}`,
        babyId: demo.babyId,
        message: "Still here!",
        visitorId: `visitor-${locale}`,
      }),
    );
  }

  vi.setSystemTime(new Date("2026-08-20T03:59:00.000Z"));
  await expect(t.mutation(internal.homepageDemo.resetIfInactive, {})).resolves.toEqual({
    resetBabies: 0,
    status: "skipped_recent_encouragement",
  });
});

test("daily reset clears visitor encouragements once they are older than one hour", async () => {
  await using _timers = useFakeTimersResource();
  vi.setSystemTime(new Date("2026-08-20T03:00:00.000Z"));
  const t = await setup();
  const photos = await storeCompletePhotoSet(t);
  const demo = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos });
  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Earlier Visitor",
      babyId: demo.babyId,
      message: "Good luck!",
      visitorId: "real-visitor",
    }),
  );

  vi.setSystemTime(new Date("2026-08-20T04:01:00.000Z"));
  const result = await t.mutation(internal.homepageDemo.resetIfInactive, {});
  expect(result.status).toBe("reset");

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: demo.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(
    feed.page.some(
      (item) =>
        item.kind === "encouragement" && item.encouragement.authorName === "Earlier Visitor",
    ),
  ).toBe(false);
});

test("daily reset does not wipe a demo when its complete photo sentinel is missing", async () => {
  const t = await setup();
  const demo = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos: {} });
  const before = await t.query(api.timeline.listByBaby, {
    babyId: demo.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });

  expect(await t.query(internal.homepageDemo.hasCompletePhotoSet, {})).toBe(false);
  await expect(t.mutation(internal.homepageDemo.resetIfInactive, {})).resolves.toEqual({
    resetBabies: 0,
    status: "skipped_missing_photos",
  });

  const after = await t.query(api.timeline.listByBaby, {
    babyId: demo.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(after.page.map((item) => item._id)).toEqual(before.page.map((item) => item._id));
});

test("generateUploadUrl returns a storage upload URL", async () => {
  const t = await setup();
  const url = await t.mutation(internal.homepageDemo.generateUploadUrl, {});
  expect(url).toEqual(expect.any(String));
  expect(url.length).toBeGreaterThan(0);
});

test("storePhoto stores JPEG bytes and returns a storage id", async () => {
  const t = await setup();
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]).buffer;
  const storageId = await t.action(internal.homepageDemo.storePhoto, {
    bytes,
    contentType: "image/jpeg",
  });
  expect(storageId).toEqual(expect.any(String));

  const url = await t.run(async (ctx) => await ctx.storage.getUrl(storageId));
  expect(url).toEqual(expect.any(String));
});

test("clearFeedBatch reports hasMore until the feed is empty", async () => {
  const t = await setup();
  const { babyId } = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos: {} });

  let batches = 0;
  let hasMore = true;
  while (hasMore) {
    const result = await t.mutation(internal.homepageDemo.clearFeedBatch, { babyId });
    batches += 1;
    hasMore = result.hasMore;
    expect(result.deleted).toBeGreaterThan(0);
    expect(batches).toBeLessThan(10);
  }

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toHaveLength(0);
});

test("refresh({ locale: 'sv' }) creates Ella Holm with Swedish copy", async () => {
  const t = await setup();

  const result = await t.mutation(internal.homepageDemo.refresh, { locale: "sv", photos: {} });
  expect(result.publicId).toBe(HOMEPAGE_DEMO_BABIES.sv.publicId);
  expect(result.locale).toBe("sv");

  const baby = await t.query(api.baby.getByPublicId, { id: HOMEPAGE_DEMO_BABIES.sv.publicId });
  expect(baby).toMatchObject({
    demo: true,
    locale: "sv",
    name: HOMEPAGE_DEMO_BABIES.sv.name,
    publicId: "ella-holm",
    resolvedLocale: "sv",
  });
  expect(getCurrentStatus(baby!)).toMatchObject({ type: "born" });

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: baby!._id,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  const svFeed = homepageDemoFeedFor("sv");
  expect(feed.page).toHaveLength(svFeed.length);
  expect(feed.page[0]?.kind === "encouragement" && feed.page[0].encouragement.authorName).toBe(
    "Lisa",
  );

  const bornUpdate = feed.page.find(
    (item) => item.kind === "update" && item.update.milestone === "born",
  );
  expect(bornUpdate?.kind === "update" && bornUpdate.update.message).toContain("Ella Linnea Holm");
});

test("each locale gets its own baby with the same feed shape and shared photos", async () => {
  const t = await setup();

  const photos: Record<
    string,
    {
      blurDataUrl: string | null;
      photoId: Id<"_storage">;
      pushImageId: Id<"_storage"> | null;
      thumbnailId: Id<"_storage">;
    }
  > = {};
  for (const key of HOMEPAGE_DEMO_PHOTO_KEYS) {
    photos[key] = {
      blurDataUrl: null,
      photoId: await storeBlob(t, `${key}-photo`),
      pushImageId: null,
      thumbnailId: await storeBlob(t, `${key}-thumb`),
    };
  }

  const results = [];
  for (const locale of SUPPORTED_LOCALES) {
    results.push(await t.mutation(internal.homepageDemo.refresh, { locale, photos }));
  }

  expect(new Set(results.map((result) => result.babyId)).size).toBe(SUPPORTED_LOCALES.length);
  expect(results.map((result) => result.publicId)).toEqual(
    SUPPORTED_LOCALES.map((locale) => HOMEPAGE_DEMO_BABIES[locale].publicId),
  );

  for (const result of results) {
    const baby = await t.query(api.baby.getByPublicId, { id: result.publicId });
    expect(baby?.photoId).toBe(photos.born?.photoId);
    expect(baby?.locale).toBe(result.locale);
    expect(baby?.name).toBe(HOMEPAGE_DEMO_BABIES[result.locale].name);

    const feed = await t.query(api.timeline.listByBaby, {
      babyId: result.babyId,
      paginationOpts: FIRST_PAGE,
      visitorId: null,
    });
    expect(feed.page).toHaveLength(HOMEPAGE_DEMO_FEED_SLOTS.length);
  }

  const juniper = await t.query(api.baby.getByPublicId, { id: "juniper-hale" });
  const ella = await t.query(api.baby.getByPublicId, { id: "ella-holm" });
  expect(juniper?._id).not.toBe(ella?._id);
  expect(juniper?.demo).toBe(true);
  expect(ella?.demo).toBe(true);
});

test("refresh refuses to hijack a real baby that shares a demo publicId", async () => {
  const t = await setup();

  const realBabyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Real Willow",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: HOMEPAGE_DEMO_BABIES["en-US"].publicId,
      subscriptionCount: 0,
      userId: "alice",
    });
  });

  await expect(
    t.mutation(internal.homepageDemo.refresh, { locale: "en-US", photos: {} }),
  ).rejects.toThrow(/Refusing to overwrite non-demo baby/);

  const realBaby = await t.run(async (ctx) => ctx.db.get(realBabyId));
  expect(realBaby).toMatchObject({
    name: "Real Willow",
    publicId: "willow-brooks",
    userId: "alice",
  });
  expect(realBaby?.demo).not.toBe(true);

  const timelineCount = await t.run(async (ctx) => {
    return (
      await ctx.db
        .query("timelineItems")
        .withIndex("by_babyId_and_postedAt", (q) => q.eq("babyId", realBabyId))
        .collect()
    ).length;
  });
  expect(timelineCount).toBe(0);
});

test("daily reset rolls back every demo change when a reserved publicId belongs to real data", async () => {
  const t = await setup();
  const photos = await storeCompletePhotoSet(t);
  const demo = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos });
  const beforeFeed = await t.query(api.timeline.listByBaby, {
    babyId: demo.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });

  const realBabyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      demo: true,
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 123,
      name: "Real Willow",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: HOMEPAGE_DEMO_BABIES["en-US"].publicId,
      subscriptionCount: 0,
      userId: "alice",
    });
  });
  const realBabyBefore = await t.run(async (ctx) => await ctx.db.get(realBabyId));

  await expect(t.mutation(internal.homepageDemo.resetIfInactive, {})).rejects.toThrow(
    /Refusing to overwrite non-demo baby/,
  );

  const afterFeed = await t.query(api.timeline.listByBaby, {
    babyId: demo.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(afterFeed.page.map((item) => item._id)).toEqual(beforeFeed.page.map((item) => item._id));
  expect(await t.run(async (ctx) => await ctx.db.get(realBabyId))).toEqual(realBabyBefore);
});

test("daily reset leaves non-homepage documents and shared storage untouched", async () => {
  const t = await setup();
  const reusablePhotos = await storeCompletePhotoSet(t);
  await t.mutation(internal.homepageDemo.refresh, { locale: null, photos: reusablePhotos });
  const divergentPhotos = await storeCompletePhotoSet(t);
  await t.mutation(internal.homepageDemo.refresh, {
    locale: "sv",
    photos: divergentPhotos,
  });
  const sharedPhotoId = divergentPhotos.bump?.photoId;
  if (!sharedPhotoId) {
    throw new Error("Divergent fixture is missing its bump photo");
  }

  const real = await t.run(async (ctx) => {
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 123,
      name: "Alice's Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "alices-real-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const updateTimelineId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "update",
      postedAt: 100,
    });
    const updateId = await ctx.db.insert("updates", {
      babyId,
      message: "A real family update",
      photoId: sharedPhotoId,
      timelineItemId: updateTimelineId,
    });
    const encouragementTimelineId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 101,
    });
    const encouragementId = await ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId: "real-family-visitor" },
      authorName: "Grandma",
      babyId,
      createdAt: 101,
      message: "For the real family",
      timelineItemId: encouragementTimelineId,
      visitorId: "real-family-visitor",
    });
    return {
      babyId,
      encouragementId,
      encouragementTimelineId,
      updateId,
      updateTimelineId,
    };
  });
  const before = await t.run(async (ctx) => {
    return {
      baby: await ctx.db.get(real.babyId),
      encouragement: await ctx.db.get(real.encouragementId),
      encouragementTimeline: await ctx.db.get(real.encouragementTimelineId),
      storage: await ctx.db.system.get(sharedPhotoId),
      update: await ctx.db.get(real.updateId),
      updateTimeline: await ctx.db.get(real.updateTimelineId),
    };
  });

  await expect(t.mutation(internal.homepageDemo.resetIfInactive, {})).resolves.toMatchObject({
    status: "reset",
  });

  const after = await t.run(async (ctx) => {
    return {
      baby: await ctx.db.get(real.babyId),
      encouragement: await ctx.db.get(real.encouragementId),
      encouragementTimeline: await ctx.db.get(real.encouragementTimelineId),
      storage: await ctx.db.system.get(sharedPhotoId),
      update: await ctx.db.get(real.updateId),
      updateTimeline: await ctx.db.get(real.updateTimelineId),
    };
  });
  expect(after).toEqual(before);
});

test("refresh grandfathers the sentinel-owned juniper-hale row and stamps demo: true", async () => {
  const t = await setup();

  const legacyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-01-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Juniper Hale",
      ownerTokenIdentifier: `https://convex.test|${HOMEPAGE_DEMO_BABY.ownerUserId}`,
      publicDueDateText: null,
      publicId: HOMEPAGE_DEMO_BABY.publicId,
      subscriptionCount: 0,
      theme: HOMEPAGE_DEMO_BABY.theme,
      userId: HOMEPAGE_DEMO_BABY.ownerUserId,
    });
  });

  const result = await t.mutation(internal.homepageDemo.refresh, { locale: null, photos: {} });
  expect(result.babyId).toBe(legacyId);

  const baby = await t.query(api.baby.getByPublicId, { id: HOMEPAGE_DEMO_BABY.publicId });
  expect(baby?.demo).toBe(true);
  expect(getCurrentStatus(baby!)).toMatchObject({ type: "born" });
});

test("clearFeedBatch refuses a non-homepage baby even when demo is true", async () => {
  const t = await setup();
  const babyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      demo: true,
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Someone Else",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "someone-else",
      subscriptionCount: 0,
      userId: "alice",
    });
  });

  await expect(t.mutation(internal.homepageDemo.clearFeedBatch, { babyId })).rejects.toThrow(
    /not a reserved homepage-demo identity/,
  );
});
