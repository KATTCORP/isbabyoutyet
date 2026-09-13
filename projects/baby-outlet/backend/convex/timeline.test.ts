import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { makeAsyncResource, makeResource } from "./test.resource";
import {
  modules,
  registerComponents,
  createBabyArgs,
  postUpdateArgs,
  createEncouragementArgs,
} from "./test.setup";
import { insertUpdateWithTimelineItem } from "./timeline";

const FIRST_PAGE = { cursor: null, numItems: 20 };

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );
  return makeAsyncResource({ asAlice, babyId: created.babyId, t }, async () => {
    await t.finishInProgressScheduledFunctions();
  });
}

function useFakeTimersResource() {
  vi.useFakeTimers();
  return makeResource({}, () => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
}

async function getBaby(t: Awaited<ReturnType<typeof setup>>["t"], babyId: Id<"baby">) {
  return await t.run(async (ctx) => {
    const baby = await ctx.db.get(babyId);
    if (!baby) {
      throw new Error("Baby not found");
    }
    return baby;
  });
}

async function storeBlob(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["fake image bytes"], { type: "image/jpeg" }));
  });
}

test("a text-only update tops the feed without changing the status", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId, t } = harness;

  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId,
      message: "Good luck!",
      visitorId: "visitor-1",
    }),
  );

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "Long walk today. Still comfy in there",
    }),
  );

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toMatchObject([
    { kind: "update", update: { message: "Long walk today. Still comfy in there" } },
    { encouragement: { authorName: "Grandma" }, kind: "encouragement" },
  ]);

  const latest = await t.query(api.timeline.latestUpdate, { babyId });
  expect(latest).toMatchObject({
    update: { message: "Long walk today. Still comfy in there" },
  });

  // Status stays untouched, but every owner update schedules a push.
  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  expect(publicBaby).toMatchObject({ babyBorn: null, laborStarted: null, wentToHospital: null });
  const baby = await getBaby(t, babyId);
  expect(baby.lastActivityAt).toBe(feed.page[0]?.postedAt);
  const notifications = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notifications).toMatchObject([
    {
      customMessage: "Long walk today. Still comfy in there",
      notificationType: "update_posted",
      photoId: null,
      status: "pending",
    },
  ]);
});

test("the public feed never leaks visitor credentials or metadata", async () => {
  await using harness = await setup();
  const { babyId, t } = harness;

  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId,
      locale: "en-US",
      message: "Hi!",
      timezone: "Europe/Stockholm",
      userAgent: "Mozilla/5.0",
      visitorId: "visitor-secret",
    }),
  );

  const anonymous = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  const item = anonymous.page[0];
  if (item?.kind !== "encouragement") {
    throw new Error("expected encouragement item");
  }
  expect(item.encouragement).not.toHaveProperty("author");
  expect(item.encouragement).not.toHaveProperty("visitorId");
  expect(item.encouragement).not.toHaveProperty("userId");
  expect(item.encouragement).not.toHaveProperty("userAgent");
  expect(item.encouragement).not.toHaveProperty("locale");
  expect(item.encouragement).not.toHaveProperty("timezone");
  expect(item.encouragement.isMine).toBe(false);

  // The author sees their own post marked as theirs
  const asAuthor = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: "visitor-secret",
  });
  const ownItem = asAuthor.page[0];
  if (ownItem?.kind !== "encouragement") {
    throw new Error("expected encouragement item");
  }
  expect(ownItem.encouragement.isMine).toBe(true);
});

test("a photo-only update does not blank the latest message", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId, t } = harness;
  const photo = await storeBlob(t);

  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, message: "Still waiting!" }));
  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, photoId: photo }));

  const latest = await t.query(api.timeline.latestUpdate, { babyId });
  expect(latest).toMatchObject({ update: { message: "Still waiting!" } });

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notifications).toMatchObject([
    { customMessage: null, notificationType: "photo_added", photoId: photo, status: "pending" },
    {
      customMessage: "Still waiting!",
      notificationType: "update_posted",
      photoId: null,
      status: "pending",
    },
  ]);
});

