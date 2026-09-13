import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { createAuth } from "./auth";
import {
  DEMO_BABIES,
  DEMO_COPARENT_USER,
  DEMO_EMPTY_USER,
  DEMO_USER,
  MILO_LEGACY_PUBLIC_ID,
} from "../src/seedCredentials";
import { insertEncouragementTimelineItem, insertUpdateWithTimelineItem } from "./timeline";
import type { Milestone } from "../src/types";
import { tokenIdentifierForAuthUserId } from "./authIdentity";
import { clearUserOnboarding, skipUserOnboarding } from "./onboarding";
import { DEFAULT_TIME_ZONE } from "../src/timeZone";
import { isActive } from "./softDelete";
import { internalMutationWithTriggers } from "./triggers";

async function seedDemoDataHandler(ctx: MutationCtx) {
  const userId = await ensureAuthUser(ctx, DEMO_USER);
  await ensureDemoProfile(ctx, userId);

  // Demo login is for exploring the product — skip the first-run tour.
  await skipUserOnboarding(ctx, userId);

  const emptyUserId = await ensureAuthUser(ctx, DEMO_EMPTY_USER);
  // Re-seeding restores the first-run state; skipTourForExistingUsers ignores
  // this account when it grandfathers everyone else.
  await clearUserOnboarding(ctx, emptyUserId);

  const coParentUserId = await ensureAuthUser(ctx, DEMO_COPARENT_USER);
  await skipUserOnboarding(ctx, coParentUserId);

  const existingBabies = await ctx.db
    .query("baby")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);

  if (existingBabies.length > 0) {
    const now = new Date();
    const babiesByPublicId = new Map(existingBabies.map((baby) => [baby.publicId, baby]));
    for (const spec of SEED_BABIES) {
      const baby = babiesByPublicId.get(spec.publicId);
      if (baby) {
        if (baby.demo !== true) {
          await ctx.db.patch(baby._id, { demo: true });
        }
        await seedEncouragements({ babyId: baby._id, ctx, now, spec });
      }
    }
    await ensureMiloSeedExtras(ctx, {
      addedByUserId: userId,
      coParentUserId,
    });
    return {
      coParentUserEmail: DEMO_COPARENT_USER.email,
      coParentUserId,
      count: existingBabies.length,
      email: DEMO_USER.email,
      emptyUserEmail: DEMO_EMPTY_USER.email,
      emptyUserId,
      message: "Seed data already exists",
      success: true,
      userId,
    };
  }

  const babies = await seedBabiesForUser(ctx, userId);
  await ensureMiloSeedExtras(ctx, {
    addedByUserId: userId,
    coParentUserId,
  });

  return {
    babies,
    coParentUserEmail: DEMO_COPARENT_USER.email,
    coParentUserId,
    email: DEMO_USER.email,
    emptyUserEmail: DEMO_EMPTY_USER.email,
    emptyUserId,
    message: "Seed data created successfully",
    success: true,
    userId,
  };
}

async function ensureDemoProfile(ctx: MutationCtx, userId: string) {
  const tokenIdentifier = tokenIdentifierForAuthUserId(userId);
  const existing = await ctx.db
    .query("userProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!existing) {
    // Demo login is the preview/local staff account — mark as admin so
    // /dashboard/admin is available on staging without a separate promote step.
    await ctx.db.insert("userProfiles", {
      isAdmin: true,
      locale: "en-GB",
      timeZone: DEFAULT_TIME_ZONE,
      tokenIdentifier,
      userId,
    });
    return;
  }
  await ctx.db.patch(existing._id, {
    isAdmin: true,
    timeZone: existing.timeZone ?? DEFAULT_TIME_ZONE,
    tokenIdentifier,
  });
}

/**
 * Idempotent seeder for local development and Vercel preview deployments.
 * Creates DEMO_USER (test@example.com / password) with babies in every status,
 * DEMO_EMPTY_USER (test+newuser@example.com / password) with no babies and
 * onboarding left unset so the first-run tour still appears, and
 * DEMO_COPARENT_USER (test+coparent@example.com / password) as a co-parent on
 * Milo (`baby-born`).
 *
 * Preview deploys run this via `--preview-run`; local setup runs `pnpm seed`.
 */
