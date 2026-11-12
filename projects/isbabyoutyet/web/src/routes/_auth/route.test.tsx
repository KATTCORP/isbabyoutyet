import { setData } from "@raf-query/react";
import type { FunctionReturnType } from "convex/server";
import { isRedirect } from "@tanstack/react-router";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { AppQueryClient } from "@/lib/query-client";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { expect, test, vi } from "vitest";
import { Route } from "@/routes/_auth/route";

test("auth layout is wired as the route component", () => {
  expect(Route.options.component).toBeTypeOf("function");
});

type Profile = NonNullable<FunctionReturnType<typeof api.profile.get>>;

function signedInProfile(snapshot: Pick<Profile, "isAdmin" | "locale" | "timeZone">): Profile {
  return { email: "ada@example.com", emailVerified: true, name: "Ada", ...snapshot };
}

/** A query client whose `profile.get` answers what the test says, signed out by default. */
function makeGuard() {
  const queryFn = vi.fn<() => Promise<Profile | null>>(() => Promise.resolve(null));
  const stub = stubQueryClientResource(queryFn);
  return Object.assign(stub, { queryFn });
}

// @ts-expect-error — stub loader opts are the fields this route reads
const loader: (opts: {
  context: { queryClient: AppQueryClient };
  location: { pathname: string };
}) => Promise<{ locale: Profile["locale"] }> = Route.options.loader;

async function redirectOf(run: () => Promise<object>) {
  try {
    await run();
  } catch (error) {
    if (isRedirect(error)) {
      return error.options;
    }
    throw error;
  }
  return expect.unreachable("expected a redirect");
}

test("signed in, the dashboard is in the profile's language", async () => {
  await using guard = makeGuard();
  guard.queryFn.mockResolvedValueOnce(
    signedInProfile({ isAdmin: false, locale: "sv", timeZone: "Europe/London" }),
  );

  const data = await loader({
    context: { queryClient: guard.queryClient },
    location: { pathname: "/dashboard" },
  });

  expect(data).toEqual({ locale: "sv" });
  expect(guard.queryFn).toHaveBeenCalledTimes(1);
});

test("a cached profile is not asked for again", async () => {
  await using guard = makeGuard();
  setData(
    guard.queryClient,
    convexQuery(api.profile.get),
    {},
    signedInProfile({ isAdmin: false, locale: "sv", timeZone: "Europe/London" }),
  );

  const data = await loader({
    context: { queryClient: guard.queryClient },
    location: { pathname: "/dashboard" },
  });

  expect(data).toEqual({ locale: "sv" });
  expect(guard.queryFn).not.toHaveBeenCalled();
});

test("signed out, the dashboard sends the visitor to login with a return path", async () => {
  await using guard = makeGuard();

  const redirect = await redirectOf(() =>
    loader({
      context: { queryClient: guard.queryClient },
      location: { pathname: "/dashboard/settings" },
    }),
  );

  expect(redirect).toMatchObject({
    replace: true,
    search: { redirect: "/dashboard/settings" },
    to: "/auth/login",
  });
});

test("an expired session, which flips the cached profile to null, goes to login", async () => {
  await using guard = makeGuard();
  setData(guard.queryClient, convexQuery(api.profile.get), {}, null);

  const redirect = await redirectOf(() =>
    loader({
      context: { queryClient: guard.queryClient },
      location: { pathname: "/dashboard/admin" },
    }),
  );

  expect(redirect).toMatchObject({ search: { redirect: "/dashboard/admin" }, to: "/auth/login" });
  expect(guard.queryFn).not.toHaveBeenCalled();
});
