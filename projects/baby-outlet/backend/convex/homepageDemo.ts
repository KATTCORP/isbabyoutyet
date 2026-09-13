import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  HOMEPAGE_DEMO_BABIES,
  HOMEPAGE_DEMO_OWNER_USER_ID,
  HOMEPAGE_DEMO_THEME,
  isHomepageDemoPublicId,
} from "../src/seedCredentials";
import { HOMEPAGE_DEMO_DUE_DATE_MINUTES_AGO, homepageDemoFeedFor } from "../src/homepageDemoFeed";
import type { SupportedLocale } from "../src/i18n";
import { DEFAULT_LOCALE } from "../src/i18n";
import { supportedLocaleValidator } from "./i18n";
import { tokenIdentifierForAuthUserId } from "./authIdentity";
import { insertEncouragementTimelineItem, insertUpdateWithTimelineItem } from "./timeline";

const CLEAR_BATCH_SIZE = 32;

const photoIdsValidator = v.object({
  photoId: v.id("_storage"),
  thumbnailId: v.optional(v.union(v.id("_storage"), v.null())),
  pushImageId: v.optional(v.union(v.id("_storage"), v.null())),
  blurDataUrl: v.optional(v.union(v.string(), v.null())),
});

const photosValidator = v.record(v.string(), photoIdsValidator);

const localeArg = v.optional(supportedLocaleValidator);

type DemoPhotos = Record<
  string,
  {
    photoId: Id<"_storage">;
    thumbnailId?: Id<"_storage"> | null;
    pushImageId?: Id<"_storage"> | null;
    blurDataUrl?: string | null;
  }
>;

function resolveDemoLocale(locale: SupportedLocale | undefined) {
  return locale ?? DEFAULT_LOCALE;
}

function dueDateIso(now: number) {
  return new Date(now - HOMEPAGE_DEMO_DUE_DATE_MINUTES_AGO * 60_000).toISOString();
}

function storageIdsToKeep(photos: DemoPhotos) {
  const keepStorageIds = new Set<string>();
  for (const photo of Object.values(photos)) {
    keepStorageIds.add(photo.photoId);
    if (photo.thumbnailId) keepStorageIds.add(photo.thumbnailId);
    if (photo.pushImageId) keepStorageIds.add(photo.pushImageId);
  }
  return keepStorageIds;
}

/**
 * Only wipe/patch babies that are explicitly marked demo, or the pre-flag
 * Juniper-hale row owned by the sentinel homepage-demo userId.
 */
function isManagedHomepageDemo(baby: Doc<"baby">) {
  if (baby.demo === true) return true;
  return baby.userId === HOMEPAGE_DEMO_OWNER_USER_ID && isHomepageDemoPublicId(baby.publicId);
}

function refuseNonDemo(publicId: string) {
  return new Error(
    `Refusing to overwrite non-demo baby "${publicId}". Homepage seed only touches babies with demo: true.`,
  );
}

async function findBabyByPublicId(ctx: MutationCtx, publicId: string) {
  return await ctx.db
    .query("baby")
    .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
    .unique();
}

async function requireManagedDemoBaby(ctx: MutationCtx, babyId: Id<"baby">) {
  const baby = await ctx.db.get(babyId);
  if (!baby || !isManagedHomepageDemo(baby)) {
    throw new Error(
      `Refusing to modify baby ${babyId}: not a managed homepage demo (demo: true required).`,
    );
  }
  return baby;
}

async function ensureBabyDoc(ctx: MutationCtx, opts: { now: number; locale: SupportedLocale }) {
  const demo = HOMEPAGE_DEMO_BABIES[opts.locale];
  const existing = await findBabyByPublicId(ctx, demo.publicId);
  const fields = {
    userId: HOMEPAGE_DEMO_OWNER_USER_ID,
    ownerTokenIdentifier: tokenIdentifierForAuthUserId(HOMEPAGE_DEMO_OWNER_USER_ID),
    name: demo.name,
    theme: HOMEPAGE_DEMO_THEME,
    locale: opts.locale,
    birthJourney: "labor" as const,
    demo: true as const,
    encouragementsDisabled: false,
    dueDate: dueDateIso(opts.now),
    dueDateDisplayMode: "exact" as const,
    publicDueDateText: null,
    lastActivityAt: opts.now,
  };
  if (existing) {
    if (!isManagedHomepageDemo(existing)) {
      throw refuseNonDemo(demo.publicId);
    }
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }

  return await ctx.db.insert("baby", {
    ...fields,
    publicId: demo.publicId,
    photoId: null,
    thumbnailId: null,
    subscriptionCount: 0,
  });
}

