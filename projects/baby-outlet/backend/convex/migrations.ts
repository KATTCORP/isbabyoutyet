import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isOnboardingStepId } from "../src/onboardingSteps";
import { insertEncouragementTimelineItem } from "./timeline";
import { tokenIdentifierForAuthUserId } from "./authIdentity";
import { skipUserOnboarding, SKIP_TOUR_FOR_EXISTING_USERS_SENTINEL } from "./onboarding";
import { isActive } from "./softDelete";
import { DEMO_EMPTY_USER } from "../src/seedCredentials";

export const migrations = new Migrations<DataModel>(components.migrations);

// Runner to execute individual migrations via CLI
export const run = migrations.runner();

// Migration to generate thumbnails for existing photos
export const generateThumbnailsForExistingPhotos = migrations.define({
  table: "baby",
  migrateOne: async (ctx, baby) => {
    // Only process babies that have a photo but no thumbnail
    if (baby.photoId && !baby.thumbnailId) {
      // Schedule thumbnail generation action
      await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateThumbnail, {
        babyId: baby._id,
        photoId: baby.photoId,
      });
    }
  },
});

/**
 * Generate 1350×675 push images for photo updates that predate the derivative.
 */
export async function generatePushImagesForExistingPhotosDoc(
  ctx: MutationCtx,
  update: Doc<"updates">,
) {
  if (!isActive(update)) return;
  if (!update.photoId || update.pushImageId) return;
  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateThumbnail, {
    babyId: update.babyId,
    photoId: update.photoId,
    updateId: update._id,
  });
}

export const generatePushImagesForExistingPhotos = migrations.define({
  table: "updates",
  migrateOne: generatePushImagesForExistingPhotosDoc,
});

/**
 * Inline Next.js-style blur placeholders for photo updates that predate the field.
 */
export async function generateBlurDataUrlsForExistingPhotosDoc(
  ctx: MutationCtx,
  update: Doc<"updates">,
) {
  if (!isActive(update)) return;
  if (!update.photoId || update.blurDataUrl) return;
  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateBlurDataUrl, {
    babyId: update.babyId,
    photoId: update.photoId,
    updateId: update._id,
  });
}

export const generateBlurDataUrlsForExistingPhotos = migrations.define({
  table: "updates",
  migrateOne: generateBlurDataUrlsForExistingPhotosDoc,
});

/**
 * Same placeholder for a baby's current page photo when no matching update
 * row carried it (or the update backfill has not landed yet).
 */
export async function generateBlurDataUrlsForExistingBabyPhotosDoc(
  ctx: MutationCtx,
  baby: Doc<"baby">,
) {
  if (!isActive(baby)) return;
  if (!baby.photoId || baby.blurDataUrl) return;
  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateBlurDataUrl, {
    babyId: baby._id,
    photoId: baby.photoId,
  });
}

export const generateBlurDataUrlsForExistingBabyPhotos = migrations.define({
  table: "baby",
  migrateOne: generateBlurDataUrlsForExistingBabyPhotosDoc,
});

/**
 * Backfills the timeline row for an existing encouragement at its original
 * creation time. Idempotent: an encouragement with `timelineItemId` set has
 * already been migrated.
 */
export async function backfillEncouragementTimelineDoc(
  ctx: MutationCtx,
  encouragement: Doc<"encouragements">,
) {
  if (encouragement.timelineItemId) return;

  const timelineItemId = await insertEncouragementTimelineItem(ctx, {
    babyId: encouragement.babyId,
    postedAt: encouragement.createdAt,
  });
  await ctx.db.patch(encouragement._id, { timelineItemId });
}

export const backfillEncouragementTimeline = migrations.define({
  table: "encouragements",
  migrateOne: backfillEncouragementTimelineDoc,
});

const SKIP_TOUR_BATCH_SIZE = 50;

function authUserId(user: unknown) {
  if (user && typeof user === "object" && "_id" in user) {
    return String(user._id);
  }
  throw new Error("Better Auth user is missing _id");
}

function authUserEmail(user: unknown) {
  if (user && typeof user === "object" && "email" in user && typeof user.email === "string") {
    return user.email;
  }
  return null;
}

