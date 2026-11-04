import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { Milestone, MilestoneDates } from "../src/types";
import { getCurrentStatus, MILESTONE_FIELDS, MILESTONES } from "../src/types";
import { visitorTag } from "../src/visitorId";
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
 * the server-resolved author (the signed-in user). `visitorTag` lets the
 * browser check visitor-id ownership itself, so the feed's args do not depend
 * on browser storage.
 */
async function toPublicEncouragement(
  encouragement: Doc<"encouragements">,
  author: EncouragementAuthor | null,
) {
  return {
    _id: encouragement._id,
    authorName: encouragement.authorName,
    createdAt: encouragement.createdAt,
    isMine: encouragementIsMine(encouragement, author),
    message: encouragement.message,
    visitorTag: await visitorTag({
      babyId: encouragement.babyId,
      visitorId: encouragement.visitorId,
    }),
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
        encouragement: await toPublicEncouragement(encouragement, opts.author),
        kind: "encouragement" as const,
        postedAt: opts.item.postedAt,
      };
    }
  }
}

export type TimelineItem = NonNullable<Awaited<ReturnType<typeof hydrateTimelineItem>>>;

async function hydratePage(
  ctx: QueryCtx,
  opts: { baby: Doc<"baby">; items: ReadonlyArray<Doc<"timelineItems">> },
) {
  const currentPhotoId = opts.baby.photoId ?? null;
  const author = await resolveEncouragementAuthor(ctx, null);
  const page: Array<TimelineItem> = [];
  for (const item of opts.items) {
    const hydrated = await hydrateTimelineItem(ctx, { author, currentPhotoId, item });
    if (hydrated) {
      page.push(hydrated);
    }
  }
  return page;
}

export const listByBaby = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const baby = await findBabyByIdOrPublicId(ctx.db, args.babyId);
    if (!baby || !isActive(baby)) {
      return { continueCursor: "", isDone: true, page: [] };
    }
    const babyId = baby._id;

    const result = await ctx.db
      .query("timelineItems")
      .withIndex("by_babyId_and_postedAt", (q) => q.eq("babyId", babyId))
      .order("desc")
      .paginate(args.paginationOpts);

    return { ...result, page: await hydratePage(ctx, { baby, items: result.page }) };
  },
});

// --- Linked items (`/baby/{publicId}?item={timelineItemId}`) ---

/**
 * The feed row a link points at, on this baby's page. A soft-deleted row
 * still positions the window, so deleting the linked item while someone is
 * reading around it doesn't move what they are looking at; `visible` says
 * whether the feed would show the row itself. Any other id (malformed,
 * unknown, another baby's) resolves to `null`, indistinguishable from each
 * other, so a link can't probe for items outside this page.
 */
async function findLinkedItem(ctx: QueryCtx, opts: { babyRef: string; itemId: string }) {
  const baby = await findBabyByIdOrPublicId(ctx.db, opts.babyRef);
  if (!baby || !isActive(baby)) {
    return null;
  }
  const itemId = ctx.db.normalizeId("timelineItems", opts.itemId);
  const item = itemId ? await ctx.db.get(itemId) : null;
  if (!item || item.babyId !== baby._id) {
    return null;
  }
  return { baby, item };
}

const EMPTY_LINKED_PAGE = {
  continueCursor: "",
  isDone: true,
  linkedItemVisible: false,
  page: [],
};

/**
 * The feed from a linked item down: the item itself, then everything older,
 * newest first like {@link listByBaby}. Positions by the feed's index key
 * (`postedAt`, then Convex's built-in `_creationTime`), so rows posted in
 * the same millisecond keep one stable order across this query and
 * {@link listNewerThanItem}. `linkedItemVisible` is false when the link is
 * unknown, removed, or for another page; the page then falls back to the
 * latest feed.
 */
export const listFromItem = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
    itemId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const linked = await findLinkedItem(ctx, { babyRef: args.babyId, itemId: args.itemId });
    if (!linked) {
      return EMPTY_LINKED_PAGE;
    }
    const anchor = linked.item;
    const result = await ctx.db
      .query("timelineItems")
      .withIndex("by_babyId_and_postedAt", (q) =>
        q.eq("babyId", anchor.babyId).lte("postedAt", anchor.postedAt),
      )
      .order("desc")
      // An index range can't express "(postedAt, _creationTime) <= anchor";
      // this only skips rows tied with the anchor's postedAt but newer.
      .filter((q) =>
        q.or(
          q.lt(q.field("postedAt"), anchor.postedAt),
          q.lte(q.field("_creationTime"), anchor._creationTime),
        ),
      )
      .paginate(args.paginationOpts);
    const page = await hydratePage(ctx, { baby: linked.baby, items: result.page });
    const linkedItemVisible =
      page.some((item) => item._id === anchor._id) ||
      (await hydratePage(ctx, { baby: linked.baby, items: [anchor] })).length > 0;
    return { ...result, linkedItemVisible, page };
  },
});

/**
 * Feed items newer than a linked item, oldest first: page one is the items
 * right above the link, and each next page climbs towards the newest. The
 * page reveals these only when asked, prepending each page in reverse.
 */
export const listNewerThanItem = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
    itemId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const linked = await findLinkedItem(ctx, { babyRef: args.babyId, itemId: args.itemId });
    if (!linked) {
      return { continueCursor: "", isDone: true, page: [] };
    }
    const result = await newerThan(ctx, linked.item).paginate(args.paginationOpts);
    return { ...result, page: await hydratePage(ctx, { baby: linked.baby, items: result.page }) };
  },
});

function newerThan(ctx: QueryCtx, anchor: Doc<"timelineItems">) {
  return ctx.db
    .query("timelineItems")
    .withIndex("by_babyId_and_postedAt", (q) =>
      q.eq("babyId", anchor.babyId).gte("postedAt", anchor.postedAt),
    )
    .order("asc")
    .filter((q) =>
      q.or(
        q.gt(q.field("postedAt"), anchor.postedAt),
        q.gt(q.field("_creationTime"), anchor._creationTime),
      ),
    );
}

/** Reads at most this many rows to count what's above a link. */
export const NEWER_THAN_ITEM_COUNT_CAP = 100;

/**
 * How many feed items are newer than a linked item, for the "Show N newer"
 * button. Capped so a link deep in a busy feed stays a bounded read: past
 * the cap, `count` is the cap and `more` is true.
 */
export const countNewerThanItem = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
    itemId: v.string(),
  },
  handler: async (ctx, args) => {
    const linked = await findLinkedItem(ctx, { babyRef: args.babyId, itemId: args.itemId });
    if (!linked) {
      return { count: 0, more: false };
    }
    const rows = await newerThan(ctx, linked.item)
      .filter((q) => q.or(q.eq(q.field("deletedAt"), null), q.eq(q.field("deletedAt"), undefined)))
      .take(NEWER_THAN_ITEM_COUNT_CAP + 1);
    return {
      count: Math.min(rows.length, NEWER_THAN_ITEM_COUNT_CAP),
      more: rows.length > NEWER_THAN_ITEM_COUNT_CAP,
    };
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
