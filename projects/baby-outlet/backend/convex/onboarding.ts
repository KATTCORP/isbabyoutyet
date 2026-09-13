import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ONBOARDING_STEP_IDS } from "../src/onboardingSteps";
import type { AppIdentity } from "./authIdentity";
import { appIdentity, tokenIdentifierForAuthUserId } from "./authIdentity";
import { isActive } from "./softDelete";
import { onboardingStepIdValidator } from "./onboardingValidators";

const emptyState = {
  welcomeDismissed: false,
  checklistDismissed: false,
  minimized: false,
  completedSteps: [] as string[],
  hasBaby: false,
  hasUpdate: false,
  effectiveSteps: [] as string[],
  allDone: false,
  tourBaby: null as null | { publicId: string; name: string },
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
    userId: identity.authUserId,
    tokenIdentifier: identity.tokenIdentifier,
    completedSteps: [],
    welcomeDismissed: false,
    checklistDismissed: false,
    minimized: false,
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
  tourBaby: null | { publicId: string; name: string };
  encouragementsDisabled: boolean;
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
  const tourBaby = first ? { publicId: first.publicId, name: first.name } : null;
  const encouragementsDisabled = first?.encouragementsDisabled === true;

  if (babies.length === 0) {
    return { hasBaby: false, hasUpdate: false, tourBaby, encouragementsDisabled };
  }

  for (const baby of babies) {
    const update = await ctx.db
      .query("updates")
      .withIndex("by_babyId", (q) => q.eq("babyId", baby._id))
      .first();
    if (update && isActive(update)) {
      return { hasBaby: true, hasUpdate: true, tourBaby, encouragementsDisabled };
    }
  }

  return { hasBaby: true, hasUpdate: false, tourBaby, encouragementsDisabled };
}

function mergeEffectiveSteps(opts: {
  completedSteps: string[];
  hasBaby: boolean;
  hasUpdate: boolean;
  encouragementsDisabled: boolean;
}) {
  const set = new Set(opts.completedSteps);
  if (opts.hasBaby) {
    set.add("add_baby");
  }
  if (opts.hasUpdate) {
    set.add("post_update");
  }
  if (opts.encouragementsDisabled) {
    set.add("learn_encouragements");
  }
  return ONBOARDING_STEP_IDS.filter((id) => set.has(id));
}

function toClientState(doc: Doc<"userOnboarding"> | null, auto: AutoProgress) {
  const completedSteps = doc?.completedSteps ?? [];
  const effectiveSteps = mergeEffectiveSteps({
    completedSteps,
    hasBaby: auto.hasBaby,
    hasUpdate: auto.hasUpdate,
    encouragementsDisabled: auto.encouragementsDisabled,
  });
  return {
    welcomeDismissed: doc?.welcomeDismissed ?? false,
    checklistDismissed: doc?.checklistDismissed ?? false,
    minimized: doc?.minimized ?? false,
    completedSteps,
    hasBaby: auto.hasBaby,
    hasUpdate: auto.hasUpdate,
    effectiveSteps,
    allDone: effectiveSteps.length >= ONBOARDING_STEP_IDS.length,
    tourBaby: auto.tourBaby,
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

export const dismissChecklist = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireUserId(ctx);
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const doc = await getOrCreateOnboarding(ctx, identity);
    await ctx.db.patch(doc._id, {
      checklistDismissed: true,
      welcomeDismissed: true,
      minimized: true,
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
    await ctx.db.patch(doc._id, {
      completedSteps: [...doc.completedSteps, args.stepId],
      welcomeDismissed: true,
    });
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
      welcomeDismissed: auto.hasBaby,
      checklistDismissed: false,
      minimized: false,
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
    completedSteps: [...ONBOARDING_STEP_IDS],
    welcomeDismissed: true,
    checklistDismissed: true,
    minimized: true,
  };

  if (existing) {
    await ctx.db.patch(existing._id, { ...patch, tokenIdentifier });
    return existing._id;
  }

  return await ctx.db.insert("userOnboarding", {
    userId,
    tokenIdentifier,
    ...patch,
  });
}
