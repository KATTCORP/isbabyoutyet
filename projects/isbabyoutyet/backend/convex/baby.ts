import { v } from "convex/values";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { FORBIDDEN, isMilestoneNotificationType, isStatusForward } from "../src/types";
import type { BabyStatus, Milestone, NotifiableStatus } from "../src/types";
import { notificationScheduleDelayMs } from "../src/notificationTiming";
import { supportedLocaleValidator } from "./i18n";
import { internalMutationWithTriggers, mutationWithTriggers } from "./triggers";
import { insertUpdateWithTimelineItem, loadCurrentStatus } from "./timeline";
import { isActive, softDeletePatch } from "./softDelete";
import { findBabyManager, requireBabyManager, requireBabyOwner } from "./babyAccess";
import { listBabiesForUser } from "./coParents";
import { appIdentity } from "./authIdentity";
import { toBabyDto, toManagerBabyDto } from "./babyDto";
import { babyIdOrPublicIdValidator, findBabyByIdOrPublicId } from "./babyLookup";
import { generateUniquePublicId, slugifyPublicId } from "./babyPublicId";
import { resolveBabyPreferences } from "./babyPreferences";

const birthJourneyValidator = v.union(
  v.literal("labor"),
  v.literal("home_birth"),
  v.literal("planned_c_section"),
  v.literal("custom"),
);

const dueDateDisplayModeValidator = v.union(v.literal("exact"), v.literal("message"));

type DueDateDisplayMode = "exact" | "message";

const MAX_PUBLIC_DUE_DATE_TEXT_LENGTH = 80;

function normalizePublicDueDateText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (normalized.length > MAX_PUBLIC_DUE_DATE_TEXT_LENGTH) {
    throw new Error("Public due date message must be 80 characters or fewer");
  }
  return normalized || null;
}

function normalizeDueDateDisplay(opts: {
  dueDate: string | null | undefined;
  mode: DueDateDisplayMode | undefined;
  text: string | null | undefined;
}) {
  const normalizedText = normalizePublicDueDateText(opts.text);
  const mode = opts.mode ?? (normalizedText ? "message" : "exact");
  const dueDate = opts.dueDate ?? null;
  if (mode === "exact" && !dueDate) {
    throw new Error("A due date is required when the exact date is shown");
  }
  return {
    dueDate,
    mode,
    text: normalizedText,
  };
}

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    return await listBabiesForUser(ctx, appIdentity(identity));
  },
});

export const getByPublicId = query({
  args: {
    id: babyIdOrPublicIdValidator,
  },
  handler: async (ctx, args) => {
    const baby = await findBabyByIdOrPublicId(ctx.db, args.id);

    if (!baby || !isActive(baby)) {
      return null;
    }

    const photoUrl = baby.photoId ? await ctx.storage.getUrl(baby.photoId) : null;
    const thumbnailUrl = baby.thumbnailId ? await ctx.storage.getUrl(baby.thumbnailId) : null;
    const blurDataUrl = baby.blurDataUrl ?? null;

    return {
      ...(await toBabyDto(ctx, baby)),
      blurDataUrl,
      photoUrl,
      thumbnailUrl,
    };
  },
});

export const getManagerBaby = query({
  args: { babyId: babyIdOrPublicIdValidator },
  handler: async (ctx, args) => {
    const access = await findBabyManager(ctx, args.babyId);
    return access ? await toManagerBabyDto(ctx, access.baby) : FORBIDDEN;
  },
});

export const getBirthJourney = query({
  args: { babyId: v.id("baby") },
  handler: async (ctx, args) => {
    const access = await findBabyManager(ctx, args.babyId);
    return access ? access.baby.birthJourney : FORBIDDEN;
  },
});

export type Baby = Doc<"baby">;