test("posting requires content and ownership", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;

  await expect(
    asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, message: "   " })),
  ).rejects.toThrow("An update needs a message, a photo, or a milestone");

  // The three fields are mutually inclusive — any single one is enough, and
  // a whitespace-only message is trimmed away rather than blocking the post
  const photo = await storeBlob(t);
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({ babyId, message: "   ", photoId: photo }),
  );
  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page[0]).toMatchObject({ kind: "update", update: { message: null } });
  expect(feed.page[0]?.kind === "update" && feed.page[0].update.photoUrl).toBeTruthy();

  const asBob = t.withIdentity({ subject: "bob" });
  await expect(
    asBob.mutation(api.updates.post, postUpdateArgs({ babyId, message: "Hi" })),
  ).rejects.toThrow("Not authorized");

  await expect(
    t.mutation(api.updates.post, postUpdateArgs({ babyId, message: "Hi" })),
  ).rejects.toThrow("Not authenticated");
});

test("status is inferred from milestone updates, not stored baby fields", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId, t } = harness;

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "She's here!",
      milestone: "born",
    }),
  );

  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  expect(publicBaby?.babyBorn).toBeTruthy();
  const stored = await getBaby(t, babyId);
  for (const field of [
    "laborStarted",
    "wentToHospital",
    "babyBorn",
    "laborStartedMessage",
    "hospitalMessage",
    "babyBornMessage",
  ] as const) {
    expect(stored).not.toHaveProperty(field);
  }

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notifications).toMatchObject([
    { customMessage: "She's here!", notificationType: "born", photoId: null, status: "pending" },
  ]);

  // The status only moves forward: re-marking the same milestone — or any
  // earlier stage — is rejected once a later stage is reached
  await expect(
    asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "born" })),
  ).rejects.toThrow("Only a future status can be marked");
  await expect(
    asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "gone_to_hospital" })),
  ).rejects.toThrow("Only a future status can be marked");
  await expect(
    asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" })),
  ).rejects.toThrow("Only a future status can be marked");
});

test("a legacy milestone without occurredAt infers its date from feed position", async () => {
  await using harness = await setup();
  const { babyId, t } = harness;
  const postedAt = Date.parse("2026-08-10T08:00:00.000Z");

  await t.run(async (ctx) => {
    await insertUpdateWithTimelineItem(ctx, {
      babyId,
      milestone: "labor_started",
      postedAt,
    });
  });

  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  expect(publicBaby?.laborStarted).toBe("2026-08-10T08:00:00.000Z");
});

test("a milestone update without an active feed row fails closed", async () => {
  await using harness = await setup();
  const { babyId, t } = harness;

  await t.run(async (ctx) => {
    const { timelineItemId } = await insertUpdateWithTimelineItem(ctx, {
      babyId,
      milestone: "born",
      postedAt: Date.parse("2026-08-10T08:00:00.000Z"),
    });
    await ctx.db.delete(timelineItemId);
  });

  await expect(t.query(api.baby.getByPublicId, { id: babyId })).rejects.toThrow(
    "has no active timeline item",
  );
});

test("an invalid persisted milestone timestamp fails closed", async () => {
  await using harness = await setup();
  const { babyId, t } = harness;

  await t.run(async (ctx) => {
    await insertUpdateWithTimelineItem(ctx, {
      babyId,
      milestone: "labor_started",
      occurredAt: Number.MAX_VALUE,
      postedAt: Date.now(),
    });
  });

  await expect(t.query(api.baby.getByPublicId, { id: babyId })).rejects.toThrow(
    "has an invalid event timestamp",
  );
});

