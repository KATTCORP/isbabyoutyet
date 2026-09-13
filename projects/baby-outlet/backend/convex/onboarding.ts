import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ONBOARDING_STEP_IDS } from "../src/onboardingSteps";
import type { AppIdentity } from "./authIdentity";
import { appIdentity, tokenIdentifierForAuthUserId } from "./authIdentity";
import { isActive } from "./softDelete";
import { onboardingStepIdValidator } from "./onboardingValidators";

type OnboardingClientState = Omit<
  ReturnType<typeof toClientState>,
  "completedSteps" | "effectiveSteps"
> & {
  completedSteps: Array<string>;
  effectiveSteps: Array<string>;
};

const emptyState: OnboardingClientState = {
  activeCoachmarkStepId: null,
  allDone: false,
  checklistDismissed: false,
  completedSteps: [],
  effectiveSteps: [],
  hasBaby: false,
  hasUpdate: false,
  minimized: false,
  restartHintVisible: false,
  tourBaby: null,
  welcomeDismissed: false,
};

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  return appIdentity(identity);
}

async function getOrCreateOnboarding(ctx: MutationCtx, identity: AppIdentity) {
  const existing = await ctx.db
    .query("userOnboarding")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (existing) {
    return existing;
  }
  const id = await ctx.db.insert("userOnboarding", {
    checklistDismissed: false,
    completedSteps: [],
    minimized: false,
    tokenIdentifier: identity.tokenIdentifier,
    userId: identity.authUserId,
    welcomeDismissed: false,
  });
  const doc = await ctx.db.get(id);
  if (!doc) {
    throw new Error("Failed to create onboarding row");
  }
  return doc;
}

type AutoProgress = {
  hasBaby: boolean;
  hasUpdate: boolean;
  tourBaby: null | { name: string; publicId: string };
};

async function computeAutoProgress(ctx: QueryCtx | MutationCtx, identity: AppIdentity) {
  const babies = (
    await ctx.db
      .query("baby")
      .withIndex("by_ownerTokenIdentifier", (q) =>
        q.eq("ownerTokenIdentifier", identity.tokenIdentifier),
      )
      .order("asc")
      .take(40)
  ).filter(isActive);

  const first = babies[0];
  const tourBaby = first ? { name: first.name, publicId: first.publicId } : null;

  if (babies.length === 0) {
    return { hasBaby: false, hasUpdate: false, tourBaby };
  }

  for (const baby of babies) {
    const update = await ctx.db
      .query("updates")
      .withIndex("by_babyId", (q) => q.eq("babyId", baby._id))
      .first();
    if (update && isActive(update)) {
      return { hasBaby: true, hasUpdate: true, tourBaby };
    }
  }

  return { hasBaby: true, hasUpdate: false, tourBaby };
}

function mergeEffectiveSteps(opts: {
  completedSteps: Array<string>;
  hasBaby: boolean;
  hasUpdate: boolean;
}) {
  const set = new Set(opts.completedSteps);
  if (opts.hasBaby) {
    set.add("add_baby");
  }
  if (opts.hasUpdate) {
    set.add("post_update");
  }
  return ONBOARDING_STEP_IDS.filter((id) => set.has(id));
}

function toClientState(doc: Doc<"userOnboarding"> | null, auto: AutoProgress) {
  const completedSteps = doc?.completedSteps ?? [];
  const effectiveSteps = mergeEffectiveSteps({
    completedSteps,
    hasBaby: auto.hasBaby,
    hasUpdate: auto.hasUpdate,
  });
  return {
    activeCoachmarkStepId: doc?.activeCoachmarkStepId ?? null,
    allDone: effectiveSteps.length >= ONBOARDING_STEP_IDS.length,
    checklistDismissed: doc?.checklistDismissed ?? false,
    completedSteps,
    effectiveSteps,
    hasBaby: auto.hasBaby,
    hasUpdate: auto.hasUpdate,
    minimized: doc?.minimized ?? false,
    restartHintVisible: doc?.restartHintVisible ?? false,
    tourBaby: auto.tourBaby,
    welcomeDismissed: doc?.welcomeDismissed ?? false,
  };
}

/** Current user's onboarding progress (null identity → empty defaults). */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      return emptyState;
    }

    const doc = await ctx.db
      .query("userOnboarding")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const auto = await computeAutoProgress(ctx, identity);
    return toClientState(doc, auto);
  },
});

export const dismissWelcome = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    await ctx.db.patch(doc._id, { welcomeDismissed: true });
    return null;
  },
});

export const setMinimized = mutation({
  args: { minimized: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    await ctx.db.patch(doc._id, { minimized: args.minimized });
    return null;
  },
});

export const setActiveCoachmarkStepId = mutation({
  args: { stepId: v.union(onboardingStepIdValidator, v.null()) },
  handler: async (ctx, args) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    await ctx.db.patch(doc._id, { activeCoachmarkStepId: args.stepId });
    return null;
  },
});

export const setRestartHintVisible = mutation({
  args: { visible: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    await ctx.db.patch(doc._id, { restartHintVisible: args.visible });
    return null;
  },
});

export const dismissChecklist = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    await ctx.db.patch(doc._id, {
      activeCoachmarkStepId: null,
      checklistDismissed: true,
      minimized: true,
      welcomeDismissed: true,
    });
    return null;
  },
});

export const completeStep = mutation({
  args: { stepId: onboardingStepIdValidator },
  handler: async (ctx, args) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    if (doc.completedSteps.includes(args.stepId)) {
      return null;
    }
    const onboardingPatch = {
      completedSteps: [...doc.completedSteps, args.stepId],
      welcomeDismissed: true,
    };
    await ctx.db.patch(
      doc._id,
      doc.activeCoachmarkStepId === args.stepId
        ? { ...onboardingPatch, activeCoachmarkStepId: null }
        : onboardingPatch,
    );
    return null;
  },
});

/** Re-open the tour (welcome + checklist) for users who dismissed it. */
export const restart = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    const auto = await computeAutoProgress(ctx, identity);
    await ctx.db.patch(doc._id, {
      // Replay the welcome carousel only if they still have no baby
      activeCoachmarkStepId: null,
      checklistDismissed: false,
      minimized: false,
      restartHintVisible: false,
      welcomeDismissed: auto.hasBaby,
    });
    return null;
  },
});

/**
 * Sentinel `userOnboarding.userId` written when skipTourForExistingUsers
 * finishes. Re-runs of the migration (every deploy's `runAll`) no-op once
 * this row exists, so users who sign up later still get the first-run tour.
 */
export const SKIP_TOUR_FOR_EXISTING_USERS_SENTINEL = "migration:skipTourForExistingUsers";

/** Deletes any `userOnboarding` row so the first-run tour shows again. */
export async function clearUserOnboarding(ctx: MutationCtx, userId: string) {
  const existing = await ctx.db
    .query("userOnboarding")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

/** Skips the first-run tour while preserving the normal per-step model. */
export async function skipUserOnboarding(ctx: MutationCtx, userId: string) {
  const tokenIdentifier = tokenIdentifierForAuthUserId(userId);
  const existing = await ctx.db
    .query("userOnboarding")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  const patch = {
    activeCoachmarkStepId: null,
    checklistDismissed: true,
    completedSteps: [...ONBOARDING_STEP_IDS],
    minimized: true,
    restartHintVisible: false,
    welcomeDismissed: true,
  };

  if (existing) {
    await ctx.db.patch(existing._id, { ...patch, tokenIdentifier });
    return existing._id;
  }

  return await ctx.db.insert("userOnboarding", {
    tokenIdentifier,
    userId,
    ...patch,
  });
}
