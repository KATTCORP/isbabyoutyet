import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  getBlockingLaterMilestone,
  getCurrentStatus,
  MILESTONE_LABELS,
  STATUS_ORDER,
} from "../src/types";
import { applyPhotoSideEffects, schedulePushNotification, syncStatusNotifications } from "./baby";
import { requireBabyManager } from "./babyAccess";
import {
  deleteUpdateWithTimelineItem,
  findMilestoneUpdate,
  insertUpdateWithTimelineItem,
  isValidDateTimestamp,
  loadMilestoneDates,
} from "./timeline";
import { mutationWithTriggers } from "./triggers";
import { isActive } from "./softDelete";

const milestoneValidator = v.union(
  v.literal("labor_started"),
  v.literal("gone_to_hospital"),
  v.literal("born"),
);

export const MAX_UPDATE_MESSAGE_LENGTH = 1000;

/**
 * Owner or co-parent posts an update to the timeline: a message and/or a photo,
 * optionally marking a milestone. Every post schedules one delayed push;
 * milestone status is inferred from the source update.
 */
export const post = mutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    message: v.union(v.string(), v.null()),
    milestone: v.union(milestoneValidator, v.null()),
    /** Event clock for a milestone (ms epoch). Null means "happening now". */
    occurredAt: v.union(v.number(), v.null()),
    photoId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, args) => {
    const { baby, identity } = await requireBabyManager(ctx, args.babyId);

    const message = args.message?.trim() || null;
    const milestone = args.milestone ?? null;
    const photoId = args.photoId ?? null;

    if (!message && !milestone && !photoId) {
      throw new Error("An update needs a message, a photo, or a milestone");
    }
    if (message && message.length > MAX_UPDATE_MESSAGE_LENGTH) {
      throw new Error(`Message must be ${MAX_UPDATE_MESSAGE_LENGTH} characters or less`);
    }

    const datesBefore = await loadMilestoneDates(ctx, args.babyId);
    const statusBefore = getCurrentStatus({
      ...datesBefore,
      birthJourney: baby.birthJourney,
    });

    if (milestone) {
      if (STATUS_ORDER[milestone] <= STATUS_ORDER[statusBefore.type]) {
        throw new Error("Only a future status can be marked");
      }
      const existing = await findMilestoneUpdate(ctx, {
        babyId: args.babyId,
        milestone,
      });
      if (existing) {
        throw new Error("This milestone is already marked");
      }
    }
    if (args.occurredAt != null && !milestone) {
      throw new Error("A backdated time requires a status change");
    }

    const postedAt = Date.now();
    // Event clock: when the milestone actually happened. Defaults to the
    // announce time; a backdated value must be in the past.
    const occurredAt = milestone ? (args.occurredAt ?? postedAt) : null;
    if (occurredAt != null && !isValidDateTimestamp(occurredAt)) {
      throw new Error("Invalid date");
    }
    if (occurredAt != null && occurredAt > postedAt + 60_000) {
      throw new Error("The event time cannot be in the future");
    }

    const { updateId } = await insertUpdateWithTimelineItem(ctx, {
      babyId: args.babyId,
      message,
      milestone,
      postedAt,
      // Settings can still redate occurredAt later without moving the feed position
      occurredAt,
      photoId,
      postedByUserId: identity.authUserId,
    });

    if (photoId) {
      await applyPhotoSideEffects(ctx, { baby, photoId, updateId });
    }

    if (milestone) {
      await syncStatusNotifications(ctx, {
        customMessageByMilestone: {
          born: milestone === "born" ? message : null,
          gone_to_hospital: milestone === "gone_to_hospital" ? message : null,
          labor_started: milestone === "labor_started" ? message : null,
        },
        photoId,
        statusBefore,
        updatedBaby: baby,
        updateId,
      });
    } else {
      await schedulePushNotification(ctx, {
        baby,
        customMessage: message,
        notificationType: photoId ? "photo_added" : "update_posted",
        photoId,
        updateId,
      });
    }

    return updateId;
  },
});

/**
 * Pins a photo from the timeline as the baby's current page photo.
 * New photo uploads still take over by default (latest wins) — this lets a
 * manager bring back any earlier photo without re-uploading it.
 */
export const setAsCurrentPhoto = mutationWithTriggers({
  args: { updateId: v.id("updates") },
  handler: async (ctx, args) => {
    const update = await ctx.db.get(args.updateId);
    if (!update || !isActive(update)) {
      throw new Error("Update not found");
    }
    if (!update.photoId) {
      throw new Error("This update has no photo");
    }

    await requireBabyManager(ctx, update.babyId);

    const baby = await ctx.db.get(update.babyId);
    if (!baby || !isActive(baby)) {
      throw new Error("Baby not found");
    }

    await ctx.db.patch(baby._id, {
      blurDataUrl: update.blurDataUrl ?? null,
      photoId: update.photoId,
      thumbnailId: update.thumbnailId ?? null,
    });

    if (!update.thumbnailId || !update.pushImageId || !update.blurDataUrl) {
      await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateThumbnail, {
        babyId: baby._id,
        photoId: update.photoId,
        updateId: update._id,
      });
    }
  },
});