/**
 * Grandfathers every Better Auth user that existed when the guided tour
 * shipped: they skip the welcome carousel and checklist. New signups after
 * this migration completes still get the tour.
 *
 * The empty demo login (`test+newuser@example.com`) is left on the first-run
 * tour so preview/local can exercise that flow. `seedDemoData` resets that
 * account's progress and marks the main demo parent as complete.
 *
 * Idempotent: a sentinel `userOnboarding` row is written on the last page,
 * so later `runAll` deploys are a no-op.
 */
export async function skipTourForExistingUsersPage(ctx: MutationCtx, cursor: string | null) {
  const sentinel = await ctx.db
    .query("userOnboarding")
    .withIndex("by_userId", (q) => q.eq("userId", SKIP_TOUR_FOR_EXISTING_USERS_SENTINEL))
    .unique();
  if (sentinel) {
    return {
      isDone: true,
      continueCursor: "",
      alreadyRan: true,
      processed: 0,
    };
  }

  const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    paginationOpts: {
      numItems: SKIP_TOUR_BATCH_SIZE,
      cursor,
    },
  });

  for (const user of page.page) {
    if (authUserEmail(user) === DEMO_EMPTY_USER.email) continue;
    await skipUserOnboarding(ctx, authUserId(user));
  }

  if (page.isDone) {
    await skipUserOnboarding(ctx, SKIP_TOUR_FOR_EXISTING_USERS_SENTINEL);
    return {
      isDone: true,
      continueCursor: page.continueCursor,
      alreadyRan: false,
      processed: page.page.length,
    };
  }

  return {
    isDone: false,
    continueCursor: page.continueCursor,
    alreadyRan: false,
    processed: page.page.length,
  };
}

export const skipTourForExistingUsers = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await skipTourForExistingUsersPage(ctx, args.cursor);
    if (!result.isDone && !result.alreadyRan) {
      await ctx.scheduler.runAfter(0, internal.migrations.skipTourForExistingUsers, {
        cursor: result.continueCursor,
      });
    }
    return result;
  },
});

/**
 * Prefills `postedByUserId` on existing updates from the baby owner so a later
 * PR can tighten the field to required.
 */
export async function backfillUpdatePostedByUserIdDoc(ctx: MutationCtx, update: Doc<"updates">) {
  if (update.postedByUserId != null) return;
  const baby = await ctx.db.get(update.babyId);
  if (!baby) return;
  await ctx.db.patch(update._id, { postedByUserId: baby.userId });
}

export const backfillUpdatePostedByUserId = migrations.define({
  table: "updates",
  migrateOne: backfillUpdatePostedByUserIdDoc,
});

export async function backfillBabyOwnerTokenIdentifierDoc(ctx: MutationCtx, baby: Doc<"baby">) {
  if (baby.ownerTokenIdentifier !== undefined) return;
  await ctx.db.patch(baby._id, {
    ownerTokenIdentifier: tokenIdentifierForAuthUserId(baby.userId),
  });
}

export const backfillBabyOwnerTokenIdentifier = migrations.define({
  table: "baby",
  migrateOne: backfillBabyOwnerTokenIdentifierDoc,
});

/**
 * Gives every existing baby the pre-feature journey so the stacked feature PR
 * can tighten `birthJourney` from optional to required without changing any
 * currently visible milestones.
 */
export async function backfillBabyBirthJourneyDoc(ctx: MutationCtx, baby: Doc<"baby">) {
  if (baby.birthJourney !== undefined) return;
  await ctx.db.patch(baby._id, { birthJourney: "labor" });
}

export const backfillBabyBirthJourney = migrations.define({
  table: "baby",
  migrateOne: backfillBabyBirthJourneyDoc,
});

/**
 * Gives every baby an explicit public due-date display mode. Existing babies
 * keep the pre-feature exact date/countdown behavior. The message branch also
 * preserves any text written by an earlier preview deployment.
 */
