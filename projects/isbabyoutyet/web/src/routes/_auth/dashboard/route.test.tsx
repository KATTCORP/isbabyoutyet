import { QueryClientProvider } from "@raf-query/react";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { ConvexProvider } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReturnType } from "convex/server";
import { expect, test, vi } from "vitest";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { LocaleProvider } from "@/lib/i18n";
import { convexQuery } from "@workspace/convex-query";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { renderResource } from "@/test/renderResource";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { DashboardBabyList, DashboardHeader, Route } from "@/routes/_auth/dashboard/route";

const babySmith = {
  // SAFETY: Seeded convex-test document id.
  _id: "baby-id" as Id<"baby">,
  babyBorn: null,
  birthJourney: "labor" as const,
  dueDate: "2026-12-01",
  dueDateDisplayMode: "exact" as const,
  laborStarted: null,
  name: "Baby Smith",
  publicDueDateText: null,
  publicId: "baby-smith",
  role: "owner" as const,
  timeZone: "Europe/London",
  wentToHospital: null,
};

const onboardingProgress: FunctionReturnType<typeof api.onboarding.getMine> = {
  activeCoachmarkStepId: null,
  allDone: true,
  checklistDismissed: true,
  completedSteps: [],
  effectiveSteps: [],
  hasBaby: true,
  hasUpdate: true,
  minimized: false,
  restartHintVisible: false,
  tourBaby: null,
  welcomeDismissed: true,
};

/**
 * `Route.update()` is typed for non-structural option tweaks only, so widen it
 * to re-parent the real route (same instance, so its `useLoaderData` keeps
 * resolving) onto a test root.
 */
function reparentRoute<TRoute extends AnyRoute>(
  route: TRoute,
  opts: { getParentRoute: () => AnyRoute; path: string },
): TRoute {
  // SAFETY: Test fixture is a subset of the production type.
  const update = route.update as (options: typeof opts) => TRoute;
  return update(opts);
}

/**
 * Answers the loader's Convex reads without a deployment, recording call
 * order and holding every answer until `release()` to prove the loader starts
 * its reads together instead of one after another.
 */
function stubLoaderQueries(babies: Array<typeof babySmith>) {
  const calls: Array<string> = [];
  const gate = Promise.withResolvers<void>();
  const stub = stubQueryClientResource(async (query) => {
    const name = getFunctionName(query);
    calls.push(name);
    await gate.promise;
    return name === getFunctionName(api.baby.listByUser) ? babies : onboardingProgress;
  });
  return Object.assign(stub, {
    calls,
    context: { queryClient: stub.queryClient },
    release: () => {
      gate.resolve();
    },
  });
}

test("shows the empty state once the list has loaded with no babies", async () => {
  await using view = await renderWithTestRouter(
    <DashboardBabyList babies={[]} tourBabyPublicId={undefined} />,
  );

  expect(view.getByText("No baby pages yet")).toBeTruthy();
});

test("dashboard header groups add baby separately from theme and settings", async () => {
  await using view = await renderWithTestRouter(<DashboardHeader />);

  const ownerGroup = view.getByRole("group", { name: "Owner actions" });
  const pageGroup = view.getByRole("group", { name: "Page actions" });
  const addBaby = view.getByRole("button", { name: "Add Baby" });
  const theme = view.getByRole("button", { name: "Toggle theme" });
  const settings = view.getByRole("button", { name: "Settings" });

  expect(ownerGroup.contains(addBaby)).toBe(true);
  expect(pageGroup.contains(theme)).toBe(true);
  expect(pageGroup.contains(settings)).toBe(true);
  expect(addBaby.getAttribute("href")).toBe("/dashboard/add");
  expect(settings.getAttribute("href")).toBe("/dashboard/settings");
  expect(view.queryByText("Admin")).toBeNull();
  expect(view.queryByText("Log out")).toBeNull();
  expect(view.queryByLabelText("Restart getting started tour")).toBeNull();
});

test("parent dashboard stays mounted while child routes render through its outlet", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  await using loaderQueries = stubLoaderQueries([babySmith]);
  loaderQueries.release();
  // The real route re-parented onto a bare test root: its loader, component,
  // and `<Outlet />` all run, with a child route standing in for /dashboard/*.
  const rootRoute = createRootRoute({
    component: function TestRoot() {
      return (
        <QueryClientProvider client={loaderQueries.queryClient}>
          <ConvexProvider
            // @ts-expect-error — integration client is not ConvexReactClient
            client={harness.convexClient}
          >
            <LocaleProvider locale="en-GB">
              <TooltipProvider>
                <Outlet />
              </TooltipProvider>
            </LocaleProvider>
          </ConvexProvider>
        </QueryClientProvider>
      );
    },
  });
  const dashboardRoute = reparentRoute(Route, {
    getParentRoute: () => rootRoute,
    path: "/dashboard",
  });
  const childRoute = createRoute({
    component: () => <div data-testid="dashboard-outlet" />,
    getParentRoute: () => dashboardRoute,
    path: "/",
  });
  const router = createRouter({
    context: loaderQueries.context,
    defaultPendingMinMs: 0,
    history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
    routeTree: rootRoute.addChildren([dashboardRoute.addChildren([childRoute])]),
  });
  await router.load();

  await using view = renderResource(<RouterProvider router={router} />);

  expect(view.getByRole("heading", { name: /Your babies/ })).toBeTruthy();
  expect(view.getByTestId("dashboard-outlet")).toBeTruthy();
});

test("parent dashboard loader ensures auth-scoped reads without a waterfall", async () => {
  await using loaderQueries = stubLoaderQueries([]);
  // @ts-expect-error — stub context is the subset the loader reads
  const loader: (opts: {
    context: typeof loaderQueries.context;
  }) => Promise<{ babies: object; onboarding: object }> = Route.options.loader;

  const pending = loader({ context: loaderQueries.context });

  await vi.waitFor(() => {
    expect(loaderQueries.calls).toEqual([
      getFunctionName(api.baby.listByUser),
      getFunctionName(api.onboarding.getMine),
    ]);
  });
  loaderQueries.release();
  await expect(pending).resolves.toMatchObject({
    babies: { data: expect.anything(), input: {} },
    onboarding: { data: expect.anything(), input: {} },
  });
  expect(loaderQueries.queryClient.getData(convexQuery(api.onboarding.getMine), {})).toEqual(
    onboardingProgress,
  );
});

test("shows prefetched babies without a spinner", async () => {
  await using view = await renderWithTestRouter(
    <DashboardBabyList babies={[babySmith]} tourBabyPublicId="baby-smith" />,
  );

  expect(view.queryByRole("status", { name: "Loading" })).toBeNull();
  expect(view.queryByText("No babies added yet")).toBeNull();
  expect(view.getByText("Baby Smith")).toBeTruthy();
  expect(view.container.querySelector('[data-tour-id="tour_baby"]')).toBeTruthy();
});
