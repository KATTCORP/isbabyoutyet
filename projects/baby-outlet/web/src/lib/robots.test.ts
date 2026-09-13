import { expect, test } from "vitest";
import { HOMEPAGE_DEMO_BABIES } from "@baby-outlet/backend/src/seedCredentials";
import {
  aiNoTrainHeaders,
  aiNoTrainMeta,
  babyPageRobotsHeaders,
  isIndexableBabyPublicId,
  noIndexHeaders,
  robotsTxt,
  searchRobotsMeta,
} from "@/lib/robots";

test("only homepage live-demo baby pages are indexable", () => {
  expect(isIndexableBabyPublicId("juniper-hale")).toBe(true);
  expect(isIndexableBabyPublicId("willow-brooks")).toBe(true);
  expect(isIndexableBabyPublicId("ella-holm")).toBe(true);
  expect(isIndexableBabyPublicId("lucia-navarro")).toBe(true);
  expect(isIndexableBabyPublicId("helena-costa")).toBe(true);
  expect(isIndexableBabyPublicId("baby-waiting")).toBe(false);
  expect(isIndexableBabyPublicId("baby-born")).toBe(false);
  expect(isIndexableBabyPublicId("some-real-family-page")).toBe(false);
});

test("robots.txt blocks family baby pages and allows live demos", () => {
  const body = robotsTxt();
  expect(body).toContain("Disallow: /baby/");
  expect(body).toContain("Disallow: /og/baby/");
  for (const baby of Object.values(HOMEPAGE_DEMO_BABIES)) {
    expect(body).toContain(`Allow: /baby/${baby.publicId}`);
    expect(body).toContain(`Allow: /og/baby/${baby.publicId}`);
  }
});

test("robots.txt forbids model-training crawlers from every path", () => {
  const body = robotsTxt();
  expect(body).toContain("User-agent: GPTBot\nDisallow: /");
  expect(body).toContain("User-agent: Google-Extended\nDisallow: /");
  expect(body).toContain("User-agent: CCBot\nDisallow: /");
  expect(body).toContain("User-agent: ClaudeBot\nDisallow: /");
  expect(body).toContain("User-agent: Applebot-Extended\nDisallow: /");
});

test("search robots meta keeps Google indexing off family pages", () => {
  const indexed = searchRobotsMeta({ index: true });
  const hidden = searchRobotsMeta({ index: false });
  expect(indexed.some((tag) => tag.content.includes("noai"))).toBe(true);
  expect(indexed.some((tag) => tag.name === "googlebot" && tag.content === "index, follow")).toBe(
    true,
  );
  expect(hidden.some((tag) => tag.content.includes("noindex"))).toBe(true);
  expect(hidden.some((tag) => tag.name === "googlebot" && tag.content.includes("noindex"))).toBe(
    true,
  );
});

test("AI training opt-out tags apply site-wide and with noindex", () => {
  expect(aiNoTrainMeta()).toEqual([{ name: "robots", content: "noai, noimageai" }]);
  expect(aiNoTrainHeaders()["X-Robots-Tag"]).toBe("noai, noimageai");
  expect(noIndexHeaders()["X-Robots-Tag"]).toContain("noindex");
  expect(noIndexHeaders()["X-Robots-Tag"]).toContain("noai");
});

test("baby page X-Robots-Tag is noindex except live demos", () => {
  expect(babyPageRobotsHeaders("juniper-hale")).toEqual({});
  expect(babyPageRobotsHeaders("a-real-family-page")).toEqual(noIndexHeaders());
});
