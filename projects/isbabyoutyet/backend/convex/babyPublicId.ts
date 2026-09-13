import type { DatabaseReader, MutationCtx } from "./_generated/server";
import { isHomepageDemoPublicId } from "../src/seedCredentials";
import { isActive } from "./softDelete";

const MAX_TRANSFER_MOTIVATION_LENGTH = 500;

export function slugifyPublicId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/[\s_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function normalizePublicId(value: string): string {
  const publicId = slugifyPublicId(value);
  if (!publicId) {
    throw new Error("Public ID must contain letters or numbers");
  }
  return publicId;
}

function normalizeTransferMotivation(value: string) {
  const motivation = value.trim();
  if (!motivation) {
    throw new Error("Motivation is required");
  }
  if (motivation.length > MAX_TRANSFER_MOTIVATION_LENGTH) {
    throw new Error(`Motivation must be ${MAX_TRANSFER_MOTIVATION_LENGTH} characters or fewer`);
  }
  return motivation;
}

export async function findBabyByCurrentPublicId(db: DatabaseReader, publicId: string) {
  return await db
    .query("baby")
    .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
    .first();
}

async function deletePublicIdHistory(ctx: MutationCtx, publicId: string) {
  while (true) {
    const rows = await ctx.db
      .query("babyPublicIdHistory")
      .withIndex("by_publicId", (q) => q.eq("publicId", publicId))
      .take(100);
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}

export async function isPublicIdTaken(opts: {
  db: DatabaseReader;
  excludeTokenIdentifier: string;
  publicId: string;
}): Promise<boolean> {
  // Reserved for the seeded homepage live demos — never let a real user claim them.
  if (isHomepageDemoPublicId(opts.publicId)) {
    return true;
  }

  const existingBaby = await opts.db
    .query("baby")
    .withIndex("by_publicId", (q) => q.eq("publicId", opts.publicId))
    .first();

  if (existingBaby) {
    return true;
  }

  // Historical public IDs stay reserved, except the same owner reclaiming theirs.
  const historicEntry = await opts.db
    .query("babyPublicIdHistory")
    .withIndex("by_publicId", (q) => q.eq("publicId", opts.publicId))
    .first();

  if (!historicEntry) {
    return false;
  }

  const historicBaby = await opts.db.get(historicEntry.babyId);
  if (historicBaby && historicBaby.ownerTokenIdentifier !== opts.excludeTokenIdentifier) {
    return true;
  }

  return false;
}

export async function generateUniquePublicId(opts: {
  baseName: string;
  db: DatabaseReader;
  excludeTokenIdentifier: string;
}): Promise<string> {
  const slug = slugifyPublicId(opts.baseName);
  let tries = 0;
  let publicId = slug;

  while (
    await isPublicIdTaken({
      db: opts.db,
      excludeTokenIdentifier: opts.excludeTokenIdentifier,
      publicId,
    })
  ) {
    tries++;
    publicId = `${slug}-${tries}`;
  }

  return publicId;
}

/**
 * Staff-only permalink move. Records history for the claimant's old slug so
 * `/baby/{from}` redirects to `/baby/{to}`. If `{to}` is currently held, that
 * occupant is moved with {@link generateUniquePublicId} (the same `name`,
 * `name-1`, `name-2` sequence used on create) and does not keep `{to}` in
 * history — the claimant is taking that URL. Each call writes an audit row
 * with the staff actor, timestamp, and motivation.
 */
export async function transferBabyPublicId(
  ctx: MutationCtx,
  opts: {
    actorEmail: string | null;
    actorTokenIdentifier: string;
    actorUserId: string;
    fromPublicId: string;
    motivation: string;
    toPublicId: string;
  },
) {
  const fromPublicId = normalizePublicId(opts.fromPublicId);
  const toPublicId = normalizePublicId(opts.toPublicId);
  const motivation = normalizeTransferMotivation(opts.motivation);

  if (fromPublicId === toPublicId) {
    throw new Error("New public ID must be different from the current one");
  }
  if (isHomepageDemoPublicId(fromPublicId) || isHomepageDemoPublicId(toPublicId)) {
    throw new Error("Homepage demo public IDs cannot be transferred");
  }

  const claimant = await findBabyByCurrentPublicId(ctx.db, fromPublicId);
  if (!claimant || !isActive(claimant)) {
    throw new Error(`No baby currently uses public ID "${fromPublicId}"`);
  }

  const occupant = await findBabyByCurrentPublicId(ctx.db, toPublicId);
  const occupyingBaby = occupant && occupant._id !== claimant._id ? occupant : null;

  let displacedPublicId: string | null = null;
  if (occupyingBaby) {
    displacedPublicId = await generateUniquePublicId({
      baseName: occupyingBaby.name,
      db: ctx.db,
      excludeTokenIdentifier: occupyingBaby.ownerTokenIdentifier,
    });
    await ctx.db.patch(occupyingBaby._id, { publicId: displacedPublicId });
  }

  await deletePublicIdHistory(ctx, toPublicId);
  await ctx.db.insert("babyPublicIdHistory", {
    babyId: claimant._id,
    publicId: fromPublicId,
  });
  await ctx.db.patch(claimant._id, { publicId: toPublicId });
  await ctx.db.insert("babyPublicIdTransfers", {
    actorEmail: opts.actorEmail,
    actorTokenIdentifier: opts.actorTokenIdentifier,
    actorUserId: opts.actorUserId,
    babyId: claimant._id,
    babyName: claimant.name,
    createdAt: Date.now(),
    displacedBabyId: occupyingBaby ? occupyingBaby._id : null,
    displacedBabyName: occupyingBaby ? occupyingBaby.name : null,
    displacedPublicId,
    fromPublicId,
    motivation,
    toPublicId,
  });

  return {
    displacedPublicId,
    fromPublicId,
    toPublicId,
  };
}
