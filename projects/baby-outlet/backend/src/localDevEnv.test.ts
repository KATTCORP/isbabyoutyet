import { expect, test } from "vitest";
import { convexEnvSchema } from "./env";
import {
  GENERATED_LOCAL_DEV_CONVEX_ENV_KEYS,
  LOCAL_DEV_CONVEX_ENV,
  parseConvexEnvList,
  staticLocalConvexEnvUpdates,
  vapidKeysAreSet,
} from "./localDevEnv";

test("local placeholders plus generated VAPID keys satisfy the Convex env schema", () => {
  const localEnv = {
    ...LOCAL_DEV_CONVEX_ENV,
    VAPID_PRIVATE_KEY: "private",
    VAPID_PUBLIC_KEY: "public",
  };
  for (const key of GENERATED_LOCAL_DEV_CONVEX_ENV_KEYS) {
    expect(key in localEnv).toBe(true);
  }
  expect(convexEnvSchema.safeParse(localEnv).success).toBe(true);
});

test("replaces missing and invalid static env, keeps valid values", () => {
  expect(staticLocalConvexEnvUpdates({})).toEqual({ ...LOCAL_DEV_CONVEX_ENV });
  expect(
    staticLocalConvexEnvUpdates({
      ...LOCAL_DEV_CONVEX_ENV,
      EMAIL_FROM: "noreply@localhost",
    }),
  ).toEqual({ EMAIL_FROM: LOCAL_DEV_CONVEX_ENV.EMAIL_FROM });
  expect(
    staticLocalConvexEnvUpdates({
      ...LOCAL_DEV_CONVEX_ENV,
    }),
  ).toEqual({});
});

test("vapid keys are generated only when missing", () => {
  expect(vapidKeysAreSet({})).toBe(false);
  expect(
    vapidKeysAreSet({
      VAPID_PRIVATE_KEY: "private",
      VAPID_PUBLIC_KEY: "public",
    }),
  ).toBe(true);
});

test("parseConvexEnvList reads KEY=value lines", () => {
  expect(
    parseConvexEnvList(`
Environment variables:
BETTER_AUTH_SECRET=localhost
EMAIL_FROM=noreply@localhost
SITE_URL=http://localhost:3000
`),
  ).toEqual({
    BETTER_AUTH_SECRET: "localhost",
    EMAIL_FROM: "noreply@localhost",
    SITE_URL: "http://localhost:3000",
  });
});
