import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { encouragementAuthorValidator } from "./encouragementAuthor";
import { supportedLocaleValidator } from "./i18n";
import { onboardingStepIdValidator } from "./onboardingValidators";
import { notifiableStatusValidator } from "./pushValidators";

export default defineSchema({
  baby: defineTable({
    userId: v.string(), // Better-auth user ID
    ownerTokenIdentifier: v.string(), // Stable Convex auth identity
    name: v.string(),
    dueDate: v.union(v.string(), v.null()), // ISO date string in exact mode; null in message mode
    // Stack 2: required after backfillBabyDueDateDisplay populates every baby.
    dueDateDisplayMode: v.union(v.literal("exact"), v.literal("message")),
    publicDueDateText: v.union(v.string(), v.null()),
    publicId: v.string(), // Unique shareable ID
    birthJourney: v.union(
      v.literal("labor"),
      v.literal("home_birth"),
      v.literal("planned_c_section"),
      v.literal("custom"),
    ),
    /** Theme preset name (e.g. "violet-bloom"). @todo Optional until every row sets this key. */
    theme: v.optional(v.union(v.string(), v.null())),
    /** Language override; null inherits the owner's profile. @todo Optional until every row sets this key. */
    locale: v.optional(v.union(supportedLocaleValidator, v.null())),
    /** Convex storage ID for the baby photo. @todo Optional until every row sets this key. */
    photoId: v.optional(v.union(v.id("_storage"), v.null())),
    /** Convex storage ID for the baby photo thumbnail. @todo Optional until every row sets this key. */
    thumbnailId: v.optional(v.union(v.id("_storage"), v.null())),
    /** Tiny JPEG data URL shown while the page photo loads. @todo Optional until every row sets this key. */
    blurDataUrl: v.optional(v.union(v.string(), v.null())),
    /** Homepage live-demo babies only. @todo Optional until every row sets this key (`false` for non-demo). */
    demo: v.optional(v.boolean()),
    // Denormalized exact Web Push subscriber count, maintained with subscription writes.
    subscriptionCount: v.number(),
    // Latest timeline activity, materialized for bounded admin sorting.
    lastActivityAt: v.number(),
    /** Soft delete: ms epoch when deleted, null when active. @todo Optional until every row sets this key. */
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_userId", ["userId"])
    .index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"])
    .index("by_lastActivityAt", ["lastActivityAt"])
    .index("by_publicId", ["publicId"]),
  userProfiles: defineTable({
    userId: v.string(), // Better Auth user ID
    tokenIdentifier: v.string(), // Stable Convex auth identity
    locale: supportedLocaleValidator,
    /** IANA zone; legacy profiles fall back to Europe/London. @todo Optional until every row sets this key. */
    timeZone: v.optional(v.string()),
    // Platform staff flag, backfilled before this final schema tightening.
    isAdmin: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"]),
  /**
   * Language-request inbox is retired. Keep the table so existing rows stay
   * valid on deploy until a later migration deletes them.
   */
  languageRequests: defineTable({
    userId: v.string(),
    requestedLocale: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"]),
  cacheInvalidationJobs: defineTable({
    key: v.string(),
    tags: v.array(v.string()),
    version: v.number(),
    attempts: v.number(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),
  babyPublicIdHistory: defineTable({
    babyId: v.id("baby"),
    publicId: v.string(), // Historical publicId
  })
    .index("by_publicId", ["publicId"])
    .index("by_babyId", ["babyId"]),
  // Staff permalink moves: who changed which slug, when, and why.
  babyPublicIdTransfers: defineTable({
    actorEmail: v.union(v.string(), v.null()),
    actorTokenIdentifier: v.string(),
    actorUserId: v.string(),
    babyId: v.id("baby"),
    babyName: v.string(),
    createdAt: v.number(),
    displacedBabyId: v.union(v.id("baby"), v.null()),
    displacedBabyName: v.union(v.string(), v.null()),
    displacedPublicId: v.union(v.string(), v.null()),
    fromPublicId: v.string(),
    motivation: v.string(),
    toPublicId: v.string(),
  })
    .index("by_babyId", ["babyId"])
    .index("by_createdAt", ["createdAt"]),
  pushSubscriptions: defineTable({
    babyId: v.id("baby"), // Reference to the baby
    endpoint: v.string(), // Web Push endpoint URL
    p256dh: v.string(), // Public key for encryption
    auth: v.string(), // Authentication secret
    createdAt: v.number(), // Timestamp
    /** Recorded at subscribe/resubscribe for future payload gating. @todo Optional until every row sets this key. */
    userAgent: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_endpoint", ["endpoint"])
    .index("by_babyId_and_endpoint", ["babyId", "endpoint"]),
  // Managers (owner / co-parent) opt in to visitor-message alerts separately
  // from family status-update subscriptions, so counts and payloads stay distinct.
  ownerPushSubscriptions: defineTable({
    babyId: v.id("baby"),
    userId: v.string(), // Better Auth user id
    tokenIdentifier: v.string(), // Stable Convex auth identity
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
    /** Recorded at subscribe/resubscribe for future payload gating. @todo Optional until every row sets this key. */
    userAgent: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_endpoint", ["endpoint"])
    .index("by_babyId_and_endpoint", ["babyId", "endpoint"])
    .index("by_babyId_and_tokenIdentifier", ["babyId", "tokenIdentifier"]),
  scheduledNotifications: defineTable({
    babyId: v.id("baby"), // Reference to the baby
    /** Convex scheduler job ID, set after scheduling. @todo Optional until every row sets this key. */
    scheduledId: v.optional(v.union(v.id("_scheduled_functions"), v.null())),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("cancelled")), // Current status
    scheduledFor: v.number(), // Timestamp when notification will be sent
    notificationType: notifiableStatusValidator, // Type of notification
    /** Optional custom push body. @todo Optional until every row sets this key. */
    customMessage: v.optional(v.union(v.string(), v.null())),
    /** Original photo; send prefers the update's 1350×675 push image when ready. @todo Optional until every row sets this key. */
    photoId: v.optional(v.union(v.id("_storage"), v.null())),
    /** @todo Optional until every row sets this key. */
    updateId: v.optional(v.union(v.id("updates"), v.null())),
    createdAt: v.number(), // Creation timestamp
  })
    .index("by_babyId", ["babyId"])
    .index("by_babyId_and_status", ["babyId", "status"])
    .index("by_scheduledId", ["scheduledId"]),
  encouragements: defineTable({
    babyId: v.id("baby"), // Reference to the baby
    authorName: v.string(), // Name of the person sending encouragement
    message: v.string(), // The encouragement message
    createdAt: v.number(), // Timestamp
    timelineItemId: v.id("timelineItems"), // Binding to the timeline feed
    // Metadata
    visitorId: v.string(), // Unique visitor ID (stored in localStorage)
    /**
     * Discriminated author: signed-in user or visitor id.
     * Required after `backfillEncouragementAuthor` populates every row.
     */
    author: encouragementAuthorValidator,
    /** Server-controlled marker for seeded homepage-demo encouragements. @todo Optional until every row sets this key. */
    demoFixture: v.optional(v.boolean()),
    /** @todo Optional until every row sets this key. */
    userAgent: v.optional(v.union(v.string(), v.null())),
    /** Browser locale (e.g. "en-US"). @todo Optional until every row sets this key. */
    locale: v.optional(v.union(v.string(), v.null())),
    /** IANA timezone (e.g. "America/New_York"). @todo Optional until every row sets this key. */
    timezone: v.optional(v.union(v.string(), v.null())),
    /** Soft delete: ms epoch when deleted, null when active. @todo Optional until every row sets this key. */
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_babyId_and_createdAt", ["babyId", "createdAt"])
    .index("by_timelineItemId", ["timelineItemId"])
    .index("by_visitorId", ["visitorId"]),
  // Binding table for the per-baby feed: owns ordering (postedAt) and the kind
  // discriminator; children (updates/encouragements) point at it via timelineItemId.
  // postedAt is when the item entered the feed (announce/post time) — never the
  // retrofitted event clock. Milestone event times live on updates.occurredAt.
  timelineItems: defineTable({
    babyId: v.id("baby"),
    kind: v.union(v.literal("update"), v.literal("encouragement")),
    postedAt: v.number(), // ms epoch; feed sort key (when posted/announced)
    /** Soft delete: ms epoch when deleted, null when active. @todo Optional until every row sets this key. */
    deletedAt: v.optional(v.union(v.number(), v.null())),
  }).index("by_babyId_and_postedAt", ["babyId", "postedAt"]),
  // Owner-posted feed content: a message and/or a photo, optionally marking a
  // milestone. Each photo change is its own row, so old photos are never lost.
  updates: defineTable({
    babyId: v.id("baby"),
    timelineItemId: v.id("timelineItems"),
    /** @todo Optional until every row sets this key. */
    message: v.optional(v.union(v.string(), v.null())),
    /** @todo Optional until every row sets this key. */
    milestone: v.optional(
      v.union(
        v.literal("labor_started"),
        v.literal("gone_to_hospital"),
        v.literal("born"),
        v.null(),
      ),
    ),
    /** Milestone event time (ms). Display-only; null for non-milestone updates. @todo Optional until every row sets this key. */
    occurredAt: v.optional(v.union(v.number(), v.null())),
    /** @todo Optional until every row sets this key. */
    photoId: v.optional(v.union(v.id("_storage"), v.null())),
    /** @todo Optional until every row sets this key. */
    thumbnailId: v.optional(v.union(v.id("_storage"), v.null())),
    /** Tiny JPEG data URL shown while the update photo loads. @todo Optional until every row sets this key. */
    blurDataUrl: v.optional(v.union(v.string(), v.null())),
    /** 1350×675 JPEG for Chromium Notification.image. @todo Optional until every row sets this key. */
    pushImageId: v.optional(v.union(v.id("_storage"), v.null())),
    /** Who posted this update. @todo Optional until backfill makes this required. */
    postedByUserId: v.optional(v.union(v.string(), v.null())),
    /** Soft delete: ms epoch when deleted, null when active. @todo Optional until every row sets this key. */
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    // Milestone lookups (one row per marked stage) without scanning all of a
    // baby's updates — used on every post/redate/unmark and by migrations
    .index("by_babyId_and_milestone", ["babyId", "milestone"])
    .index("by_timelineItemId", ["timelineItemId"]),
  // Per-user first-run guided tour progress. One row per user.
  userOnboarding: defineTable({
    userId: v.string(), // Better Auth user ID
    tokenIdentifier: v.string(), // Stable Convex auth identity
    /** Steps the user explicitly completed or acknowledged */
    completedSteps: v.array(onboardingStepIdValidator),
    /** Welcome carousel seen or skipped */
    welcomeDismissed: v.boolean(),
    /** Floating checklist dismissed forever (until restart) */
    checklistDismissed: v.boolean(),
    /** Checklist collapsed to a small chip */
    minimized: v.boolean(),
    /**
     * Open coachmark tip for a tour step (null = none).
     * @todo Optional until every row sets this key.
     */
    activeCoachmarkStepId: v.optional(v.union(onboardingStepIdValidator, v.null())),
    /**
     * One-shot tip pointing at the restart control after checklist dismiss.
     * @todo Optional until every row sets this key.
     */
    restartHintVisible: v.optional(v.boolean()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_userId", ["userId"]),
  // Co-parents authorized to manage a baby page (not including the owner).
  babyCoParents: defineTable({
    babyId: v.id("baby"),
    userId: v.string(), // Better Auth user id
    tokenIdentifier: v.string(), // Stable Convex auth identity
    email: v.string(), // Denormalized for settings display
    /** @todo Optional until every row sets this key. */
    name: v.optional(v.union(v.string(), v.null())),
    addedByUserId: v.string(),
    addedAt: v.number(),
    /** Soft delete: ms epoch when deleted, null when active. @todo Optional until every row sets this key. */
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_userId", ["userId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_babyId_and_tokenIdentifier", ["babyId", "tokenIdentifier"]),
  // Pending co-parent invites for emails that do not yet have an account.
  babyCoParentInvites: defineTable({
    babyId: v.id("baby"),
    email: v.string(), // Normalized lowercase
    invitedByUserId: v.string(),
    createdAt: v.number(),
    /** Soft delete: ms epoch when deleted, null when active. @todo Optional until every row sets this key. */
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_email", ["email"])
    .index("by_babyId_and_email", ["babyId", "email"]),
});