test("journey selection does not block backend milestone writes", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  await asAlice.mutation(api.baby.update, {
    id: babyId,
    patch: { birthJourney: "planned_c_section" },
  });

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      milestone: "labor_started",
      occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
    }),
  );

  const baby = await getBaby(t, babyId);
  expect(baby).not.toHaveProperty("laborStarted");
  expect(baby.birthJourney).toBe("planned_c_section");
  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toMatchObject([{ kind: "update", update: { milestone: "labor_started" } }]);
});

test("changing selection leaves existing updates and notifications untouched", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId, t } = harness;
  const photoId = await storeBlob(t);

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "A quiet update for everyone",
      milestone: "labor_started",
      photoId,
    }),
  );

  const notificationsBefore = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  await asAlice.mutation(api.baby.update, {
    id: babyId,
    patch: { birthJourney: "planned_c_section" },
  });

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toHaveLength(1);
  expect(feed.page[0]).toMatchObject({
    kind: "update",
    update: {
      message: "A quiet update for everyone",
      milestone: "labor_started",
    },
  });
  expect(feed.page[0]?.kind === "update" && feed.page[0].update.photoUrl).toBeTruthy();
  const notificationsAfter = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notificationsAfter).toEqual(notificationsBefore);
});

test("changing selection then unmarking cancels the pending milestone push", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId } = harness;
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      milestone: "labor_started",
    }),
  );

  await asAlice.mutation(api.baby.update, {
    id: babyId,
    patch: { birthJourney: "planned_c_section" },
  });
  await asAlice.mutation(api.updates.unmarkMilestone, {
    babyId,
    milestone: "labor_started",
  });

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notifications).toMatchObject([{ notificationType: "labor_started", status: "cancelled" }]);
});

test("selection changes do not filter empty historical milestone rows", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" }));

  await asAlice.mutation(api.baby.update, {
    id: babyId,
    patch: { birthJourney: "planned_c_section" },
  });

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toMatchObject([{ kind: "update", update: { milestone: "labor_started" } }]);
});

test("a milestone with a photo is a single status push that carries the image", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId, t } = harness;
  const photo = await storeBlob(t);

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "She's here!",
      milestone: "born",
      photoId: photo,
    }),
  );

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notifications).toMatchObject([
    {
      customMessage: "She's here!",
      notificationType: "born",
      photoId: photo,
      status: "pending",
    },
  ]);
});

test("a later generic update does not cancel a pending status push", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId } = harness;

  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" }));
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({ babyId, message: "Breathing through it" }),
  );

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notifications).toMatchObject([
    {
      customMessage: "Breathing through it",
      notificationType: "update_posted",
      status: "pending",
    },
    { notificationType: "labor_started", status: "pending" },
  ]);
});

test("the forward-only guard enforces order at every intermediate stage", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId } = harness;

  // From labor_started: re-marking it is rejected, later stages are open
  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" }));
  await expect(
    asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" })),
  ).rejects.toThrow("Only a future status can be marked");
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({ babyId, milestone: "gone_to_hospital" }),
  );

  // From gone_to_hospital: same and earlier stages are rejected, born is open
  await expect(
    asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "gone_to_hospital" })),
  ).rejects.toThrow("Only a future status can be marked");
  await expect(
    asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" })),
  ).rejects.toThrow("Only a future status can be marked");
  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "born" }));
});

test("milestones are posted, redated, and unmarked through explicit update operations", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;

  const initialOccurredAt = Date.parse("2026-08-10T08:00:00.000Z");
  const beforeMark = Date.now();
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      milestone: "labor_started",
      occurredAt: initialOccurredAt,
    }),
  );
  const afterMark = Date.now();

  let feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toHaveLength(1);
  const marked = feed.page[0];
  if (marked?.kind !== "update") {
    throw new Error("expected update");
  }
  // Feed position is announce time (now), not the historical event clock
  expect(marked.postedAt).toBeGreaterThanOrEqual(beforeMark);
  expect(marked.postedAt).toBeLessThanOrEqual(afterMark);
  expect(marked.update).toMatchObject({
    milestone: "labor_started",
    occurredAt: initialOccurredAt,
  });

  // Redate updates the event clock only — feed position stays put
  const postedAtBeforeRedate = marked.postedAt;
  await asAlice.mutation(api.updates.redateMilestone, {
    babyId,
    milestone: "labor_started",
    occurredAt: Date.parse("2026-08-10T10:30:00.000Z"),
  });
  feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toMatchObject([
    {
      postedAt: postedAtBeforeRedate,
      update: { occurredAt: Date.parse("2026-08-10T10:30:00.000Z") },
    },
  ]);

  // Unmarking removes the milestone from the feed
  await asAlice.mutation(api.updates.unmarkMilestone, {
    babyId,
    milestone: "labor_started",
  });
  feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toEqual([]);
});

