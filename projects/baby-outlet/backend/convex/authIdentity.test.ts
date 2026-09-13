import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import {
  backfillBabyBirthJourneyDoc,
  backfillBabyDueDateDisplayDoc,
  backfillBabyLastActivityAtDoc,
  backfillBabyOwnerTokenIdentifierDoc,
  backfillBabySubscriptionCountDoc,
  backfillCoParentTokenIdentifierDoc,
  backfillOnboardingTokenIdentifierDoc,
  backfillProfileTokenIdentifierDoc,
  sanitizeOnboardingStepsDoc,
} from "./migrations";
import schema from "./schema";
import { modules } from "./test.setup";

test("auth identity migrations remain idempotent after backfill", async () => {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Migration Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "migration-baby",
      subscriptionCount: 99,
      userId: "alice",
    });
    const profileId = await ctx.db.insert("userProfiles", {
      isAdmin: false,
      locale: "en-GB",
      tokenIdentifier: "https://convex.test|alice",
      userId: "alice",
    });
    const onboardingId = await ctx.db.insert("userOnboarding", {
      checklistDismissed: false,
      completedSteps: ["share_link"],
      minimized: false,
      tokenIdentifier: "https://convex.test|alice",
      userId: "alice",
      welcomeDismissed: false,
    });
    const coParentId = await ctx.db.insert("babyCoParents", {
      addedAt: 1,
      addedByUserId: "alice",
      babyId,
      email: "bob@example.com",
      tokenIdentifier: "https://convex.test|bob",
      userId: "bob",
    });
    return { babyId, coParentId, onboardingId, profileId };
  });

  await t.run(async (ctx) => {
    const baby = await ctx.db.get(ids.babyId);
    const profile = await ctx.db.get(ids.profileId);
    const onboarding = await ctx.db.get(ids.onboardingId);
    const coParent = await ctx.db.get(ids.coParentId);
    if (!baby || !profile || !onboarding || !coParent) {
      throw new Error("Migration fixture missing");
    }

    await backfillBabyOwnerTokenIdentifierDoc(ctx, baby);
    await backfillBabyBirthJourneyDoc(ctx, baby);
    await backfillBabyDueDateDisplayDoc(ctx, baby);
    await backfillBabyLastActivityAtDoc(ctx, baby);
    await backfillBabySubscriptionCountDoc(ctx, baby);
    await backfillProfileTokenIdentifierDoc(ctx, profile);
    await backfillOnboardingTokenIdentifierDoc(ctx, onboarding);
    await backfillCoParentTokenIdentifierDoc(ctx, coParent);
    await sanitizeOnboardingStepsDoc(ctx, onboarding);

    await backfillBabyOwnerTokenIdentifierDoc(ctx, baby);
    await backfillBabyBirthJourneyDoc(ctx, baby);
    await backfillBabyDueDateDisplayDoc(ctx, baby);
    await backfillBabyLastActivityAtDoc(ctx, baby);
    await backfillBabySubscriptionCountDoc(ctx, baby);
    await backfillProfileTokenIdentifierDoc(ctx, profile);
    await backfillOnboardingTokenIdentifierDoc(ctx, onboarding);
    await backfillCoParentTokenIdentifierDoc(ctx, coParent);
    await sanitizeOnboardingStepsDoc(ctx, onboarding);
  });

  const migrated = await t.run(async (ctx) => {
    return {
      baby: await ctx.db.get(ids.babyId),
      coParent: await ctx.db.get(ids.coParentId),
      onboarding: await ctx.db.get(ids.onboardingId),
      profile: await ctx.db.get(ids.profileId),
    };
  });

  expect(migrated.baby?.ownerTokenIdentifier).toBe("https://convex.test|alice");
  expect(migrated.baby?.birthJourney).toBe("labor");
  expect(migrated.baby?.dueDateDisplayMode).toBe("exact");
  expect(migrated.baby?.publicDueDateText).toBeNull();
  expect(migrated.baby?.lastActivityAt).toBe(1);
  expect(migrated.baby?.subscriptionCount).toBe(0);
  expect(migrated.profile?.tokenIdentifier).toBe("https://convex.test|alice");
  expect(migrated.onboarding?.tokenIdentifier).toBe("https://convex.test|alice");
  expect(migrated.onboarding?.completedSteps).toEqual(["share_link"]);
  expect(migrated.coParent?.tokenIdentifier).toBe("https://convex.test|bob");
});

