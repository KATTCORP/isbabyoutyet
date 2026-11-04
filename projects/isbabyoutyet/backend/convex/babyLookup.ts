import { v } from "convex/values";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { findBabyByCurrentPublicId, findBabyByHistoricalPublicId } from "./babyPublicId";

/** Accepts a Convex baby id or a public slug (current or historical). */
export const babyIdOrPublicIdValidator = v.union(v.id("baby"), v.string());

export type BabyIdOrPublicId = Id<"baby"> | string;

/**
 * Resolves a baby by Convex id or public slug without sequential fallbacks
 * inside callers — each lookup path is independent so queries can run in
 * parallel from the route loader using the URL slug alone.
 *
 * A Convex id may resolve to a soft-deleted baby (callers check `isActive`);
 * slugs only resolve to active babies, because deleted pages release them.
 */
export async function findBabyByIdOrPublicId(
  db: DatabaseReader,
  ref: BabyIdOrPublicId,
): Promise<Doc<"baby"> | null> {
  const normalizedId = db.normalizeId("baby", ref);
  const [byId, byPublicId, byHistory] = await Promise.all([
    normalizedId ? db.get(normalizedId) : Promise.resolve(null),
    findBabyByCurrentPublicId(db, ref),
    findBabyByHistoricalPublicId(db, ref),
  ]);

  return byId ?? byPublicId ?? byHistory;
}
