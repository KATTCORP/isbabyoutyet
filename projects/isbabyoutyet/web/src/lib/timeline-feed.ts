import type { QueryClient } from "@raf-query/react";
import { allKeyed } from "@raf-query/react";
import type { ConvexReader } from "@workspace/convex-query";
import {
  convexBidirectionalPaginatedQuery,
  convexPaginatedQuery,
  convexQuery,
} from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export const TIMELINE_PAGE_SIZE = 20;

/**
 * The feed read from a linked item: the item and older ones forward (the
 * skeleton sentinel loads more), newer ones backward on "Show newer" only.
 */
export const linkedTimelineQuery = convexBidirectionalPaginatedQuery({
  backward: api.timeline.listNewerThanItem,
  forward: api.timeline.listFromItem,
});

/** Convex ids are short base32-ish strings; anything else can't be an item. */
const FEED_ITEM_ID = /^[0-9a-z]{1,64}$/i;

function loadLatestTimeline(queryClient: QueryClient<ConvexReader>, publicId: string) {
  return queryClient.ensure(convexPaginatedQuery(api.timeline.listByBaby), {
    args: { babyId: publicId },
    numItems: TIMELINE_PAGE_SIZE,
  });
}

async function loadLinkedTimeline(
  queryClient: QueryClient<ConvexReader>,
  opts: { itemId: string; publicId: string },
) {
  const args = { babyId: opts.publicId, itemId: opts.itemId };
  const loaded = await allKeyed({
    newerCount: queryClient.ensure(convexQuery(api.timeline.countNewerThanItem), args),
    window: queryClient.ensure(linkedTimelineQuery, { args, numItems: TIMELINE_PAGE_SIZE }),
  });
  const firstPage = loaded.window.data.pages[0];
  if (firstPage && "linkedItemVisible" in firstPage && firstPage.linkedItemVisible) {
    return { itemId: opts.itemId, kind: "linked" as const, ...loaded };
  }
  // Waterfall: whether to fall back depends on the window's first page.
  return {
    kind: "latest" as const,
    linkUnavailable: true,
    timeline: await loadLatestTimeline(queryClient, opts.publicId),
  };
}

/**
 * The baby page's feed: the latest items, or the window around `item` when
 * a link names one. A link to an item that's gone, hidden, malformed or on
 * another baby's page falls back to the latest items with `linkUnavailable`.
 */
export async function loadTimelineFeed(
  queryClient: QueryClient<ConvexReader>,
  opts: { item: string | null; publicId: string },
) {
  if (opts.item === null) {
    return {
      kind: "latest" as const,
      linkUnavailable: false,
      timeline: await loadLatestTimeline(queryClient, opts.publicId),
    };
  }
  if (!FEED_ITEM_ID.test(opts.item)) {
    return {
      kind: "latest" as const,
      linkUnavailable: true,
      timeline: await loadLatestTimeline(queryClient, opts.publicId),
    };
  }
  return await loadLinkedTimeline(queryClient, { itemId: opts.item, publicId: opts.publicId });
}

export type TimelineFeedLoad = Awaited<ReturnType<typeof loadTimelineFeed>>;
