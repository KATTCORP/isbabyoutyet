import { expect, test } from "vitest";
import { sentryDefines } from "./vite.ts";

test("tags browser events with Vercel's environment, so previews aren't reported as production", () => {
  expect(sentryDefines({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: "abc123" })).toEqual({
    "import.meta.env.VITE_SENTRY_ENVIRONMENT": '"preview"',
    "import.meta.env.VITE_SENTRY_RELEASE": '"abc123"',
  });
});

test("SENTRY_RELEASE wins over the commit SHA", () => {
  expect(sentryDefines({ SENTRY_RELEASE: "v1", VERCEL_GIT_COMMIT_SHA: "abc123" })).toEqual({
    "import.meta.env.VITE_SENTRY_RELEASE": '"v1"',
  });
});

test("defines nothing outside Vercel", () => {
  expect(sentryDefines({ VERCEL_ENV: "" })).toEqual({});
});
