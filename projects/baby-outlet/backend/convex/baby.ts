import { v } from "convex/values";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { DatabaseReader, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { FORBIDDEN, isMilestoneNotificationType, isStatusForward } from "../src/types";
import type { BabyStatus, Milestone, NotifiableStatus } from "../src/types";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "../src/i18n";
import { supportedLocaleValidator } from "./i18n";
import { mutationWithTriggers } from "./triggers";
import { insertUpdateWithTimelineItem, loadCurrentStatus } from "./timeline";
import { isActive, softDeletePatch } from "./softDelete";
import { findBabyManager, requireBabyManager, requireBabyOwner } from "./babyAccess";
import { listBabiesForUser } from "./coParents";
import { isHomepageDemoPublicId } from "../src/seedCredentials";
import { appIdentity } from "./authIdentity";
import { toBabyDto, toManagerBabyDto } from "./babyDto";

const birthJourneyValidator = v.union(
  v.literal("labor"),
  v.literal("home_birth"),
  v.literal("planned_c_section"),
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
  if (mode === "message" && !normalizedText) {
    throw new Error("A public due date message is required when the exact date is hidden");
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
    id: v.union(v.id("baby"), v.string()),
  },
  handler: async (ctx, args) => {
    // Check if it's a valid Convex ID and try to fetch directly
    const normalizedId = ctx.db.normalizeId("baby", args.id);
    let baby: Doc<"baby"> | null = null;
    if (normalizedId) {
      baby = await ctx.db.get(normalizedId);
    }

    // Fall back to publicId lookup
    if (!baby) {
      baby = await ctx.db
        .query("baby")
        .withIndex("by_publicId", (q) => q.eq("publicId", args.id))
        .first();
    }

    // If not found, check historical publicIds
    const latestHistoryEntry = await ctx.db
      .query("babyPublicIdHistory")
      .withIndex("by_publicId", (q) => q.eq("publicId", args.id))
      .order("desc")
      .first();

    if (latestHistoryEntry) {
      baby = await ctx.db.get(latestHistoryEntry.babyId);
    }

    if (!baby || !isActive(baby)) {
      return null;
    }

    const photoUrl = baby.photoId ? await ctx.storage.getUrl(baby.photoId) : null;
    const thumbnailUrl = baby.thumbnailId ? await ctx.storage.getUrl(baby.thumbnailId) : null;
    const blurDataUrl = baby.blurDataUrl ?? null;
    const resolvedLocale = await resolveBabyLocale(ctx.db, baby);

    return {
      ...(await toBabyDto(ctx, baby)),
      photoUrl,
      thumbnailUrl,
      blurDataUrl,
      resolvedLocale,
    };
  },
});