async function deleteStorageIfExists(
  ctx: MutationCtx,
  opts: {
    storageId: Id<"_storage"> | null | undefined;
    keepStorageIds: Set<string>;
  },
) {
  if (!opts.storageId) return;
  if (opts.keepStorageIds.has(opts.storageId)) return;
  const meta = await ctx.db.system.get(opts.storageId);
  if (!meta) return;
  await ctx.storage.delete(opts.storageId);
}

async function deleteTimelineItem(
  ctx: MutationCtx,
  opts: { item: Doc<"timelineItems">; keepStorageIds: Set<string> },
) {
  switch (opts.item.kind) {
    case "update": {
      const update = await ctx.db
        .query("updates")
        .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", opts.item._id))
        .first();
      if (update) {
        await deleteStorageIfExists(ctx, {
          storageId: update.photoId,
          keepStorageIds: opts.keepStorageIds,
        });
        await deleteStorageIfExists(ctx, {
          storageId: update.thumbnailId,
          keepStorageIds: opts.keepStorageIds,
        });
        await deleteStorageIfExists(ctx, {
          storageId: update.pushImageId,
          keepStorageIds: opts.keepStorageIds,
        });
        await ctx.db.delete(update._id);
      }
      await ctx.db.delete(opts.item._id);
      return;
    }
    case "encouragement": {
      const encouragement = await ctx.db
        .query("encouragements")
        .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", opts.item._id))
        .first();
      if (encouragement) {
        await ctx.db.delete(encouragement._id);
      }
      await ctx.db.delete(opts.item._id);
      return;
    }
  }
}

async function clearFeedBatchForBaby(
  ctx: MutationCtx,
  opts: { babyId: Id<"baby">; keepStorageIds: Set<string> },
) {
  await requireManagedDemoBaby(ctx, opts.babyId);

  const items = await ctx.db
    .query("timelineItems")
    .withIndex("by_babyId_and_postedAt", (q) => q.eq("babyId", opts.babyId))
    .take(CLEAR_BATCH_SIZE);

  for (const item of items) {
    await deleteTimelineItem(ctx, { item, keepStorageIds: opts.keepStorageIds });
  }

  return { deleted: items.length, hasMore: items.length === CLEAR_BATCH_SIZE };
}

async function clearAllFeed(
  ctx: MutationCtx,
  opts: { babyId: Id<"baby">; keepStorageIds: Set<string> },
) {
  for (;;) {
    const result = await clearFeedBatchForBaby(ctx, opts);
    if (!result.hasMore) break;
  }

  const baby = await requireManagedDemoBaby(ctx, opts.babyId);
  await deleteStorageIfExists(ctx, {
    storageId: baby.photoId,
    keepStorageIds: opts.keepStorageIds,
  });
  await deleteStorageIfExists(ctx, {
    storageId: baby.thumbnailId,
    keepStorageIds: opts.keepStorageIds,
  });
  await ctx.db.patch(opts.babyId, {
    photoId: null,
    thumbnailId: null,
    blurDataUrl: null,
  });
}

function slugAuthor(authorName: string) {
  return authorName.toLowerCase().replace(/\s+/g, "-");
}

