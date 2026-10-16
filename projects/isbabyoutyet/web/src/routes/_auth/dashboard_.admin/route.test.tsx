import { fireEvent } from "@testing-library/react";
import { isRedirect } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRouteTree } from "@/test/renderMountedFileRoute";
import { signedInRouteContext } from "@/test/routeTestContext";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import {
  AdminDashboardPage,
  AdminDashboardView,
  Route as AdminRoute,
} from "@/routes/_auth/dashboard_.admin/route";
import { Route as AdminBabiesRoute } from "@/routes/_auth/dashboard_.admin/babies";
import { Route as AdminIndexRoute } from "@/routes/_auth/dashboard_.admin/index";
import { Route as AdminTransfersRoute } from "@/routes/_auth/dashboard_.admin/transfers";
import { Route as AdminUsersRoute } from "@/routes/_auth/dashboard_.admin/users";

function renderAdmin(ui: ReactElement) {
  return renderWithTestRouter(<LocaleProvider locale="en-GB">{ui}</LocaleProvider>, {
    path: "/dashboard/admin/babies",
  });
}

function captureRedirect(run: () => void) {
  try {
    run();
  } catch (error) {
    if (isRedirect(error)) {
      return error.options;
    }
    throw error;
  }
  return expect.unreachable("expected a redirect");
}

test("admin remains a standalone non-nested dashboard route", () => {
  // Underscored `dashboard_` keeps this sibling of `/dashboard`, not a child.
  expect(AdminRoute.options.component).toBe(AdminDashboardPage);
});

test("admin view links each tab to its own route", async () => {
  await using view = await renderAdmin(
    <AdminDashboardView hideDemo={true} onHideDemoChange={() => undefined} tab="babies">
      <div>babies body</div>
    </AdminDashboardView>,
  );
  expect(view.getByText("Admin dashboard")).toBeTruthy();
  expect(view.getByText("babies body")).toBeTruthy();

  const babiesTab = view.getByRole("tab", { name: "All babies" });
  const transfersTab = view.getByRole("tab", { name: "Transfer permalink" });
  const usersTab = view.getByRole("tab", { name: "Recent users" });
  expect(babiesTab.tagName).toBe("A");
  expect(babiesTab.getAttribute("href")).toBe("/dashboard/admin/babies");
  expect(transfersTab.getAttribute("href")).toBe("/dashboard/admin/transfers");
  expect(usersTab.getAttribute("href")).toBe("/dashboard/admin/users");
  expect(babiesTab.getAttribute("aria-selected")).toBe("true");
  expect(usersTab.getAttribute("aria-selected")).toBe("false");
});