export const getManagerBaby = query({
  args: { babyId: v.id("baby") },
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
  await ctx.db.patch(baby._id, { photoId: opts.photoId, thumbnailId: null, blurDataUrl: null });

  await ctx.scheduler.runAfter(0, internal.babyThumbnails.generateThumbnail, {
    babyId: baby._id,
    photoId: opts.photoId,
    updateId: opts.updateId,
  });
}

function notificationScheduleDelayMs() {
  return env.NODE_ENV === "production" ? 60_000 : 3_000;
}

/**
 * Schedules one delayed Web Push for this baby. Does not cancel other pending
 * jobs — callers that replace a pending status notification do that first.
 */
export async function schedulePushNotification(
  ctx: MutationCtx,
  opts: {
    baby: Doc<"baby">;
    notificationType: NotifiableStatus;
    customMessage: string | null;
    photoId: Id<"_storage"> | null;
    updateId: Id<"updates"> | null;
  },
) {
  const baby = opts.baby;
  const scheduledFor = Date.now() + notificationScheduleDelayMs();

  const notificationId = await ctx.db.insert("scheduledNotifications", {
    babyId: baby._id,
    status: "pending",
    scheduledFor,
    notificationType: opts.notificationType,
    customMessage: opts.customMessage,
    photoId: opts.photoId,
    updateId: opts.updateId,
    createdAt: Date.now(),
  });

  const scheduledId = await ctx.scheduler.runAt(
    scheduledFor,
    internal.pushNotifications.sendNotification,
    {
      notificationId,
      babyId: baby._id,
      babyName: baby.name,
      publicId: baby.publicId,
      status: opts.notificationType,
      customMessage: opts.customMessage,
      photoId: opts.photoId,
      updateId: opts.updateId,
      locale: await resolveBabyLocale(ctx.db, baby),
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
    const { identity, baby } = await requireBabyManager(ctx, args.babyId);

    if (!args.photoId) {
      // Removing the current photo only affects the baby doc; photo updates
      // already posted to the timeline keep their own copies.
      await ctx.db.patch(args.babyId, { photoId: null, thumbnailId: null, blurDataUrl: null });
      return;
    }

    const { updateId } = await insertUpdateWithTimelineItem(ctx, {
      babyId: args.babyId,
      postedAt: Date.now(),
      photoId: args.photoId,
      postedByUserId: identity.authUserId,
    });

    await applyPhotoSideEffects(ctx, { baby, photoId: args.photoId, updateId });
    await schedulePushNotification(ctx, {
      baby,
      notificationType: "photo_added",
      customMessage: null,
      photoId: args.photoId,
      updateId,
    });
  },
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function isPublicIdTaken(opts: {
  db: DatabaseReader;
  publicId: string;
  excludeTokenIdentifier: string;
}): Promise<boolean> {
  // Reserved for the seeded homepage live demos — never let a real user claim them.
  if (isHomepageDemoPublicId(opts.publicId)) {
    return true;
  }

  // Check current baby publicIds
  const existingBaby = await opts.db
    .query("baby")
    .withIndex("by_publicId", (q) => q.eq("publicId", opts.publicId))
    .first();

  if (existingBaby) {
    return true;
  }

  // Check historical publicIds (but allow the same owner to reclaim their own)
  const historicEntry = await opts.db
    .query("babyPublicIdHistory")
    .withIndex("by_publicId", (q) => q.eq("publicId", opts.publicId))
    .first();

  if (!historicEntry) {
    return false;
  }

  const historicBaby = await opts.db.get(historicEntry.babyId);
  if (historicBaby && historicBaby.ownerTokenIdentifier !== opts.excludeTokenIdentifier) {
    return true;
  }

  return false;
}

async function generateUniquePublicId(opts: {
  db: DatabaseReader;
  baseName: string;
  excludeTokenIdentifier: string;
}): Promise<string> {
  const slug = slugify(opts.baseName);
  let tries = 0;
  let publicId = slug;

  while (
    await isPublicIdTaken({
      db: opts.db,
      publicId,
      excludeTokenIdentifier: opts.excludeTokenIdentifier,
    })
  ) {
    tries++;
    publicId = `${slug}-${tries}`;
  }

  return publicId;
}

async function resolveBabyLocale(db: DatabaseReader, baby: Doc<"baby">) {
  if (baby.locale) {
    return resolveSupportedLocale(baby.locale);
  }
  const profile = await db
    .query("userProfiles")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", baby.ownerTokenIdentifier))
    .unique();
  return profile ? resolveSupportedLocale(profile.locale) : DEFAULT_LOCALE;
}

export const create = mutationWithTriggers({
  args: {
    name: v.string(),
    dueDate: v.union(v.string(), v.null()),
    dueDateDisplayMode: v.optional(dueDateDisplayModeValidator),
    publicDueDateText: v.optional(v.union(v.string(), v.null())),
    // Optional for stale clients; the document always stores a concrete selection.
    birthJourney: v.optional(birthJourneyValidator),
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
      db: ctx.db,
      baseName: args.name,
      excludeTokenIdentifier: caller.tokenIdentifier,
    });

    const babyId = await ctx.db.insert("baby", {
      userId: caller.authUserId,
      ownerTokenIdentifier: caller.tokenIdentifier,
      name: args.name,
      dueDate: dueDateDisplay.dueDate,
      dueDateDisplayMode: dueDateDisplay.mode,
      publicDueDateText: dueDateDisplay.text,
      publicId,
      birthJourney: args.birthJourney ?? "labor",
      subscriptionCount: 0,
      lastActivityAt: Date.now(),
    });

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
        } catch (_error) {
          // Already sent or missing — still mark cancelled below
        }
      }
      await ctx.db.patch(notification._id, { status: "cancelled" });
    }

    await ctx.db.patch(args.babyId, softDeletePatch());
  },
});

