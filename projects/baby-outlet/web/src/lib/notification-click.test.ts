import { expect, test } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { applyNotificationClickUrl, shouldReuseBabyClient } from "./notification-click";

function withPath(path: string) {
  const previous = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.history.replaceState(null, "", path);
  return makeResource({}, () => {
    window.history.replaceState(null, "", previous);
  });
}

test("reuses the open baby tab even when only the hash differs", () => {
  expect(
    shouldReuseBabyClient({
      clientUrl: "https://isbabyoutyet.com/baby/baby-waiting",
      targetUrl: "https://isbabyoutyet.com/baby/baby-waiting#feed",
    }),
  ).toBe(true);
});

test("does not steal a nested overlay tab for a feed notification", () => {
  expect(
    shouldReuseBabyClient({
      clientUrl: "https://isbabyoutyet.com/baby/baby-waiting/photo",
      targetUrl: "https://isbabyoutyet.com/baby/baby-waiting#feed",
    }),
  ).toBe(false);
  expect(
    shouldReuseBabyClient({
      clientUrl: "https://isbabyoutyet.com/baby/baby-waiting/login",
      targetUrl: "https://isbabyoutyet.com/baby/baby-waiting#feed",
    }),
  ).toBe(false);
});

test("does not reuse a tab for a different baby", () => {
  expect(
    shouldReuseBabyClient({
      clientUrl: "https://isbabyoutyet.com/baby/baby-waiting",
      targetUrl: "https://isbabyoutyet.com/baby/other-baby#feed",
    }),
  ).toBe(false);
});

test("does not reuse a tab from another origin", () => {
  expect(
    shouldReuseBabyClient({
      clientUrl: "https://preview.example/baby/baby-waiting",
      targetUrl: "https://isbabyoutyet.com/baby/baby-waiting#feed",
    }),
  ).toBe(false);
});

test("does not reuse the dashboard or home for a baby notification", () => {
  expect(
    shouldReuseBabyClient({
      clientUrl: "https://isbabyoutyet.com/dashboard",
      targetUrl: "https://isbabyoutyet.com/baby/baby-waiting#feed",
    }),
  ).toBe(false);
});

test("applyNotificationClickUrl sets a same-origin feed hash", async () => {
  await using _path = withPath("/baby/baby-waiting");
  applyNotificationClickUrl(`${window.location.origin}/baby/baby-waiting#feed`);
  expect(window.location.hash).toBe("#feed");
});

test("applyNotificationClickUrl leaves the page as-is when the target has no hash", async () => {
  await using _path = withPath("/baby/baby-waiting");
  applyNotificationClickUrl(`${window.location.origin}/baby/baby-waiting`);
  expect(window.location.hash).toBe("");
});

test("applyNotificationClickUrl ignores another origin", async () => {
  await using _path = withPath("/baby/baby-waiting");
  applyNotificationClickUrl("https://preview.example/baby/baby-waiting#feed");
  expect(window.location.hash).toBe("");
});
