import { setData } from "@raf-query/react";
import type { FunctionReturnType } from "convex/server";
import { isRedirect } from "@tanstack/react-router";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { AppQueryClient } from "@/lib/query-client";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { expect, test, vi } from "vitest";
import { Route } from "@/routes/baby/$publicId/_auth/route";

test("baby manager auth layout is wired as the route component", () => {
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
  params: { publicId: string };
}) => Promise<void> = Route.options.loader;

async function redirectOf(run: () => Promise<void>) {
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

test("signed in, the overlays open and the page keeps the baby's language", async () => {
  await using guard = makeGuard();
  guard.queryFn.mockResolvedValueOnce(
    signedInProfile({ isAdmin: false, locale: "en-GB", timeZone: "Europe/London" }),
  );

  // No loader data: a `locale` here would switch a Swedish baby page to the
  // owner's saved language on /post and /settings.
  expect(
    await loader({
      context: { queryClient: guard.queryClient },
      location: { pathname: "/baby/test-baby-4/settings" },
      params: { publicId: "test-baby-4" },
    }),
  ).toBeUndefined();
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

  await loader({
    context: { queryClient: guard.queryClient },
    location: { pathname: "/baby/test-baby-4/post" },
    params: { publicId: "test-baby-4" },
  });

  expect(guard.queryFn).not.toHaveBeenCalled();
});

test("signed out, the overlays open the baby page's login with a return path", async () => {
  await using guard = makeGuard();

  const redirect = await redirectOf(() =>
    loader({
      context: { queryClient: guard.queryClient },
      location: { pathname: "/baby/test-baby-4/post" },
      params: { publicId: "test-baby-4" },
    }),
  );

  expect(redirect).toMatchObject({
    params: { publicId: "test-baby-4" },
    replace: true,
    search: { redirect: "/baby/test-baby-4/post" },
    to: "/baby/$publicId/login",
  });
});
