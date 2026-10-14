import { ConvexHttpClient } from "convex/browser";
import { isRedirect } from "@tanstack/react-router";
import { makeAsyncResource } from "@isbabyoutyet/backend/convex/test.resource";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { SignedInProfileContext } from "@/lib/signed-in-profile";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { expect, test, vi } from "vitest";
import { resolveBabyManagerGuard, Route } from "@/routes/baby/$publicId/_auth/route";

test("baby manager auth layout is wired as the route component", () => {
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
  publicId: string;
}) {
  return await resolveBabyManagerGuard({
    context: opts.context,
    fetchToken: opts.fetchToken,
    pathname: opts.pathname,
    publicId: opts.publicId,
  });
}

/** Guard runs that are expected to throw a redirect (result is never observed). */
type GuardRunResult = object | null | void;

async function expectRedirectToBabyLogin(
  run: () => Promise<GuardRunResult>,
  opts: { pathname: string; publicId: string },
) {
  try {
    await run();
    expect.unreachable("expected a redirect");
  } catch (error) {
    expect(isRedirect(error)).toBe(true);
    if (isRedirect(error)) {
      expect(error.options.to).toBe("/baby/$publicId/login");
      expect(error.options.params).toEqual({ publicId: opts.publicId });
      expect(error.options.search).toEqual({ redirect: opts.pathname });
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

test("client overlay navigations reuse a cached profile without an auth round-trip", async () => {
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
    pathname: "/baby/baby-waiting/settings",
    publicId: "baby-waiting",
  });

  expect(result).toMatchObject({ token: null });
  expect(result).not.toHaveProperty("locale");
  expect(fetchToken).not.toHaveBeenCalled();
  expect(guard.queryFn).not.toHaveBeenCalled();
});

test("manager overlays keep the baby page locale instead of the signed-in profile locale", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  await using guard = makeGuardCtx();
  guard.queryClient.setData(
    convexQuery(api.profile.get),
    {},
    signedInProfile({
      isAdmin: false,
      locale: "en-GB",
      timeZone: "Europe/London",
    }),
  );

  const result = await runGuard({
    context: guard.context,
    fetchToken,
    pathname: "/baby/test-baby-4/post",
    publicId: "test-baby-4",
  });

  expect(result).not.toHaveProperty("locale");
});

test("client overlay navigations without a profile open baby-page login with a return path", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  await using guard = makeGuardCtx();

  await expectRedirectToBabyLogin(
    () =>
      runGuard({
        context: guard.context,
        fetchToken,
        pathname: "/baby/baby-waiting/post",
        publicId: "baby-waiting",
      }),
    { pathname: "/baby/baby-waiting/post", publicId: "baby-waiting" },
  );
  expect(fetchToken).not.toHaveBeenCalled();
});

test("server render redirects to baby-page login when no auth token is available", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null);
  await using guard = makeGuardCtx();

  await withoutBrowserWindow(async () => {
    await expectRedirectToBabyLogin(
      () =>
        runGuard({
          context: guard.context,
          fetchToken,
          pathname: "/baby/juniper-hale/settings",
          publicId: "juniper-hale",
        }),
      { pathname: "/baby/juniper-hale/settings", publicId: "juniper-hale" },
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
      pathname: "/baby/baby-waiting/settings",
      publicId: "baby-waiting",
    });

    expect(result).toMatchObject({
      token: "ssr-token",
    });
    expect(result).not.toHaveProperty("locale");
    expect(fetchToken).not.toHaveBeenCalled();
    expect(guard.setServerAuth).toHaveBeenCalledWith("ssr-token");
    expect(guard.queryFn).toHaveBeenCalledTimes(1);
  });
});

test("server render redirects to baby-page login when its authenticated profile cannot be read", async () => {
  const fetchToken = vi.fn<() => Promise<string | null>>();
  await using guard = makeGuardCtx();
  guard.context.token = "ssr-token";

  await withoutBrowserWindow(async () => {
    await expectRedirectToBabyLogin(
      () =>
        runGuard({
          context: guard.context,
          fetchToken,
          pathname: "/baby/baby-waiting/post",
          publicId: "baby-waiting",
        }),
      { pathname: "/baby/baby-waiting/post", publicId: "baby-waiting" },
    );
    expect(guard.queryFn).toHaveBeenCalledTimes(1);
  });
});