// Generate upload URL for baby photo
export const generateUploadUrl = mutation({
  args: { babyId: v.id("baby") },
  handler: async (ctx, args) => {
    await requireBabyManager(ctx, args.babyId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Applies the side effects of a new photo attached to an update row: points
 * the baby doc at it (current photo) and schedules thumbnail generation for
 * both the baby and the update row. Push notifications are scheduled by the
 * caller so a milestone+photo post is one notification, not two.
 */
export async function applyPhotoSideEffects(
  ctx: MutationCtx,
  opts: { baby: Doc<"baby">; photoId: Id<"_storage">; updateId: Id<"updates"> },
) {
  const baby = opts.baby;

  // Update the current photo (retain old photos in storage + feed for history)
  await ctx.db.patch(baby._id, { blurDataUrl: null, photoId: opts.photoId, thumbnailId: null });

  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateThumbnail, {
    babyId: baby._id,
    photoId: opts.photoId,
    updateId: opts.updateId,
  });
}

/**
 * Schedules one delayed Web Push for this baby. Does not cancel other pending
 * jobs — callers that replace a pending status notification do that first.
 */
export async function schedulePushNotification(
  ctx: MutationCtx,
  opts: {
    baby: Doc<"baby">;
    customMessage: string | null;
    notificationType: NotifiableStatus;
    photoId: Id<"_storage"> | null;
    updateId: Id<"updates"> | null;
  },
) {
  const baby = opts.baby;
  const scheduledFor = Date.now() + notificationScheduleDelayMs(env.VERCEL_ENV, env.NODE_ENV);

  const notificationId = await ctx.db.insert("scheduledNotifications", {
    babyId: baby._id,
    createdAt: Date.now(),
    customMessage: opts.customMessage,
    notificationType: opts.notificationType,
    photoId: opts.photoId,
    scheduledFor,
    status: "pending",
    updateId: opts.updateId,
  });

  const preferences = await resolveBabyPreferences(ctx.db, baby);
  const scheduledId = await ctx.scheduler.runAt(
    scheduledFor,
    internal.pushNotifications.sendNotification,
    {
      babyId: baby._id,
      babyName: baby.name,
      customMessage: opts.customMessage,
      locale: preferences.resolvedLocale,
      notificationId,
      photoId: opts.photoId,
      publicId: baby.publicId,
      status: opts.notificationType,
      updateId: opts.updateId,
    },
  );

  await ctx.db.patch(notificationId, { scheduledId });
}

// Update baby photo and send a photo_added notification
export const updatePhoto = mutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    photoId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, args) => {
    const { baby, identity } = await requireBabyManager(ctx, args.babyId);

    if (!args.photoId) {
      // Removing the current photo only affects the baby doc; photo updates
      // already posted to the timeline keep their own copies.
      await ctx.db.patch(args.babyId, { blurDataUrl: null, photoId: null, thumbnailId: null });
      return;
    }

    const { updateId } = await insertUpdateWithTimelineItem(ctx, {
      babyId: args.babyId,
      photoId: args.photoId,
      postedAt: Date.now(),
      postedByUserId: identity.authUserId,
    });

    await applyPhotoSideEffects(ctx, { baby, photoId: args.photoId, updateId });
    await schedulePushNotification(ctx, {
      baby,
      customMessage: null,
      notificationType: "photo_added",
      photoId: args.photoId,
      updateId,
    });
  },
});

export const create = mutationWithTriggers({
  args: {
    birthJourney: birthJourneyValidator,
    dueDate: v.union(v.string(), v.null()),
    dueDateDisplayMode: dueDateDisplayModeValidator,
    name: v.string(),
    publicDueDateText: v.union(v.string(), v.null()),
    theme: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const caller = appIdentity(identity);
    const dueDateDisplay = normalizeDueDateDisplay({
      dueDate: args.dueDate,
      mode: args.dueDateDisplayMode,
      text: args.publicDueDateText,
    });

    const publicId = await generateUniquePublicId({
      baseName: args.name,
      db: ctx.db,
      excludeTokenIdentifier: caller.tokenIdentifier,
    });

    const babyFields = {
      birthJourney: args.birthJourney,
      dueDate: dueDateDisplay.dueDate,
      dueDateDisplayMode: dueDateDisplay.mode,
      lastActivityAt: Date.now(),
      name: args.name,
      ownerTokenIdentifier: caller.tokenIdentifier,
      publicDueDateText: dueDateDisplay.text,
      publicId,
      subscriptionCount: 0,
      theme: args.theme,
      userId: caller.authUserId,
    };
    const babyId = await ctx.db.insert("baby", babyFields);

    return { babyId, publicId };
  },
});

/**
 * Soft-deletes a baby page. Only the owner (creator) can do this.
 * Pending push notifications are cancelled; feed rows stay recoverable.
 */
