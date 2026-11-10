import type { QueryClient } from "@raf-query/react";
import { getData } from "@raf-query/react";
import { convexBidirectionalPaginatedQuery } from "@workspace/convex-query";
import { z } from "zod";
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
export const timelineQuery = convexBidirectionalPaginatedQuery({
  backward: api.timeline.listNewer,
  forward: api.timeline.listFeed,
});

/** Where the feed on screen starts: a linked item, or `null` for the latest items. */
export type TimelineFeedAnchor = { itemId: string | null };

/**
 * History state for a link followed from the feed at `anchor`, so the loader
 * can keep that feed when it already shows the item, instead of reopening it.
 */
export function followedFromFeed(anchor: TimelineFeedAnchor) {
  return { overlay: undefined, timelineFeed: anchor };
}

/** History state is whatever the browser kept, so check it. */
const timelineFeedAnchorSchema = z.object({ itemId: z.string().nullable() });

/** The {@link timelineQuery} input for the feed from `itemId`, or the latest one. */
export function timelineInput(opts: { itemId: string | null; publicId: string }) {
  return {
    args: { babyId: opts.publicId, context: LINKED_ITEM_CONTEXT, itemId: opts.itemId },
    numItems: TIMELINE_PAGE_SIZE,
  };
}

/**
 * Where the baby page's feed starts for `?item=`: at `item`, unless the
 * feed `item`'s link was followed from (`followedFrom`, history state)
 * already shows it. That feed then stays as loaded and only the highlight
 * moves, so following a timestamp never collapses the pages scrolled
 * through. The server never has history state, so a cold load always
 * opens the feed at `item`. Reads only the cache.
 */
export function timelineFeedStart(
  queryClient: QueryClient,
  opts: { followedFrom: TimelineFeedAnchor | undefined; item: string | null; publicId: string },
) {
  const parsed = timelineFeedAnchorSchema.safeParse(opts.followedFrom);
  if (opts.item === null || queryClient.isServer || !parsed.success) {
    return opts.item;
  }
  const followedFrom = parsed.data.itemId;
  const pages = getData(
    queryClient,
    timelineQuery,
    timelineInput({ itemId: followedFrom, publicId: opts.publicId }),
  )?.pages;
  const items = pages?.flatMap((page) => page.page) ?? [];
  return items.some((item) => item._id === opts.item) ? followedFrom : opts.item;
}
