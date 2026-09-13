export const BABY_FEED_HASH = "feed";

/** Status / family push: open the baby page, no feed hash. */
export function babyPageUrl(publicId: string) {
  return `/baby/${publicId}`;
}

/** Owner message push: open the Updates & messages list. */
export function babyFeedUrl(publicId: string) {
  return `${babyPageUrl(publicId)}#${BABY_FEED_HASH}`;
}
