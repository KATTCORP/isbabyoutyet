import { isRedirect } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { Route } from "@/routes/baby/$publicId/_auth/route";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signInTestUser, signUpTestUser } from "@/test/convexTestSeed";
import { runRouteBeforeLoad } from "@/test/routeTestContext";

const ADA = { email: "ada@example.com", name: "Ada", password: "password123" };

test("baby manager auth layout is wired as the route component", () => {
  expect(Route.options.component).toBeTypeOf("function");
});

test("a signed-in manager passes the guard but keeps the baby page's language", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await signInTestUser(harness, ADA);

  const result = await runRouteBeforeLoad({
    harness,
    location: { pathname: "/baby/baby-waiting/settings" },
    params: { publicId: "baby-waiting" },
    route: Route,
  });

  expect(result).toMatchObject({ token: undefined });
  expect(result).toHaveProperty("profile");
  // Root reduces locale from matches (last wins); the baby route's
  // `resolvedLocale` must survive opening a manager overlay.
  expect(result).not.toHaveProperty("locale");
});

test("a visitor is sent to the baby-page login with the overlay they wanted", async () => {
  await using harness = await createConvexTestHarness({ identity: null });

  const run = runRouteBeforeLoad({
    harness,
    location: { pathname: "/baby/baby-waiting/post" },
    params: { publicId: "baby-waiting" },
    route: Route,
  });

  await expect(run).rejects.toSatisfy((error) => {
    expect(isRedirect(error)).toBe(true);
    if (isRedirect(error)) {
      expect(error.options).toMatchObject({
        params: { publicId: "baby-waiting" },
        replace: true,
        search: { redirect: "/baby/baby-waiting/post" },
        to: "/baby/$publicId/login",
      });
    }
    return true;
  });
});
