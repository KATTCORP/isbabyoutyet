import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { AppIdentity } from "./authIdentity";
import { appIdentity } from "./authIdentity";
import type { BabyIdOrPublicId } from "./babyLookup";
import { findBabyByIdOrPublicId } from "./babyLookup";
import { isActive } from "./softDelete";

type DbCtx = QueryCtx | MutationCtx;

export async function findActiveCoParent(
  ctx: DbCtx,
  opts: { babyId: Id<"baby">; identity: AppIdentity },
): Promise<Doc<"babyCoParents"> | null> {
  const rows = await ctx.db
    .query("babyCoParents")
    .withIndex("by_babyId_and_tokenIdentifier", (q) =>
      q.eq("babyId", opts.babyId).eq("tokenIdentifier", opts.identity.tokenIdentifier),
    )
    .order("desc")
    .take(32);
  return rows.find(isActive) ?? null;
}

export async function canManageBaby(
  ctx: DbCtx,
  opts: { baby: Doc<"baby">; identity: AppIdentity },
) {
  const isOwner = opts.baby.ownerTokenIdentifier === opts.identity.tokenIdentifier;
  if (isOwner) {
    return true;
  }
  const coParent = await findActiveCoParent(ctx, {
    babyId: opts.baby._id,
    identity: opts.identity,
  });
  return coParent != null;
}

/**
 * Authenticated caller who may manage baby content (owner or co-parent).
 * Does not allow soft-deleted babies.
 */
export async function requireBabyManager(ctx: DbCtx, babyRef: BabyIdOrPublicId) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const caller = appIdentity(identity);

  const baby = await findBabyByIdOrPublicId(ctx.db, babyRef);
  if (!baby || !isActive(baby)) {
    throw new Error("Baby not found");
  }

  const babyId = baby._id;
  const isOwner = baby.ownerTokenIdentifier === caller.tokenIdentifier;
  if (!isOwner) {
    const coParent = await findActiveCoParent(ctx, {
      babyId,
      identity: caller,
    });
    if (!coParent) {
      throw new Error("Not authorized");
    }
  }

  return { baby, identity: caller, isOwner };
}

/**
 * Non-throwing counterpart of {@link requireBabyManager}: resolves to null
 * for anonymous callers, missing babies, and non-managers. For queries that
 * return a FORBIDDEN sentinel so route loaders can fetch the same queries
 * for every visitor.
 */
export async function findBabyManager(ctx: DbCtx, babyRef: BabyIdOrPublicId) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  const caller = appIdentity(identity);

  const baby = await findBabyByIdOrPublicId(ctx.db, babyRef);
  if (!baby || !isActive(baby)) {
    return null;
  }

  const babyId = baby._id;
  const isOwner = baby.ownerTokenIdentifier === caller.tokenIdentifier;
  if (!isOwner) {
    const coParent = await findActiveCoParent(ctx, {
      babyId,
      identity: caller,
    });
    if (!coParent) {
      return null;
    }
  }

  return { baby, identity: caller, isOwner };
}

/**
 * Only the baby page owner (creator). Co-parents are refused.
 */
export async function requireBabyOwner(ctx: DbCtx, babyId: Id<"baby">) {
  const access = await requireBabyManager(ctx, babyId);
  if (!access.isOwner) {
    throw new Error("Not authorized");
  }
  return access;
}