export const seedDemoData = internalMutationWithTriggers({
  args: {},
  handler: seedDemoDataHandler,
});

/** Alias kept so older `--preview-run seed:seedPreviewData` refs keep working. */
export const seedPreviewData = internalMutationWithTriggers({
  args: {},
  handler: seedDemoDataHandler,
});

async function ensureAuthUser(
  ctx: MutationCtx,
  user: { email: string; name: string; password: string },
) {
  const existing = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: user.email }],
  });

  if (existing) {
    return String(existing._id);
  }

  const auth = createAuth(ctx);
  const result = await auth.api.signUpEmail({
    body: {
      email: user.email,
      name: user.name,
      password: user.password,
    },
  });

  return result.user.id;
}

/** Co-parent + `/baby/milo` → `baby-born` history redirect for the born demo baby. */
async function ensureMiloSeedExtras(
  ctx: MutationCtx,
  opts: { addedByUserId: string; coParentUserId: string },
) {
  const milo = await ctx.db
    .query("baby")
    .withIndex("by_publicId", (q) => q.eq("publicId", "baby-born"))
    .unique();
  if (!milo || !isActive(milo)) {
    return;
  }

  await ensureMiloLegacyPublicId(ctx, milo._id);
  await ensureMiloCoParent(ctx, {
    addedByUserId: opts.addedByUserId,
    babyId: milo._id,
    coParentUserId: opts.coParentUserId,
  });
}

/** `/baby/milo` looks up history and the route redirects to `/baby/baby-born`. */
async function ensureMiloLegacyPublicId(ctx: MutationCtx, babyId: Id<"baby">) {
  const existing = await ctx.db
    .query("babyPublicIdHistory")
    .withIndex("by_publicId", (q) => q.eq("publicId", MILO_LEGACY_PUBLIC_ID))
    .order("desc")
    .first();
  if (existing?.babyId === babyId) {
    return;
  }
  if (existing) {
    await ctx.db.delete(existing._id);
  }
  await ctx.db.insert("babyPublicIdHistory", {
    babyId,
    publicId: MILO_LEGACY_PUBLIC_ID,
  });
}

async function ensureMiloCoParent(
  ctx: MutationCtx,
  opts: { addedByUserId: string; babyId: Id<"baby">; coParentUserId: string },
) {
  const tokenIdentifier = tokenIdentifierForAuthUserId(opts.coParentUserId);
  const existing = await ctx.db
    .query("babyCoParents")
    .withIndex("by_babyId_and_tokenIdentifier", (q) =>
      q.eq("babyId", opts.babyId).eq("tokenIdentifier", tokenIdentifier),
    )
    .order("desc")
    .take(32);
  if (existing.some(isActive)) {
    return;
  }

  await ctx.db.insert("babyCoParents", {
    addedAt: Date.now(),
    addedByUserId: opts.addedByUserId,
    babyId: opts.babyId,
    email: DEMO_COPARENT_USER.email,
    name: DEMO_COPARENT_USER.name,
    tokenIdentifier,
    userId: opts.coParentUserId,
  });
}

type SeedBabyExtras = {
  babyBornMessage?: string;
  dueDateOffsetDays: number;
  encouragements?: Array<{
    authorName: string;
    message: string;
    minutesAgo: number;
  }>;
  hospitalMessage?: string;
  hoursAgo?: {
    babyBorn?: number;
    laborStarted?: number;
    wentToHospital?: number;
  };
  laborStartedMessage?: string;
};

type SeedBabySpec = (typeof DEMO_BABIES)[number] & SeedBabyExtras;

