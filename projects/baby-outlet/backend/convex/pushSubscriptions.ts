import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { findBabyManager } from "./babyAccess";
import { FORBIDDEN } from "../src/types";
import { requiredEnv } from "./requiredEnv";
import schema from "./schema";
import { isActive } from "./softDelete";

async function deleteSubscription(ctx: MutationCtx, subscription: Doc<"pushSubscriptions">) {
  await ctx.db.delete(subscription._id);
  const baby = await ctx.db.get(subscription.babyId);
  if (baby) {
    await ctx.db.patch(baby._id, {
      subscriptionCount: Math.max(0, (baby.subscriptionCount ?? 0) - 1),
    });
  }
}

async function deleteByEndpoint(ctx: MutationCtx, endpoint: string) {
  for await (const subscription of ctx.db
    .query("pushSubscriptions")
    .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))) {
    await deleteSubscription(ctx, subscription);
  }
}

export const subscribe = mutation({
  args: {
    babyId: v.id("baby"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, args) => {
    const baby = await ctx.db.get(args.babyId);
    if (!baby || !isActive(baby)) {
      throw new Error("Baby not found");
    }

    // Check if subscription already exists for this babyId and endpoint
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_babyId_and_endpoint", (q) =>
        q.eq("babyId", args.babyId).eq("endpoint", args.endpoint),
      )
      .first();

    if (existing) {
      // Update existing subscription
      await ctx.db.patch(existing._id, {
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
      });
      return existing._id;
    }

    // Create new subscription
    const subscriptionId = await ctx.db.insert("pushSubscriptions", {
      babyId: args.babyId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      createdAt: Date.now(),
      userAgent: args.userAgent,
    });
    await ctx.db.patch(args.babyId, {
      subscriptionCount: (baby.subscriptionCount ?? 0) + 1,
    });

    return subscriptionId;
  },
});

export const unsubscribe = mutation({
  args: {
    babyId: v.id("baby"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_babyId_and_endpoint", (q) =>
        q.eq("babyId", args.babyId).eq("endpoint", args.endpoint),
      )
      .first();
    if (subscription && subscription.p256dh === args.p256dh && subscription.auth === args.auth) {
      await deleteSubscription(ctx, subscription);
    }
  },
});

export const removeByEndpoint = internalMutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    await deleteByEndpoint(ctx, args.endpoint);
  },
});

export const getSubscriptionsPage = internalQuery({
  args: {
    babyId: v.id("baby"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("pushSubscriptions")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_babyId", (q) => q.eq("babyId", args.babyId))
      .paginate(args.paginationOpts);
  },
});

export const getSubscriptionCount = query({
  args: {
    babyId: v.id("baby"),
  },
  returns: v.union(v.number(), v.literal(FORBIDDEN)),
  handler: async (ctx, args) => {
    // Sentinel instead of throwing: the baby route loader queries this for
    // every visitor.
    const access = await findBabyManager(ctx, args.babyId);
    if (!access) {
      return FORBIDDEN;
    }
    return access.baby.subscriptionCount ?? 0;
  },
});

export const getPublicKey = query({
  args: {},
  handler: async () => {
    // VAPID public key is safe to expose to clients
    return requiredEnv("VAPID_PUBLIC_KEY", env.VAPID_PUBLIC_KEY);
  },
});

export const isSubscribed = query({
  args: {
    babyId: v.id("baby"),
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_babyId_and_endpoint", (q) =>
        q.eq("babyId", args.babyId).eq("endpoint", args.endpoint),
      )
      .first();

    return subscription !== null;
  },
});
