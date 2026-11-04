export const BABY_FEED_HASH = "feed";

/** Status / family push: open the baby page, no feed hash. */
export function babyPageUrl(publicId: string) {
  return `/baby/${publicId}`;
}

/** Owner message push: open the Updates & messages list. */
export function babyFeedUrl(publicId: string) {
  return `${babyPageUrl(publicId)}#${BABY_FEED_HASH}`;
}

/** DOM id of a feed item, so `#item-…` lands on it. */
export function feedItemDomId(itemId: string) {
  return `item-${itemId}`;
}

/**
 * One feed item: `?item=` loads the feed from it (the server never sees the
 * hash) and `#item-…` lets the browser jump to it before hydration.
 */
export function babyFeedItemUrl(opts: { itemId: string; publicId: string }) {
  const search = new URLSearchParams({ item: opts.itemId });
  return `${babyPageUrl(opts.publicId)}?${search.toString()}#${feedItemDomId(opts.itemId)}`;
}