/** Fixture details keyed by publicId — identity fields come from DEMO_BABIES. */
const SEED_BABY_EXTRAS = {
  "baby-at-hospital": {
    dueDateOffsetDays: 1,
    encouragements: [
      {
        authorName: "Sister Sam",
        message: "So exciting!! Love you both.",
        minutesAgo: 60,
      },
    ],
    hospitalMessage: "Checked in and getting comfy.",
    hoursAgo: { laborStarted: 8, wentToHospital: 3 },
    laborStartedMessage: "Contractions got serious. Heading in!",
  },
  "baby-born": {
    babyBornMessage: "Baby's here! Everyone's healthy and doing brilliantly.",
    dueDateOffsetDays: -2,
    encouragements: [
      {
        authorName: "Cousin Pat",
        message: "Congratulations!!! Can't wait to visit.",
        minutesAgo: 60 * 6,
      },
      {
        authorName: "Neighbour Jo",
        message: "Best news ever. Rest up!",
        minutesAgo: 60 * 2,
      },
      {
        authorName: "NoSpacesAuthorNameAtMaximumLength123456789012345",
        message: "W".repeat(240),
        minutesAgo: 110,
      },
      {
        authorName: "Link Tester",
        message: `A deliberately long link: https://layout-stress.example/${"deep-path/".repeat(30)}`,
        minutesAgo: 100,
      },
      {
        authorName: "Emoji Parade",
        message: `Welcome, baby! ${"👶🏽🎉🍼".repeat(30)}`,
        minutesAgo: 90,
      },
      {
        authorName: "Excited Cousins",
        message: `**${"WELCOME".repeat(40)}**`,
        minutesAgo: 80,
      },
      {
        authorName: "Code Block Friend",
        message: `\`${"CONGRATULATIONS".repeat(24)}\``,
        minutesAgo: 70,
      },
      {
        authorName: "Very Online Aunt",
        message: `#baby #welcome #soexcited ${"#cantwaittomeetyou".repeat(20)}`,
        minutesAgo: 60,
      },
      {
        authorName: "Multilingual Family",
        message: "Välkommen—Bienvenida—Bem-vinda—Welcome—".repeat(16),
        minutesAgo: 50,
      },
      {
        authorName: "Caps Lock Grandpa",
        message: "THIS IS THE BEST NEWS EVER!!! ".repeat(20),
        minutesAgo: 40,
      },
    ],
    hospitalMessage: "At hospital. Let's do this.",
    hoursAgo: { babyBorn: 12, laborStarted: 30, wentToHospital: 24 },
    laborStartedMessage: "Here we go!",
  },
  "baby-in-labor": {
    dueDateOffsetDays: 3,
    encouragements: [
      {
        authorName: "Aunt Meg",
        message: "Good luck!! You've got this ❤️",
        minutesAgo: 90,
      },
      {
        authorName: "Grandpa Jim",
        message: "Thinking of you all. Keep us posted!",
        minutesAgo: 45,
      },
    ],
    hoursAgo: { laborStarted: 2 },
    laborStartedMessage: "It's happening! Bags are packed and we're timing contractions.",
  },
  "baby-waiting": {
    dueDateOffsetDays: 14,
    encouragements: [
      {
        authorName: "Grandma",
        message: "We can't wait to meet you, little one!",
        minutesAgo: 60 * 26,
      },
      {
        authorName: "Uncle Bob",
        message: "Any day now! Sending love.",
        minutesAgo: 60 * 3,
      },
    ],
  },
} satisfies Record<(typeof DEMO_BABIES)[number]["publicId"], SeedBabyExtras>;

const SEED_BABIES: Array<SeedBabySpec> = DEMO_BABIES.map((baby) => ({
  ...baby,
  ...SEED_BABY_EXTRAS[baby.publicId],
}));

/**
 * Inserts the demo babies (and their timeline/encouragement fixtures) for a user.
 * Exported for tests that supply their own userId without Better Auth.
 */
