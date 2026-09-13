import { expect, test } from "vitest";
import { BABY_FEED_HASH, babyFeedUrl, babyPageUrl } from "../src/babyFeedUrl";

test("status push opens the baby page without a feed hash", () => {
  expect(babyPageUrl("baby-waiting")).toBe("/baby/baby-waiting");
});

test("owner message push opens the Updates & messages list", () => {
  expect(BABY_FEED_HASH).toBe("feed");
  expect(babyFeedUrl("baby-waiting")).toBe("/baby/baby-waiting#feed");
});
