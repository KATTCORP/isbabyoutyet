import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import { DEFAULT_TIME_ZONE } from "../src/timeZone";
import {
  backfillBabyBirthJourneyDoc,
  backfillBabyLastActivityAtDoc,
  backfillBabyOptionalKeysDoc,
  backfillBabySubscriptionCountDoc,
  backfillCoParentInviteOptionalKeysDoc,
  backfillCoParentOptionalKeysDoc,
  backfillEncouragementAuthorDoc,
  backfillEncouragementOptionalKeysDoc,
  removeEncouragementUserIdDoc,
  backfillEncouragementTimelineDoc,
  backfillPushSubscriptionOptionalKeysDoc,
  backfillScheduledNotificationOptionalKeysDoc,
  backfillTimelineItemOptionalKeysDoc,
  backfillUpdateOptionalKeysDoc,
  backfillUpdatePostedByUserIdDoc,
  backfillUserOnboardingOptionalKeysDoc,
  backfillUserProfileOptionalKeysDoc,
  removeBabyEncouragementsDisabledDoc,
  sanitizeOnboardingStepsDoc,
} from "./migrations";
import schema from "./schema";
import { modules, registerMigrationsComponent } from "./test.setup";

test("retained migrations skip linked rows and backfill update metadata and counts", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const ids = await t.run(async (ctx) => {
    const photoId = await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" }));
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Migration Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      photoId,
      publicDueDateText: null,
      publicId: "migration-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const originalItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 100,
    });
    const encouragementId = await ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId: "visitor-1" },
      authorName: "Grandma",
      babyId,
      createdAt: 200,
      message: "Thinking of you!",
      timelineItemId: originalItemId,
      visitorId: "visitor-1",
    });
    const updateItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "update",
      postedAt: 500,
    });
    const updateId = await ctx.db.insert("updates", {
      babyId,
      message: "Hello",
      timelineItemId: updateItemId,
    });
    await ctx.db.insert("pushSubscriptions", {
      auth: "auth",
      babyId,
      createdAt: 300,
      endpoint: "https://push.example/subscription",
      p256dh: "p256dh",
    });
    return { babyId, encouragementId, originalItemId, updateId };
  });

  await t.run(async (ctx) => {
    const baby = await ctx.db.get(ids.babyId);
    const encouragement = await ctx.db.get(ids.encouragementId);
    const update = await ctx.db.get(ids.updateId);
    if (!baby || !encouragement || !update) {
      throw new Error("Fixture missing");
    }

    await backfillEncouragementTimelineDoc(ctx, encouragement);
    await backfillEncouragementTimelineDoc(ctx, {
      ...encouragement,
      timelineItemId: undefined,
    });
    await backfillUpdatePostedByUserIdDoc(ctx, update);
    const updated = await ctx.db.get(ids.updateId);
    if (!updated) {
      throw new Error("Updated fixture missing");
    }
    await backfillUpdatePostedByUserIdDoc(ctx, updated);
    await backfillBabyBirthJourneyDoc(ctx, {
      ...baby,
      birthJourney: undefined,
    });
    await backfillBabyLastActivityAtDoc(ctx, {
      ...baby,
      lastActivityAt: undefined,
    });
    await backfillBabySubscriptionCountDoc(ctx, baby);
  });

  const result = await t.run(async (ctx) => {
    return {
      baby: await ctx.db.get(ids.babyId),
      encouragement: await ctx.db.get(ids.encouragementId),
      update: await ctx.db.get(ids.updateId),
    };
  });
  expect(result.encouragement?.timelineItemId).not.toBe(ids.originalItemId);
  expect(result.update?.postedByUserId).toBe("alice");
  expect(result.baby?.lastActivityAt).toBe(result.baby?._creationTime);
  expect(result.baby?.subscriptionCount).toBe(1);

  await expect(
    t.mutation(internal.migrations.runTableMigrations, {
      oneBatchOnly: true,
    }),
  ).resolves.toBeTruthy();
});

test("posted-by backfill skips updates whose baby row is gone", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const updateId = await t.run(async (ctx) => {
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Orphan Update Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "orphan-update-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "update",
      postedAt: 500,
    });
    const id = await ctx.db.insert("updates", {
      babyId,
      message: "Hello",
      timelineItemId,
    });
    await ctx.db.delete(babyId);
    return id;
  });

  await t.run(async (ctx) => {
    const update = await ctx.db.get(updateId);
    if (!update) {
      throw new Error("Fixture missing");
    }
    expect(await backfillUpdatePostedByUserIdDoc(ctx, update)).toBeUndefined();
  });

  expect(await t.run(async (ctx) => await ctx.db.get(updateId))).toMatchObject({
    message: "Hello",
  });
  expect(
    await t.run(async (ctx) => {
      const update = await ctx.db.get(updateId);
      return update?.postedByUserId ?? null;
    }),
  ).toBeNull();
});

