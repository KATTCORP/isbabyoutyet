import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  HOMEPAGE_DEMO_BABIES,
  HOMEPAGE_DEMO_BABY,
  HOMEPAGE_DEMO_OWNER_USER_ID,
  HOMEPAGE_DEMO_THEME,
  isHomepageDemoPublicId,
} from "../src/seedCredentials";
import {
  HOMEPAGE_DEMO_DUE_DATE_MINUTES_AGO,
  HOMEPAGE_DEMO_FEED_SLOTS,
  HOMEPAGE_DEMO_PHOTO_KEYS,
  homepageDemoFeedFor,
  homepageDemoLocales,
} from "../src/homepageDemoFeed";
import type { HomepageDemoPhotoKey } from "../src/homepageDemoFeed";
import type { SupportedLocale } from "../src/i18n";
import { DEFAULT_LOCALE } from "../src/i18n";
import { supportedLocaleValidator } from "./i18n";
import { tokenIdentifierForAuthUserId } from "./authIdentity";
import { insertEncouragementTimelineItem, insertUpdateWithTimelineItem } from "./timeline";
import { internalMutationWithTriggers } from "./triggers";

const CLEAR_BATCH_SIZE = 32;
const RESET_INACTIVITY_MS = 60 * 60_000;

const photoIdsValidator = v.object({
  blurDataUrl: v.union(v.string(), v.null()),
  photoId: v.id("_storage"),
  pushImageId: v.union(v.id("_storage"), v.null()),
  thumbnailId: v.union(v.id("_storage"), v.null()),
});

const photosValidator = v.record(v.string(), photoIdsValidator);

const localeArg = v.union(supportedLocaleValidator, v.null());

type DemoPhotos = Record<
  string,
  {
    blurDataUrl: string | null;
    photoId: Id<"_storage">;
    pushImageId: Id<"_storage"> | null;
    thumbnailId: Id<"_storage"> | null;
  }
>;

type CompleteDemoPhoto = {
  blurDataUrl: string;
  photoId: Id<"_storage">;
  pushImageId: Id<"_storage">;
  thumbnailId: Id<"_storage">;
};

type CompleteDemoPhotos = Record<HomepageDemoPhotoKey, CompleteDemoPhoto>;

function resolveDemoLocale(locale: SupportedLocale | null) {
  return locale ?? DEFAULT_LOCALE;
}

function dueDateIso(now: number) {
  return new Date(now - HOMEPAGE_DEMO_DUE_DATE_MINUTES_AGO * 60_000).toISOString();
}

/**
 * Only wipe/patch babies with the fixed homepage-demo identity. `demo: true`
 * alone is intentionally insufficient because preview login fixtures use it
 * too. The sole exception is the pre-flag Juniper row with the same sentinel
 * owner, token, and reserved public id.
 */
function isManagedHomepageDemo(baby: Doc<"baby">) {
  const hasHomepageIdentity =
    baby.userId === HOMEPAGE_DEMO_OWNER_USER_ID &&
    baby.ownerTokenIdentifier === tokenIdentifierForAuthUserId(HOMEPAGE_DEMO_OWNER_USER_ID) &&
    isHomepageDemoPublicId(baby.publicId);
  if (!hasHomepageIdentity) {
    return false;
  }
  return baby.demo === true || baby.publicId === HOMEPAGE_DEMO_BABY.publicId;
}

function refuseNonDemo(publicId: string) {
  return new Error(
    `Refusing to overwrite non-demo baby "${publicId}". Homepage seed only touches reserved homepage-demo identities.`,
  );
}

async function findBabyByPublicId(ctx: MutationCtx | QueryCtx, publicId: string) {
  return await ctx.db
    .query("baby")
    .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
    .unique();
}

async function storageObjectExists(ctx: MutationCtx | QueryCtx, storageId: Id<"_storage">) {
  return (await ctx.db.system.get(storageId)) !== null;
}