/**
 * Corrects when an existing milestone happened without moving its feed
 * position. Creating a milestone remains exclusive to `post`.
 */
export const redateMilestone = mutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    milestone: milestoneValidator,
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    await requireBabyManager(ctx, args.babyId);
    if (!isValidDateTimestamp(args.occurredAt)) {
      throw new Error("Invalid date");
    }
    if (args.occurredAt > Date.now() + 60_000) {
      throw new Error("The event time cannot be in the future");
    }

    const update = await findMilestoneUpdate(ctx, {
      babyId: args.babyId,
      milestone: args.milestone,
    });
    if (!update) {
      throw new Error("Milestone update not found");
    }

    await ctx.db.patch(update._id, { occurredAt: args.occurredAt });
    return null;
  },
  returns: v.null(),
});

/**
 * Removes the update that marks a milestone. Callers identify the milestone;
 * the backend resolves the source-of-truth update row.
 */
export const unmarkMilestone = mutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    milestone: milestoneValidator,
  },
  handler: async (ctx, args) => {
    const { baby } = await requireBabyManager(ctx, args.babyId);
    const update = await findMilestoneUpdate(ctx, {
      babyId: args.babyId,
      milestone: args.milestone,
    });
    if (!update) {
      throw new Error("Milestone update not found");
    }

    await removeManagedUpdate(ctx, { baby, update });
    return null;
  },
  returns: v.null(),
});

/**
 * Removes an update from the timeline. Removing a milestone update infers
 * the status from remaining milestones; removing the update carrying the
 * current photo falls back to the most recent remaining photo update.
 */
export const remove = mutationWithTriggers({
  args: { updateId: v.id("updates") },
  handler: async (ctx, args) => {
    const update = await ctx.db.get(args.updateId);
    if (!update || !isActive(update)) {
      throw new Error("Update not found");
    }

    const { baby } = await requireBabyManager(ctx, update.babyId);
    await removeManagedUpdate(ctx, { baby, update });
  },
});

async function removeManagedUpdate(
  ctx: MutationCtx,
  opts: { baby: Doc<"baby">; update: Doc<"updates"> },
) {
  const update = opts.update;
  const datesBefore = await loadMilestoneDates(ctx, update.babyId);

  if (update.milestone) {
    const blocker = getBlockingLaterMilestone(datesBefore, update.milestone);
    if (blocker) {
      throw new Error(`Delete the ${MILESTONE_LABELS[blocker]} status first`);
    }
  }

  const statusBefore = getCurrentStatus(datesBefore);

  await deleteUpdateWithTimelineItem(ctx, update);

  if (update.photoId && update.photoId === opts.baby.photoId) {
    const fallback = await findLatestRemainingPhotoUpdate(ctx, update);
    await ctx.db.patch(opts.baby._id, {
      blurDataUrl: fallback?.blurDataUrl ?? null,
      photoId: fallback?.photoId ?? null,
      thumbnailId: fallback?.thumbnailId ?? null,
    });
  }

  if (update.milestone) {
    const updatedBaby = await ctx.db.get(opts.baby._id);
    if (!updatedBaby) {
      throw new Error("Baby not found after update");
    }

    // Status can only move backward here: cancels pending notifications
    await syncStatusNotifications(ctx, {
      customMessageByMilestone: { born: null, gone_to_hospital: null, labor_started: null },
      photoId: null,
      statusBefore,
      updatedBaby,
      updateId: null,
    });
  }
}

async function findLatestRemainingPhotoUpdate(ctx: MutationCtx, removed: Doc<"updates">) {
  const photoUpdates = await ctx.db
    .query("updates")
    .withIndex("by_babyId", (q) => q.eq("babyId", removed.babyId))
    .order("desc")
    .take(256);

  let latest: { postedAt: number; update: Doc<"updates"> } | null = null;
  for (const candidate of photoUpdates) {
    if (candidate._id === removed._id || !candidate.photoId || !isActive(candidate)) {
      continue;
    }
    const timelineItem = await ctx.db.get(candidate.timelineItemId);
    if (!timelineItem || !isActive(timelineItem)) {
      continue;
    }
    if (!latest || timelineItem.postedAt > latest.postedAt) {
      latest = { postedAt: timelineItem.postedAt, update: candidate };
    }
  }
  return latest?.update ?? null;
}
