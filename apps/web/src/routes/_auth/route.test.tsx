import { QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { isRedirect } from "@tanstack/react-router";
import { getConvexQueryPreloader } from "@workspace/convex-prefetch";
import { api } from "@workspace/convex/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { resolveAuthGuard, Route } from "@/routes/_auth/route";

test("auth layout is wired as the route component", () => {
  expect(Route.options.component).toBeTypeOf("function");
});

type GuardCtx = {
  convexClient:
    | { setAuth: (fetchToken: () => Promise<string | null>) => void }
    | Record<string, never>;
  convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
  convexQueryClient: {
    serverHttpClient: { setAuth: (token: string) => void };
  };
  queryClient: QueryClient;
  token: string | null;
};

type ProfileSnapshot = {
  isAdmin: boolean;
  locale: string;
  timeZone: string;
};

function makeGuardCtx() {
  const queryFn = vi.fn<() => Promise<null | ProfileSnapshot>>(() => Promise.resolve(null));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn, retry: false } },
  });
  const setServerAuth = vi.fn<(token: string) => void>();
  const context: GuardCtx = {
    convexClient: {},
    convexPreloader: getConvexQueryPreloader(queryClient),
    convexQueryClient: { serverHttpClient: { setAuth: setServerAuth } },
    queryClient,
    token: null,
  };
  return { context, queryClient, queryFn, setServerAuth };
}

async function runGuard(opts: {
  context: GuardCtx;
  fetchToken: () => Promise<string | null>;
  pathname: string;
}) {
  return await resolveAuthGuard({
    // SAFETY: Test fixture is a subset of the production type.
    context: opts.context as Parameters<typeof resolveAuthGuard>[0]["context"],
    fetchToken: opts.fetchToken,
    pathname: opts.pathname,
  });
}

/** Guard runs that are expected to throw a redirect (result is never observed). */
type GuardRunResult = object | null | void;

async function expectRedirectToLogin(run: () => Promise<GuardRunResult>, pathname: string) {
  try {
    await run();
    expect.unreachable("expected a redirect");
  } catch (error) {
    expect(isRedirect(error)).toBe(true);
    if (isRedirect(error)) {
      expect(error.options.to).toBe("/auth/login");
      expect(error.options.search).toEqual({ redirect: pathname });
      expect(error.options.replace).toBe(true);
    }
  }
}

function withoutBrowserWindow(run: () => Promise<void>) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
  return run().finally(() => {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    }
  });
}

test("client navigations reuse a cached profile without an auth round-trip", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const guard = makeGuardCtx();
  guard.queryClient.setQueryData(convexQuery(api.profile.get, {}).queryKey, {
    isAdmin: false,
    locale: "sv",
    timeZone: "Europe/London",
  });

  const result = await runGuard({
    context: guard.context,
    fetchToken,
    pathname: "/dashboard",
  });

  expect(result).toMatchObject({ locale: "sv" });
  expect(result).not.toHaveProperty("isAuthenticated");
  expect(fetchToken).not.toHaveBeenCalled();
  expect(guard.queryFn).not.toHaveBeenCalled();
});

test("client navigations without a profile send the user to login with a return path", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const guard = makeGuardCtx();

  await expectRedirectToLogin(
    () =>
      runGuard({
        context: guard.context,
        fetchToken,
        pathname: "/dashboard/settings",
      }),
    "/dashboard/settings",
  );
  expect(fetchToken).not.toHaveBeenCalled();
});

test("client navigations keep the cached profile", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const cachedProfile = { isAdmin: false, locale: "sv", timeZone: "Europe/London" };
  const guard = makeGuardCtx();
  guard.queryClient.setQueryData(convexQuery(api.profile.get, {}).queryKey, cachedProfile);

  const result = await runGuard({
    context: guard.context,
    fetchToken,
    pathname: "/dashboard",
  });

  expect(result).toMatchObject({ locale: "sv" });
  expect(guard.queryClient.getQueryData(convexQuery(api.profile.get, {}).queryKey)).toEqual(
    cachedProfile,
  );
  expect(guard.queryFn).not.toHaveBeenCalled();
});

test("server render redirects to login when no auth token is available", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null);
  const guard = makeGuardCtx();

  await withoutBrowserWindow(async () => {
    await expectRedirectToLogin(
      () =>
        runGuard({
          context: guard.context,
          fetchToken,
          pathname: "/dashboard",
        }),
      "/dashboard",
    );
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });
});

test("server render reuses the layout token without calling getAuthToken", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const guard = makeGuardCtx();
  guard.queryFn.mockResolvedValueOnce({
    isAdmin: false,
    locale: "en-GB",
    timeZone: "Europe/London",
  });
  guard.context.token = "ssr-token";

  await withoutBrowserWindow(async () => {
    const result = await runGuard({
      context: guard.context,
      fetchToken,
      pathname: "/dashboard",
    });

    expect(result).toMatchObject({
      locale: "en-GB",
      token: "ssr-token",
    });
    expect(result).not.toHaveProperty("isAuthenticated");
    expect(fetchToken).not.toHaveBeenCalled();
    expect(guard.setServerAuth).toHaveBeenCalledWith("ssr-token");
    expect(guard.queryFn).toHaveBeenCalledTimes(1);
  });
});

test("server render redirects to login when its authenticated profile cannot be read", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  const guard = makeGuardCtx();
  guard.context.token = "ssr-token";

  await withoutBrowserWindow(async () => {
    await expectRedirectToLogin(
      () =>
        runGuard({
          context: guard.context,
          fetchToken,
          pathname: "/dashboard/admin",
        }),
      "/dashboard/admin",
    );
    expect(guard.queryFn).toHaveBeenCalledTimes(1);
  });
});