test("sanitizeOnboardingSteps strips unknown retired step ids", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const onboardingId = await t.run(async (ctx) => {
    return await ctx.db.insert("userOnboarding", {
      checklistDismissed: false,
      completedSteps: ["add_baby", "share_link"],
      minimized: false,
      tokenIdentifier: "https://convex.test|alice",
      userId: "alice",
      welcomeDismissed: false,
    });
  });

  await t.run(async (ctx) => {
    const onboarding = await ctx.db.get(onboardingId);
    if (!onboarding) {
      throw new Error("Fixture missing");
    }
    const legacyOnboarding = {
      ...onboarding,
      completedSteps: ["add_baby", "retired_step", "share_link", "learn_encouragements"],
    };
    await sanitizeOnboardingStepsDoc(ctx, legacyOnboarding);
    const updated = await ctx.db.get(onboardingId);
    if (!updated) {
      throw new Error("Fixture missing");
    }
    await sanitizeOnboardingStepsDoc(ctx, updated);
  });

  const onboarding = await t.run(async (ctx) => ctx.db.get(onboardingId));
  expect(onboarding?.completedSteps).toEqual(["add_baby", "share_link", "learn_encouragements"]);
});

test("backfillEncouragementAuthor writes the union from leftover userId and visitorId", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const ids = await t.run(async (ctx) => {
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Legacy Author Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "legacy-author-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const guestItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 100,
    });
    const guestId = await ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId: "guest-browser" },
      authorName: "Grandma",
      babyId,
      createdAt: 100,
      message: "Soon!",
      timelineItemId: guestItemId,
      visitorId: "guest-browser",
    });
    const claimedItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 200,
    });
    const claimedId = await ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId: "bob-browser" },
      authorName: "Bob",
      babyId,
      createdAt: 200,
      message: "Hi",
      timelineItemId: claimedItemId,
      visitorId: "bob-browser",
    });
    return { claimedId, guestId };
  });

  await t.run(async (ctx) => {
    const guest = await ctx.db.get(ids.guestId);
    const claimed = await ctx.db.get(ids.claimedId);
    if (!guest || !claimed) {
      throw new Error("Fixture missing");
    }
    const { author: _guestAuthor, ...guestRest } = guest;
    const { author: _claimedAuthor, ...claimedRest } = claimed;
    await backfillEncouragementAuthorDoc(ctx, { ...guestRest, userId: null });
    await backfillEncouragementAuthorDoc(ctx, { ...claimedRest, userId: "bob" });
  });

  const result = await t.run(async (ctx) => {
    return {
      claimed: await ctx.db.get(ids.claimedId),
      guest: await ctx.db.get(ids.guestId),
    };
  });
  expect(result.guest?.author).toEqual({ type: "visitor", visitorId: "guest-browser" });
  expect(result.claimed?.author).toEqual({
    type: "user",
    userId: "bob",
    visitorId: "bob-browser",
  });
});

test("backfillEncouragementAuthor is a no-op when author is already set", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const encouragementId = await t.run(async (ctx) => {
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Author Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "author-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 100,
    });
    return await ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId: "guest-browser" },
      authorName: "Grandma",
      babyId,
      createdAt: 100,
      message: "Soon!",
      timelineItemId,
      visitorId: "guest-browser",
    });
  });

  await t.run(async (ctx) => {
    const encouragement = await ctx.db.get(encouragementId);
    if (!encouragement) {
      throw new Error("Fixture missing");
    }
    await backfillEncouragementAuthorDoc(ctx, encouragement);
    const updated = await ctx.db.get(encouragementId);
    if (!updated) {
      throw new Error("Fixture missing");
    }
    await backfillEncouragementAuthorDoc(ctx, updated);
  });

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored?.author).toEqual({ type: "visitor", visitorId: "guest-browser" });
});