test("encouragements dual-write timeline rows and cascade on delete", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Uncle Bob",
      babyId,
      message: "So excited!",
      visitorId: "visitor-2",
    }),
  );

  let feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toMatchObject([
    { encouragement: { authorName: "Uncle Bob" }, kind: "encouragement" },
  ]);

  await asAlice.mutation(api.encouragements.remove, { encouragementId, visitorId: null });

  feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toEqual([]);
  const softDeleted = await t.run(async (ctx) => {
    const items = await ctx.db.query("timelineItems").collect();
    const encouragements = await ctx.db.query("encouragements").collect();
    return { encouragements, items };
  });
  expect(softDeleted.items).toHaveLength(1);
  expect(softDeleted.items[0]?.deletedAt).toEqual(expect.any(Number));
  expect(softDeleted.encouragements).toHaveLength(1);
  expect(softDeleted.encouragements[0]?.deletedAt).toEqual(expect.any(Number));
});

test("removing a milestone update unmarks it and cancels the pending push", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId, t } = harness;

  const updateId = await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "It's starting",
      milestone: "labor_started",
    }),
  );

  await asAlice.mutation(api.updates.remove, { updateId });

  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  expect(publicBaby).toMatchObject({ babyBorn: null, laborStarted: null, wentToHospital: null });

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, { babyId });
  expect(notifications).toMatchObject([{ notificationType: "labor_started", status: "cancelled" }]);

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toEqual([]);
});

test("milestones must be deleted in reverse order", async () => {
  await using harness = await setup();
  await using _timers = useFakeTimersResource();
  const { asAlice, babyId, t } = harness;

  const laborUpdateId = await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      milestone: "labor_started",
    }),
  );
  const hospitalUpdateId = await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      milestone: "gone_to_hospital",
    }),
  );
  const bornUpdateId = await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      milestone: "born",
    }),
  );

  await expect(
    asAlice.mutation(api.updates.unmarkMilestone, {
      babyId,
      milestone: "gone_to_hospital",
    }),
  ).rejects.toThrow("Delete the Born status first");
  await expect(asAlice.mutation(api.updates.remove, { updateId: laborUpdateId })).rejects.toThrow(
    "Delete the Born status first",
  );

  await asAlice.mutation(api.updates.remove, { updateId: bornUpdateId });
  await expect(asAlice.mutation(api.updates.remove, { updateId: laborUpdateId })).rejects.toThrow(
    "Delete the Gone to hospital status first",
  );
  await asAlice.mutation(api.updates.remove, { updateId: hospitalUpdateId });
  await asAlice.mutation(api.updates.remove, { updateId: laborUpdateId });

  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  expect(publicBaby).toMatchObject({ babyBorn: null, laborStarted: null, wentToHospital: null });
});

