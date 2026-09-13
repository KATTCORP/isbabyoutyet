import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { createAuth } from "./auth";
import { DEMO_BABIES, DEMO_EMPTY_USER, DEMO_USER } from "../src/seedCredentials";
import { insertEncouragementTimelineItem, insertUpdateWithTimelineItem } from "./timeline";
import type { Milestone } from "../src/types";
import { tokenIdentifierForAuthUserId } from "./authIdentity";
import { clearUserOnboarding, skipUserOnboarding } from "./onboarding";

async function seedDemoDataHandler(ctx: MutationCtx) {
  const userId = await ensureAuthUser(ctx, DEMO_USER);
  await ensureDemoProfile(ctx, userId);

  // Demo login is for exploring the product — skip the first-run tour.
  await skipUserOnboarding(ctx, userId);

  const emptyUserId = await ensureAuthUser(ctx, DEMO_EMPTY_USER);
  // Re-seeding restores the first-run state; skipTourForExistingUsers ignores
  // this account when it grandfathers everyone else.
  await clearUserOnboarding(ctx, emptyUserId);

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
        await seedEncouragements({ ctx, babyId: baby._id, now, spec });
      }
    }
    return {
      success: true,
      message: "Seed data already exists",
      userId,
      email: DEMO_USER.email,
      count: existingBabies.length,
      emptyUserId,
      emptyUserEmail: DEMO_EMPTY_USER.email,
    };
  }

  const babies = await seedBabiesForUser(ctx, userId);

  return {
    success: true,
    message: "Seed data created successfully",
    userId,
    email: DEMO_USER.email,
    babies,
    emptyUserId,
    emptyUserEmail: DEMO_EMPTY_USER.email,
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
      userId,
      tokenIdentifier,
      locale: "en-GB",
      isAdmin: true,
    });
    return;
  }
  await ctx.db.patch(existing._id, { tokenIdentifier, isAdmin: true });
}

/**
 * Idempotent seeder for local development and Vercel preview deployments.
 * Creates DEMO_USER (test@example.com / password) with babies in every status,
 * plus DEMO_EMPTY_USER (test+newuser@example.com / password) with no babies
 * and onboarding left unset so the first-run tour still appears.
 *
 * Preview deploys run this via `--preview-run`; local setup runs `pnpm seed`.
 */
export const seedDemoData = internalMutation({
  args: {},
  handler: seedDemoDataHandler,
});

/** Alias kept so older `--preview-run seed:seedPreviewData` refs keep working. */
export const seedPreviewData = internalMutation({
  args: {},
  handler: seedDemoDataHandler,
});

async function ensureAuthUser(
  ctx: MutationCtx,
  user: { email: string; password: string; name: string },
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
      password: user.password,
      name: user.name,
    },
  });

  return result.user.id;
}

type SeedBabyExtras = {
  dueDateOffsetDays: number;
  laborStartedMessage?: string;
  hospitalMessage?: string;
  babyBornMessage?: string;
  hoursAgo?: {
    laborStarted?: number;
    wentToHospital?: number;
    babyBorn?: number;
  };
  encouragements?: Array<{
    authorName: string;
    message: string;
    minutesAgo: number;
  }>;
};

type SeedBabySpec = (typeof DEMO_BABIES)[number] & SeedBabyExtras;

/** Fixture details keyed by publicId — identity fields come from DEMO_BABIES. */
const SEED_BABY_EXTRAS: Record<(typeof DEMO_BABIES)[number]["publicId"], SeedBabyExtras> = {
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
  "baby-in-labor": {
    dueDateOffsetDays: 3,
    laborStartedMessage: "It's happening! Bags are packed and we're timing contractions.",
    hoursAgo: { laborStarted: 2 },
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
  },
  "baby-at-hospital": {
    dueDateOffsetDays: 1,
    laborStartedMessage: "Contractions got serious. Heading in!",
    hospitalMessage: "Checked in and getting comfy.",
    hoursAgo: { laborStarted: 8, wentToHospital: 3 },
    encouragements: [
      {
        authorName: "Sister Sam",
        message: "So exciting!! Love you both.",
        minutesAgo: 60,
      },
    ],
  },
  "baby-born": {
    dueDateOffsetDays: -2,
    laborStartedMessage: "Here we go!",
    hospitalMessage: "At hospital. Let's do this.",
    babyBornMessage: "Baby's here! Everyone's healthy and doing brilliantly.",
    hoursAgo: { laborStarted: 30, wentToHospital: 24, babyBorn: 12 },
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
  },
};

