import type { QueryCtx } from "./_generated/server";
import type { AppIdentity } from "./authIdentity";
import { appIdentity } from "./authIdentity";

type AuthDbCtx = Pick<QueryCtx, "auth" | "db">;

export async function getUserAdminFlag(ctx: Pick<QueryCtx, "db">, identity: AppIdentity) {
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  return profile?.isAdmin === true;
}

/**
 * Authenticated caller with `userProfiles.isAdmin`. Used for staff-only
 * dashboards (language requests, global baby list) — not baby-page roles.
 */
export async function requireAdmin(ctx: AuthDbCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const caller = appIdentity(identity);
  const isAdmin = await getUserAdminFlag(ctx, caller);
  if (!isAdmin) {
    throw new Error("Not authorized");
  }
  return caller;
}