export async function backfillBabyDueDateDisplayDoc(ctx: MutationCtx, baby: Doc<"baby">) {
  const publicDueDateText = baby.publicDueDateText?.trim() || null;
  const dueDateDisplayMode = publicDueDateText ? ("message" as const) : ("exact" as const);
  if (
    baby.dueDateDisplayMode === dueDateDisplayMode &&
    baby.publicDueDateText === publicDueDateText
  ) {
    return;
  }
  await ctx.db.patch(baby._id, { dueDateDisplayMode, publicDueDateText });
}

export const backfillBabyDueDateDisplay = migrations.define({
  table: "baby",
  migrateOne: backfillBabyDueDateDisplayDoc,
});

export async function backfillBabyLastActivityAtDoc(ctx: MutationCtx, baby: Doc<"baby">) {
  if (baby.lastActivityAt !== undefined) return;
  const timelineItems = await ctx.db
    .query("timelineItems")
    .withIndex("by_babyId_and_postedAt", (q) => q.eq("babyId", baby._id))
    .order("desc")
    .take(256);
  const latest = timelineItems.find(isActive);
  await ctx.db.patch(baby._id, {
    lastActivityAt: Math.max(baby._creationTime, latest?.postedAt ?? baby._creationTime),
  });
}

export const backfillBabyLastActivityAt = migrations.define({
  table: "baby",
  migrateOne: backfillBabyLastActivityAtDoc,
});

export async function backfillBabySubscriptionCountDoc(ctx: MutationCtx, baby: Doc<"baby">) {
  let subscriptionCount = 0;
  for await (const _subscription of ctx.db
    .query("pushSubscriptions")
    .withIndex("by_babyId", (q) => q.eq("babyId", baby._id))) {
    subscriptionCount += 1;
  }
  await ctx.db.patch(baby._id, { subscriptionCount });
}

export const backfillBabySubscriptionCount = migrations.define({
  table: "baby",
  migrateOne: backfillBabySubscriptionCountDoc,
});

export async function backfillProfileTokenIdentifierDoc(
  ctx: MutationCtx,
  profile: Doc<"userProfiles">,
) {
  if (profile.tokenIdentifier !== undefined) return;
  await ctx.db.patch(profile._id, {
    tokenIdentifier: tokenIdentifierForAuthUserId(profile.userId),
  });
}

export const backfillProfileTokenIdentifier = migrations.define({
  table: "userProfiles",
  migrateOne: backfillProfileTokenIdentifierDoc,
});

export async function backfillOnboardingTokenIdentifierDoc(
  ctx: MutationCtx,
  onboarding: Doc<"userOnboarding">,
) {
  if (onboarding.tokenIdentifier !== undefined) return;
  await ctx.db.patch(onboarding._id, {
    tokenIdentifier: tokenIdentifierForAuthUserId(onboarding.userId),
  });
}

export const backfillOnboardingTokenIdentifier = migrations.define({
  table: "userOnboarding",
  migrateOne: backfillOnboardingTokenIdentifierDoc,
});

export async function backfillCoParentTokenIdentifierDoc(
  ctx: MutationCtx,
  coParent: Doc<"babyCoParents">,
) {
  if (coParent.tokenIdentifier !== undefined) return;
  await ctx.db.patch(coParent._id, {
    tokenIdentifier: tokenIdentifierForAuthUserId(coParent.userId),
  });
}

export const backfillCoParentTokenIdentifier = migrations.define({
  table: "babyCoParents",
  migrateOne: backfillCoParentTokenIdentifierDoc,
});

export async function sanitizeOnboardingStepsDoc(
  ctx: MutationCtx,
  onboarding: Doc<"userOnboarding">,
) {
  const completedSteps = onboarding.completedSteps.filter(isOnboardingStepId);
  if (completedSteps.length === onboarding.completedSteps.length) return;
  await ctx.db.patch(onboarding._id, { completedSteps });
}

export const sanitizeOnboardingSteps = migrations.define({
  table: "userOnboarding",
  migrateOne: sanitizeOnboardingStepsDoc,
});

/**
 * Prefills `isAdmin: false` on existing userProfiles so a later PR can tighten
 * the field to required.
 */
export async function backfillUserProfileIsAdminDoc(
  ctx: MutationCtx,
  profile: Doc<"userProfiles">,
) {
  if (profile.isAdmin !== undefined) return;
  await ctx.db.patch(profile._id, { isAdmin: false });
}