export const remove = mutationWithTriggers({
  args: { babyId: v.id("baby") },
  handler: async (ctx, args) => {
    await requireBabyOwner(ctx, args.babyId);

    const pendingNotifications = await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_babyId_and_status", (q) => q.eq("babyId", args.babyId).eq("status", "pending"))
      .take(100);

    for (const notification of pendingNotifications) {
      if (notification.scheduledId) {
        try {
          await ctx.scheduler.cancel(notification.scheduledId);
        } catch {
          // Already sent or missing — still mark cancelled below
        }
      }
      await ctx.db.patch(notification._id, { status: "cancelled" });
    }

    await ctx.db.patch(args.babyId, softDeletePatch());
  },
});

export const getScheduledNotifications = query({
  args: { babyId: babyIdOrPublicIdValidator },
  handler: async (ctx, args) => {
    // Sentinel instead of throwing: the baby route loader queries this for
    // every visitor.
    const access = await findBabyManager(ctx, args.babyId);
    if (!access) {
      return FORBIDDEN;
    }

    const notifications = await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_babyId", (q) => q.eq("babyId", access.baby._id))
      .order("desc")
      .take(100);

    return notifications;
  },
});

export const cancelScheduledNotification = mutation({
  args: { notificationId: v.id("scheduledNotifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Notification not found");
    }

    await requireBabyManager(ctx, notification.babyId);

    if (notification.status !== "pending") {
      throw new Error("Notification is not pending");
    }

    if (notification.scheduledId) {
      try {
        await ctx.scheduler.cancel(notification.scheduledId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error("Failed to cancel scheduled notification: " + message, {
          cause: error,
        });
      }
    }

    await ctx.db.patch(args.notificationId, { status: "cancelled" });
  },
});

export const markNotificationSent = internalMutation({
  args: { notificationId: v.id("scheduledNotifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return; // Notification already deleted or doesn't exist
    }

    if (notification.status === "pending") {
      await ctx.db.patch(args.notificationId, { status: "sent" });
    }
  },
});

export const updateThumbnail = internalMutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    pushImageId: v.union(v.id("_storage"), v.null()),
    thumbnailId: v.id("_storage"),
    /** Photo the derivatives were generated from. */
    photoId: v.union(v.id("_storage"), v.null()),
    /** Timeline update row to also patch. */
    blurDataUrl: v.union(v.string(), v.null()),
    updateId: v.union(v.id("updates"), v.null()),
  },
  handler: async (ctx, args) => {
    const baby = await ctx.db.get(args.babyId);
    // Skip the baby doc if its current photo changed while the thumbnail was
    // generating — a newer generation owns the field now.
    const blurDataUrl = args.blurDataUrl;
    if (baby && (!args.photoId || baby.photoId === args.photoId)) {
      await ctx.db.patch(args.babyId, {
        blurDataUrl,
        thumbnailId: args.thumbnailId,
      });
    }

    if (args.updateId) {
      const update = await ctx.db.get(args.updateId);
      if (update && (!args.photoId || update.photoId === args.photoId)) {
        const updateFields = {
          blurDataUrl,
          pushImageId: args.pushImageId ?? update.pushImageId ?? null,
          thumbnailId: args.thumbnailId,
        };
        await ctx.db.patch(args.updateId, updateFields);
      }
    }
  },
});

/**
 * Backfill-only write for the inline blur placeholder. Same stale-photo
 * guard as `updateThumbnail`.
 */
export const updateBlurDataUrl = internalMutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    blurDataUrl: v.string(),
    photoId: v.id("_storage"),
    updateId: v.union(v.id("updates"), v.null()),
  },
  handler: async (ctx, args) => {
    const baby = await ctx.db.get(args.babyId);
    if (baby && baby.photoId === args.photoId) {
      await ctx.db.patch(args.babyId, { blurDataUrl: args.blurDataUrl });
    }

    if (args.updateId) {
      const update = await ctx.db.get(args.updateId);
      if (update && update.photoId === args.photoId) {
        await ctx.db.patch(args.updateId, { blurDataUrl: args.blurDataUrl });
      }
    }
  },
});

/**
 * Storage id to attach as Notification.image. Prefer the 1350×675 push
 * derivative, then the page thumbnail, then the original photo.
 */
