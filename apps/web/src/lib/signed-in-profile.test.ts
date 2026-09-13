import { QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { getConvexQueryPreloader } from "@workspace/convex-prefetch";
import { api } from "@workspace/convex/convex/_generated/api";
import { makeResource } from "@workspace/convex/convex/test.resource";
import { expect, test, vi } from "vitest";
import { loadSignedInProfile } from "@/lib/signed-in-profile";

/**
 * The SSR branch cannot run under a real TanStack Start request in jsdom, so
 * these tests drive `loadSignedInProfile` with an injected token fetcher and
 * a React Query cache. The client branch is covered route-by-route against
 * the Convex test harness (`routes/_auth/route.test.tsx` and the baby one).
 */

type ProfileSnapshot = {
  isAdmin: boolean;
  locale: string;
  timeZone: string;
};

const ADA_PROFILE: ProfileSnapshot = { isAdmin: false, locale: "sv", timeZone: "Europe/London" };

/** The slice of root route context `loadSignedInProfile` reads. */
type FixtureContext = {
  convexClient:
    | { setAuth: (fetchToken: () => Promise<string | null>) => void }
    | Record<string, never>;
  convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
  convexQueryClient: { serverHttpClient: { setAuth: (token: string) => void } };
  queryClient: QueryClient;
  token: string | null;
};

function makeContext() {
  const queryFn = vi.fn<() => Promise<null | ProfileSnapshot>>(() => Promise.resolve(null));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn, retry: false } },
  });
  const setServerAuth = vi.fn<(token: string) => void>();
  const context: FixtureContext = {
    convexClient: {},
    convexPreloader: getConvexQueryPreloader(queryClient),
    convexQueryClient: { serverHttpClient: { setAuth: setServerAuth } },
    queryClient,
    token: null,
  };
  return { context, queryClient, queryFn, setServerAuth };
}

function load(opts: { context: FixtureContext; fetchToken: () => Promise<string | null> }) {
  return loadSignedInProfile({
    // SAFETY: Test fixture is a subset of the production type.
    context: opts.context as Parameters<typeof loadSignedInProfile>[0]["context"],
    fetchToken: opts.fetchToken,
  });
}

/** Pretend to be the server for the duration of a test. */
function withoutBrowserWindow() {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
  return makeResource({}, () => {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    }
  });
}

test("client navigations reuse the cached profile without an auth round-trip", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const fixture = makeContext();
  fixture.queryClient.setQueryData(convexQuery(api.profile.get, {}).queryKey, ADA_PROFILE);

  const result = await load({ context: fixture.context, fetchToken });

  expect(result).toMatchObject({ locale: "sv", token: null });
  expect(fetchToken).not.toHaveBeenCalled();
  expect(fixture.queryFn).not.toHaveBeenCalled();
  expect(fixture.queryClient.getQueryData(convexQuery(api.profile.get, {}).queryKey)).toEqual(
    ADA_PROFILE,
  );
});

test("client navigations without a profile are signed out", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const fixture = makeContext();

  expect(await load({ context: fixture.context, fetchToken })).toBeNull();
  expect(fetchToken).not.toHaveBeenCalled();
});

test("server render is signed out when no auth token is available", async () => {
  using _server = withoutBrowserWindow();
  const fetchToken = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null);
  const fixture = makeContext();

  expect(await load({ context: fixture.context, fetchToken })).toBeNull();
  expect(fetchToken).toHaveBeenCalledTimes(1);
  expect(fixture.queryFn).not.toHaveBeenCalled();
});

test("server render reuses the layout token and authenticates the server client", async () => {
  using _server = withoutBrowserWindow();
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const fixture = makeContext();
  fixture.queryFn.mockResolvedValueOnce({ ...ADA_PROFILE, locale: "en-GB" });
  fixture.context.token = "ssr-token";

  const result = await load({ context: fixture.context, fetchToken });

  expect(result).toMatchObject({ locale: "en-GB", token: "ssr-token" });
  expect(fetchToken).not.toHaveBeenCalled();
  expect(fixture.setServerAuth).toHaveBeenCalledWith("ssr-token");
  expect(fixture.queryFn).toHaveBeenCalledTimes(1);
});

test("server render fetches the token when the layout has none", async () => {
  using _server = withoutBrowserWindow();
  const fetchToken = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce("cookie-token");
  const fixture = makeContext();
  fixture.queryFn.mockResolvedValueOnce(ADA_PROFILE);

  const result = await load({ context: fixture.context, fetchToken });

  expect(result).toMatchObject({ locale: "sv", token: "cookie-token" });
  expect(fixture.setServerAuth).toHaveBeenCalledWith("cookie-token");
});

test("server render is signed out when the token no longer resolves a profile", async () => {
  using _server = withoutBrowserWindow();
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const fixture = makeContext();
  fixture.context.token = "ssr-token";

  expect(await load({ context: fixture.context, fetchToken })).toBeNull();
  expect(fixture.queryFn).toHaveBeenCalledTimes(1);
});
