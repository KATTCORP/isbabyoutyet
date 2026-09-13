import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { Milestone, MilestoneDates } from "../src/types";
import { getCurrentStatus, MILESTONE_FIELDS, MILESTONES } from "../src/types";
import { babyIdOrPublicIdValidator, findBabyByIdOrPublicId } from "./babyLookup";
import type { EncouragementAuthor } from "./encouragementIdentity";
import { encouragementIsMine, resolveEncouragementAuthor } from "./encouragementIdentity";
import { isActive, softDeletePatch } from "./softDelete";

/**
 * The per-baby feed. `timelineItems` binds owner updates and visitor
 * encouragements into one stream ordered by `postedAt`; each child row points
 * back at its timeline row via `timelineItemId`.
 */

async function findUpdateByTimelineItem(ctx: QueryCtx, timelineItemId: Id<"timelineItems">) {
  // .first() (not .unique()): a duplicate child row would be a data bug, but
  // it must not take the whole public feed down.
  return await ctx.db
    .query("updates")
    .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", timelineItemId))
    .first();
}

async function findEncouragementByTimelineItem(ctx: QueryCtx, timelineItemId: Id<"timelineItems">) {
  return await ctx.db
    .query("encouragements")
    .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", timelineItemId))
    .first();
}

async function hydrateUpdate(
  ctx: QueryCtx,
  opts: {
    currentPhotoId: Id<"_storage"> | null;
    item: Doc<"timelineItems">;
    update: Doc<"updates">;
  },
) {
  const milestone = opts.update.milestone ?? null;
  const photoUrl = opts.update.photoId ? await ctx.storage.getUrl(opts.update.photoId) : null;
  const thumbnailUrl = opts.update.thumbnailId
    ? await ctx.storage.getUrl(opts.update.thumbnailId)
    : null;
  return {
    _id: opts.item._id,
    kind: "update" as const,
    postedAt: opts.item.postedAt,
    update: {
      _id: opts.update._id,
      blurDataUrl: opts.update.blurDataUrl ?? null,
      message: opts.update.message ?? null,
      milestone,
      occurredAt: opts.update.occurredAt ?? null,
      photoUrl,
      thumbnailUrl,
      // Whether this update's photo is the baby's current page photo
      isCurrentPagePhoto: !!opts.update.photoId && opts.update.photoId === opts.currentPhotoId,
    },
  };
}

/**
 * Public shape of an encouragement in the feed. Deliberately excludes
 * `author`, `visitorId` (the edit/delete credential), `userId`, and the
 * `userAgent` / `locale` / `timezone` metadata. `isMine` is computed from
 * the server-resolved author (signed-in user and/or visitor id).
 */
function toPublicEncouragement(
  encouragement: Doc<"encouragements">,
  author: EncouragementAuthor | null,
) {
  return {
    _id: encouragement._id,
    authorName: encouragement.authorName,
    createdAt: encouragement.createdAt,
    isMine: encouragementIsMine(encouragement, author),
    message: encouragement.message,
  };
}

async function hydrateTimelineItem(
  ctx: QueryCtx,
  opts: {
    author: EncouragementAuthor | null;
    currentPhotoId: Id<"_storage"> | null;
    item: Doc<"timelineItems">;
  },
) {
  if (!isActive(opts.item)) {
    return null;
  }

  switch (opts.item.kind) {
    case "update": {
      const update = await findUpdateByTimelineItem(ctx, opts.item._id);
      if (!update || !isActive(update)) {
        return null;
      }
      return await hydrateUpdate(ctx, {
        currentPhotoId: opts.currentPhotoId,
        item: opts.item,
        update,
      });
    }
    case "encouragement": {
      const encouragement = await findEncouragementByTimelineItem(ctx, opts.item._id);
      if (!encouragement || !isActive(encouragement)) {
        return null;
      }
      return {
        _id: opts.item._id,
        encouragement: toPublicEncouragement(encouragement, opts.author),
        kind: "encouragement" as const,
        postedAt: opts.item.postedAt,
      };
    }
  }
}

export type TimelineItem = NonNullable<Awaited<ReturnType<typeof hydrateTimelineItem>>>;

