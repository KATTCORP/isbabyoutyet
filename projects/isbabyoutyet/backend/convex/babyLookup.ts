import { v } from "convex/values";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Accepts a Convex baby id or a public slug (current or historical). */
export const babyIdOrPublicIdValidator = v.union(v.id("baby"), v.string());

export type BabyIdOrPublicId = Id<"baby"> | string;

/**
 * Resolves a baby by Convex id or public slug without sequential fallbacks
 * inside callers — each lookup path is independent so queries can run in
 * parallel from the route loader using the URL slug alone.
 */
export async function findBabyByIdOrPublicId(
  db: DatabaseReader,
  ref: BabyIdOrPublicId,
): Promise<Doc<"baby"> | null> {
  const normalizedId = db.normalizeId("baby", ref);
  const [byId, byPublicId, historyEntry] = await Promise.all([
    normalizedId ? db.get(normalizedId) : Promise.resolve(null),
    db
      .query("baby")
      .withIndex("by_publicId", (q) => q.eq("publicId", ref))
      .first(),
    db
      .query("babyPublicIdHistory")
      .withIndex("by_publicId", (q) => q.eq("publicId", ref))
      .order("desc")
      .first(),
  ]);

  if (byId) {
    return byId;
  }
  if (byPublicId) {
    return byPublicId;
  }
  if (historyEntry) {
    return await db.get(historyEntry.babyId);
  }
  return null;
}
