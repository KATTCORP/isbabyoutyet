import type { InputOf } from "@raf-query/react";
import { convexPaginatedQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export const TIMELINE_PAGE_SIZE = 20;

/** How many items newer than a linked one open with it, above it, for context. */
const LINKED_ITEM_CONTEXT = 2;

/**
 * The baby page's feed, read both ways: from the newest item, or from a
 * linked one with the {@link LINKED_ITEM_CONTEXT} right above it. Older items
 * load forward (the skeleton sentinel loads more), the rest of the newer ones
 * backward, a page per "Show more". The top page says how many newer ones
 * are still above it, and the first forward page whether a linked item is
 * there.
 */
export const timelineQuery = convexPaginatedQuery(api.timeline.listFeed);

/** The {@link timelineQuery} input for the feed from `from`, or the latest one. */
export function timelineInput(opts: {
  from: string | null;
  publicId: string;
}): InputOf<typeof timelineQuery> {
  return {
    args: { babyId: opts.publicId, context: LINKED_ITEM_CONTEXT },
    from: opts.from,
    numItems: TIMELINE_PAGE_SIZE,
  };
}