export const listByBaby = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
    /** The caller's visitor id, used to mark their posts with `isMine`. */
    paginationOpts: paginationOptsValidator,
    visitorId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const baby = await findBabyByIdOrPublicId(ctx.db, args.babyId);
    if (!baby || !isActive(baby)) {
      return { continueCursor: "", isDone: true, page: [] };
    }
    const babyId = baby._id;
    const currentPhotoId = baby.photoId ?? null;
    const author = await resolveEncouragementAuthor(ctx, args.visitorId);

    const result = await ctx.db
      .query("timelineItems")
      .withIndex("by_babyId_and_postedAt", (q) => q.eq("babyId", babyId))
      .order("desc")
      .paginate(args.paginationOpts);

    const page: Array<TimelineItem> = [];
    for (const item of result.page) {
      const hydrated = await hydrateTimelineItem(ctx, {
        author,
        currentPhotoId,
        item,
      });
      if (hydrated) {
        page.push(hydrated);
      }
    }

    return { ...result, page };
  },
});

/**
 * The newest owner update carrying a message — powers the status card's
 * "latest message on top". Message-less (e.g. photo-only) updates are
 * skipped so they don't blank the box while an older message exists.
 *
 * Bounded by the number of owner updates (only the owner creates them), so
 * visitor activity cannot grow this query.
 */
export const latestUpdate = query({
  args: { babyId: babyIdOrPublicIdValidator },
  handler: async (ctx, args) => {
    const baby = await findBabyByIdOrPublicId(ctx.db, args.babyId);
    if (!baby || !isActive(baby)) {
      return null;
    }
    const babyId = baby._id;

    const updates = await ctx.db
      .query("updates")
      .withIndex("by_babyId", (q) => q.eq("babyId", babyId))
      .order("desc")
      .take(256);

    let latest: { item: Doc<"timelineItems">; update: Doc<"updates"> } | null = null;
    for (const update of updates) {
      if (!isActive(update) || !update.message) {
        continue;
      }
      const item = await ctx.db.get(update.timelineItemId);
      if (!item || !isActive(item)) {
        continue;
      }
      if (!latest || item.postedAt > latest.item.postedAt) {
        latest = { item, update };
      }
    }

    if (!latest) {
      return null;
    }
    return await hydrateUpdate(ctx, {
      currentPhotoId: baby.photoId ?? null,
      item: latest.item,
      update: latest.update,
    });
  },
});

/**
 * Public photo payload for the timeline-update lightbox overlay. Returns null
 * when the update is missing, soft-deleted, on another baby, or has no photo.
 */
export const getUpdatePhoto = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
    updateId: v.string(),
  },
  handler: async (ctx, args) => {
    const baby = await findBabyByIdOrPublicId(ctx.db, args.babyId);
    if (!baby || !isActive(baby)) {
      return null;
    }
    const updateId = ctx.db.normalizeId("updates", args.updateId);
    if (!updateId) {
      return null;
    }
    const update = await ctx.db.get(updateId);
    if (!update || !isActive(update) || update.babyId !== baby._id || !update.photoId) {
      return null;
    }
    const photoUrl = await ctx.storage.getUrl(update.photoId);
    if (!photoUrl) {
      return null;
    }
    return {
      babyName: baby.name,
      blurDataUrl: update.blurDataUrl ?? null,
      photoUrl,
    };
  },
  returns: v.union(
    v.object({
      babyName: v.string(),
      blurDataUrl: v.union(v.string(), v.null()),
      photoUrl: v.string(),
    }),
    v.null(),
  ),
});

// --- Write helpers (shared by baby.ts, updates.ts, encouragements.ts, migrations.ts) ---

async function advanceBabyActivity(
  ctx: MutationCtx,
  opts: { activityAt: number; babyId: Id<"baby"> },
) {
  const baby = await ctx.db.get(opts.babyId);
  if (baby && (baby.lastActivityAt === undefined || opts.activityAt > baby.lastActivityAt)) {
    await ctx.db.patch(opts.babyId, { lastActivityAt: opts.activityAt });
  }
}

/**
 * Inserts an owner update together with its timeline row.
 * `postedAt` is the feed sort key (when announced). `occurredAt` is the
 * milestone's real event time for display — omit for non-milestone updates.
 */
