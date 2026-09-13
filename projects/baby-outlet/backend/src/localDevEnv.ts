import { convexEnvSchema } from "./env";

/**
 * Placeholder values for a local anonymous Convex backend. VAPID keys are
 * generated once and reused; VAPID_SUBJECT / VERCEL_ENV stay unset (schema
 * defaults / optional).
 */
export const LOCAL_DEV_CONVEX_ENV = {
  BETTER_AUTH_SECRET: "localhost",
  EMAIL_FROM: "noreply@example.com",
  RESEND_API_KEY: "placeholder",
  SITE_URL: "http://localhost:3000",
} as const;

const LOCAL_DEV_PARSE_PLACEHOLDERS = {
  ...LOCAL_DEV_CONVEX_ENV,
  VAPID_PRIVATE_KEY: "local-dev-vapid-private",
  VAPID_PUBLIC_KEY: "local-dev-vapid-public",
};

const VAPID_PUBLIC_KEY = "VAPID_PUBLIC_KEY";
const VAPID_PRIVATE_KEY = "VAPID_PRIVATE_KEY";

export function parseConvexEnvList(stdout: string) {
  const env: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator);
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      continue;
    }
    env[key] = trimmed.slice(separator + 1);
  }
  return env;
}

function localFieldNeedsSet(key: keyof typeof LOCAL_DEV_CONVEX_ENV, existing: string | undefined) {
  return !convexEnvSchema.safeParse({
    ...LOCAL_DEV_PARSE_PLACEHOLDERS,
    [key]: existing,
  }).success;
}

export function staticLocalConvexEnvUpdates(
  existing: Readonly<Record<string, string | undefined>>,
) {
  const updates: Record<string, string> = {};
  if (localFieldNeedsSet("BETTER_AUTH_SECRET", existing.BETTER_AUTH_SECRET)) {
    updates.BETTER_AUTH_SECRET = LOCAL_DEV_CONVEX_ENV.BETTER_AUTH_SECRET;
  }
  if (localFieldNeedsSet("EMAIL_FROM", existing.EMAIL_FROM)) {
    updates.EMAIL_FROM = LOCAL_DEV_CONVEX_ENV.EMAIL_FROM;
  }
  if (localFieldNeedsSet("RESEND_API_KEY", existing.RESEND_API_KEY)) {
    updates.RESEND_API_KEY = LOCAL_DEV_CONVEX_ENV.RESEND_API_KEY;
  }
  if (localFieldNeedsSet("SITE_URL", existing.SITE_URL)) {
    updates.SITE_URL = LOCAL_DEV_CONVEX_ENV.SITE_URL;
  }
  return updates;
}

export function vapidKeysAreSet(existing: Readonly<Record<string, string | undefined>>) {
  return convexEnvSchema.safeParse({
    ...LOCAL_DEV_CONVEX_ENV,
    VAPID_PRIVATE_KEY: existing[VAPID_PRIVATE_KEY],
    VAPID_PUBLIC_KEY: existing[VAPID_PUBLIC_KEY],
  }).success;
}

export const GENERATED_LOCAL_DEV_CONVEX_ENV_KEYS = [VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY] as const;
