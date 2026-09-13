import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { AppIdentity } from "./authIdentity";
import { authComponent } from "./auth";
import { appIdentity, tokenIdentifierForAuthUserId } from "./authIdentity";
import { claimPendingInvitesForAuthUser } from "./coParentInviteClaims";
import { findActiveCoParent, findBabyManager, requireBabyOwner } from "./babyAccess";
import { FORBIDDEN } from "../src/types";
import { toManagerBabyDto } from "./babyDto";
import { babyIdOrPublicIdValidator, findBabyByIdOrPublicId } from "./babyLookup";
import { isActive, softDeletePatch } from "./softDelete";
import { parseOptionalString } from "@workspace/runtime/json";
import { deleteOwnerSubscriptionsForIdentity } from "./pushSubscriptions";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function findUserByEmail(ctx: QueryCtx | MutationCtx, email: string) {
  return await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  });
}

async function resolveCallerProfile(ctx: QueryCtx | MutationCtx, userId: string) {
  const user = await authComponent.getAnyUserById(ctx, userId);
  if (!user) {
    return null;
  }
  return {
    email: normalizeEmail(user.email),
    name: user.name || null,
  };
}

async function findActiveInvite(
  ctx: QueryCtx | MutationCtx,
  opts: { babyId: Id<"baby">; email: string },
) {
  const invites = await ctx.db
    .query("babyCoParentInvites")
    .withIndex("by_babyId_and_email", (q) => q.eq("babyId", opts.babyId).eq("email", opts.email))
    .order("desc")
    .take(32);
  return invites.find(isActive) ?? null;
}

async function listActiveCoParents(ctx: QueryCtx | MutationCtx, babyId: Id<"baby">) {
  const rows = await ctx.db
    .query("babyCoParents")
    .withIndex("by_babyId", (q) => q.eq("babyId", babyId))
    .order("desc")
    .take(100);
  return rows.filter(isActive);
}

async function listActiveInvites(ctx: QueryCtx | MutationCtx, babyId: Id<"baby">) {
  const rows = await ctx.db
    .query("babyCoParentInvites")
    .withIndex("by_babyId", (q) => q.eq("babyId", babyId))
    .order("desc")
    .take(100);
  return rows.filter(isActive);
}

/**
 * Access flags for the signed-in user on a baby page.
 * Anonymous callers get canManage/isOwner false.
 */
export const myAccess = query({
  args: { babyId: babyIdOrPublicIdValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { canManage: false, isCoParent: false, isOwner: false };
    }
    const caller = appIdentity(identity);

    const baby = await findBabyByIdOrPublicId(ctx.db, args.babyId);
    if (!baby || !isActive(baby)) {
      return { canManage: false, isCoParent: false, isOwner: false };
    }

    const babyId = baby._id;
    const isOwner = baby.ownerTokenIdentifier === caller.tokenIdentifier;
    const isCoParent =
      !isOwner && (await findActiveCoParent(ctx, { babyId, identity: caller })) != null;
    return { canManage: isOwner || isCoParent, isCoParent, isOwner };
  },
});

/**
 * Owner/co-parent view of current co-parents and pending invites.
 */
export const listForBaby = query({
  args: { babyId: babyIdOrPublicIdValidator },
  handler: async (ctx, args) => {
    // Sentinel instead of throwing: the baby route loader queries this for
    // every visitor.
    const access = await findBabyManager(ctx, args.babyId);
    if (!access) {
      return FORBIDDEN;
    }

    const babyId = access.baby._id;
    const [coParents, invites] = await Promise.all([
      listActiveCoParents(ctx, babyId),
      listActiveInvites(ctx, babyId),
    ]);

    return {
      coParents: coParents.map((row) => ({
        _id: row._id,
        addedAt: row.addedAt,
        email: row.email,
        name: row.name ?? null,
      })),
      invites: invites.map((row) => ({
        _id: row._id,
        createdAt: row.createdAt,
        email: row.email,
      })),
    };
  },
});

/**
 * Owner invites a co-parent by email. Existing accounts are added immediately;
 * unknown emails become a pending invite claimed on next sign-in.
 */
