import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { Milestone, MilestoneDates } from "../src/types";
import { getCurrentStatus, MILESTONE_FIELDS, MILESTONES } from "../src/types";
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
    item: Doc<"timelineItems">;
    update: Doc<"updates">;
    currentPhotoId: Id<"_storage"> | null;
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
      message: opts.update.message ?? null,
      milestone,
      occurredAt: opts.update.occurredAt ?? null,
      photoUrl,
      thumbnailUrl,
      blurDataUrl: opts.update.blurDataUrl ?? null,
      // Whether this update's photo is the baby's current page photo
      isCurrentPagePhoto: !!opts.update.photoId && opts.update.photoId === opts.currentPhotoId,
    },
  };
}

/**
 * Public shape of an encouragement in the feed. Deliberately excludes
 * `visitorId` (it is the edit/delete credential) and the `userAgent` /
 * `locale` / `timezone` metadata. `isMine` is computed from the
 * caller-supplied visitorId so the client can offer edit/delete.
 */
function toPublicEncouragement(encouragement: Doc<"encouragements">, visitorId?: string) {
  return {
    _id: encouragement._id,
    authorName: encouragement.authorName,
    message: encouragement.message,
    createdAt: encouragement.createdAt,
    isMine: visitorId !== undefined && encouragement.visitorId === visitorId,
  };
}

async function hydrateTimelineItem(
  ctx: QueryCtx,
  opts: {
    item: Doc<"timelineItems">;
    visitorId?: string;
    currentPhotoId: Id<"_storage"> | null;
  },
) {
  if (!isActive(opts.item)) return null;

  switch (opts.item.kind) {
    case "update": {
      const update = await findUpdateByTimelineItem(ctx, opts.item._id);
      if (!update || !isActive(update)) return null;
      return await hydrateUpdate(ctx, {
        item: opts.item,
        update,
        currentPhotoId: opts.currentPhotoId,
      });
    }
    case "encouragement": {
      const encouragement = await findEncouragementByTimelineItem(ctx, opts.item._id);
      if (!encouragement || !isActive(encouragement)) return null;
      return {
        _id: opts.item._id,
        kind: "encouragement" as const,
        postedAt: opts.item.postedAt,
        encouragement: toPublicEncouragement(encouragement, opts.visitorId),
      };
    }
  }
}

export type TimelineItem = NonNullable<Awaited<ReturnType<typeof hydrateTimelineItem>>>;

export const listByBaby = query({
  args: {
    babyId: v.id("baby"),
    // The caller's own visitor id, only used to mark their posts with `isMine`
    visitorId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const baby = await ctx.db.get(args.babyId);
    if (!baby || !isActive(baby)) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const currentPhotoId = baby.photoId ?? null;

    const result = await ctx.db
      .query("timelineItems")
      .withIndex("by_babyId_and_postedAt", (q) => q.eq("babyId", args.babyId))
      .order("desc")
      .paginate(args.paginationOpts);

    const page: TimelineItem[] = [];
    for (const item of result.page) {
      const hydrated = await hydrateTimelineItem(ctx, {
        item,
        visitorId: args.visitorId,
        currentPhotoId,
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
  args: { babyId: v.id("baby") },
  handler: async (ctx, args) => {
    const updates = await ctx.db
      .query("updates")
      .withIndex("by_babyId", (q) => q.eq("babyId", args.babyId))
      .order("desc")
      .take(256);

    let latest: { update: Doc<"updates">; item: Doc<"timelineItems"> } | null = null;
    for (const update of updates) {
      if (!isActive(update) || !update.message) continue;
      const item = await ctx.db.get(update.timelineItemId);
      if (!item || !isActive(item)) continue;
      if (!latest || item.postedAt > latest.item.postedAt) {
        latest = { update, item };
      }
    }

    if (!latest) return null;
    const baby = await ctx.db.get(args.babyId);
    return await hydrateUpdate(ctx, {
      item: latest.item,
      update: latest.update,
      currentPhotoId: baby?.photoId ?? null,
    });
  },
});

// --- Write helpers (shared by baby.ts, updates.ts, encouragements.ts, migrations.ts) ---

async function advanceBabyActivity(
  ctx: MutationCtx,
  opts: { babyId: Id<"baby">; activityAt: number },
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
    postedAt: number;
    message?: string | null;
    milestone?: Milestone | null;
    occurredAt?: number | null;
    photoId?: Id<"_storage"> | null;
    thumbnailId?: Id<"_storage"> | null;
    blurDataUrl?: string | null;
    pushImageId?: Id<"_storage"> | null;
    postedByUserId?: string | null;
  },
) {
  const timelineItemId = await ctx.db.insert("timelineItems", {
    babyId: opts.babyId,
    kind: "update",
    postedAt: opts.postedAt,
  });
  const updateId = await ctx.db.insert("updates", {
    babyId: opts.babyId,
    timelineItemId,
    message: opts.message ?? null,
    milestone: opts.milestone ?? null,
    occurredAt: opts.occurredAt ?? null,
    photoId: opts.photoId ?? null,
    thumbnailId: opts.thumbnailId ?? null,
    blurDataUrl: opts.blurDataUrl ?? null,
    pushImageId: opts.pushImageId ?? null,
    postedByUserId: opts.postedByUserId ?? null,
  });
  await advanceBabyActivity(ctx, {
    babyId: opts.babyId,
    activityAt: opts.postedAt,
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
    babyId: update.babyId,
    activityAt: patch.deletedAt,
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
    babyId: encouragement.babyId,
    activityAt: patch.deletedAt,
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
    laborStarted: null,
    wentToHospital: null,
    babyBorn: null,
  };
  for (const milestone of MILESTONES) {
    const update = await findMilestoneUpdate(ctx, { babyId, milestone });
    if (!update) continue;
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
    babyId: opts.babyId,
    activityAt: opts.postedAt,
  });
  return timelineItemId;
}