export const resolveNotificationImage = internalQuery({
  args: {
    photoId: v.union(v.id("_storage"), v.null()),
    updateId: v.union(v.id("updates"), v.null()),
  },
  handler: async (ctx, args) => {
    if (args.updateId) {
      const update = await ctx.db.get(args.updateId);
      if (update) {
        return update.pushImageId ?? update.thumbnailId ?? update.photoId ?? args.photoId;
      }
    }
    return args.photoId;
  },
  returns: v.union(v.id("_storage"), v.null()),
});

/**
 * Cancels pending status push notifications when the derived status changes,
 * and schedules a new one when it moved forward. Generic/photo pending jobs
 * are left alone on a forward move; a rollback still cancels every pending
 * job (same as deleting the baby).
 */
export async function syncStatusNotifications(
  ctx: MutationCtx,
  opts: {
    /** Message to attach to the push, per notifiable milestone. */
    customMessageByMilestone: Record<Milestone, string | null>;
    photoId: Id<"_storage"> | null;
    statusBefore: BabyStatus;
    updatedBaby: Doc<"baby">;
    updateId: Id<"updates"> | null;
  },
) {
  const updatedBaby = opts.updatedBaby;
  const statusAfter = await loadCurrentStatus(ctx, updatedBaby._id);

  if (opts.statusBefore.type === statusAfter.type) {
    // no notification change as status didn't change
    return;
  }

  const movedForward = isStatusForward(opts.statusBefore, statusAfter);

  const pendingNotifications = await ctx.db
    .query("scheduledNotifications")
    .withIndex("by_babyId_and_status", (q) =>
      q.eq("babyId", updatedBaby._id).eq("status", "pending"),
    )
    .take(100);

  for (const notification of pendingNotifications) {
    if (movedForward && !isMilestoneNotificationType(notification.notificationType)) {
      continue;
    }
    if (notification.scheduledId) {
      try {
        await ctx.scheduler.cancel(notification.scheduledId);
      } catch {
        // Ignore errors if notification was already sent or doesn't exist
      }
    }
    await ctx.db.patch(notification._id, { status: "cancelled" });
  }

  if (!movedForward) {
    return;
  }

  await schedulePushNotification(ctx, {
    baby: updatedBaby,
    customMessage: opts.customMessageByMilestone[statusAfter.type],
    notificationType: statusAfter.type,
    photoId: opts.photoId,
    updateId: opts.updateId,
  });
}

export const update = mutationWithTriggers({
  args: {
    id: v.id("baby"),
    patch: v.object({
      birthJourney: v.optional(birthJourneyValidator),
      dueDate: v.optional(v.union(v.string(), v.null())),
      dueDateDisplayMode: v.optional(dueDateDisplayModeValidator),
      locale: v.optional(v.union(supportedLocaleValidator, v.null())),
      name: v.optional(v.string()),
      publicDueDateText: v.optional(v.union(v.string(), v.null())),
      theme: v.optional(v.union(v.string(), v.null())),
    }),
  },
  handler: async (ctx, args) => {
    const babyId = args.id;
    const patch = { ...args.patch };
    const { baby, identity } = await requireBabyManager(ctx, babyId);
    if (
      patch.dueDate !== undefined ||
      patch.dueDateDisplayMode !== undefined ||
      patch.publicDueDateText !== undefined
    ) {
      const dueDateDisplay = normalizeDueDateDisplay({
        dueDate: patch.dueDate !== undefined ? patch.dueDate : baby.dueDate,
        mode: patch.dueDateDisplayMode ?? baby.dueDateDisplayMode,
        text:
          patch.publicDueDateText !== undefined ? patch.publicDueDateText : baby.publicDueDateText,
      });
      patch.dueDate = dueDateDisplay.dueDate;
      patch.dueDateDisplayMode = dueDateDisplay.mode;
      patch.publicDueDateText = dueDateDisplay.text;
    }

    let publicId: string | undefined;
    // If name changed and the slugified name would result in a different publicId
    if (patch.name && patch.name !== baby.name) {
      const newSlugifiedName = slugifyPublicId(patch.name);
      // Only update publicId if the slugified name is different from current publicId
      if (newSlugifiedName !== baby.publicId) {
        const oldPublicId = baby.publicId;
        publicId = await generateUniquePublicId({
          baseName: patch.name,
          db: ctx.db,
          excludeTokenIdentifier: identity.tokenIdentifier,
        });
        await ctx.db.insert("babyPublicIdHistory", {
          babyId,
          publicId: oldPublicId,
        });
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(babyId, publicId ? { ...patch, publicId } : patch);
    }
  },
});
