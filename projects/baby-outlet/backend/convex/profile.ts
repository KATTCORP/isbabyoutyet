import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { resolveSupportedLocale } from "../src/i18n";
import { supportedLocaleValidator } from "./i18n";
import { appIdentity } from "./authIdentity";

const profileResultValidator = v.object({
  locale: supportedLocaleValidator,
  isAdmin: v.boolean(),
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

function toProfileResult(profile: { locale: string; isAdmin: boolean }) {
  return {
    locale: resolveSupportedLocale(profile.locale),
    isAdmin: profile.isAdmin,
  };
}

export const get = query({
  args: {},
  returns: v.union(profileResultValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const caller = appIdentity(identity);
    const profile = await getProfileHandler(ctx, caller.tokenIdentifier);
    return profile ? toProfileResult(profile) : null;
  },
});

export const ensure = mutation({
  args: {
    browserLocale: v.string(),
  },
  returns: profileResultValidator,
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const caller = appIdentity(identity);
    const existing = await getProfileHandler(ctx, caller.tokenIdentifier);
    if (existing) {
      return toProfileResult(existing);
    }

    const locale = resolveSupportedLocale(args.browserLocale);
    await ctx.db.insert("userProfiles", {
      userId: caller.authUserId,
      tokenIdentifier: caller.tokenIdentifier,
      locale,
      isAdmin: false,
    });
    return { locale, isAdmin: false };
  },
});

export const updateLocale = mutation({
  args: {
    locale: supportedLocaleValidator,
  },
  returns: profileResultValidator,
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const caller = appIdentity(identity);
    const existing = await getProfileHandler(ctx, caller.tokenIdentifier);
    if (existing) {
      await ctx.db.patch(existing._id, {
        locale: args.locale,
        tokenIdentifier: caller.tokenIdentifier,
      });
      return { locale: args.locale, isAdmin: existing.isAdmin };
    }
    await ctx.db.insert("userProfiles", {
      userId: caller.authUserId,
      tokenIdentifier: caller.tokenIdentifier,
      locale: args.locale,
      isAdmin: false,
    });
    return { locale: args.locale, isAdmin: false };
  },
});

export const requestLanguage = mutation({
  args: {
    requestedLocale: v.string(),
  },
  returns: v.id("languageRequests"),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const requestedLocale = args.requestedLocale.trim();
    if (requestedLocale.length < 2 || requestedLocale.length > 100) {
      throw new Error("Enter a language name or language code");
    }
    return await ctx.db.insert("languageRequests", {
      userId: appIdentity(identity).authUserId,
      requestedLocale,
      createdAt: Date.now(),
    });
  },
});
