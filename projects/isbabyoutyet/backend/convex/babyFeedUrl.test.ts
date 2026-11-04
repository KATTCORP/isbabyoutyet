import { expect, test } from "vitest";
import {
  BABY_FEED_HASH,
  babyFeedItemUrl,
  babyFeedUrl,
  babyPageUrl,
  feedItemDomId,
} from "../src/babyFeedUrl";

test("status push opens the baby page without a feed hash", () => {
  expect(babyPageUrl("baby-waiting")).toBe("/baby/baby-waiting");
});

test("owner message push opens the Updates & messages list", () => {
  expect(BABY_FEED_HASH).toBe("feed");
  expect(babyFeedUrl("baby-waiting")).toBe("/baby/baby-waiting#feed");
});

test("a feed item link loads the feed from the item and jumps to it", () => {
  expect(feedItemDomId("k57abc")).toBe("item-k57abc");
  expect(babyFeedItemUrl({ itemId: "k57abc", publicId: "baby-born" })).toBe(
    "/baby/baby-born?item=k57abc#item-k57abc",
  );
});
