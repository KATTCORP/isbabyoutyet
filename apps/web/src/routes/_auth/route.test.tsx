import { isRedirect } from "@tanstack/react-router";
import { api } from "@workspace/convex/convex/_generated/api";
import { expect, test } from "vitest";
import { Route } from "@/routes/_auth/route";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signInTestUser, signUpTestUser } from "@/test/convexTestSeed";
import { runRouteBeforeLoad } from "@/test/routeTestContext";

const ADA = { email: "ada@example.com", name: "Ada", password: "password123" };

test("auth layout is wired as the route component", () => {
  expect(Route.options.component).toBeTypeOf("function");
});

test("a signed-in user passes the guard with their profile and language", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await signInTestUser(harness, ADA);

  const result = await runRouteBeforeLoad({
    harness,
    location: { pathname: "/dashboard" },
    params: {},
    route: Route,
  });

  expect(result).toMatchObject({ locale: "en-GB", token: undefined });
  expect(result).toHaveProperty("profile");
  expect(result).not.toHaveProperty("isAuthenticated");
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: ADA.email }),
  );
});

test("a visitor is sent to login with the page they wanted", async () => {
  await using harness = await createConvexTestHarness({ identity: null });

  const run = runRouteBeforeLoad({
    harness,
    location: { pathname: "/dashboard/settings" },
    params: {},
    route: Route,
  });

  await expect(run).rejects.toSatisfy((error) => {
    expect(isRedirect(error)).toBe(true);
    if (isRedirect(error)) {
      expect(error.options).toMatchObject({
        replace: true,
        search: { redirect: "/dashboard/settings" },
        to: "/auth/login",
      });
    }
    return true;
  });
});
