import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  backfillBabyBirthJourneyDoc,
  backfillBabyLastActivityAtDoc,
  backfillBabySubscriptionCountDoc,
  backfillEncouragementTimelineDoc,
  backfillUpdatePostedByUserIdDoc,
} from "./migrations";
import schema from "./schema";
import { modules, registerMigrationsComponent } from "./test.setup";

test("retained migrations skip linked rows and backfill update metadata and counts", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  const ids = await t.run(async (ctx) => {
    const photoId = await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" }));
    const babyId = await ctx.db.insert("baby", {
      userId: "alice",
      ownerTokenIdentifier: "https://convex.test|alice",
      name: "Migration Baby",
      dueDate: "2026-09-01",
      publicId: "migration-baby",
      birthJourney: "labor",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      photoId,
      lastActivityAt: 1,
      subscriptionCount: 0,
    });
    const originalItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 100,
    });
    const encouragementId = await ctx.db.insert("encouragements", {
      babyId,
      authorName: "Grandma",
      message: "Thinking of you!",
      createdAt: 200,
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
      timelineItemId: updateItemId,
      message: "Hello",
    });
    await ctx.db.insert("pushSubscriptions", {
      babyId,
      endpoint: "https://push.example/subscription",
      p256dh: "p256dh",
      auth: "auth",
      createdAt: 300,
    });
    return { babyId, encouragementId, originalItemId, updateId };
  });

  await t.run(async (ctx) => {
    const baby = await ctx.db.get(ids.babyId);
    const encouragement = await ctx.db.get(ids.encouragementId);
    const update = await ctx.db.get(ids.updateId);
    if (!baby || !encouragement || !update) throw new Error("Fixture missing");

    await backfillEncouragementTimelineDoc(ctx, encouragement);
    await backfillEncouragementTimelineDoc(ctx, {
      ...encouragement,
      timelineItemId: undefined,
    } as unknown as Doc<"encouragements">);
    await backfillUpdatePostedByUserIdDoc(ctx, update);
    const updated = await ctx.db.get(ids.updateId);
    if (!updated) throw new Error("Updated fixture missing");
    await backfillUpdatePostedByUserIdDoc(ctx, updated);
    await backfillBabyBirthJourneyDoc(ctx, {
      ...baby,
      birthJourney: undefined,
    } as unknown as Doc<"baby">);
    await backfillBabyLastActivityAtDoc(ctx, {
      ...baby,
      lastActivityAt: undefined,
    } as unknown as Doc<"baby">);
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