test("photo updates keep old photos; removing one falls back to the previous", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;

  const photoA = await storeBlob(t);
  const photoB = await storeBlob(t);

  // Legacy path: settings photo uploader
  await asAlice.mutation(api.baby.updatePhoto, { babyId, photoId: photoA });
  // New path: photo posted as an update with a message
  const updateB = await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "Bump week 39",
      photoId: photoB,
    }),
  );

  let baby = await getBaby(t, babyId);
  expect(baby.photoId).toBe(photoB);

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toMatchObject([
    { kind: "update", update: { message: "Bump week 39" } },
    { kind: "update", update: { message: null } },
  ]);
  // Both photos (including the replaced one) stay fully resolvable in the feed
  expect(feed.page[0]?.kind === "update" && feed.page[0].update.photoUrl).toBeTruthy();
  expect(feed.page[1]?.kind === "update" && feed.page[1].update.photoUrl).toBeTruthy();

  // Removing the newest photo update falls back to the previous photo
  await asAlice.mutation(api.updates.remove, { updateId: updateB });
  baby = await getBaby(t, babyId);
  expect(baby.photoId).toBe(photoA);
});

test("text updates never displace the current page photo; pinning brings back an older one", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  const photoA = await storeBlob(t);
  const photoB = await storeBlob(t);

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({ babyId, message: "First pic", photoId: photoA }),
  );
  const updateB = await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({ babyId, photoId: photoB }),
  );

  // Text-only posts after a photo upload leave the page photo alone
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({ babyId, message: "Just a status, no new photo" }),
  );
  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, message: "Another one" }));
  let baby = await getBaby(t, babyId);
  expect(baby.photoId).toBe(photoB);

  // The feed marks which photo is the current page photo
  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  const photoFlags = feed.page
    .filter((item) => item.kind === "update" && item.update.photoUrl)
    .map((item) => item.kind === "update" && item.update.isCurrentPagePhoto);
  expect(photoFlags).toEqual([true, false]); // newest photo (B) is current, A is not

  // Pin the older photo back as the page photo
  const photoUpdates = feed.page.filter((item) => item.kind === "update" && item.update.photoUrl);
  const updateA = photoUpdates.at(-1);
  if (updateA?.kind !== "update") {
    throw new Error("expected photo update");
  }
  await asAlice.mutation(api.updates.setAsCurrentPhoto, { updateId: updateA.update._id });
  baby = await getBaby(t, babyId);
  expect(baby.photoId).toBe(photoA);

  // A brand-new photo upload takes over again (latest wins by default)
  const photoC = await storeBlob(t);
  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, photoId: photoC }));
  baby = await getBaby(t, babyId);
  expect(baby.photoId).toBe(photoC);

  // Only the owner can pin
  const asBob = t.withIdentity({ subject: "bob" });
  await expect(
    asBob.mutation(api.updates.setAsCurrentPhoto, { updateId: updateB }),
  ).rejects.toThrow("Not authorized");
});

test("redating validates the timestamp and requires an existing milestone", async () => {
  await using harness = await setup();
  const { asAlice, babyId } = harness;

  await expect(
    asAlice.mutation(api.updates.redateMilestone, {
      babyId,
      milestone: "labor_started",
      occurredAt: Date.now(),
    }),
  ).rejects.toThrow("Milestone update not found");

  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" }));

  await expect(
    asAlice.mutation(api.updates.redateMilestone, {
      babyId,
      milestone: "labor_started",
      occurredAt: Number.MAX_VALUE,
    }),
  ).rejects.toThrow("Invalid date");

  await expect(
    asAlice.mutation(api.updates.redateMilestone, {
      babyId,
      milestone: "labor_started",
      occurredAt: Date.now() + 2 * 60 * 60 * 1000,
    }),
  ).rejects.toThrow("The event time cannot be in the future");
});

test("posting a milestone rejects non-finite and out-of-range timestamps", async () => {
  await using harness = await setup();
  const { asAlice, babyId } = harness;

  for (const occurredAt of [Number.NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    await expect(
      asAlice.mutation(
        api.updates.post,
        postUpdateArgs({
          babyId,
          milestone: "labor_started",
          occurredAt,
        }),
      ),
    ).rejects.toThrow("Invalid date");
  }
});

test("posting a milestone sets occurredAt to the announce time", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  const before = Date.now();
  await asAlice.mutation(api.updates.post, postUpdateArgs({ babyId, milestone: "labor_started" }));
  const after = Date.now();

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toHaveLength(1);
  const item = feed.page[0];
  if (item?.kind !== "update") {
    throw new Error("expected update");
  }
  expect(item.postedAt).toBeGreaterThanOrEqual(before);
  expect(item.postedAt).toBeLessThanOrEqual(after);
  expect(item.update.occurredAt).toBe(item.postedAt);
});