function isCompleteDemoPhotos(photos: Partial<CompleteDemoPhotos>): photos is CompleteDemoPhotos {
  return HOMEPAGE_DEMO_PHOTO_KEYS.every((key) => photos[key] !== undefined);
}

async function reusablePhotosForBaby(
  ctx: MutationCtx | QueryCtx,
  opts: { baby: Doc<"baby">; locale: SupportedLocale },
) {
  const updates = await ctx.db
    .query("updates")
    .withIndex("by_babyId", (q) => q.eq("babyId", opts.baby._id))
    .take(HOMEPAGE_DEMO_FEED_SLOTS.length);
  const photos: Partial<CompleteDemoPhotos> = {};

  for (const item of homepageDemoFeedFor(opts.locale)) {
    if (item.kind !== "update" || !item.photo) {
      continue;
    }
    const update = updates.find((candidate) => candidate.message === item.message);
    if (!update?.photoId || !update.thumbnailId || !update.pushImageId || !update.blurDataUrl) {
      return null;
    }
    if (
      !(await storageObjectExists(ctx, update.photoId)) ||
      !(await storageObjectExists(ctx, update.thumbnailId)) ||
      !(await storageObjectExists(ctx, update.pushImageId))
    ) {
      return null;
    }
    photos[item.photo] = {
      blurDataUrl: update.blurDataUrl,
      photoId: update.photoId,
      pushImageId: update.pushImageId,
      thumbnailId: update.thumbnailId,
    };
  }

  if (!isCompleteDemoPhotos(photos)) {
    return null;
  }
  return photos;
}

async function loadReusablePhotos(ctx: MutationCtx | QueryCtx) {
  for (const locale of homepageDemoLocales()) {
    const demo = HOMEPAGE_DEMO_BABIES[locale];
    const baby = await findBabyByPublicId(ctx, demo.publicId);
    if (!baby || !isManagedHomepageDemo(baby)) {
      continue;
    }
    const photos = await reusablePhotosForBaby(ctx, { baby, locale });
    if (photos) {
      return photos;
    }
  }
  return null;
}

async function hasCompleteHomepageDemoSeed(ctx: QueryCtx) {
  for (const locale of homepageDemoLocales()) {
    const baby = await findBabyByPublicId(ctx, HOMEPAGE_DEMO_BABIES[locale].publicId);
    if (!baby || !isManagedHomepageDemo(baby)) {
      return false;
    }
    if (!(await reusablePhotosForBaby(ctx, { baby, locale }))) {
      return false;
    }
  }
  return true;
}

async function hasRecentVisitorEncouragement(
  ctx: MutationCtx,
  opts: { baby: Doc<"baby">; since: number },
) {
  const recent = ctx.db
    .query("encouragements")
    .withIndex("by_babyId_and_createdAt", (q) =>
      q.eq("babyId", opts.baby._id).gte("createdAt", opts.since),
    )
    .order("desc");
  for await (const encouragement of recent) {
    if (encouragement.demoFixture !== true) {
      return true;
    }
  }
  return false;
}

async function requireManagedDemoBaby(ctx: MutationCtx, babyId: Id<"baby">) {
  const baby = await ctx.db.get(babyId);
  if (!baby || !isManagedHomepageDemo(baby)) {
    throw new Error(`Refusing to modify baby ${babyId}: not a reserved homepage-demo identity.`);
  }
  return baby;
}

async function ensureBabyDoc(ctx: MutationCtx, opts: { locale: SupportedLocale; now: number }) {
  const demo = HOMEPAGE_DEMO_BABIES[opts.locale];
  const existing = await findBabyByPublicId(ctx, demo.publicId);
  const fields = {
    birthJourney: "labor" as const,
    demo: true as const,
    dueDate: dueDateIso(opts.now),
    dueDateDisplayMode: "exact" as const,
    lastActivityAt: opts.now,
    locale: opts.locale,
    name: demo.name,
    ownerTokenIdentifier: tokenIdentifierForAuthUserId(HOMEPAGE_DEMO_OWNER_USER_ID),
    publicDueDateText: null,
    theme: HOMEPAGE_DEMO_THEME,
    userId: HOMEPAGE_DEMO_OWNER_USER_ID,
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
    photoId: null,
    publicId: demo.publicId,
    subscriptionCount: 0,
    thumbnailId: null,
  });
}

