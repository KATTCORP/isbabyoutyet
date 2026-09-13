import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, registerComponents } from "./test.setup";
import { getCurrentStatus } from "../src/types";
import { HOMEPAGE_DEMO_BABIES, HOMEPAGE_DEMO_BABY } from "../src/seedCredentials";
import {
  HOMEPAGE_DEMO_FEED,
  HOMEPAGE_DEMO_FEED_SLOTS,
  HOMEPAGE_DEMO_PHOTO_KEYS,
  homepageDemoFeedFor,
  homepageDemoLocales,
} from "../src/homepageDemoFeed";
import { SUPPORTED_LOCALES } from "../src/i18n";

const FIRST_PAGE = { numItems: 50, cursor: null };

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
  expect(
    homepageDemoFeedFor("sv")[0]?.kind === "update" && homepageDemoFeedFor("sv")[0].message,
  ).toContain("Vecka 40");
});

test("refresh creates Juniper Hale as born after a two-day labour with fixture encouragements", async () => {
  const t = await setup();

  const result = await t.mutation(internal.homepageDemo.refresh, {});
  expect(result.publicId).toBe(HOMEPAGE_DEMO_BABY.publicId);
  expect(result.locale).toBe("en-GB");

  const baby = await t.query(api.baby.getByPublicId, { id: HOMEPAGE_DEMO_BABY.publicId });
  expect(baby).toMatchObject({
    name: HOMEPAGE_DEMO_BABY.name,
    publicId: HOMEPAGE_DEMO_BABY.publicId,
    theme: HOMEPAGE_DEMO_BABY.theme,
    locale: "en-GB",
    demo: true,
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

  const first = await t.mutation(internal.homepageDemo.refresh, {});
  await t.mutation(api.encouragements.create, {
    babyId: first.babyId,
    authorName: "Random Visitor",
    message: "Congrats from the internet!",
    visitorId: "visitor-spam",
  });

  const before = await t.query(api.timeline.listByBaby, {
    babyId: first.babyId,
    paginationOpts: FIRST_PAGE,
  });
  expect(before.page).toHaveLength(HOMEPAGE_DEMO_FEED.length + 1);

  const second = await t.mutation(internal.homepageDemo.refresh, {});
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
    { photoId: Id<"_storage">; thumbnailId: Id<"_storage">; blurDataUrl: string }
  > = {};
  for (const key of HOMEPAGE_DEMO_PHOTO_KEYS) {
    photos[key] = {
      photoId: await storeBlob(t, `${key}-photo`),
      thumbnailId: await storeBlob(t, `${key}-thumb`),
      blurDataUrl: `data:image/jpeg;base64,${key}`,
    };
  }

  const result = await t.mutation(internal.homepageDemo.refresh, { photos });
  const baby = await t.query(api.baby.getByPublicId, { id: result.publicId });
  expect(baby?.photoUrl).toBeTruthy();
  expect(baby?.photoId).toBe(photos.born?.photoId);
  expect(baby?.blurDataUrl).toBe(photos.born?.blurDataUrl);

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: result.babyId,
    paginationOpts: FIRST_PAGE,
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
  const { babyId } = await t.mutation(internal.homepageDemo.refresh, {});

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
  });
  expect(feed.page).toHaveLength(0);
});

test("refresh({ locale: 'sv' }) creates Ella Holm with Swedish copy", async () => {
  const t = await setup();

  const result = await t.mutation(internal.homepageDemo.refresh, { locale: "sv" });
  expect(result.publicId).toBe(HOMEPAGE_DEMO_BABIES.sv.publicId);
  expect(result.locale).toBe("sv");

  const baby = await t.query(api.baby.getByPublicId, { id: HOMEPAGE_DEMO_BABIES.sv.publicId });
  expect(baby).toMatchObject({
    name: HOMEPAGE_DEMO_BABIES.sv.name,
    publicId: "ella-holm",
    locale: "sv",
    resolvedLocale: "sv",
    demo: true,
  });
  expect(getCurrentStatus(baby!)).toMatchObject({ type: "born" });

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: baby!._id,
    paginationOpts: FIRST_PAGE,
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

  const photos: Record<string, { photoId: Id<"_storage">; thumbnailId: Id<"_storage"> }> = {};
  for (const key of HOMEPAGE_DEMO_PHOTO_KEYS) {
    photos[key] = {
      photoId: await storeBlob(t, `${key}-photo`),
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
      userId: "alice",
      ownerTokenIdentifier: "https://convex.test|alice",
      name: "Real Willow",
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: HOMEPAGE_DEMO_BABIES["en-US"].publicId,
      birthJourney: "labor",
      lastActivityAt: 1,
      subscriptionCount: 0,
    });
  });

  await expect(t.mutation(internal.homepageDemo.refresh, { locale: "en-US" })).rejects.toThrow(
    /Refusing to overwrite non-demo baby/,
  );

  const realBaby = await t.run(async (ctx) => ctx.db.get(realBabyId));
  expect(realBaby).toMatchObject({
    userId: "alice",
    name: "Real Willow",
    publicId: "willow-brooks",
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

test("refresh grandfathers the sentinel-owned juniper-hale row and stamps demo: true", async () => {
  const t = await setup();

  const legacyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      userId: HOMEPAGE_DEMO_BABY.ownerUserId,
      ownerTokenIdentifier: `https://convex.test|${HOMEPAGE_DEMO_BABY.ownerUserId}`,
      name: "Juniper Hale",
      dueDate: "2026-01-01",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: HOMEPAGE_DEMO_BABY.publicId,
      birthJourney: "labor",
      theme: HOMEPAGE_DEMO_BABY.theme,
      lastActivityAt: 1,
      subscriptionCount: 0,
    });
  });

  const result = await t.mutation(internal.homepageDemo.refresh, {});
  expect(result.babyId).toBe(legacyId);

  const baby = await t.query(api.baby.getByPublicId, { id: HOMEPAGE_DEMO_BABY.publicId });
  expect(baby?.demo).toBe(true);
  expect(getCurrentStatus(baby!)).toMatchObject({ type: "born" });
});

test("clearFeedBatch refuses a non-demo babyId", async () => {
  const t = await setup();
  const babyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      userId: "alice",
      ownerTokenIdentifier: "https://convex.test|alice",
      name: "Someone Else",
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: "someone-else",
      birthJourney: "labor",
      lastActivityAt: 1,
      subscriptionCount: 0,
    });
  });

  await expect(t.mutation(internal.homepageDemo.clearFeedBatch, { babyId })).rejects.toThrow(
    /not a managed homepage demo/,
  );
});