async function insertFeedDocs(
  ctx: MutationCtx,
  opts: { babyId: Id<"baby">; photos: DemoPhotos; now: number; locale: SupportedLocale },
) {
  await requireManagedDemoBaby(ctx, opts.babyId);

  const babyId = opts.babyId;
  const photos = opts.photos;
  const now = opts.now;
  const locale = opts.locale;
  const demo = HOMEPAGE_DEMO_BABIES[locale];
  let pagePhotoId: Id<"_storage"> | null = null;
  let pageThumbnailId: Id<"_storage"> | null = null;
  let pageBlurDataUrl: string | null = null;

  // Oldest first so the last photo we see is the newest (page photo).
  const chronological = [...homepageDemoFeedFor(locale)].sort(
    (a, b) => b.minutesAgo - a.minutesAgo,
  );

  for (const item of chronological) {
    const postedAt = now - item.minutesAgo * 60_000;
    if (item.kind === "encouragement") {
      const timelineItemId = await insertEncouragementTimelineItem(ctx, {
        babyId,
        postedAt,
      });
      await ctx.db.insert("encouragements", {
        babyId,
        authorName: item.authorName,
        message: item.message,
        createdAt: postedAt,
        timelineItemId,
        visitorId: `homepage-demo-${locale}-${slugAuthor(item.authorName)}`,
      });
      continue;
    }

    const photo = item.photo ? photos[item.photo] : undefined;
    await insertUpdateWithTimelineItem(ctx, {
      babyId,
      postedAt,
      message: item.message,
      milestone: item.milestone ?? null,
      occurredAt: item.milestone ? postedAt : null,
      photoId: photo?.photoId ?? null,
      thumbnailId: photo?.thumbnailId ?? null,
      pushImageId: photo?.pushImageId ?? null,
      blurDataUrl: photo?.blurDataUrl ?? null,
    });

    if (photo) {
      pagePhotoId = photo.photoId;
      pageThumbnailId = photo.thumbnailId ?? null;
      pageBlurDataUrl = photo.blurDataUrl ?? null;
    }
  }

  await ctx.db.patch(babyId, {
    photoId: pagePhotoId,
    thumbnailId: pageThumbnailId,
    blurDataUrl: pageBlurDataUrl,
  });

  return { babyId, publicId: demo.publicId, locale };
}

/**
 * Upload URL for homepage-demo photos. Prefer `storePhoto` from the seed
 * script: `convex run` auto-starts the local backend, but the upload URL
 * points at 127.0.0.1:3210 which is gone once that process exits.
 */
export const generateUploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Store a homepage-demo JPEG via `convex run` so the CLI keeps the local
 * backend alive for the whole call (no HTTP POST to 3210).
 */
export const storePhoto = internalAction({
  args: {
    bytes: v.bytes(),
    contentType: v.literal("image/jpeg"),
  },
  returns: v.id("_storage"),
  handler: async (ctx, args) => {
    return await ctx.storage.store(
      new Blob([new Uint8Array(args.bytes)], { type: args.contentType }),
    );
  },
});

export const ensureBaby = internalMutation({
  args: { locale: localeArg },
  handler: async (ctx, args) => {
    return await ensureBabyDoc(ctx, {
      now: Date.now(),
      locale: resolveDemoLocale(args.locale),
    });
  },
});

export const clearFeedBatch = internalMutation({
  args: {
    babyId: v.id("baby"),
    keepStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    return await clearFeedBatchForBaby(ctx, {
      babyId: args.babyId,
      keepStorageIds: new Set(args.keepStorageIds ?? []),
    });
  },
});

export const insertFeed = internalMutation({
  args: {
    babyId: v.id("baby"),
    photos: v.optional(photosValidator),
    locale: localeArg,
  },
  handler: async (ctx, args) => {
    return await insertFeedDocs(ctx, {
      babyId: args.babyId,
      photos: args.photos ?? {},
      now: Date.now(),
      locale: resolveDemoLocale(args.locale),
    });
  },
});

/**
 * Idempotent upsert: creates the public demo baby for one locale (or reuses
 * it), wipes the feed — including visitor encouragements — and restores the
 * fixture story with timestamps relative to now. Does not send push
 * notifications. Call once per locale from the seed script so each baby stays
 * under mutation limits.
 *
 * Never touches a baby that is not marked `demo: true` (except grandfathering
 * the existing sentinel-owned homepage demo publicIds).
 */
export const refresh = internalMutation({
  args: {
    photos: v.optional(photosValidator),
    locale: localeArg,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const photos = args.photos ?? {};
    const locale = resolveDemoLocale(args.locale);
    const babyId = await ensureBabyDoc(ctx, { now, locale });
    await clearAllFeed(ctx, { babyId, keepStorageIds: storageIdsToKeep(photos) });
    return await insertFeedDocs(ctx, { babyId, photos, now, locale });
  },
});
