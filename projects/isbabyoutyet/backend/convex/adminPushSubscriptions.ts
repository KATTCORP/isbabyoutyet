import type { WithoutSystemFields } from "convex/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { getUserAdminFlag, requireAdmin } from "./adminAccess";
import { appIdentity } from "./authIdentity";
import { supportedLocaleValidator } from "./i18n";
import { isActive } from "./softDelete";

/** Admin-only: get a push on this device whenever a new baby page is created. */
export const subscribe = mutation({
  args: {
    auth: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    const fields = {
      auth: args.auth,
      p256dh: args.p256dh,
      tokenIdentifier: caller.tokenIdentifier,
      userAgent: args.userAgent,
      userId: caller.authUserId,
    } satisfies Partial<WithoutSystemFields<Doc<"adminPushSubscriptions">>>;
    const existing = await ctx.db
      .query("adminPushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("adminPushSubscriptions", {
      ...fields,
      createdAt: Date.now(),
      endpoint: args.endpoint,
    });
  },
  returns: v.id("adminPushSubscriptions"),
});

/** Admin-only. The keys must match, so only the subscribed device can turn it off. */
export const unsubscribe = mutation({
  args: {
    auth: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const subscription = await ctx.db
      .query("adminPushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (subscription && subscription.p256dh === args.p256dh && subscription.auth === args.auth) {
      await ctx.db.delete(subscription._id);
    }
    return null;
  },
  returns: v.null(),
});

/** Whether this device gets new-baby pushes for the signed-in admin. `false` for everyone else. */
export const isSubscribed = query({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }
    const caller = appIdentity(identity);
    if (!(await getUserAdminFlag(ctx, caller))) {
      return false;
    }
    const subscription = await ctx.db
      .query("adminPushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    return subscription?.tokenIdentifier === caller.tokenIdentifier;
  },
  returns: v.boolean(),
});

/**
 * Subscriptions whose owner is still an admin, with that admin's language.
 * Rows of a demoted admin stay put but receive nothing.
 */
export const getRecipientsPage = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("adminPushSubscriptions").paginate(args.paginationOpts);
    const page = [];
    for (const subscription of result.page) {
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", subscription.tokenIdentifier),
        )
        .unique();
      if (profile?.isAdmin !== true) {
        continue;
      }
      page.push({
        auth: subscription.auth,
        endpoint: subscription.endpoint,
        locale: profile.locale,
        p256dh: subscription.p256dh,
      });
    }
    return { ...result, page };
  },
  returns: paginationResultValidator(
    v.object({
      auth: v.string(),
      endpoint: v.string(),
      locale: supportedLocaleValidator,
      p256dh: v.string(),
    }),
  ),
});

/** The new baby page an admin push names, or `null` once it is deleted. */
export const getNewBaby = internalQuery({
  args: {
    babyId: v.id("baby"),
  },
  handler: async (ctx, args) => {
    const baby = await ctx.db.get(args.babyId);
    if (!baby || !isActive(baby)) {
      return null;
    }
    return { name: baby.name };
  },
  returns: v.union(v.object({ name: v.string() }), v.null()),
});