async function deleteTimelineItem(ctx: MutationCtx, item: Doc<"timelineItems">) {
  switch (item.kind) {
    case "update": {
      const update = await ctx.db
        .query("updates")
        .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", item._id))
        .first();
      if (update) {
        await ctx.db.delete(update._id);
      }
      await ctx.db.delete(item._id);
      return;
    }
    case "encouragement": {
      const encouragement = await ctx.db
        .query("encouragements")
        .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", item._id))
        .first();
      if (encouragement) {
        await ctx.db.delete(encouragement._id);
      }
      await ctx.db.delete(item._id);
      return;
    }
  }
}

async function clearFeedBatchForBaby(ctx: MutationCtx, babyId: Id<"baby">) {
  await requireManagedDemoBaby(ctx, babyId);

  const items = await ctx.db
    .query("timelineItems")
    .withIndex("by_babyId_and_postedAt", (q) => q.eq("babyId", babyId))
    .take(CLEAR_BATCH_SIZE);

  for (const item of items) {
    await deleteTimelineItem(ctx, item);
  }

  return { deleted: items.length, hasMore: items.length === CLEAR_BATCH_SIZE };
}

async function clearAllFeed(ctx: MutationCtx, babyId: Id<"baby">) {
  for (;;) {
    const result = await clearFeedBatchForBaby(ctx, babyId);
    if (!result.hasMore) {
      break;
    }
  }

  await requireManagedDemoBaby(ctx, babyId);
  await ctx.db.patch(babyId, {
    blurDataUrl: null,
    photoId: null,
    thumbnailId: null,
  });
}

function slugAuthor(authorName: string) {
  return authorName.toLowerCase().replaceAll(/\s+/g, "-");
}

async function insertFeedDocs(
  ctx: MutationCtx,
  opts: { babyId: Id<"baby">; locale: SupportedLocale; now: number; photos: DemoPhotos },
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
  const chronological = [...homepageDemoFeedFor(locale)].toSorted(
    (a, b) => b.minutesAgo - a.minutesAgo,
  );

  for (const item of chronological) {
    const postedAt = now - item.minutesAgo * 60_000;
    if (item.kind === "encouragement") {
      const timelineItemId = await insertEncouragementTimelineItem(ctx, {
        babyId,
        postedAt,
      });
      const visitorId = `homepage-demo-${locale}-${slugAuthor(item.authorName)}`;
      await ctx.db.insert("encouragements", {
        author: { type: "visitor", visitorId },
        authorName: item.authorName,
        babyId,
        createdAt: postedAt,
        demoFixture: true,
        message: item.message,
        timelineItemId,
        visitorId,
      });
      continue;
    }

    const photo = item.photo ? photos[item.photo] : undefined;
    await insertUpdateWithTimelineItem(ctx, {
      babyId,
      blurDataUrl: photo?.blurDataUrl ?? null,
      message: item.message,
      milestone: item.milestone ?? null,
      occurredAt: item.milestone ? postedAt : null,
      photoId: photo?.photoId ?? null,
      postedAt,
      pushImageId: photo?.pushImageId ?? null,
      thumbnailId: photo?.thumbnailId ?? null,
    });

    if (photo) {
      pagePhotoId = photo.photoId;
      pageThumbnailId = photo.thumbnailId ?? null;
      pageBlurDataUrl = photo.blurDataUrl ?? null;
    }
  }

  await ctx.db.patch(babyId, {
    blurDataUrl: pageBlurDataUrl,
    photoId: pagePhotoId,
    thumbnailId: pageThumbnailId,
  });

  return { babyId, locale, publicId: demo.publicId };
}

