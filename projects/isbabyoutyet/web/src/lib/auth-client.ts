import type { QueryClient } from "@raf-query/react";
import { hashKey } from "@raf-query/react";
import type { ConvexReader, ConvexWatchClient } from "@workspace/convex-query";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import type { FunctionReturnType } from "convex/server";
import { Effect, Option, Stream } from "effect";
import type { ConvexReactClient } from "convex/react";
import { parseConvexTokenFromAuthResponse } from "@isbabyoutyet/backend/src/convexToken";
import { isValidTimeZone, TIME_ZONE_HINT_HEADER } from "@isbabyoutyet/backend/src/timeZone";
import { parseVisitorIdHint, VISITOR_ID_HINT_HEADER } from "@isbabyoutyet/backend/src/visitorId";
import type { TranslationFunction } from "@/lib/i18n";
import { convexQuery, watchConvexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { peekVisitorId } from "@/lib/use-visitor-id";

function browserTimeZone() {
  try {
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && isValidTimeZone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

/** @internal */
export function getBrowserAuthHeaders() {
  const headers: Record<string, string> = {};
  if (globalThis.window === undefined) {
    return headers;
  }
  const timeZone = browserTimeZone();
  const visitorId = parseVisitorIdHint(peekVisitorId());
  if (timeZone) {
    headers[TIME_ZONE_HINT_HEADER] = timeZone;
  }
  if (visitorId) {
    headers[VISITOR_ID_HINT_HEADER] = visitorId;
  }
  return headers;
}

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SITE_URL,
  plugins: [convexClient()],
});

/**
 * Sole `setAuth` owner for the browser Convex client (router `hydrate`, login,
 * signup). A known JWT (SSR cookie, sign-in response) authenticates without a
 * round trip; `null` and every later refresh go to `/convex/token`, which
 * answers 401 for anonymous visitors and re-mints for a live session cookie.
 *
 * Sign-out uses {@link clearClientToken} instead: `setAuth` pauses the socket
 * while it fetches, and a `clearAuth` issued during that pause is dropped, so
 * the server would keep the old identity.
 */
export function setClientToken(convexReactClient: ConvexReactClient, token: string | null) {
  let nextToken = token;
  convexReactClient.setAuth(async (opts) => {
    if (!opts.forceRefreshToken && nextToken) {
      return nextToken;
    }
    const result = await authClient.convex
      .token({ fetchOptions: { throw: false } })
      .catch(() => null);

    nextToken = result?.data?.token ?? null;
    return nextToken;
  });
}

/**
 * Drop the identity on the live socket right away (sign-out).
 *
 * @internal exported for tests
 */
export function clearClientToken(convexReactClient: ConvexReactClient) {
  convexReactClient.clearAuth();
}

export type MePresence = "present" | "absent";

function meMatchesPresence(
  value: FunctionReturnType<typeof api.profile.get> | undefined,
  presence: MePresence,
) {
  if (value === undefined) {
    return false;
  }
  switch (presence) {
    case "present":
      return value !== null;
    case "absent":
      return value === null;
    default: {
      const _exhaustive: never = presence;
      return _exhaustive;
    }
  }
}

/** @internal So a stuck websocket cannot pin the submit button forever. */
export const SETTLED_ME_WAIT_MS = 10_000;

/**
 * Watches `profile.get` (call this *before* sign-in / sign-up / sign-out) and
 * resolves once a value matches `opts.presence`, or after
 * {@link SETTLED_ME_WAIT_MS}.
 *
 * On a match every other cache entry is removed, so the next screen loads
 * with the new identity.
 *
 * @internal
 */
export async function waitForMe(opts: {
  convexClient: ConvexWatchClient;
  presence: MePresence;
  queryClient: QueryClient<ConvexReader>;
}) {
  // Convex can answer with the old identity until the auth change re-runs the
  // query, so wait for a matching value instead of reading once.
  const me = await Effect.runPromise(
    watchConvexQuery(
      { client: opts.convexClient, queryClient: opts.queryClient },
      { args: {}, query: api.profile.get },
    ).pipe(
      Stream.filter((value) => meMatchesPresence(value, opts.presence)),
      Stream.runHead,
      Effect.timeoutOption(SETTLED_ME_WAIT_MS),
      Effect.map(Option.flatten),
    ),
  );
  if (Option.isSome(me)) {
    const meHash = hashKey(convexQuery(api.profile.get)({}).queryKey);
    opts.queryClient.remove({ predicate: (query) => query.hash !== meHash });
  }
}

type AuthThenGoOpts = {
  convexClient: ConvexReactClient;
  navigate: () => Promise<void> | void;
  queryClient: QueryClient<ConvexReader>;
};

/**
 * Sign in, then SPA-navigate. Callers own the destination (dashboard, baby
 * page, or overlay close).
 */
export async function signInThenGo(
  values: { email: string; password: string },
  opts: AuthThenGoOpts & { t: TranslationFunction },
) {
  const settled = waitForMe({
    convexClient: opts.convexClient,
    presence: "present",
    queryClient: opts.queryClient,
  });
  const result = await authClient.signIn.email(
    { email: values.email, password: values.password, rememberMe: true },
    { headers: getBrowserAuthHeaders() },
  );
  if (result.error) {
    throw new Error(result.error.message || opts.t("Failed to sign in"));
  }
  setClientToken(opts.convexClient, parseConvexTokenFromAuthResponse(result.data));
  await settled;
  await opts.navigate();
}

/**
 * Create the account, then SPA-navigate. Callers own the destination
 * (dashboard, or overlay close).
 */
export async function signUpThenGo(
  values: { email: string; name: string; password: string },
  opts: AuthThenGoOpts & { t: TranslationFunction },
) {
  const settled = waitForMe({
    convexClient: opts.convexClient,
    presence: "present",
    queryClient: opts.queryClient,
  });
  const result = await authClient.signUp.email(
    { email: values.email, name: values.name, password: values.password },
    { headers: getBrowserAuthHeaders() },
  );
  if (result.error) {
    throw new Error(result.error.message || opts.t("Failed to sign up"));
  }
  setClientToken(opts.convexClient, parseConvexTokenFromAuthResponse(result.data));
  await settled;
  await opts.navigate();
}

type GoOpts = {
  navigate: () => Promise<void> | void;
  t: TranslationFunction;
};

/**
 * Email a reset link, then SPA-navigate (the forgot-password page marks
 * itself sent through the URL). No Convex identity changes here.
 */
export async function requestPasswordResetThenGo(values: { email: string }, opts: GoOpts) {
  const result = await authClient.requestPasswordReset({
    email: values.email,
    redirectTo: `${import.meta.env.VITE_SITE_URL}/auth/reset-password`,
  });
  if (result.error) {
    throw new Error(result.error.message || opts.t("Unable to request a password reset"));
  }
  await opts.navigate();
}

/**
 * Set the new password from a reset link, then SPA-navigate. Better Auth does
 * not open a session here (and revokes the old ones), so the destination is
 * the login page and there is no Convex identity to wait for.
 */
export async function resetPasswordThenGo(
  values: { newPassword: string; token: string },
  opts: GoOpts,
) {
  const result = await authClient.resetPassword({
    newPassword: values.newPassword,
    token: values.token,
  });
  if (result.error) {
    throw new Error(result.error.message || opts.t("Unable to reset your password"));
  }
  await opts.navigate();
}

/**
 * Sign out, then SPA-navigate. Callers own the destination (usually home).
 */
export async function signOutThenGo(opts: AuthThenGoOpts & { t: TranslationFunction }) {
  const settled = waitForMe({
    convexClient: opts.convexClient,
    presence: "absent",
    queryClient: opts.queryClient,
  });
  const result = await authClient.signOut();
  if (result.error) {
    throw new Error(result.error.message || opts.t("Failed to sign out"));
  }
  clearClientToken(opts.convexClient);
  await settled;
  await opts.navigate();
}
