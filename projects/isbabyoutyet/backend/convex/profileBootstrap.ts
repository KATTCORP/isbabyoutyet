import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { resolveSupportedLocale } from "../src/i18n";
import type { SupportedLocale } from "../src/i18n";
import { resolveTimeZone } from "../src/timeZone";
import { tokenIdentifierForAuthUserId } from "./authIdentity";
import {
  claimPendingInvitesForAuthUser,
  claimPendingInvitesForAuthUserId,
} from "./coParentInviteClaims";

export type ProfileResult = {
  isAdmin: boolean;
  locale: SupportedLocale;
  timeZone: string;
};

async function getProfileByTokenIdentifier(ctx: Pick<QueryCtx, "db">, tokenIdentifier: string) {
  return await ctx.db
    .query("userProfiles")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

export function localeFromAcceptLanguage(acceptLanguage: string | null | undefined) {
  const primary = acceptLanguage?.split(",")[0]?.trim();
  return resolveSupportedLocale(primary);
}

/** Creates the app profile row on first auth; idempotent on later calls. */
export async function ensureUserProfileForAuthUser(
  ctx: MutationCtx,
  opts: {
    localeHint: string | null | undefined;
    timeZoneHint: string | null | undefined;
    userId: string;
  },
): Promise<ProfileResult> {
  const tokenIdentifier = tokenIdentifierForAuthUserId(opts.userId);
  const existing = await getProfileByTokenIdentifier(ctx, tokenIdentifier);
  if (existing) {
    const timeZone = resolveTimeZone(existing.timeZone ?? opts.timeZoneHint);
    if (existing.timeZone === undefined) {
      await ctx.db.patch(existing._id, { timeZone });
    }
    return {
      isAdmin: existing.isAdmin,
      locale: resolveSupportedLocale(existing.locale),
      timeZone,
    };
  }

  const locale = resolveSupportedLocale(opts.localeHint);
  const timeZone = resolveTimeZone(opts.timeZoneHint);
  await ctx.db.insert("userProfiles", {
    isAdmin: false,
    locale,
    timeZone,
    tokenIdentifier,
    userId: opts.userId,
  });
  return { isAdmin: false, locale, timeZone };
}

export async function claimInvitesForAuthUser(
  ctx: MutationCtx,
  opts: {
    email: string | null;
    name: string | null;
    userId: string;
  },
) {
  if (opts.email) {
    await claimPendingInvitesForAuthUser(ctx, {
      email: opts.email,
      name: opts.name,
      userId: opts.userId,
    });
    return;
  }

  await claimPendingInvitesForAuthUserId(ctx, opts.userId);
}

export const ensureUserProfileForAuthUserMutation = internalMutation({
  args: {
    localeHint: v.union(v.string(), v.null()),
    timeZoneHint: v.union(v.string(), v.null()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ensureUserProfileForAuthUser(ctx, args);
  },
});

export const claimInvitesForAuthUserMutation = internalMutation({
  args: {
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await claimInvitesForAuthUser(ctx, args);
  },
});