/**
 * Upload URL for homepage-demo photos. Prefer `storePhoto` from the seed
 * script: `convex run` auto-starts the local backend, but the upload URL
 * points at 127.0.0.1:3210 which is gone once that process exits.
 */
export const generateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
  returns: v.string(),
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
  handler: async (ctx, args) => {
    return await ctx.storage.store(
      new Blob([new Uint8Array(args.bytes)], { type: args.contentType }),
    );
  },
  returns: v.id("_storage"),
});

/**
 * Deploy-time sentinel: a complete fixture feed already owns the reusable
 * storage objects, so seeding can skip both the reset and photo uploads.
 */
export const hasCompletePhotoSet = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await hasCompleteHomepageDemoSeed(ctx);
  },
  returns: v.boolean(),
});

export const ensureBaby = internalMutationWithTriggers({
  args: { locale: localeArg },
  handler: async (ctx, args) => {
    return await ensureBabyDoc(ctx, {
      locale: resolveDemoLocale(args.locale),
      now: Date.now(),
    });
  },
});

export const clearFeedBatch = internalMutationWithTriggers({
  args: {
    babyId: v.id("baby"),
  },
  handler: async (ctx, args) => {
    return await clearFeedBatchForBaby(ctx, args.babyId);
  },
});

export const insertFeed = internalMutationWithTriggers({
  args: {
    babyId: v.id("baby"),
    locale: localeArg,
    photos: photosValidator,
  },
  handler: async (ctx, args) => {
    return await insertFeedDocs(ctx, {
      babyId: args.babyId,
      locale: resolveDemoLocale(args.locale),
      now: Date.now(),
      photos: args.photos,
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
 * Never touches a baby outside the reserved homepage-demo identity. Storage
 * objects are retained because Convex storage IDs have no ownership metadata;
 * deleting one here could invalidate a non-demo update that reused the ID.
 */
export const refresh = internalMutationWithTriggers({
  args: {
    locale: localeArg,
    photos: photosValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const photos = args.photos;
    const locale = resolveDemoLocale(args.locale);
    const babyId = await ensureBabyDoc(ctx, { locale, now });
    await clearAllFeed(ctx, babyId);
    return await insertFeedDocs(ctx, { babyId, locale, now, photos });
  },
});

/**
 * Daily reset for the public demo pages. Only server-marked fixture
 * encouragements are excluded from activity, so a client cannot spoof the
 * guard through visitorId. Each baby has its own activity gate, so one active
 * locale does not block inactive demos from resetting. The checks, photo
 * lookup, and resets share one transaction so an encouragement cannot arrive
 * between a baby's check and wipe.
 */
export const resetIfInactive = internalMutationWithTriggers({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const photos = await loadReusablePhotos(ctx);
    if (!photos) {
      return { resetBabies: 0, status: "skipped_missing_photos" as const };
    }

    let resetBabies = 0;
    for (const locale of homepageDemoLocales()) {
      const existing = await findBabyByPublicId(ctx, HOMEPAGE_DEMO_BABIES[locale].publicId);
      if (
        existing &&
        isManagedHomepageDemo(existing) &&
        (await hasRecentVisitorEncouragement(ctx, {
          baby: existing,
          since: now - RESET_INACTIVITY_MS,
        }))
      ) {
        continue;
      }
      const babyId = await ensureBabyDoc(ctx, { locale, now });
      await clearAllFeed(ctx, babyId);
      await insertFeedDocs(ctx, { babyId, locale, now, photos });
      resetBabies += 1;
    }

    if (resetBabies === 0) {
      return { resetBabies, status: "skipped_recent_encouragement" as const };
    }
    return { resetBabies, status: "reset" as const };
  },
  returns: v.object({
    resetBabies: v.number(),
    status: v.union(
      v.literal("reset"),
      v.literal("skipped_recent_encouragement"),
      v.literal("skipped_missing_photos"),
    ),
  }),
});