test("removeEncouragementUserId strips the retired userId key", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const encouragementId = await t.run(async (ctx) => {
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Strip Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "strip-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 100,
    });
    return await ctx.db.insert("encouragements", {
      author: { type: "user", userId: "bob", visitorId: "bob-browser" },
      authorName: "Bob",
      babyId,
      createdAt: 100,
      message: "Hi",
      timelineItemId,
      visitorId: "bob-browser",
    });
  });

  await t.run(async (ctx) => {
    const encouragement = await ctx.db.get(encouragementId);
    if (!encouragement) {
      throw new Error("Fixture missing");
    }
    const legacy = { ...encouragement, userId: "bob" };
    await removeEncouragementUserIdDoc(ctx, legacy);
    const updated = await ctx.db.get(encouragementId);
    if (!updated) {
      throw new Error("Fixture missing");
    }
    await removeEncouragementUserIdDoc(ctx, updated);
  });

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored).not.toHaveProperty("userId");
  expect(stored?.author).toEqual({ type: "user", userId: "bob", visitorId: "bob-browser" });
});

test("removeBabyEncouragementsDisabled strips the retired flag from baby docs", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const babyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Legacy Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "legacy-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
  });

  await t.run(async (ctx) => {
    const baby = await ctx.db.get(babyId);
    if (!baby) {
      throw new Error("Fixture missing");
    }
    const legacyBaby = { ...baby, encouragementsDisabled: true };
    await removeBabyEncouragementsDisabledDoc(ctx, legacyBaby);
    const updated = await ctx.db.get(babyId);
    if (!updated) {
      throw new Error("Fixture missing");
    }
    await removeBabyEncouragementsDisabledDoc(ctx, updated);
  });

  const baby = await t.run(async (ctx) => ctx.db.get(babyId));
  expect(baby).not.toHaveProperty("encouragementsDisabled");
});

