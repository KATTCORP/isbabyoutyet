import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { findBabyManager, requireBabyManager } from "./babyAccess";
import { babyIdOrPublicIdValidator, findBabyByIdOrPublicId } from "./babyLookup";
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
  for await (const subscription of ctx.db
    .query("ownerPushSubscriptions")
    .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))) {
    await ctx.db.delete(subscription._id);
  }
}

export async function deleteOwnerSubscriptionsForIdentity(
  ctx: MutationCtx,
  opts: { babyId: Id<"baby">; tokenIdentifier: string },
) {
  for await (const subscription of ctx.db
    .query("ownerPushSubscriptions")
    .withIndex("by_babyId_and_tokenIdentifier", (q) =>
      q.eq("babyId", opts.babyId).eq("tokenIdentifier", opts.tokenIdentifier),
    )) {
    await ctx.db.delete(subscription._id);
  }
}

export const subscribe = mutation({
  args: {
    auth: v.string(),
    babyId: v.id("baby"),
    endpoint: v.string(),
    p256dh: v.string(),
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
        auth: args.auth,
        p256dh: args.p256dh,
        userAgent: args.userAgent,
      });
      return existing._id;
    }

    // Create new subscription
    const subscriptionId = await ctx.db.insert("pushSubscriptions", {
      auth: args.auth,
      babyId: args.babyId,
      createdAt: Date.now(),
      endpoint: args.endpoint,
      p256dh: args.p256dh,
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
    auth: v.string(),
    babyId: v.id("baby"),
    endpoint: v.string(),
    p256dh: v.string(),
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
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_babyId", (q) => q.eq("babyId", args.babyId))
      .paginate(args.paginationOpts);
  },
  returns: paginationResultValidator(schema.doc("pushSubscriptions")),
});

export const getSubscriptionCount = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
  },
  handler: async (ctx, args) => {
    // Sentinel instead of throwing: the baby route loader queries this for
    // every visitor.
    const access = await findBabyManager(ctx, args.babyId);
    if (!access) {
      return FORBIDDEN;
    }
    return access.baby.subscriptionCount ?? 0;
  },
  returns: v.union(v.number(), v.literal(FORBIDDEN)),
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
    babyId: babyIdOrPublicIdValidator,
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const baby = await findBabyByIdOrPublicId(ctx.db, args.babyId);
    if (!baby) {
      return false;
    }

    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_babyId_and_endpoint", (q) =>
        q.eq("babyId", baby._id).eq("endpoint", args.endpoint),
      )
      .first();

    return subscription !== null;
  },
});

export const subscribeAsOwner = mutation({
  args: {
    auth: v.string(),
    babyId: v.id("baby"),
    endpoint: v.string(),
    p256dh: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, args) => {
    const { baby, identity } = await requireBabyManager(ctx, args.babyId);

    const existing = await ctx.db
      .query("ownerPushSubscriptions")
      .withIndex("by_babyId_and_endpoint", (q) =>
        q.eq("babyId", baby._id).eq("endpoint", args.endpoint),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        auth: args.auth,
        p256dh: args.p256dh,
        tokenIdentifier: identity.tokenIdentifier,
        userAgent: args.userAgent,
        userId: identity.authUserId,
      });
      return existing._id;
    }

    return await ctx.db.insert("ownerPushSubscriptions", {
      auth: args.auth,
      babyId: baby._id,
      createdAt: Date.now(),
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      tokenIdentifier: identity.tokenIdentifier,
      userAgent: args.userAgent,
      userId: identity.authUserId,
    });
  },
});

export const unsubscribeAsOwner = mutation({
  args: {
    auth: v.string(),
    babyId: v.id("baby"),
    endpoint: v.string(),
    p256dh: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("ownerPushSubscriptions")
      .withIndex("by_babyId_and_endpoint", (q) =>
        q.eq("babyId", args.babyId).eq("endpoint", args.endpoint),
      )
      .first();
    if (subscription && subscription.p256dh === args.p256dh && subscription.auth === args.auth) {
      await ctx.db.delete(subscription._id);
    }
  },
});

export const getOwnerSubscriptionsPage = internalQuery({
  args: {
    babyId: v.id("baby"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ownerPushSubscriptions")
      .withIndex("by_babyId", (q) => q.eq("babyId", args.babyId))
      .paginate(args.paginationOpts);
  },
  returns: paginationResultValidator(schema.doc("ownerPushSubscriptions")),
});

export const isOwnerSubscribed = query({
  args: {
    babyId: babyIdOrPublicIdValidator,
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const baby = await findBabyByIdOrPublicId(ctx.db, args.babyId);
    if (!baby) {
      return false;
    }

    const subscription = await ctx.db
      .query("ownerPushSubscriptions")
      .withIndex("by_babyId_and_endpoint", (q) =>
        q.eq("babyId", baby._id).eq("endpoint", args.endpoint),
      )
      .first();

    return subscription !== null;
  },
});