const SEED_BABIES: SeedBabySpec[] = DEMO_BABIES.map((baby) => ({
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
    state: SeedBabySpec["state"];
    publicId: string;
  }> = [];

  for (const spec of SEED_BABIES) {
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + spec.dueDateOffsetDays);

    const laborStarted = hoursAgoIso(now, spec.hoursAgo?.laborStarted);
    const wentToHospital = hoursAgoIso(now, spec.hoursAgo?.wentToHospital);
    const babyBorn = hoursAgoIso(now, spec.hoursAgo?.babyBorn);

    // Fixture messages live only on the timeline rows via seedMilestoneUpdates.
    const babyId = await ctx.db.insert("baby", {
      userId,
      ownerTokenIdentifier,
      name: spec.name,
      dueDate: dueDate.toISOString(),
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: spec.publicId,
      birthJourney: "labor",
      theme: null,
      encouragementsDisabled: false,
      demo: true,
      subscriptionCount: 0,
      lastActivityAt: now.getTime(),
    });

    await seedMilestoneUpdates(ctx, {
      babyId,
      laborStarted,
      wentToHospital,
      babyBorn,
      laborStartedMessage: spec.laborStartedMessage ?? null,
      hospitalMessage: spec.hospitalMessage ?? null,
      babyBornMessage: spec.babyBornMessage ?? null,
    });

    await seedEncouragements({ ctx, babyId, now, spec });

    created.push({
      id: babyId,
      name: spec.name,
      state: spec.state,
      publicId: spec.publicId,
    });
  }

  return created;
}

async function seedEncouragements(options: {
  ctx: MutationCtx;
  babyId: Id<"baby">;
  now: Date;
  spec: SeedBabySpec;
}) {
  const existing = await options.ctx.db
    .query("encouragements")
    .withIndex("by_babyId", (q) => q.eq("babyId", options.babyId))
    .take(100);
  const existingVisitorIds = new Set(existing.map((encouragement) => encouragement.visitorId));

  for (const encouragement of options.spec.encouragements ?? []) {
    const visitorId = `seed-visitor-${encouragement.authorName.toLowerCase().replace(/\s+/g, "-")}`;
    if (existingVisitorIds.has(visitorId)) continue;

    const createdAt = options.now.getTime() - encouragement.minutesAgo * 60_000;
    const timelineItemId = await insertEncouragementTimelineItem(options.ctx, {
      babyId: options.babyId,
      postedAt: createdAt,
    });
    await options.ctx.db.insert("encouragements", {
      babyId: options.babyId,
      authorName: encouragement.authorName,
      message: encouragement.message,
      createdAt,
      timelineItemId,
      visitorId,
    });
  }
}

function hoursAgoIso(now: Date, hoursAgo: number | undefined) {
  if (hoursAgo === undefined) return null;
  const date = new Date(now);
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
}

async function seedMilestoneUpdates(
  ctx: MutationCtx,
  opts: {
    babyId: Id<"baby">;
    laborStarted: string | null;
    wentToHospital: string | null;
    babyBorn: string | null;
    laborStartedMessage: string | null;
    hospitalMessage: string | null;
    babyBornMessage: string | null;
  },
) {
  const milestones: Array<{
    milestone: Milestone;
    iso: string | null;
    message: string | null;
  }> = [
    {
      milestone: "labor_started",
      iso: opts.laborStarted,
      message: opts.laborStartedMessage,
    },
    {
      milestone: "gone_to_hospital",
      iso: opts.wentToHospital,
      message: opts.hospitalMessage,
    },
    {
      milestone: "born",
      iso: opts.babyBorn,
      message: opts.babyBornMessage,
    },
  ];

  for (const entry of milestones) {
    if (!entry.iso) continue;
    const occurredAt = Date.parse(entry.iso);
    await insertUpdateWithTimelineItem(ctx, {
      babyId: opts.babyId,
      postedAt: occurredAt,
      occurredAt,
      milestone: entry.milestone,
      message: entry.message,
    });
  }
}
