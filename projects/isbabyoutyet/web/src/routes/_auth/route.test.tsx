import { ConvexHttpClient } from "convex/browser";
import { isRedirect } from "@tanstack/react-router";
import { makeAsyncResource } from "@isbabyoutyet/backend/convex/test.resource";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { SignedInProfileContext } from "@/lib/signed-in-profile";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { expect, test, vi } from "vitest";
import { resolveAuthGuard, Route } from "@/routes/_auth/route";

test("auth layout is wired as the route component", () => {
  expect(Route.options.component).toBeTypeOf("function");
});

type ProfileSnapshot = {
  isAdmin: boolean;
  locale: "en-GB" | "sv";
  timeZone: string;
};

function signedInProfile(snapshot: ProfileSnapshot) {
  return { email: "ada@example.com", emailVerified: true, name: "Ada", ...snapshot };
}

function makeGuardCtx() {
  const queryFn = vi.fn<() => Promise<null | ReturnType<typeof signedInProfile>>>(() =>
    Promise.resolve(null),
  );
  const stub = stubQueryClientResource(queryFn);
  const convexHttpClient = new ConvexHttpClient("https://guard-test.convex.cloud");
  const setServerAuth = vi.spyOn(convexHttpClient, "setAuth");
  const context: SignedInProfileContext = {
    convexHttpClient,
    queryClient: stub.queryClient,
    token: null,
  };
  return makeAsyncResource(
    { context, queryClient: stub.queryClient, queryFn, setServerAuth },
    async () => {
      await stub[Symbol.asyncDispose]();
    },
  );
}

async function runGuard(opts: {
  context: ReturnType<typeof makeGuardCtx>["context"];
  fetchToken: () => Promise<string | null>;
  pathname: string;
}) {
  return await resolveAuthGuard({
    context: opts.context,
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
  await using guard = makeGuardCtx();
  guard.queryClient.setData(
    convexQuery(api.profile.get),
    {},
    signedInProfile({
      isAdmin: false,
      locale: "sv",
      timeZone: "Europe/London",
    }),
  );

  const result = await runGuard({
    context: guard.context,
    fetchToken,
    pathname: "/dashboard",
  });

  expect(result).toMatchObject({ locale: "sv", me: { data: expect.anything(), input: {} } });
  expect(result).not.toHaveProperty("isAuthenticated");
  expect(fetchToken).not.toHaveBeenCalled();
  expect(guard.queryFn).not.toHaveBeenCalled();
});

test("client navigations without a profile send the user to login with a return path", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  await using guard = makeGuardCtx();

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
  const cachedProfile = signedInProfile({
    isAdmin: false,
    locale: "sv",
    timeZone: "Europe/London",
  });
  await using guard = makeGuardCtx();
  guard.queryClient.setData(convexQuery(api.profile.get), {}, cachedProfile);

  const result = await runGuard({
    context: guard.context,
    fetchToken,
    pathname: "/dashboard",
  });

  expect(result).toMatchObject({ locale: "sv" });
  expect(guard.queryClient.getData(convexQuery(api.profile.get), {})).toEqual(cachedProfile);
  expect(guard.queryFn).not.toHaveBeenCalled();
});

test("server render redirects to login when no auth token is available", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null);
  await using guard = makeGuardCtx();

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
  await using guard = makeGuardCtx();
  guard.queryFn.mockResolvedValueOnce(
    signedInProfile({
      isAdmin: false,
      locale: "en-GB",
      timeZone: "Europe/London",
    }),
  );
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
  await using guard = makeGuardCtx();
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
