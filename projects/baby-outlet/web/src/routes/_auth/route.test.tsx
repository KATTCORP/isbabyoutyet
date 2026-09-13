import { QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";

const getToken = vi.hoisted(() => vi.fn<() => Promise<string | null>>());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Outlet: () => null,
  redirect: (opts: unknown) => ({ isRedirect: true, ...(opts as object) }),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn }),
}));

vi.mock("@/lib/auth-server", () => ({
  authServer: { getToken },
}));

const { Route } = await import("@/routes/_auth/route");

type GuardCtx = {
  context: {
    queryClient: QueryClient;
    convexClient: unknown;
    token: string | null;
    locale: string;
  };
};

function makeGuardCtx() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => Promise.resolve(null) } },
  });
  const ctx: GuardCtx = {
    context: { queryClient, convexClient: {}, token: null, locale: "en-GB" },
  };
  const options = Route as unknown as {
    beforeLoad: (opts: GuardCtx) => Promise<{ locale: string; isAuthenticated: boolean }>;
  };
  return { ctx, queryClient, beforeLoad: options.beforeLoad };
}

test("client navigations with a cached profile skip the token round-trip", async () => {
  getToken.mockReset();
  const guard = makeGuardCtx();
  guard.queryClient.setQueryData(convexQuery(api.profile.get, {}).queryKey, {
    locale: "sv",
    isAdmin: false,
  });

  const result = await guard.beforeLoad(guard.ctx);

  expect(result).toMatchObject({ locale: "sv", isAuthenticated: true });
  expect(getToken).not.toHaveBeenCalled();
});

test("regression: a fresh login authenticates the websocket before ensuring the profile", async () => {
  // Right after login the cache still says "no profile" and the auth provider
  // hasn't re-authenticated the websocket yet — the guard must setAuth with
  // its fresh token before running profile.ensure, or ensure throws
  // "Not authenticated" and the login form shows "Something went wrong".
  getToken.mockReset();
  getToken.mockResolvedValueOnce("fresh-token");
  const setAuth = vi.fn<(fetchToken: () => Promise<string | null>) => void>();
  const mutation = vi.fn<() => Promise<unknown>>(() =>
    Promise.resolve({ locale: "en-US", isAdmin: false }),
  );
  const guard = makeGuardCtx();
  guard.ctx.context.convexClient = { setAuth, mutation };

  const result = await guard.beforeLoad(guard.ctx);

  expect(result).toMatchObject({ locale: "en-US", isAuthenticated: true });
  expect(setAuth).toHaveBeenCalledTimes(1);
  const setAuthOrder = setAuth.mock.invocationCallOrder[0] ?? Infinity;
  const mutationOrder = mutation.mock.invocationCallOrder[0] ?? 0;
  expect(setAuthOrder).toBeLessThan(mutationOrder);
  // The guard's token fetcher authenticates with the fresh token.
  const fetchToken = setAuth.mock.calls[0]?.[0];
  expect(await fetchToken?.()).toBe("fresh-token");
  // The ensured profile lands in the cache for subsequent navigations.
  expect(guard.queryClient.getQueryData(convexQuery(api.profile.get, {}).queryKey)).toMatchObject({
    locale: "en-US",
  });
});

test("client navigations without a session redirect home after one token check", async () => {
  getToken.mockReset();
  getToken.mockResolvedValueOnce(null);
  const guard = makeGuardCtx();

  await expect(guard.beforeLoad(guard.ctx)).rejects.toMatchObject({
    isRedirect: true,
    to: "/",
  });
  expect(getToken).toHaveBeenCalledTimes(1);
});
