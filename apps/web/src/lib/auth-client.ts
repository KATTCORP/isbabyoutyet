import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { hashKey, QueryObserver } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import type { FunctionReturnType } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import { api } from "@workspace/convex/convex/_generated/api";
import { parseConvexTokenFromAuthResponse } from "@workspace/convex/src/convexToken";
import { isValidTimeZone, TIME_ZONE_HINT_HEADER } from "@workspace/convex/src/timeZone";
import { parseVisitorIdHint, VISITOR_ID_HINT_HEADER } from "@workspace/convex/src/visitorId";
import type { TranslationFunction } from "@/lib/i18n";
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

function emptyUnsubscribe() {}

function isMeQueryKey(queryKey: QueryKey, meKey: QueryKey) {
  return hashKey(queryKey) === hashKey(meKey);
}

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

function clearQueryCacheKeepingMe(queryClient: QueryClient, meKey: QueryKey) {
  queryClient.removeQueries({
    predicate: (query) => !isMeQueryKey(query.queryKey, meKey),
  });
}

/** @internal So a stuck websocket cannot pin the submit button forever. */
export const SETTLED_ME_WAIT_MS = 10_000;

/**
 * Starts a live `profile.get` observer (call this *before* sign-in / sign-up /
 * sign-out) and resolves once the result matches `opts.presence`.
 *
 * On a matching snapshot the query cache is cleared except `profile.get`.
 *
 * @internal
 */
export function waitForMe(opts: {
  convexQueryClient: Pick<ConvexQueryClient, "queryOptions">;
  presence: MePresence;
  queryClient: QueryClient;
}) {
  const signal = AbortSignal.timeout(SETTLED_ME_WAIT_MS);
  if (signal.aborted) {
    return Promise.resolve();
  }

  const meQuery = opts.convexQueryClient.queryOptions(api.profile.get, {});
  const observer = new QueryObserver(opts.queryClient, meQuery);
  const stop = new AbortController();
  const combined = AbortSignal.any([signal, stop.signal]);
  let unsubscribe = emptyUnsubscribe;

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (matched: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      observer.destroy();
      if (matched) {
        clearQueryCacheKeepingMe(opts.queryClient, meQuery.queryKey);
      }
      resolve();
    };

    const onResult = () => {
      const result = observer.getCurrentResult();
      if (result.isPending || result.isError) {
        return;
      }
      if (meMatchesPresence(result.data, opts.presence)) {
        stop.abort();
      }
    };

    unsubscribe = observer.subscribe(onResult);
    onResult();

    const onAbort = () => {
      const result = observer.getCurrentResult();
      finish(!result.isPending && !result.isError && meMatchesPresence(result.data, opts.presence));
    };
    combined.addEventListener("abort", onAbort, { once: true });
    if (combined.aborted) {
      onAbort();
    }
  });
}

type AuthThenGoOpts = {
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
  navigate: () => Promise<void> | void;
  queryClient: QueryClient;
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
    convexQueryClient: opts.convexQueryClient,
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
    convexQueryClient: opts.convexQueryClient,
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
    convexQueryClient: opts.convexQueryClient,
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