test("auth identity migrations write omitted token identifiers", async () => {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Sparse Identity Baby",
      ownerTokenIdentifier: "https://convex.test|placeholder",
      publicDueDateText: null,
      publicId: "sparse-identity-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
    const profileId = await ctx.db.insert("userProfiles", {
      isAdmin: false,
      locale: "en-GB",
      tokenIdentifier: "https://convex.test|placeholder",
      userId: "alice",
    });
    const onboardingId = await ctx.db.insert("userOnboarding", {
      checklistDismissed: false,
      completedSteps: [],
      minimized: false,
      tokenIdentifier: "https://convex.test|placeholder",
      userId: "alice",
      welcomeDismissed: false,
    });
    const coParentId = await ctx.db.insert("babyCoParents", {
      addedAt: 1,
      addedByUserId: "alice",
      babyId,
      email: "bob@example.com",
      tokenIdentifier: "https://convex.test|placeholder",
      userId: "bob",
    });
    return { babyId, coParentId, onboardingId, profileId };
  });

  await t.run(async (ctx) => {
    const baby = await ctx.db.get(ids.babyId);
    const profile = await ctx.db.get(ids.profileId);
    const onboarding = await ctx.db.get(ids.onboardingId);
    const coParent = await ctx.db.get(ids.coParentId);
    if (!baby || !profile || !onboarding || !coParent) {
      throw new Error("Migration fixture missing");
    }

    await backfillBabyOwnerTokenIdentifierDoc(ctx, {
      ...baby,
      ownerTokenIdentifier: undefined,
    });
    await backfillProfileTokenIdentifierDoc(ctx, {
      ...profile,
      tokenIdentifier: undefined,
    });
    await backfillOnboardingTokenIdentifierDoc(ctx, {
      ...onboarding,
      tokenIdentifier: undefined,
    });
    await backfillCoParentTokenIdentifierDoc(ctx, {
      ...coParent,
      tokenIdentifier: undefined,
    });
  });

  const migrated = await t.run(async (ctx) => {
    return {
      baby: await ctx.db.get(ids.babyId),
      coParent: await ctx.db.get(ids.coParentId),
      onboarding: await ctx.db.get(ids.onboardingId),
      profile: await ctx.db.get(ids.profileId),
    };
  });

  expect(migrated.baby?.ownerTokenIdentifier).toBe("https://convex.test|alice");
  expect(migrated.profile?.tokenIdentifier).toBe("https://convex.test|alice");
  expect(migrated.onboarding?.tokenIdentifier).toBe("https://convex.test|alice");
  expect(migrated.coParent?.tokenIdentifier).toBe("https://convex.test|bob");
});

test("due date display migration preserves and normalizes existing messages", async () => {
  const t = convexTest(schema, modules);
  const babyId = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "message",
      lastActivityAt: 1,
      name: "Migration Baby",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: "  Any day now  ",
      publicId: "message-migration-baby",
      subscriptionCount: 0,
      userId: "alice",
    });
  });

  await t.run(async (ctx) => {
    const baby = await ctx.db.get(babyId);
    if (!baby) {
      throw new Error("Migration fixture missing");
    }
    await backfillBabyDueDateDisplayDoc(ctx, baby);
    const migrated = await ctx.db.get(babyId);
    if (!migrated) {
      throw new Error("Migrated baby missing");
    }
    await backfillBabyDueDateDisplayDoc(ctx, migrated);
  });

  expect(await t.run(async (ctx) => await ctx.db.get(babyId))).toMatchObject({
    dueDate: "2026-09-01",
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
});