export const backfillUserProfileIsAdmin = migrations.define({
  table: "userProfiles",
  migrateOne: backfillUserProfileIsAdminDoc,
});

export const runPushImageBackfill = migrations.runner(
  internal.migrations.generatePushImagesForExistingPhotos,
);
export const runBlurDataUrlBackfill = migrations.runner([
  internal.migrations.generateBlurDataUrlsForExistingPhotos,
  internal.migrations.generateBlurDataUrlsForExistingBabyPhotos,
]);
export const runBirthJourneyBackfill = migrations.runner(
  internal.migrations.backfillBabyBirthJourney,
);
export const runDueDateDisplayBackfill = migrations.runner(
  internal.migrations.backfillBabyDueDateDisplay,
);

export const runTableMigrations = migrations.runner([
  internal.migrations.generateThumbnailsForExistingPhotos,
  internal.migrations.backfillEncouragementTimeline,
  internal.migrations.backfillUpdatePostedByUserId,
  internal.migrations.backfillBabyOwnerTokenIdentifier,
  internal.migrations.backfillBabyLastActivityAt,
  internal.migrations.backfillBabySubscriptionCount,
  internal.migrations.backfillProfileTokenIdentifier,
  internal.migrations.backfillOnboardingTokenIdentifier,
  internal.migrations.backfillCoParentTokenIdentifier,
  internal.migrations.sanitizeOnboardingSteps,
  internal.migrations.backfillUserProfileIsAdmin,
]);

const HISTORICAL_MIGRATION_NAMES = [
  "migrations:generateThumbnailsForExistingPhotos",
  "migrations:backfillEncouragementTimeline",
  "migrations:backfillUpdatePostedByUserId",
  "migrations:backfillBabyOwnerTokenIdentifier",
  "migrations:backfillBabyLastActivityAt",
  "migrations:backfillBabySubscriptionCount",
  "migrations:backfillProfileTokenIdentifier",
  "migrations:backfillOnboardingTokenIdentifier",
  "migrations:backfillCoParentTokenIdentifier",
  "migrations:sanitizeOnboardingSteps",
  "migrations:backfillUserProfileIsAdmin",
] as const;

const TABLE_MIGRATION_NAMES = [
  ...HISTORICAL_MIGRATION_NAMES,
  "migrations:backfillBabyBirthJourney",
  "migrations:backfillBabyDueDateDisplay",
  "migrations:generatePushImagesForExistingPhotos",
  "migrations:generateBlurDataUrlsForExistingPhotos",
  "migrations:generateBlurDataUrlsForExistingBabyPhotos",
] as const;

async function migrationDeploymentStatus(ctx: QueryCtx, names: readonly string[]) {
  const statuses = await migrations.getStatus(ctx, {
    migrations: [...names],
  });
  return {
    isDone: statuses.length === names.length && statuses.every((status) => status.isDone),
    failed: statuses
      .filter((status) => status.error !== undefined)
      .map((status) => `${status.name}: ${status.error}`),
  };
}

export const historicalDeploymentStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await migrationDeploymentStatus(ctx, HISTORICAL_MIGRATION_NAMES);
  },
});

export const deploymentStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await migrationDeploymentStatus(ctx, TABLE_MIGRATION_NAMES);
  },
});

// Run all pending migrations - called automatically during deployment.
// skipTourForExistingUsers is not a table walker (users live in the Better
// Auth component), so it is kicked off alongside the serial table series.
export const runAll = internalMutation({
  args: {
    fn: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    next: v.optional(v.array(v.string())),
    reset: v.optional(v.boolean()),
    oneBatchOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    await ctx.scheduler.runAfter(0, internal.migrations.skipTourForExistingUsers, {
      cursor: null,
    });
    const historical = await ctx.runMutation(internal.migrations.runTableMigrations, args);
    await ctx.runMutation(internal.migrations.runBirthJourneyBackfill, {});
    await ctx.runMutation(internal.migrations.runDueDateDisplayBackfill, {});
    await ctx.runMutation(internal.migrations.runPushImageBackfill, {});
    await ctx.runMutation(internal.migrations.runBlurDataUrlBackfill, {});
    return historical;
  },
});
