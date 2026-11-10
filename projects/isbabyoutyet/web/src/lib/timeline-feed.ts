import type { QueryClient } from "@raf-query/react";
import { getData, load, swr } from "@raf-query/react";
import {
  convexBidirectionalPaginatedQuery,
  convexPaginatedQuery,
  convexQuery,
  loadBidirectionalPaginatedQuery,
} from "@workspace/convex-query";
import { z } from "zod";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export const TIMELINE_PAGE_SIZE = 20;

/** How many items newer than a linked one load with it, above it, for context. */
export const LINKED_ITEM_CONTEXT = 2;

const linkedTimelineQueries = {
  backward: api.timeline.listNewerThanItem,
  forward: api.timeline.listFromItem,
};

/**
 * The feed read from a linked item: the item and older ones forward (the
 * skeleton sentinel loads more), newer ones backward: the
 * {@link LINKED_ITEM_CONTEXT} right above it with the item, the rest a page
 * per "Show more".
 */
export const linkedTimelineQuery = convexBidirectionalPaginatedQuery(linkedTimelineQueries);

/** Where the feed on screen starts: the latest items, or a linked item. */
export type TimelineFeedAnchor = { kind: "latest" } | { itemId: string; kind: "linked" };

/**
 * History state for a link followed from the feed at `anchor`, so the loader
 * can keep that feed when it already shows the item, instead of reopening it.
 */
export function followedFromFeed(anchor: TimelineFeedAnchor) {
  return { overlay: undefined, timelineFeed: anchor };
}

/** Convex ids are short base32-ish strings; anything else can't be an item. */
const FEED_ITEM_ID = /^[0-9a-z]{1,64}$/i;

const timelineFeedAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("latest") }),
  z.object({ itemId: z.string().regex(FEED_ITEM_ID), kind: z.literal("linked") }),
]);

function latestTimelineInput(publicId: string) {
  return { args: { babyId: publicId }, numItems: TIMELINE_PAGE_SIZE };
}

function linkedTimelineArgs(opts: { itemId: string; publicId: string }) {
  return { babyId: opts.publicId, itemId: opts.itemId };
}

async function loadLatestTimeline(queryClient: QueryClient, publicId: string) {
  const [handles] = await load(queryClient, {
    timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), latestTimelineInput(publicId)),
  });
  return handles.timeline;
}

async function loadLinkedTimeline(
  queryClient: QueryClient,
  opts: { itemId: string; publicId: string },
) {
  const args = linkedTimelineArgs(opts);
  const [[handles], [windowHandle, windowData]] = await Promise.all([
    load(queryClient, { newerCount: swr(convexQuery(api.timeline.countNewerThanItem), args) }),
    loadBidirectionalPaginatedQuery(queryClient, {
      input: { args, numItems: TIMELINE_PAGE_SIZE },
      previousNumItems: LINKED_ITEM_CONTEXT,
      queries: linkedTimelineQueries,
    }),
  ]);
  // Newer pages come first; only the item's own pages, forward from it, say
  // whether it's visible.
  const itemPage = windowData.pages.find((page) => "linkedItemVisible" in page);
  if (itemPage && "linkedItemVisible" in itemPage && itemPage.linkedItemVisible) {
    return {
      itemId: opts.itemId,
      kind: "linked" as const,
      newerCount: handles.newerCount,
      window: windowHandle,
    };
  }
  // Waterfall: whether to fall back depends on the item's page.
  return {
    highlightedItemId: null,
    kind: "latest" as const,
    linkUnavailable: true,
    timeline: await loadLatestTimeline(queryClient, opts.publicId),
  };
}

/**
 * The feed `item` was followed from, if this browser's cache still has
 * `item` loaded in it, so the page can keep that feed. Reads nothing.
 */
function feedShowingItem(
  queryClient: QueryClient,
  opts: { followedFrom: TimelineFeedAnchor | undefined; item: string; publicId: string },
) {
  const parsed = timelineFeedAnchorSchema.safeParse(opts.followedFrom);
  if (queryClient.isServer || !parsed.success) {
    return null;
  }
  const anchor = parsed.data;
  const pages =
    anchor.kind === "latest"
      ? getData(
          queryClient,
          convexPaginatedQuery(api.timeline.listByBaby),
          latestTimelineInput(opts.publicId),
        )?.pages
      : getData(queryClient, linkedTimelineQuery, {
          args: linkedTimelineArgs({ itemId: anchor.itemId, publicId: opts.publicId }),
          numItems: TIMELINE_PAGE_SIZE,
        })?.pages;
  const items = pages?.flatMap((page) => page.page) ?? [];
  return items.some((item) => item._id === opts.item) ? anchor : null;
}

/**
 * The baby page's feed: the latest items, or the window around `item` when
 * a link names one. A link to an item that's gone, hidden, malformed or on
 * another baby's page falls back to the latest items with `linkUnavailable`.
 *
 * `followedFrom` (history state) names the feed `item`'s link was followed
 * from. When that feed already shows `item`, it stays as loaded and only
 * the highlight moves, so following a timestamp never collapses the pages
 * scrolled through. The server never has it, so a cold load always opens
 * the feed at `item`.
 */
export async function loadTimelineFeed(
  queryClient: QueryClient,
  opts: { followedFrom: TimelineFeedAnchor | undefined; item: string | null; publicId: string },
) {
  if (opts.item === null) {
    return {
      highlightedItemId: null,
      kind: "latest" as const,
      linkUnavailable: false,
      timeline: await loadLatestTimeline(queryClient, opts.publicId),
    };
  }
  if (!FEED_ITEM_ID.test(opts.item)) {
    return {
      highlightedItemId: null,
      kind: "latest" as const,
      linkUnavailable: true,
      timeline: await loadLatestTimeline(queryClient, opts.publicId),
    };
  }
  const shown = feedShowingItem(queryClient, {
    followedFrom: opts.followedFrom,
    item: opts.item,
    publicId: opts.publicId,
  });
  if (shown?.kind === "latest") {
    return {
      highlightedItemId: opts.item,
      kind: "latest" as const,
      linkUnavailable: false,
      timeline: await loadLatestTimeline(queryClient, opts.publicId),
    };
  }
  const feed = await loadLinkedTimeline(queryClient, {
    itemId: shown?.itemId ?? opts.item,
    publicId: opts.publicId,
  });
  return feed.kind === "linked" ? { ...feed, highlightedItemId: opts.item } : feed;
}

export type TimelineFeedLoad = Awaited<ReturnType<typeof loadTimelineFeed>>;
