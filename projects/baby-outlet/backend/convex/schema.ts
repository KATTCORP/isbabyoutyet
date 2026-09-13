import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
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
    ),
    theme: v.optional(v.union(v.string(), v.null())), // Theme preset name (e.g., "violet-bloom", "baby-blue")
    locale: v.optional(v.union(supportedLocaleValidator, v.null())), // Optional language override; null/absent inherits the owner's profile
    encouragementsDisabled: v.optional(v.boolean()), // Whether encouragement form is disabled (default: false)
    photoId: v.optional(v.union(v.id("_storage"), v.null())), // Convex storage ID for baby photo
    thumbnailId: v.optional(v.union(v.id("_storage"), v.null())), // Convex storage ID for baby photo thumbnail
    // Tiny JPEG data URL shown while the page photo loads (Next.js blurDataURL)
    blurDataUrl: v.optional(v.union(v.string(), v.null())),
    // Homepage live-demo babies only. Seed/refresh refuse to wipe babies without this flag.
    demo: v.optional(v.boolean()),
    // Denormalized exact Web Push subscriber count, maintained with subscription writes.
    subscriptionCount: v.number(),
    // Latest timeline activity, materialized for bounded admin sorting.
    lastActivityAt: v.number(),
    // Soft delete: set to ms epoch when deleted; absent/null means active
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
    // Platform staff flag, backfilled before this final schema tightening.
    isAdmin: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"]),
  languageRequests: defineTable({
    userId: v.string(), // Better Auth user ID
    requestedLocale: v.string(), // Free-form language name or BCP 47 tag
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_createdAt", ["createdAt"]),
  babyPublicIdHistory: defineTable({
    babyId: v.id("baby"),
    publicId: v.string(), // Historical publicId
  })
    .index("by_publicId", ["publicId"])
    .index("by_babyId", ["babyId"]),
  pushSubscriptions: defineTable({
    babyId: v.id("baby"), // Reference to the baby
    endpoint: v.string(), // Web Push endpoint URL
    p256dh: v.string(), // Public key for encryption
    auth: v.string(), // Authentication secret
    createdAt: v.number(), // Timestamp
    // Recorded at subscribe/resubscribe for future payload gating
    userAgent: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_endpoint", ["endpoint"])
    .index("by_babyId_and_endpoint", ["babyId", "endpoint"]),
  scheduledNotifications: defineTable({
    babyId: v.id("baby"), // Reference to the baby
    scheduledId: v.optional(v.id("_scheduled_functions")), // The Convex scheduler job ID (set after scheduling)
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("cancelled")), // Current status
    scheduledFor: v.number(), // Timestamp when notification will be sent
    notificationType: notifiableStatusValidator, // Type of notification
    customMessage: v.optional(v.union(v.string(), v.null())), // Optional custom message
    // Original photo; send prefers the update's 1350×675 push image when ready
    photoId: v.optional(v.union(v.id("_storage"), v.null())),
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
    userAgent: v.optional(v.string()), // User agent string
    locale: v.optional(v.string()), // Browser locale (e.g., "en-US")
    timezone: v.optional(v.string()), // Timezone (e.g., "America/New_York")
    // Soft delete: set to ms epoch when deleted; absent/null means active
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_babyId_and_createdAt", ["babyId", "createdAt"])
    .index("by_timelineItemId", ["timelineItemId"]),
  // Binding table for the per-baby feed: owns ordering (postedAt) and the kind
  // discriminator; children (updates/encouragements) point at it via timelineItemId.
  // postedAt is when the item entered the feed (announce/post time) — never the
  // retrofitted event clock. Milestone event times live on updates.occurredAt.
  timelineItems: defineTable({
    babyId: v.id("baby"),
    kind: v.union(v.literal("update"), v.literal("encouragement")),
    postedAt: v.number(), // ms epoch; feed sort key (when posted/announced)
    // Soft delete: set to ms epoch when deleted; absent/null means active
    deletedAt: v.optional(v.union(v.number(), v.null())),
  }).index("by_babyId_and_postedAt", ["babyId", "postedAt"]),
  // Owner-posted feed content: a message and/or a photo, optionally marking a
  // milestone. Each photo change is its own row, so old photos are never lost.
  updates: defineTable({
    babyId: v.id("baby"),
    timelineItemId: v.id("timelineItems"),
    message: v.optional(v.union(v.string(), v.null())),
    milestone: v.optional(
      v.union(
        v.literal("labor_started"),
        v.literal("gone_to_hospital"),
        v.literal("born"),
        v.null(),
      ),
    ),
    // When the milestone actually happened (ms). Display-only; does not affect
    // feed order. Null/absent for non-milestone updates.
    occurredAt: v.optional(v.union(v.number(), v.null())),
    photoId: v.optional(v.union(v.id("_storage"), v.null())),
    thumbnailId: v.optional(v.union(v.id("_storage"), v.null())),
    // Tiny JPEG data URL shown while the update photo loads
    blurDataUrl: v.optional(v.union(v.string(), v.null())),
    // 1350×675 JPEG for Chromium Notification.image (Android / Windows)
    pushImageId: v.optional(v.union(v.id("_storage"), v.null())),
    // Who posted this update. Optional until backfill makes it required.
    postedByUserId: v.optional(v.union(v.string(), v.null())),
    // Soft delete: set to ms epoch when deleted; absent/null means active
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
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_userId", ["userId"]),
  // Co-parents authorized to manage a baby page (not including the owner).
  babyCoParents: defineTable({
    babyId: v.id("baby"),
    userId: v.string(), // Better Auth user id
    tokenIdentifier: v.string(), // Stable Convex auth identity
    email: v.string(), // Denormalized for settings display
    name: v.optional(v.union(v.string(), v.null())),
    addedByUserId: v.string(),
    addedAt: v.number(),
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
    deletedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_babyId", ["babyId"])
    .index("by_email", ["email"])
    .index("by_babyId_and_email", ["babyId", "email"]),
});
