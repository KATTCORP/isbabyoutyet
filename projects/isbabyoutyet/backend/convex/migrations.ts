import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
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
import { isJsonObjectValue, parseJsonNumber, parseJsonString } from "@workspace/runtime/json";
import { DEFAULT_TIME_ZONE } from "../src/timeZone";

export const migrations = new Migrations<DataModel>(components.migrations);

// Runner to execute individual migrations via CLI
export const run = migrations.runner();

// Migration to generate thumbnails for existing photos
export const generateThumbnailsForExistingPhotos = migrations.define({
  migrateOne: async (ctx, baby) => {
    // Only process babies that have a photo but no thumbnail
    if (baby.photoId && !baby.thumbnailId) {
      // Schedule thumbnail generation action
      await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateThumbnail, {
        babyId: baby._id,
        photoId: baby.photoId,
        updateId: null,
      });
    }
  },
  table: "baby",
});

/**
 * Generate 1350×675 push images for photo updates that predate the derivative.
 */
export async function generatePushImagesForExistingPhotosDoc(
  ctx: MutationCtx,
  update: Doc<"updates">,
) {
  if (!isActive(update)) {
    return;
  }
  if (!update.photoId || update.pushImageId) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateThumbnail, {
    babyId: update.babyId,
    photoId: update.photoId,
    updateId: update._id,
  });
}

export const generatePushImagesForExistingPhotos = migrations.define({
  migrateOne: generatePushImagesForExistingPhotosDoc,
  table: "updates",
});

/**
 * Inline Next.js-style blur placeholders for photo updates that predate the field.
 */
export async function generateBlurDataUrlsForExistingPhotosDoc(
  ctx: MutationCtx,
  update: Doc<"updates">,
) {
  if (!isActive(update)) {
    return;
  }
  if (!update.photoId || update.blurDataUrl) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateBlurDataUrl, {
    babyId: update.babyId,
    photoId: update.photoId,
    updateId: update._id,
  });
}

export const generateBlurDataUrlsForExistingPhotos = migrations.define({
  migrateOne: generateBlurDataUrlsForExistingPhotosDoc,
  table: "updates",
});

/**
 * Same placeholder for a baby's current page photo when no matching update
 * row carried it (or the update backfill has not landed yet).
 */
export async function generateBlurDataUrlsForExistingBabyPhotosDoc(
  ctx: MutationCtx,
  baby: Doc<"baby">,
) {
  if (!isActive(baby)) {
    return;
  }
  if (!baby.photoId || baby.blurDataUrl) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateBlurDataUrl, {
    babyId: baby._id,
    photoId: baby.photoId,
    updateId: null,
  });
}

export const generateBlurDataUrlsForExistingBabyPhotos = migrations.define({
  migrateOne: generateBlurDataUrlsForExistingBabyPhotosDoc,
  table: "baby",
});

/**
 * Backfills the timeline row for an existing encouragement at its original
 * creation time. Idempotent: an encouragement with `timelineItemId` set has
 * already been migrated.
 */
type EncouragementTimelineBackfill = Omit<Doc<"encouragements">, "timelineItemId"> & {
  timelineItemId: Doc<"encouragements">["timelineItemId"] | undefined;
};

export async function backfillEncouragementTimelineDoc(
  ctx: MutationCtx,
  encouragement: EncouragementTimelineBackfill,
) {
  if (encouragement.timelineItemId) {
    return;
  }

  const timelineItemId = await insertEncouragementTimelineItem(ctx, {
    babyId: encouragement.babyId,
    postedAt: encouragement.createdAt,
  });
  await ctx.db.patch(encouragement._id, { timelineItemId });
}

export const backfillEncouragementTimeline = migrations.define({
  migrateOne: backfillEncouragementTimelineDoc,
  table: "encouragements",
});

const SKIP_TOUR_BATCH_SIZE = 50;

function authUserId<TUser>(user: TUser) {
  if (isJsonObjectValue(user) && "_id" in user) {
    return String(user._id);
  }
  throw new Error("Better Auth user is missing _id");
}