test("optional-key backfills write missing null/false without clobbering set values", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const ids = await t.run(async (ctx) => {
    const sparseBabyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Sparse Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "sparse-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const themedBabyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      demo: true,
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Themed Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "themed-baby",
      subscriptionCount: 0,
      theme: "violet-bloom",
      userId: "alice",
    });
    const sparseProfileId = await ctx.db.insert("userProfiles", {
      isAdmin: false,
      locale: "en-GB",
      tokenIdentifier: "https://convex.test|alice",
      userId: "alice",
    });
    const zonedProfileId = await ctx.db.insert("userProfiles", {
      isAdmin: false,
      locale: "en-GB",
      timeZone: "America/New_York",
      tokenIdentifier: "https://convex.test|bob",
      userId: "bob",
    });
    const subscriptionId = await ctx.db.insert("pushSubscriptions", {
      auth: "auth",
      babyId: sparseBabyId,
      createdAt: 300,
      endpoint: "https://push.example/sparse",
      p256dh: "p256dh",
    });
    const notificationId = await ctx.db.insert("scheduledNotifications", {
      babyId: sparseBabyId,
      createdAt: 400,
      notificationType: "photo_added",
      scheduledFor: 400,
      status: "pending",
    });
    const encouragementItemId = await ctx.db.insert("timelineItems", {
      babyId: sparseBabyId,
      kind: "encouragement",
      postedAt: 100,
    });
    const encouragementId = await ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId: "visitor-1" },
      authorName: "Grandma",
      babyId: sparseBabyId,
      createdAt: 100,
      message: "Soon!",
      timelineItemId: encouragementItemId,
      visitorId: "visitor-1",
    });
    const updateItemId = await ctx.db.insert("timelineItems", {
      babyId: sparseBabyId,
      kind: "update",
      postedAt: 500,
    });
    const updateId = await ctx.db.insert("updates", {
      babyId: sparseBabyId,
      message: "Hello",
      timelineItemId: updateItemId,
    });
    const onboardingId = await ctx.db.insert("userOnboarding", {
      checklistDismissed: false,
      completedSteps: ["add_baby"],
      minimized: false,
      tokenIdentifier: "https://convex.test|alice",
      userId: "alice",
      welcomeDismissed: false,
    });
    const coParentId = await ctx.db.insert("babyCoParents", {
      addedAt: 600,
      addedByUserId: "alice",
      babyId: sparseBabyId,
      email: "co@example.com",
      tokenIdentifier: "https://convex.test|co",
      userId: "co",
    });
    const inviteId = await ctx.db.insert("babyCoParentInvites", {
      babyId: sparseBabyId,
      createdAt: 700,
      email: "invite@example.com",
      invitedByUserId: "alice",
    });
    return {
      coParentId,
      encouragementId,
      encouragementItemId,
      inviteId,
      notificationId,
      onboardingId,
      sparseBabyId,
      sparseProfileId,
      subscriptionId,
      themedBabyId,
      updateId,
      updateItemId,
      zonedProfileId,
    };
  });

  async function runBackfills() {
    await t.run(async (ctx) => {
      const sparseBaby = await ctx.db.get(ids.sparseBabyId);
      const themedBaby = await ctx.db.get(ids.themedBabyId);
      const sparseProfile = await ctx.db.get(ids.sparseProfileId);
      const zonedProfile = await ctx.db.get(ids.zonedProfileId);
      const subscription = await ctx.db.get(ids.subscriptionId);
      const notification = await ctx.db.get(ids.notificationId);
      const encouragementItem = await ctx.db.get(ids.encouragementItemId);
      const encouragement = await ctx.db.get(ids.encouragementId);
      const updateItem = await ctx.db.get(ids.updateItemId);
      const update = await ctx.db.get(ids.updateId);
      const onboarding = await ctx.db.get(ids.onboardingId);
      const coParent = await ctx.db.get(ids.coParentId);
      const invite = await ctx.db.get(ids.inviteId);
      if (
        !sparseBaby ||
        !themedBaby ||
        !sparseProfile ||
        !zonedProfile ||
        !subscription ||
        !notification ||
        !encouragementItem ||
        !encouragement ||
        !updateItem ||
        !update ||
        !onboarding ||
        !coParent ||
        !invite
      ) {
        throw new Error("Fixture missing");
      }
      await backfillBabyOptionalKeysDoc(ctx, sparseBaby);
      await backfillBabyOptionalKeysDoc(ctx, themedBaby);
      await backfillUserProfileOptionalKeysDoc(ctx, sparseProfile);
      await backfillUserProfileOptionalKeysDoc(ctx, zonedProfile);
      await backfillPushSubscriptionOptionalKeysDoc(ctx, subscription);
      await backfillScheduledNotificationOptionalKeysDoc(ctx, notification);
      await backfillTimelineItemOptionalKeysDoc(ctx, encouragementItem);
      await backfillEncouragementOptionalKeysDoc(ctx, encouragement);
      await backfillTimelineItemOptionalKeysDoc(ctx, updateItem);
      await backfillUpdateOptionalKeysDoc(ctx, update);
      await backfillUserOnboardingOptionalKeysDoc(ctx, onboarding);
      await backfillCoParentOptionalKeysDoc(ctx, coParent);
      await backfillCoParentInviteOptionalKeysDoc(ctx, invite);
    });
  }

  await runBackfills();
  await runBackfills();

  const result = await t.run(async (ctx) => {
    return {
      coParent: await ctx.db.get(ids.coParentId),
      encouragement: await ctx.db.get(ids.encouragementId),
      encouragementItem: await ctx.db.get(ids.encouragementItemId),
      invite: await ctx.db.get(ids.inviteId),
      notification: await ctx.db.get(ids.notificationId),
      onboarding: await ctx.db.get(ids.onboardingId),
      sparseBaby: await ctx.db.get(ids.sparseBabyId),
      sparseProfile: await ctx.db.get(ids.sparseProfileId),
      subscription: await ctx.db.get(ids.subscriptionId),
      themedBaby: await ctx.db.get(ids.themedBabyId),
      update: await ctx.db.get(ids.updateId),
      updateItem: await ctx.db.get(ids.updateItemId),
      zonedProfile: await ctx.db.get(ids.zonedProfileId),
    };
  });

  expect(result.sparseBaby).toMatchObject({
    blurDataUrl: null,
    deletedAt: null,
    demo: false,
    locale: null,
    photoId: null,
    theme: null,
    thumbnailId: null,
  });
  expect(result.themedBaby).toMatchObject({
    deletedAt: null,
    demo: true,
    locale: null,
    theme: "violet-bloom",
  });
  expect(result.sparseProfile?.timeZone).toBe(DEFAULT_TIME_ZONE);
  expect(result.zonedProfile?.timeZone).toBe("America/New_York");
  expect(result.subscription?.userAgent).toBeNull();
  expect(result.notification).toMatchObject({
    customMessage: null,
    photoId: null,
    scheduledId: null,
    updateId: null,
  });
  expect(result.encouragementItem?.deletedAt).toBeNull();
  expect(result.encouragement).toMatchObject({
    deletedAt: null,
    demoFixture: false,
    locale: null,
    timezone: null,
    userAgent: null,
  });
  expect(result.updateItem?.deletedAt).toBeNull();
  expect(result.update).toMatchObject({
    blurDataUrl: null,
    deletedAt: null,
    message: "Hello",
    milestone: null,
    occurredAt: null,
    photoId: null,
    pushImageId: null,
    thumbnailId: null,
  });
  expect(result.onboarding).toMatchObject({
    activeCoachmarkStepId: null,
    restartHintVisible: false,
  });
  expect(result.coParent).toMatchObject({
    deletedAt: null,
    name: null,
  });
  expect(result.invite?.deletedAt).toBeNull();
});