test("posting a milestone can backdate the event clock without moving the feed", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  const occurredAt = Date.now() - 6 * 60 * 60 * 1000;

  const before = Date.now();
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "Started overnight, telling you all now!",
      milestone: "labor_started",
      occurredAt,
    }),
  );
  const after = Date.now();

  // The feed slot is the announce time; the event clock is the backdated time
  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(feed.page).toHaveLength(1);
  const item = feed.page[0];
  if (item?.kind !== "update") {
    throw new Error("expected update");
  }
  expect(item.postedAt).toBeGreaterThanOrEqual(before);
  expect(item.postedAt).toBeLessThanOrEqual(after);
  expect(item.update.occurredAt).toBe(occurredAt);

  // Inferred status uses the event clock, not the announce time
  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  expect(publicBaby?.laborStarted).toBe(new Date(occurredAt).toISOString());
  const stored = await getBaby(t, babyId);
  expect(stored).not.toHaveProperty("laborStarted");
});

test("a backdated event time is rejected when in the future or without a milestone", async () => {
  await using harness = await setup();
  const { asAlice, babyId } = harness;

  await expect(
    asAlice.mutation(
      api.updates.post,
      postUpdateArgs({
        babyId,
        milestone: "labor_started",
        occurredAt: Date.now() + 60 * 60 * 1000,
      }),
    ),
  ).rejects.toThrow("The event time cannot be in the future");

  await expect(
    asAlice.mutation(
      api.updates.post,
      postUpdateArgs({
        babyId,
        message: "Just a message",
        occurredAt: Date.now() - 60 * 60 * 1000,
      }),
    ),
  ).rejects.toThrow("A backdated time requires a status change");
});

test("getUpdatePhoto returns the public photo payload for a timeline update", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  const photoId = await storeBlob(t);
  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  if (!publicBaby) {
    throw new Error("expected baby");
  }

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "First smile",
      photoId,
    }),
  );

  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  const item = feed.page[0];
  if (item?.kind !== "update") {
    throw new Error("expected update");
  }

  const photo = await t.query(api.timeline.getUpdatePhoto, {
    babyId: publicBaby.publicId,
    updateId: item.update._id,
  });
  expect(photo).toMatchObject({
    babyName: "Baby Smith",
    blurDataUrl: null,
  });
  expect(photo?.photoUrl).toEqual(expect.any(String));
});

test("getUpdatePhoto returns null for text-only updates", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  const publicBaby = await t.query(api.baby.getByPublicId, { id: babyId });
  if (!publicBaby) {
    throw new Error("expected baby");
  }

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "No photo here",
    }),
  );
  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  const item = feed.page[0];
  if (item?.kind !== "update") {
    throw new Error("expected update");
  }

  expect(
    await t.query(api.timeline.getUpdatePhoto, {
      babyId: publicBaby.publicId,
      updateId: item.update._id,
    }),
  ).toBeNull();
});

test("getUpdatePhoto returns null when the update belongs to another baby", async () => {
  await using harness = await setup();
  const { asAlice, babyId, t } = harness;
  const other = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-01",
      name: "Baby Other",
    }),
  );
  const photoId = await storeBlob(t);
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId,
      message: "First baby photo",
      photoId,
    }),
  );
  const feed = await t.query(api.timeline.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  const item = feed.page[0];
  if (item?.kind !== "update") {
    throw new Error("expected update");
  }

  expect(
    await t.query(api.timeline.getUpdatePhoto, {
      babyId: other.publicId,
      updateId: item.update._id,
    }),
  ).toBeNull();
});