function authUserEmail<TUser>(user: TUser) {
  if (isJsonObjectValue(user) && "email" in user) {
    return parseJsonString(user.email);
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
      alreadyRan: true,
      continueCursor: "",
      isDone: true,
      processed: 0,
    };
  }

  const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    paginationOpts: {
      cursor,
      numItems: SKIP_TOUR_BATCH_SIZE,
    },
  });

  for (const user of page.page) {
    if (authUserEmail(user) === DEMO_EMPTY_USER.email) {
      continue;
    }
    await skipUserOnboarding(ctx, authUserId(user));
  }

  if (page.isDone) {
    await skipUserOnboarding(ctx, SKIP_TOUR_FOR_EXISTING_USERS_SENTINEL);
    return {
      alreadyRan: false,
      continueCursor: page.continueCursor,
      isDone: true,
      processed: page.page.length,
    };
  }

  return {
    alreadyRan: false,
    continueCursor: page.continueCursor,
    isDone: false,
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
  if (update.postedByUserId != null) {
    return;
  }
  const baby = await ctx.db.get(update.babyId);
  if (!baby) {
    return;
  }
  await ctx.db.patch(update._id, { postedByUserId: baby.userId });
}

export const backfillUpdatePostedByUserId = migrations.define({
  migrateOne: backfillUpdatePostedByUserIdDoc,
  table: "updates",
});

type BabyOwnerTokenBackfill = Omit<Doc<"baby">, "ownerTokenIdentifier"> & {
  ownerTokenIdentifier: Doc<"baby">["ownerTokenIdentifier"] | undefined;
};

export async function backfillBabyOwnerTokenIdentifierDoc(
  ctx: MutationCtx,
  baby: BabyOwnerTokenBackfill,
) {
  if (baby.ownerTokenIdentifier !== undefined) {
    return;
  }
  await ctx.db.patch(baby._id, {
    ownerTokenIdentifier: tokenIdentifierForAuthUserId(baby.userId),
  });
}

export const backfillBabyOwnerTokenIdentifier = migrations.define({
  migrateOne: backfillBabyOwnerTokenIdentifierDoc,
  table: "baby",
});

/**
 * Gives every existing baby the pre-feature journey so the stacked feature PR
 * can tighten `birthJourney` from optional to required without changing any
 * currently visible milestones.
 */
type BabyBirthJourneyBackfill = Omit<Doc<"baby">, "birthJourney"> & {
  birthJourney: Doc<"baby">["birthJourney"] | undefined;
};

export async function backfillBabyBirthJourneyDoc(
  ctx: MutationCtx,
  baby: BabyBirthJourneyBackfill,
) {
  if (baby.birthJourney !== undefined) {
    return;
  }
  await ctx.db.patch(baby._id, { birthJourney: "labor" });
}

export const backfillBabyBirthJourney = migrations.define({
  migrateOne: backfillBabyBirthJourneyDoc,
  table: "baby",
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
  migrateOne: backfillBabyDueDateDisplayDoc,
  table: "baby",
});

type BabyLastActivityAtBackfill = Omit<Doc<"baby">, "lastActivityAt"> & {
  lastActivityAt: Doc<"baby">["lastActivityAt"] | undefined;
};

export async function backfillBabyLastActivityAtDoc(
  ctx: MutationCtx,
  baby: BabyLastActivityAtBackfill,
) {
  if (baby.lastActivityAt !== undefined) {
    return;
  }
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
  migrateOne: backfillBabyLastActivityAtDoc,
  table: "baby",
});

export async function backfillBabySubscriptionCountDoc(ctx: MutationCtx, baby: Doc<"baby">) {
  let subscriptionCount = 0;
  for await (const subscription of ctx.db
    .query("pushSubscriptions")
    .withIndex("by_babyId", (q) => q.eq("babyId", baby._id))) {
    void subscription;
    subscriptionCount += 1;
  }
  await ctx.db.patch(baby._id, { subscriptionCount });
}

export const backfillBabySubscriptionCount = migrations.define({
  migrateOne: backfillBabySubscriptionCountDoc,
  table: "baby",
});

/**
 * Removes the retired `encouragementsDisabled` flag so visitor messages are
 * always allowed. Idempotent: no-op when the field is already absent.
 */
type LegacyBabyWithEncouragementsDisabled = Doc<"baby"> & {
  encouragementsDisabled?: boolean;
};

