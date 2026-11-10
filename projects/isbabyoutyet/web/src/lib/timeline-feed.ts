import { convexFeedQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export const TIMELINE_PAGE_SIZE = 20;

/** How many items newer than a linked one open with it, above it, for context. */
const LINKED_ITEM_CONTEXT = 2;

/**
 * The baby page's feed: from the newest item, or from a linked one with the
 * {@link LINKED_ITEM_CONTEXT} right above it. Older items load forward (the
 * skeleton sentinel loads more); the rest of the newer ones backward, a page
 * per "Show more". Its first page says how many newer ones there are and
 * whether a linked item is there.
 */
export const timelineQuery = convexFeedQuery({
  backward: api.timeline.listNewer,
  forward: api.timeline.listFeed,
});

/** The {@link timelineQuery} input for the feed from `from`, or the latest one. */
export function timelineInput(opts: { from: string | null; publicId: string }) {
  return {
    args: { babyId: opts.publicId, context: LINKED_ITEM_CONTEXT },
    from: opts.from,
    numItems: TIMELINE_PAGE_SIZE,
  };
}
