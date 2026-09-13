import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "../src/i18n";
import { DEFAULT_TIME_ZONE, isValidTimeZone, resolveTimeZone } from "../src/timeZone";
import { authComponent } from "./auth";
import { supportedLocaleValidator } from "./i18n";
import { appIdentity } from "./authIdentity";
import { mutationWithTriggers } from "./triggers";

const profileResultValidator = v.object({
  isAdmin: v.boolean(),
  locale: supportedLocaleValidator,
  timeZone: v.string(),
});

async function requireIdentity(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

async function getProfileHandler(ctx: Pick<QueryCtx, "db">, tokenIdentifier: string) {
  return await ctx.db
    .query("userProfiles")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const caller = appIdentity(identity);
    const profile = await getProfileHandler(ctx, caller.tokenIdentifier);
    const user = await authComponent.getAnyUserById(ctx, caller.authUserId);
    return {
      email: user?.email ?? "",
      emailVerified: user?.emailVerified ?? false,
      isAdmin: profile?.isAdmin ?? false,
      locale: resolveSupportedLocale(profile?.locale ?? DEFAULT_LOCALE),
      name: user?.name ?? "",
      timeZone: resolveTimeZone(profile?.timeZone),
    };
  },
  returns: v.union(
    v.object({
      email: v.string(),
      emailVerified: v.boolean(),
      isAdmin: v.boolean(),
      locale: supportedLocaleValidator,
      name: v.string(),
      timeZone: v.string(),
    }),
    v.null(),
  ),
});

export const updateLocale = mutationWithTriggers({
  args: {
    locale: supportedLocaleValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const caller = appIdentity(identity);
    const existing = await getProfileHandler(ctx, caller.tokenIdentifier);
    if (existing) {
      await ctx.db.patch(existing._id, {
        locale: args.locale,
        tokenIdentifier: caller.tokenIdentifier,
      });
      return {
        isAdmin: existing.isAdmin,
        locale: args.locale,
        timeZone: resolveTimeZone(existing.timeZone),
      };
    }
    await ctx.db.insert("userProfiles", {
      isAdmin: false,
      locale: args.locale,
      timeZone: DEFAULT_TIME_ZONE,
      tokenIdentifier: caller.tokenIdentifier,
      userId: caller.authUserId,
    });
    return { isAdmin: false, locale: args.locale, timeZone: DEFAULT_TIME_ZONE };
  },
  returns: profileResultValidator,
});

export const updateTimeZone = mutation({
  args: {
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (!isValidTimeZone(args.timeZone)) {
      throw new Error("Choose a valid time zone");
    }
    const caller = appIdentity(identity);
    const existing = await getProfileHandler(ctx, caller.tokenIdentifier);
    if (existing) {
      await ctx.db.patch(existing._id, {
        timeZone: args.timeZone,
        tokenIdentifier: caller.tokenIdentifier,
      });
      return {
        isAdmin: existing.isAdmin,
        locale: resolveSupportedLocale(existing.locale),
        timeZone: args.timeZone,
      };
    }
    await ctx.db.insert("userProfiles", {
      isAdmin: false,
      locale: DEFAULT_LOCALE,
      timeZone: args.timeZone,
      tokenIdentifier: caller.tokenIdentifier,
      userId: caller.authUserId,
    });
    return { isAdmin: false, locale: DEFAULT_LOCALE, timeZone: args.timeZone };
  },
  returns: profileResultValidator,
});