export async function removeBabyEncouragementsDisabledDoc(
  ctx: MutationCtx,
  baby: LegacyBabyWithEncouragementsDisabled,
) {
  if (baby.encouragementsDisabled === undefined) {
    return;
  }
  const { encouragementsDisabled: _removed, ...rest } = baby;
  await ctx.db.replace("baby", baby._id, rest);
}

export const removeBabyEncouragementsDisabled = migrations.define({
  migrateOne: removeBabyEncouragementsDisabledDoc,
  table: "baby",
});

type ProfileTokenBackfill = Omit<Doc<"userProfiles">, "tokenIdentifier"> & {
  tokenIdentifier: Doc<"userProfiles">["tokenIdentifier"] | undefined;
};

export async function backfillProfileTokenIdentifierDoc(
  ctx: MutationCtx,
  profile: ProfileTokenBackfill,
) {
  if (profile.tokenIdentifier !== undefined) {
    return;
  }
  await ctx.db.patch(profile._id, {
    tokenIdentifier: tokenIdentifierForAuthUserId(profile.userId),
  });
}

export const backfillProfileTokenIdentifier = migrations.define({
  migrateOne: backfillProfileTokenIdentifierDoc,
  table: "userProfiles",
});

type OnboardingTokenBackfill = Omit<Doc<"userOnboarding">, "tokenIdentifier"> & {
  tokenIdentifier: Doc<"userOnboarding">["tokenIdentifier"] | undefined;
};

export async function backfillOnboardingTokenIdentifierDoc(
  ctx: MutationCtx,
  onboarding: OnboardingTokenBackfill,
) {
  if (onboarding.tokenIdentifier !== undefined) {
    return;
  }
  await ctx.db.patch(onboarding._id, {
    tokenIdentifier: tokenIdentifierForAuthUserId(onboarding.userId),
  });
}

export const backfillOnboardingTokenIdentifier = migrations.define({
  migrateOne: backfillOnboardingTokenIdentifierDoc,
  table: "userOnboarding",
});

type CoParentTokenBackfill = Omit<Doc<"babyCoParents">, "tokenIdentifier"> & {
  tokenIdentifier: Doc<"babyCoParents">["tokenIdentifier"] | undefined;
};

export async function backfillCoParentTokenIdentifierDoc(
  ctx: MutationCtx,
  coParent: CoParentTokenBackfill,
) {
  if (coParent.tokenIdentifier !== undefined) {
    return;
  }
  await ctx.db.patch(coParent._id, {
    tokenIdentifier: tokenIdentifierForAuthUserId(coParent.userId),
  });
}

export const backfillCoParentTokenIdentifier = migrations.define({
  migrateOne: backfillCoParentTokenIdentifierDoc,
  table: "babyCoParents",
});

type LegacyUserOnboardingWithRetiredSteps = Omit<Doc<"userOnboarding">, "completedSteps"> & {
  completedSteps: Array<string>;
};

export async function sanitizeOnboardingStepsDoc(
  ctx: MutationCtx,
  onboarding: LegacyUserOnboardingWithRetiredSteps,
) {
  const completedSteps = onboarding.completedSteps.filter(isOnboardingStepId);
  if (completedSteps.length === onboarding.completedSteps.length) {
    return;
  }
  await ctx.db.patch(onboarding._id, { completedSteps });
}

export const sanitizeOnboardingSteps = migrations.define({
  migrateOne: sanitizeOnboardingStepsDoc,
  table: "userOnboarding",
});

/**
 * Prefills `isAdmin: false` on existing userProfiles so a later PR can tighten
 * the field to required.
 */
export async function backfillUserProfileIsAdminDoc(
  ctx: MutationCtx,
  profile: Doc<"userProfiles">,
) {
  if (profile.isAdmin !== undefined) {
    return;
  }
  await ctx.db.patch(profile._id, { isAdmin: false });
}

export const backfillUserProfileIsAdmin = migrations.define({
  migrateOne: backfillUserProfileIsAdminDoc,
  table: "userProfiles",
});

function isOwnKey<TRecord extends object>(record: TRecord, key: PropertyKey): key is keyof TRecord {
  return Object.hasOwn(record, key);
}