export async function insertUpdateWithTimelineItem(
  ctx: MutationCtx,
  opts: {
    babyId: Id<"baby">;
    blurDataUrl?: string | null;
    message?: string | null;
    milestone?: Milestone | null;
    occurredAt?: number | null;
    photoId?: Id<"_storage"> | null;
    postedAt: number;
    postedByUserId?: string | null;
    pushImageId?: Id<"_storage"> | null;
    thumbnailId?: Id<"_storage"> | null;
  },
) {
  const timelineItemId = await ctx.db.insert("timelineItems", {
    babyId: opts.babyId,
    kind: "update",
    postedAt: opts.postedAt,
  });
  const updateId = await ctx.db.insert("updates", {
    babyId: opts.babyId,
    blurDataUrl: opts.blurDataUrl ?? null,
    message: opts.message ?? null,
    milestone: opts.milestone ?? null,
    occurredAt: opts.occurredAt ?? null,
    photoId: opts.photoId ?? null,
    postedByUserId: opts.postedByUserId ?? null,
    pushImageId: opts.pushImageId ?? null,
    thumbnailId: opts.thumbnailId ?? null,
    timelineItemId,
  });
  await advanceBabyActivity(ctx, {
    activityAt: opts.postedAt,
    babyId: opts.babyId,
  });
  return { timelineItemId, updateId };
}

/**
 * Soft-deletes an owner update and its timeline row (recoverable later).
 */
export async function deleteUpdateWithTimelineItem(ctx: MutationCtx, update: Doc<"updates">) {
  const patch = softDeletePatch();
  await ctx.db.patch(update._id, patch);
  await ctx.db.patch(update.timelineItemId, patch);
  await advanceBabyActivity(ctx, {
    activityAt: patch.deletedAt,
    babyId: update.babyId,
  });
}

/**
 * Soft-deletes an encouragement and its timeline row when present.
 */
export async function deleteEncouragementWithTimelineItem(
  ctx: MutationCtx,
  encouragement: Doc<"encouragements">,
) {
  const patch = softDeletePatch();
  await ctx.db.patch(encouragement._id, patch);
  if (encouragement.timelineItemId) {
    await ctx.db.patch(encouragement.timelineItemId, patch);
  }
  await advanceBabyActivity(ctx, {
    activityAt: patch.deletedAt,
    babyId: encouragement.babyId,
  });
}

/**
 * Finds the active update row marking a given milestone for a baby, if any.
 * Soft-deleted rows are ignored so a milestone can be re-marked after unmark.
 * There is at most one active row per milestone (enforced by the write paths).
 */
export async function findMilestoneUpdate(
  ctx: QueryCtx,
  opts: { babyId: Id<"baby">; milestone: Milestone },
) {
  const updates = await ctx.db
    .query("updates")
    .withIndex("by_babyId_and_milestone", (q) =>
      q.eq("babyId", opts.babyId).eq("milestone", opts.milestone),
    )
    .order("desc")
    .take(32);
  return updates.find(isActive) ?? null;
}

const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000;

export function isValidDateTimestamp(value: number) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_DATE_TIMESTAMP;
}

/**
 * Event-clock dates inferred from the active milestone updates. Missing
 * `occurredAt` falls back to the feed `postedAt` so legacy rows still count.
 */
export async function loadMilestoneDates(
  ctx: QueryCtx,
  babyId: Id<"baby">,
): Promise<MilestoneDates> {
  const dates: MilestoneDates = {
    babyBorn: null,
    laborStarted: null,
    wentToHospital: null,
  };
  for (const milestone of MILESTONES) {
    const update = await findMilestoneUpdate(ctx, { babyId, milestone });
    if (!update) {
      continue;
    }
    const item = await ctx.db.get(update.timelineItemId);
    if (!item || !isActive(item)) {
      throw new Error(`Milestone update ${update._id} has no active timeline item`);
    }
    const occurredAt = update.occurredAt ?? item.postedAt;
    if (!isValidDateTimestamp(occurredAt)) {
      throw new Error(`Milestone update ${update._id} has an invalid event timestamp`);
    }
    dates[MILESTONE_FIELDS[milestone].date] = new Date(occurredAt).toISOString();
  }
  return dates;
}

export async function loadCurrentStatus(ctx: QueryCtx, babyId: Id<"baby">) {
  const dates = await loadMilestoneDates(ctx, babyId);
  const baby = await ctx.db.get(babyId);
  return getCurrentStatus({ ...dates, birthJourney: baby?.birthJourney });
}

/**
 * Inserts the timeline row for an encouragement. The caller stores the
 * returned id on the encouragement document.
 */
export async function insertEncouragementTimelineItem(
  ctx: MutationCtx,
  opts: { babyId: Id<"baby">; postedAt: number },
) {
  const timelineItemId = await ctx.db.insert("timelineItems", {
    babyId: opts.babyId,
    kind: "encouragement",
    postedAt: opts.postedAt,
  });
  await advanceBabyActivity(ctx, {
    activityAt: opts.postedAt,
    babyId: opts.babyId,
  });
  return timelineItemId;
}