export async function seedBabiesForUser(ctx: MutationCtx, userId: string) {
  const ownerTokenIdentifier = tokenIdentifierForAuthUserId(userId);
  const now = new Date();
  const created: Array<{
    id: Id<"baby">;
    name: string;
    publicId: string;
    state: SeedBabySpec["state"];
  }> = [];

  for (const spec of SEED_BABIES) {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + spec.dueDateOffsetDays);

    const laborStarted = hoursAgoIso(now, spec.hoursAgo?.laborStarted);
    const wentToHospital = hoursAgoIso(now, spec.hoursAgo?.wentToHospital);
    const babyBorn = hoursAgoIso(now, spec.hoursAgo?.babyBorn);

    // Fixture messages live only on the timeline rows via seedMilestoneUpdates.
    const babyId = await ctx.db.insert("baby", {
      birthJourney: "labor",
      demo: true,
      dueDate: dueDate.toISOString(),
      dueDateDisplayMode: "exact",
      lastActivityAt: now.getTime(),
      name: spec.name,
      ownerTokenIdentifier,
      publicDueDateText: null,
      publicId: spec.publicId,
      subscriptionCount: 0,
      theme: null,
      userId,
    });

    await seedMilestoneUpdates(ctx, {
      babyBorn,
      babyBornMessage: spec.babyBornMessage ?? null,
      babyId,
      hospitalMessage: spec.hospitalMessage ?? null,
      laborStarted,
      laborStartedMessage: spec.laborStartedMessage ?? null,
      wentToHospital,
    });

    await seedEncouragements({ babyId, ctx, now, spec });

    created.push({
      id: babyId,
      name: spec.name,
      publicId: spec.publicId,
      state: spec.state,
    });
  }

  return created;
}

async function seedEncouragements(options: {
  babyId: Id<"baby">;
  ctx: MutationCtx;
  now: Date;
  spec: SeedBabySpec;
}) {
  const existing = await options.ctx.db
    .query("encouragements")
    .withIndex("by_babyId", (q) => q.eq("babyId", options.babyId))
    .take(100);
  const existingVisitorIds = new Set(existing.map((encouragement) => encouragement.visitorId));

  for (const encouragement of options.spec.encouragements ?? []) {
    const visitorId = `seed-visitor-${encouragement.authorName.toLowerCase().replaceAll(/\s+/g, "-")}`;
    if (existingVisitorIds.has(visitorId)) {
      continue;
    }

    const createdAt = options.now.getTime() - encouragement.minutesAgo * 60_000;
    const timelineItemId = await insertEncouragementTimelineItem(options.ctx, {
      babyId: options.babyId,
      postedAt: createdAt,
    });
    await options.ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId },
      authorName: encouragement.authorName,
      babyId: options.babyId,
      createdAt,
      message: encouragement.message,
      timelineItemId,
      visitorId,
    });
  }
}

function hoursAgoIso(now: Date, hoursAgo: number | undefined) {
  if (hoursAgo === undefined) {
    return null;
  }
  const date = new Date(now);
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
}

async function seedMilestoneUpdates(
  ctx: MutationCtx,
  opts: {
    babyBorn: string | null;
    babyBornMessage: string | null;
    babyId: Id<"baby">;
    hospitalMessage: string | null;
    laborStarted: string | null;
    laborStartedMessage: string | null;
    wentToHospital: string | null;
  },
) {
  const milestones: Array<{
    iso: string | null;
    message: string | null;
    milestone: Milestone;
  }> = [
    {
      iso: opts.laborStarted,
      message: opts.laborStartedMessage,
      milestone: "labor_started",
    },
    {
      iso: opts.wentToHospital,
      message: opts.hospitalMessage,
      milestone: "gone_to_hospital",
    },
    {
      iso: opts.babyBorn,
      message: opts.babyBornMessage,
      milestone: "born",
    },
  ];

  for (const entry of milestones) {
    if (!entry.iso) {
      continue;
    }
    const occurredAt = Date.parse(entry.iso);
    await insertUpdateWithTimelineItem(ctx, {
      babyId: opts.babyId,
      message: entry.message,
      milestone: entry.milestone,
      occurredAt,
      postedAt: occurredAt,
    });
  }
}