export const getScheduledNotifications = query({
  args: { babyId: v.id("baby") },
  handler: async (ctx, args) => {
    // Sentinel instead of throwing: the baby route loader queries this for
    // every visitor.
    const access = await findBabyManager(ctx, args.babyId);
    if (!access) {
      return FORBIDDEN;
    }

    const notifications = await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_babyId", (q) => q.eq("babyId", args.babyId))
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
        throw new Error("Failed to cancel scheduled notification: " + (error as Error).message);
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

// Internal mutation to attach generated page/push images (called from action)
export const updateThumbnail = internalMutation({
  args: {
    babyId: v.id("baby"),
    thumbnailId: v.id("_storage"),
    pushImageId: v.union(v.id("_storage"), v.null()),
    photoId: v.optional(v.id("_storage")), // photo the derivatives were generated from
    updateId: v.optional(v.id("updates")), // timeline update row to also patch
    blurDataUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const baby = await ctx.db.get(args.babyId);
    // Skip the baby doc if its current photo changed while the thumbnail was
    // generating — a newer generation owns the field now.
    const blurDataUrl = args.blurDataUrl;
    if (baby && (!args.photoId || baby.photoId === args.photoId)) {
      await ctx.db.patch(args.babyId, {
        thumbnailId: args.thumbnailId,
        ...(blurDataUrl === undefined ? {} : { blurDataUrl }),
      });
    }

    if (args.updateId) {
      const update = await ctx.db.get(args.updateId);
      if (update && (!args.photoId || update.photoId === args.photoId)) {
        await ctx.db.patch(args.updateId, {
          thumbnailId: args.thumbnailId,
          pushImageId: args.pushImageId ?? update.pushImageId ?? null,
          ...(blurDataUrl === undefined ? {} : { blurDataUrl }),
        });
      }
    }
  },
});

/**
 * Backfill-only write for the inline blur placeholder. Same stale-photo
 * guard as `updateThumbnail`.
 */
export const updateBlurDataUrl = internalMutation({
  args: {
    babyId: v.id("baby"),
    photoId: v.id("_storage"),
    blurDataUrl: v.string(),
    updateId: v.optional(v.id("updates")),
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
    updateId: v.union(v.id("updates"), v.null()),
    photoId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    if (args.updateId) {
      const update = await ctx.db.get(args.updateId);
      if (update) {
        return update.pushImageId ?? update.thumbnailId ?? update.photoId ?? args.photoId;
      }
    }
    return args.photoId;
  },
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
    statusBefore: BabyStatus;
    updatedBaby: Doc<"baby">;
    /** Message to attach to the push, per notifiable milestone. */
    customMessageByMilestone: Record<Milestone, string | null>;
    photoId: Id<"_storage"> | null;
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
      } catch (_error) {
        // Ignore errors if notification was already sent or doesn't exist
      }
    }
    await ctx.db.patch(notification._id, { status: "cancelled" });
  }

  if (!movedForward) return;

  await schedulePushNotification(ctx, {
    baby: updatedBaby,
    notificationType: statusAfter.type,
    customMessage: opts.customMessageByMilestone[statusAfter.type],
    photoId: opts.photoId,
    updateId: opts.updateId,
  });
}

export const update = mutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    dueDate: v.optional(v.union(v.string(), v.null())),
    dueDateDisplayMode: v.optional(dueDateDisplayModeValidator),
    publicDueDateText: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
    theme: v.optional(v.union(v.string(), v.null())),
    locale: v.optional(v.union(supportedLocaleValidator, v.null())),
    encouragementsDisabled: v.optional(v.boolean()),
    birthJourney: v.optional(birthJourneyValidator),
  },
  handler: async (ctx, args) => {
    const { babyId, ...patch } = args;
    const { identity, baby } = await requireBabyManager(ctx, babyId);
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
      const newSlugifiedName = slugify(patch.name);
      // Only update publicId if the slugified name is different from current publicId
      if (newSlugifiedName !== baby.publicId) {
        const oldPublicId = baby.publicId;
        publicId = await generateUniquePublicId({
          db: ctx.db,
          baseName: patch.name,
          excludeTokenIdentifier: identity.tokenIdentifier,
        });
        await ctx.db.insert("babyPublicIdHistory", {
          babyId,
          publicId: oldPublicId,
        });
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(babyId, { ...patch, ...(publicId ? { publicId } : {}) });
    }
  },
});
