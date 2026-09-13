import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { tokenIdentifierForAuthUserId } from "./authIdentity";
import { findActiveCoParent } from "./babyAccess";
import { isActive, softDeletePatch } from "./softDelete";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function resolveAuthUserProfile(ctx: QueryCtx | MutationCtx, userId: string) {
  const user = await authComponent.getAnyUserById(ctx, userId);
  if (!user) {
    return null;
  }
  return {
    email: normalizeEmail(user.email),
    name: user.name || null,
  };
}

/**
 * Turns pending email invites into co-parent rows for a Better Auth user.
 * Idempotent — safe on sign-up, sign-in, and profile bootstrap.
 */
export async function claimPendingInvitesForAuthUser(
  ctx: MutationCtx,
  opts: { email: string; name: string | null; userId: string },
) {
  const email = normalizeEmail(opts.email);
  const caller = {
    authUserId: opts.userId,
    tokenIdentifier: tokenIdentifierForAuthUserId(opts.userId),
  };
  const name = opts.name;

  const invites = await ctx.db
    .query("babyCoParentInvites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .order("desc")
    .take(100);

  let claimed = 0;
  for (const invite of invites) {
    if (!isActive(invite)) {
      continue;
    }

    const baby = await ctx.db.get(invite.babyId);
    if (!baby || !isActive(baby)) {
      await ctx.db.patch(invite._id, softDeletePatch());
      continue;
    }

    const isOwner = baby.ownerTokenIdentifier === caller.tokenIdentifier;
    if (isOwner) {
      await ctx.db.patch(invite._id, softDeletePatch());
      continue;
    }

    const existing = await findActiveCoParent(ctx, {
      babyId: invite.babyId,
      identity: caller,
    });
    if (!existing) {
      await ctx.db.insert("babyCoParents", {
        addedAt: Date.now(),
        addedByUserId: invite.invitedByUserId,
        babyId: invite.babyId,
        email,
        name,
        tokenIdentifier: caller.tokenIdentifier,
        userId: caller.authUserId,
      });
      claimed += 1;
    }
    await ctx.db.patch(invite._id, softDeletePatch());
  }

  return claimed;
}

/** Loads the auth user's email from Better Auth, then claims pending invites. */
export async function claimPendingInvitesForAuthUserId(ctx: MutationCtx, userId: string) {
  const profile = await resolveAuthUserProfile(ctx, userId);
  if (!profile) {
    return 0;
  }
  return await claimPendingInvitesForAuthUser(ctx, {
    email: profile.email,
    name: profile.name,
    userId,
  });
}