async function patchMissingKeys<TTable extends keyof DataModel>(
  ctx: MutationCtx,
  opts: {
    defaults: Partial<Doc<TTable>>;
    doc: Doc<TTable>;
    id: Id<TTable>;
  },
) {
  const patch: Partial<Doc<TTable>> = {};
  for (const key in opts.defaults) {
    if (!isOwnKey(opts.defaults, key)) {
      continue;
    }
    if (opts.doc[key] === undefined) {
      patch[key] = opts.defaults[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    return;
  }
  await ctx.db.patch(opts.id, patch);
}

/** Writes omitted union/boolean keys so a later PR can drop `v.optional()`. */
export async function backfillBabyOptionalKeysDoc(ctx: MutationCtx, baby: Doc<"baby">) {
  await patchMissingKeys(ctx, {
    defaults: {
      blurDataUrl: null,
      deletedAt: null,
      demo: false,
      locale: null,
      photoId: null,
      theme: null,
      thumbnailId: null,
    },
    doc: baby,
    id: baby._id,
  });
}

export const backfillBabyOptionalKeys = migrations.define({
  migrateOne: backfillBabyOptionalKeysDoc,
  table: "baby",
});

export async function backfillUserProfileOptionalKeysDoc(
  ctx: MutationCtx,
  profile: Doc<"userProfiles">,
) {
  await patchMissingKeys(ctx, {
    defaults: { timeZone: DEFAULT_TIME_ZONE },
    doc: profile,
    id: profile._id,
  });
}

export const backfillUserProfileOptionalKeys = migrations.define({
  migrateOne: backfillUserProfileOptionalKeysDoc,
  table: "userProfiles",
});

export async function backfillPushSubscriptionOptionalKeysDoc(
  ctx: MutationCtx,
  subscription: Doc<"pushSubscriptions">,
) {
  await patchMissingKeys(ctx, {
    defaults: { userAgent: null },
    doc: subscription,
    id: subscription._id,
  });
}

export const backfillPushSubscriptionOptionalKeys = migrations.define({
  migrateOne: backfillPushSubscriptionOptionalKeysDoc,
  table: "pushSubscriptions",
});

export async function backfillScheduledNotificationOptionalKeysDoc(
  ctx: MutationCtx,
  notification: Doc<"scheduledNotifications">,
) {
  await patchMissingKeys(ctx, {
    defaults: {
      customMessage: null,
      photoId: null,
      scheduledId: null,
      updateId: null,
    },
    doc: notification,
    id: notification._id,
  });
}

export const backfillScheduledNotificationOptionalKeys = migrations.define({
  migrateOne: backfillScheduledNotificationOptionalKeysDoc,
  table: "scheduledNotifications",
});

export async function backfillEncouragementOptionalKeysDoc(
  ctx: MutationCtx,
  encouragement: Doc<"encouragements">,
) {
  await patchMissingKeys(ctx, {
    defaults: {
      deletedAt: null,
      demoFixture: false,
      locale: null,
      timezone: null,
      userAgent: null,
    },
    doc: encouragement,
    id: encouragement._id,
  });
}

export const backfillEncouragementOptionalKeys = migrations.define({
  migrateOne: backfillEncouragementOptionalKeysDoc,
  table: "encouragements",
});

/**
 * Writes the discriminated `author` union from leftover `userId` / `visitorId`.
 * Idempotent: a row that already has `author` is left alone.
 * `author` stays omitted-optional so leftover pre-require rows still typecheck.
 */
type EncouragementAuthorBackfill = Omit<Doc<"encouragements">, "author"> & {
  author?: Doc<"encouragements">["author"];
  userId?: string | null;
};

export async function backfillEncouragementAuthorDoc(
  ctx: MutationCtx,
  encouragement: EncouragementAuthorBackfill,
) {
  if (encouragement.author !== undefined) {
    return;
  }
  const author = encouragement.userId
    ? {
        type: "user" as const,
        userId: encouragement.userId,
        visitorId: encouragement.visitorId,
      }
    : { type: "visitor" as const, visitorId: encouragement.visitorId };
  await ctx.db.patch(encouragement._id, { author });
}

export const backfillEncouragementAuthor = migrations.define({
  migrateOne: backfillEncouragementAuthorDoc,
  table: "encouragements",
});

/**
 * Removes the retired top-level `userId` after identity lives on `author`.
 */
export async function removeEncouragementUserIdDoc(
  ctx: MutationCtx,
  encouragement: Doc<"encouragements"> & Partial<{ userId: string | null }>,
) {
  if (encouragement.userId === undefined) {
    return;
  }
  const { userId: _removed, ...rest } = encouragement;
  await ctx.db.replace("encouragements", encouragement._id, rest);
}

export const removeEncouragementUserId = migrations.define({
  migrateOne: removeEncouragementUserIdDoc,
  table: "encouragements",
});

export async function backfillTimelineItemOptionalKeysDoc(
  ctx: MutationCtx,
  item: Doc<"timelineItems">,
) {
  await patchMissingKeys(ctx, {
    defaults: { deletedAt: null },
    doc: item,
    id: item._id,
  });
}

export const backfillTimelineItemOptionalKeys = migrations.define({
  migrateOne: backfillTimelineItemOptionalKeysDoc,
  table: "timelineItems",
});

export async function backfillUpdateOptionalKeysDoc(ctx: MutationCtx, update: Doc<"updates">) {
  await patchMissingKeys(ctx, {
    defaults: {
      blurDataUrl: null,
      deletedAt: null,
      message: null,
      milestone: null,
      occurredAt: null,
      photoId: null,
      pushImageId: null,
      thumbnailId: null,
    },
    doc: update,
    id: update._id,
  });
}

export const backfillUpdateOptionalKeys = migrations.define({
  migrateOne: backfillUpdateOptionalKeysDoc,
  table: "updates",
});

export async function backfillUserOnboardingOptionalKeysDoc(
  ctx: MutationCtx,
  onboarding: Doc<"userOnboarding">,
) {
  await patchMissingKeys(ctx, {
    defaults: {
      activeCoachmarkStepId: null,
      restartHintVisible: false,
    },
    doc: onboarding,
    id: onboarding._id,
  });
}

export const backfillUserOnboardingOptionalKeys = migrations.define({
  migrateOne: backfillUserOnboardingOptionalKeysDoc,
  table: "userOnboarding",
});

export async function backfillCoParentOptionalKeysDoc(
  ctx: MutationCtx,
  coParent: Doc<"babyCoParents">,
) {
  await patchMissingKeys(ctx, {
    defaults: {
      deletedAt: null,
      name: null,
    },
    doc: coParent,
    id: coParent._id,
  });
}

export const backfillCoParentOptionalKeys = migrations.define({
  migrateOne: backfillCoParentOptionalKeysDoc,
  table: "babyCoParents",
});

export async function backfillCoParentInviteOptionalKeysDoc(
  ctx: MutationCtx,
  invite: Doc<"babyCoParentInvites">,
) {
  await patchMissingKeys(ctx, {
    defaults: { deletedAt: null },
    doc: invite,
    id: invite._id,
  });
}

export const backfillCoParentInviteOptionalKeys = migrations.define({
  migrateOne: backfillCoParentInviteOptionalKeysDoc,
  table: "babyCoParentInvites",
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
  internal.migrations.removeBabyEncouragementsDisabled,
  internal.migrations.backfillBabyOptionalKeys,
  internal.migrations.backfillUserProfileOptionalKeys,
  internal.migrations.backfillPushSubscriptionOptionalKeys,
  internal.migrations.backfillScheduledNotificationOptionalKeys,
  internal.migrations.backfillEncouragementOptionalKeys,
  internal.migrations.backfillEncouragementAuthor,
  internal.migrations.removeEncouragementUserId,
  internal.migrations.backfillTimelineItemOptionalKeys,
  internal.migrations.backfillUpdateOptionalKeys,
  internal.migrations.backfillUserOnboardingOptionalKeys,
  internal.migrations.backfillCoParentOptionalKeys,
  internal.migrations.backfillCoParentInviteOptionalKeys,
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
  "migrations:removeBabyEncouragementsDisabled",
] as const;

const TABLE_MIGRATION_NAMES = [
  ...HISTORICAL_MIGRATION_NAMES,
  "migrations:backfillBabyBirthJourney",
  "migrations:backfillBabyDueDateDisplay",
  "migrations:generatePushImagesForExistingPhotos",
  "migrations:generateBlurDataUrlsForExistingPhotos",
  "migrations:generateBlurDataUrlsForExistingBabyPhotos",
  "migrations:backfillBabyOptionalKeys",
  "migrations:backfillUserProfileOptionalKeys",
  "migrations:backfillPushSubscriptionOptionalKeys",
  "migrations:backfillScheduledNotificationOptionalKeys",
  "migrations:backfillEncouragementOptionalKeys",
  "migrations:backfillEncouragementAuthor",
  "migrations:removeEncouragementUserId",
  "migrations:backfillTimelineItemOptionalKeys",
  "migrations:backfillUpdateOptionalKeys",
  "migrations:backfillUserOnboardingOptionalKeys",
  "migrations:backfillCoParentOptionalKeys",
  "migrations:backfillCoParentInviteOptionalKeys",
] as const;

async function migrationDeploymentStatus(ctx: QueryCtx, names: ReadonlyArray<string>) {
  const statuses = await migrations.getStatus(ctx, {
    migrations: [...names],
  });
  return {
    failed: statuses
      .filter((status) => status.error !== undefined)
      .map((status) => `${status.name}: ${status.error}`),
    isDone: statuses.length === names.length && statuses.every((status) => status.isDone),
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
/** CLI-oriented report returned by `@convex-dev/migrations` runners. */
type MigrationRunnerReport = {
  readonly lastFinished: string;
  readonly lastStarted: string;
  readonly Name: string;
  readonly processed: number;
  readonly Status: string;
  readonly toStartOver: string;
};

export function parseMigrationRunnerReport<TResult>(result: TResult): MigrationRunnerReport {
  if (!isJsonObjectValue(result)) {
    throw new Error("Migration runner returned an invalid report");
  }
  if (
    !("Name" in result) ||
    !("Status" in result) ||
    !("processed" in result) ||
    !("lastFinished" in result) ||
    !("lastStarted" in result) ||
    !("toStartOver" in result)
  ) {
    throw new Error("Migration runner returned an invalid report");
  }
  const Name = parseJsonString(result.Name);
  const Status = parseJsonString(result.Status);
  const processed = parseJsonNumber(result.processed);
  const lastFinished = parseJsonString(result.lastFinished);
  const lastStarted = parseJsonString(result.lastStarted);
  const toStartOver = parseJsonString(result.toStartOver);
  if (
    Name === null ||
    Status === null ||
    processed === null ||
    lastFinished === null ||
    lastStarted === null ||
    toStartOver === null
  ) {
    throw new Error("Migration runner returned an invalid report");
  }
  return {
    lastFinished,
    lastStarted,
    Name,
    processed,
    Status,
    toStartOver,
  };
}

export const runAll = internalMutation({
  args: {
    /** @todo Keep mirroring `@convex-dev/migrations` runner options. */
    fn: v.optional(v.string()),
    /** @todo Keep mirroring `@convex-dev/migrations` runner options. */
    cursor: v.optional(v.union(v.string(), v.null())),
    /** @todo Keep mirroring `@convex-dev/migrations` runner options. */
    batchSize: v.optional(v.number()),
    /** @todo Keep mirroring `@convex-dev/migrations` runner options. */
    dryRun: v.optional(v.boolean()),
    /** @todo Keep mirroring `@convex-dev/migrations` runner options. */
    next: v.optional(v.array(v.string())),
    /** @todo Keep mirroring `@convex-dev/migrations` runner options. */
    reset: v.optional(v.boolean()),
    /** @todo Keep mirroring `@convex-dev/migrations` runner options. */
    oneBatchOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<MigrationRunnerReport> => {
    await ctx.scheduler.runAfter(0, internal.migrations.skipTourForExistingUsers, {
      cursor: null,
    });
    const historical = parseMigrationRunnerReport(
      await ctx.runMutation(internal.migrations.runTableMigrations, args),
    );
    await ctx.runMutation(internal.migrations.runBirthJourneyBackfill, {});
    await ctx.runMutation(internal.migrations.runDueDateDisplayBackfill, {});
    await ctx.runMutation(internal.migrations.runPushImageBackfill, {});
    await ctx.runMutation(internal.migrations.runBlurDataUrlBackfill, {});
    return historical;
  },
});