test("admin view shows the hide-demo filter when given a value", async () => {
  const onHideDemoChange = vi.fn<(hideDemo: boolean) => void>();
  await using view = await renderAdmin(
    <AdminDashboardView hideDemo={true} onHideDemoChange={onHideDemoChange} tab="babies">
      <div>babies body</div>
    </AdminDashboardView>,
  );
  const hideDemo = view.getByRole("switch", { name: "Hide demo babies" });
  expect(hideDemo.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(hideDemo);
  expect(onHideDemoChange).toHaveBeenCalledWith(false);
});

test("admin view hides the hide-demo filter when it is null", async () => {
  await using view = await renderAdmin(
    <AdminDashboardView hideDemo={null} onHideDemoChange={() => undefined} tab="users">
      <div>users body</div>
    </AdminDashboardView>,
  );
  expect(view.getByText("users body")).toBeTruthy();
  expect(view.queryByRole("switch", { name: "Hide demo babies" })).toBeNull();
});

test("admin guard redirects non-admins before any tab loader runs", () => {
  // @ts-expect-error — stub beforeLoad opts are the fields this route reads
  const beforeLoad: (opts: { context: { isAdmin: boolean } }) => void =
    AdminRoute.options.beforeLoad;

  expect(captureRedirect(() => beforeLoad({ context: { isAdmin: false } })).to).toBe("/dashboard");
  expect(() => beforeLoad({ context: { isAdmin: true } })).not.toThrow();
});

test("admin index redirects to the tab named by a legacy ?tab= param", () => {
  // @ts-expect-error — stub beforeLoad opts are the fields this route reads
  const beforeLoad: (opts: { search: { tab: string } }) => void =
    AdminIndexRoute.options.beforeLoad;

  expect(captureRedirect(() => beforeLoad({ search: { tab: "users" } }))).toMatchObject({
    replace: true,
    to: "/dashboard/admin/users",
  });
});

async function seedAdminHarness() {
  const harness = await createConvexTestHarness({ identity: null });
  const staffId = await signUpTestUser(harness, {
    email: "staff@example.com",
    name: "Staff",
    password: "password123",
  });
  await harness.withIdentity({ subject: staffId });
  await harness.client.mutation(api.profile.updateLocale, { locale: "en-GB" });
  await harness.t.run(async (ctx) => {
    const profiles = await ctx.db.query("userProfiles").collect();
    for (const profile of profiles) {
      await ctx.db.patch(profile._id, { isAdmin: true });
    }
  });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Real Baby" });
  harness.queryClient.clear();
  return harness;
}

async function renderAdminTree(opts: {
  harness: Awaited<ReturnType<typeof seedAdminHarness>>;
  initialEntry: string;
}) {
  return await renderMountedFileRouteTree({
    childRoutes: [
      { path: "/", route: AdminIndexRoute },
      { path: "babies", route: AdminBabiesRoute },
      { path: "transfers", route: AdminTransfersRoute },
      { path: "users", route: AdminUsersRoute },
    ],
    harness: opts.harness,
    initialEntry: opts.initialEntry,
    overlayHistory: null,
    path: "/dashboard/admin",
    route: AdminRoute,
    routerContext: await signedInRouteContext(opts.harness),
    wrap: null,
  });
}

test("legacy ?tab= admin URLs land on that tab's route", async () => {
  await using harness = await seedAdminHarness();
  await using ctx = await renderAdminTree({ harness, initialEntry: "/dashboard/admin?tab=users" });

  await vi.waitFor(() => {
    expect(ctx.router.state.resolvedLocation?.pathname).toBe("/dashboard/admin/users");
    expect(ctx.view.getByText("Signed up")).toBeTruthy();
  });
});

test("admin tabs navigate between their routes against Convex", async () => {
  await using harness = await seedAdminHarness();
  await using ctx = await renderAdminTree({ harness, initialEntry: "/dashboard/admin" });

  await vi.waitFor(() => {
    expect(ctx.router.state.location.pathname).toBe("/dashboard/admin/babies");
    expect(ctx.view.getByText("Real Baby")).toBeTruthy();
  });
  expect(
    ctx.view.getByRole("switch", { name: "Hide demo babies" }).getAttribute("aria-checked"),
  ).toBe("true");

  fireEvent.click(ctx.view.getByRole("switch", { name: "Hide demo babies" }));
  await vi.waitFor(() => {
    expect(ctx.router.state.location.search).toMatchObject({ hideDemo: false });
    expect(
      ctx.view.getByRole("switch", { name: "Hide demo babies" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  fireEvent.click(ctx.view.getByRole("tab", { name: "Recent users" }));
  await vi.waitFor(() => {
    expect(ctx.router.state.location.pathname).toBe("/dashboard/admin/users");
    expect(ctx.view.getByText("Signed up")).toBeTruthy();
  });
  expect(ctx.view.getByRole("tab", { name: "Recent users" }).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(ctx.view.queryByRole("switch", { name: "Hide demo babies" })).toBeNull();

  fireEvent.click(ctx.view.getByRole("tab", { name: "Transfer permalink" }));
  await vi.waitFor(() => {
    expect(ctx.router.state.location.pathname).toBe("/dashboard/admin/transfers");
    expect(ctx.view.getByText("No permalink transfers yet")).toBeTruthy();
  });
});
