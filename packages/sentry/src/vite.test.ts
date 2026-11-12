import { expect, test, vi } from "vitest";
import { resolveSentrySdk, sentryDefines } from "./vite.ts";

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

test("resolves Sentry's SDK from this package, since the apps don't depend on it", async () => {
  const plugin = resolveSentrySdk();
  const resolve = vi.fn(async () => ({ id: "/installed/sentry-sdk.js" }));

  // Sentry's plugin asks for the SDK when it wraps an app's server entry.
  const sdk = await plugin.resolveId.call({ resolve }, "@sentry/tanstackstart-react");
  const other = await plugin.resolveId.call({ resolve }, "react");

  expect(sdk).toEqual({ id: "/installed/sentry-sdk.js" });
  expect(other).toBeNull();
  expect(resolve).toHaveBeenCalledExactlyOnceWith(
    "@sentry/tanstackstart-react",
    expect.stringMatching(/packages\/sentry\/src\/vite\.ts$/),
    { skipSelf: true },
  );
});