export const invite = mutation({
  args: {
    babyId: v.id("baby"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { baby, identity } = await requireBabyOwner(ctx, args.babyId);
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) {
      throw new Error("Enter a valid email address");
    }

    const caller = await resolveCallerProfile(ctx, identity.authUserId);
    if (caller && caller.email === email) {
      throw new Error("You already own this page");
    }

    const existingUser = await findUserByEmail(ctx, email);
    if (existingUser) {
      const userId = String(existingUser._id);
      const tokenIdentifier = tokenIdentifierForAuthUserId(userId);
      if (tokenIdentifier === baby.ownerTokenIdentifier) {
        throw new Error("That person already owns this page");
      }
      const existing = await findActiveCoParent(ctx, {
        babyId: args.babyId,
        identity: {
          authUserId: userId,
          tokenIdentifier,
        },
      });
      if (existing) {
        throw new Error("That person is already a co-parent");
      }

      // Clear any stale pending invite for this email
      const pending = await findActiveInvite(ctx, { babyId: args.babyId, email });
      if (pending) {
        await ctx.db.patch(pending._id, softDeletePatch());
      }

      await ctx.db.insert("babyCoParents", {
        addedAt: Date.now(),
        addedByUserId: identity.authUserId,
        babyId: args.babyId,
        email,
        name: parseOptionalString(existingUser.name),
        tokenIdentifier,
        userId,
      });
      return { status: "added" as const };
    }

    const pending = await findActiveInvite(ctx, { babyId: args.babyId, email });
    if (pending) {
      throw new Error("An invite is already pending for that email");
    }

    await ctx.db.insert("babyCoParentInvites", {
      babyId: args.babyId,
      createdAt: Date.now(),
      email,
      invitedByUserId: identity.authUserId,
    });
    return { status: "invited" as const };
  },
});

export const removeCoParent = mutation({
  args: { coParentId: v.id("babyCoParents") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.coParentId);
    if (!row || !isActive(row)) {
      throw new Error("Co-parent not found");
    }
    await requireBabyOwner(ctx, row.babyId);
    await ctx.db.patch(args.coParentId, softDeletePatch());
    await deleteOwnerSubscriptionsForIdentity(ctx, {
      babyId: row.babyId,
      tokenIdentifier: row.tokenIdentifier,
    });
  },
});

export const cancelInvite = mutation({
  args: { inviteId: v.id("babyCoParentInvites") },
  handler: async (ctx, args) => {
    const inviteRow = await ctx.db.get(args.inviteId);
    if (!inviteRow || !isActive(inviteRow)) {
      throw new Error("Invite not found");
    }
    await requireBabyOwner(ctx, inviteRow.babyId);
    await ctx.db.patch(args.inviteId, softDeletePatch());
  },
});

/**
 * Co-parent leaves a baby page they were added to.
 */
export const leave = mutation({
  args: { babyId: v.id("baby") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const caller = appIdentity(identity);

    const membership = await findActiveCoParent(ctx, {
      babyId: args.babyId,
      identity: caller,
    });
    if (!membership) {
      throw new Error("You are not a co-parent on this page");
    }
    await ctx.db.patch(membership._id, softDeletePatch());
    await deleteOwnerSubscriptionsForIdentity(ctx, {
      babyId: args.babyId,
      tokenIdentifier: caller.tokenIdentifier,
    });
  },
});

/**
 * Turns pending email invites for the signed-in user into co-parent rows.
 * Idempotent — also runs from Better Auth sign-up / sign-in hooks.
 */
export async function claimPendingInvitesForCaller(ctx: MutationCtx, caller: AppIdentity) {
  const profile = await resolveCallerProfile(ctx, caller.authUserId);
  if (!profile) {
    return 0;
  }
  return await claimPendingInvitesForAuthUser(ctx, {
    email: profile.email,
    name: profile.name,
    userId: caller.authUserId,
  });
}

/**
 * Explicit invite claim — pending invites are claimed automatically on
 * sign-up and sign-in hooks.
 */
export const claimPendingInvites = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    // After signup the first dashboard load can race the session cookie —
    // treat missing auth as a no-op so the page doesn't crash.
    if (!identity) {
      return { claimed: 0 };
    }
    const claimed = await claimPendingInvitesForCaller(ctx, appIdentity(identity));
    return { claimed };
  },
  returns: v.object({ claimed: v.number() }),
});

/**
 * Babies the caller owns or co-parents, with a role for dashboard labeling.
 */
export async function listBabiesForUser(ctx: QueryCtx, identity: AppIdentity) {
  const owned = await ctx.db
    .query("baby")
    .withIndex("by_ownerTokenIdentifier", (q) =>
      q.eq("ownerTokenIdentifier", identity.tokenIdentifier),
    )
    .order("desc")
    .take(100);

  const memberships = await ctx.db
    .query("babyCoParents")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .order("desc")
    .take(100);

  const shared: Array<
    Awaited<ReturnType<typeof toManagerBabyDto>> & { role: "owner" | "coParent" }
  > = [];
  const seen = new Set<string>();

  for (const baby of owned.filter(isActive)) {
    seen.add(baby._id);
    shared.push({ ...(await toManagerBabyDto(ctx, baby)), role: "owner" });
  }

  for (const membership of memberships.filter(isActive)) {
    if (seen.has(membership.babyId)) {
      continue;
    }
    const baby = await ctx.db.get(membership.babyId);
    if (!baby || !isActive(baby)) {
      continue;
    }
    seen.add(baby._id);
    shared.push({ ...(await toManagerBabyDto(ctx, baby)), role: "coParent" });
  }

  // Newest first across both sources
  shared.sort((a, b) => b._creationTime - a._creationTime);
  return shared;
}
