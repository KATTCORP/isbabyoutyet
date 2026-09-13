import type { Infer } from "convex/values";
import { v } from "convex/values";

/**
 * Stored and caller encouragement identity. `type` matches `BabyStatus`.
 * Clients never send this object — the server builds it from the Convex token
 * plus the browser visitor id.
 */
export const encouragementAuthorValidator = v.union(
  v.object({
    type: v.literal("user"),
    userId: v.string(),
    visitorId: v.union(v.string(), v.null()),
  }),
  v.object({
    type: v.literal("visitor"),
    visitorId: v.string(),
  }),
);

export type EncouragementAuthor = Infer<typeof encouragementAuthorValidator>;

export type EncouragementOwnership = {
  author: EncouragementAuthor;
  visitorId: string;
};

export function storedEncouragementAuthor(row: EncouragementOwnership): EncouragementAuthor {
  return row.author;
}

export function storedEncouragementAuthorFromCaller(
  author: EncouragementAuthor | null,
  visitorId: string,
): EncouragementAuthor {
  if (author?.type === "user") {
    return {
      type: "user",
      userId: author.userId,
      visitorId,
    };
  }
  return { type: "visitor", visitorId };
}

export function encouragementHasUserId(row: EncouragementOwnership) {
  return row.author.type === "user";
}

export function encouragementIsMine(
  encouragement: EncouragementOwnership,
  author: EncouragementAuthor | null,
) {
  if (!author) {
    return false;
  }
  const stored = storedEncouragementAuthor(encouragement);
  switch (author.type) {
    case "user": {
      if (stored.type === "user" && stored.userId === author.userId) {
        return true;
      }
      return author.visitorId != null && stored.visitorId === author.visitorId;
    }
    case "visitor":
      return stored.visitorId === author.visitorId;
  }
  const _exhaustive: never = author;
  return _exhaustive;
}
