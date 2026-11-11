import { removeAll } from "@raf-query/react";
import { fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRouteTree } from "@/test/renderMountedFileRoute";
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
  removeAll(harness.queryClient);
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
    wrap: null,
  });
}

test("someone who isn't an admin goes back to the dashboard, though the tab's query failed", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const memberId = await signUpTestUser(harness, {
    email: "member@example.com",
    name: "Member",
    password: "password123",
  });
  await harness.withIdentity({ subject: memberId });
  await using ctx = await renderAdminTree({ harness, initialEntry: "/dashboard/admin/babies" });

  expect(ctx.router.state.location.pathname).toBe("/dashboard");
});

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

test("babies sort and filter survive switching to other tabs and back", async () => {
  await using harness = await seedAdminHarness();
  await using ctx = await renderAdminTree({ harness, initialEntry: "/dashboard/admin/babies" });

  await vi.waitFor(() => {
    expect(ctx.view.getByText("Real Baby")).toBeTruthy();
  });
  // Defaults stay out of the URL.
  expect(ctx.router.state.location.href).toBe("/dashboard/admin/babies");

  fireEvent.click(ctx.view.getByRole("link", { name: "Updated" }));
  fireEvent.click(ctx.view.getByRole("switch", { name: "Hide demo babies" }));
  await vi.waitFor(() => {
    expect(ctx.router.state.location.search).toEqual({ hideDemo: false, sort: "updated" });
  });

  fireEvent.click(ctx.view.getByRole("tab", { name: "Recent users" }));
  await vi.waitFor(() => {
    expect(ctx.view.getByText("Signed up")).toBeTruthy();
  });
  expect(ctx.router.state.location.pathname).toBe("/dashboard/admin/users");
  expect(ctx.router.state.location.search).toEqual({ hideDemo: false, sort: "updated" });
  expect(ctx.view.getByRole("tab", { name: "Recent users" }).getAttribute("aria-selected")).toBe(
    "true",
  );

  fireEvent.click(ctx.view.getByRole("tab", { name: "Transfer permalink" }));
  await vi.waitFor(() => {
    expect(ctx.view.getByText("No permalink transfers yet")).toBeTruthy();
  });
  expect(ctx.router.state.location.search).toEqual({ hideDemo: false, sort: "updated" });

  fireEvent.click(ctx.view.getByRole("tab", { name: "All babies" }));
  await vi.waitFor(() => {
    expect(ctx.router.state.location.pathname).toBe("/dashboard/admin/babies");
    expect(ctx.view.getByText("Real Baby")).toBeTruthy();
  });
  expect(ctx.router.state.location.search).toEqual({ hideDemo: false, sort: "updated" });
  expect(
    ctx.view.getByRole("switch", { name: "Hide demo babies" }).getAttribute("aria-checked"),
  ).toBe("false");
  // "Updated" is the active desc column, so its next click toggles to asc.
  expect(ctx.view.getByRole("link", { name: "Updated" }).getAttribute("href")).toContain(
    "order=asc",
  );
});

test("legacy ?tab= admin URLs keep the babies sort they carried", async () => {
  await using harness = await seedAdminHarness();
  await using ctx = await renderAdminTree({
    harness,
    initialEntry: "/dashboard/admin?tab=babies&sort=updated",
  });

  await vi.waitFor(() => {
    expect(ctx.router.state.resolvedLocation?.pathname).toBe("/dashboard/admin/babies");
    expect(ctx.view.getByText("Real Baby")).toBeTruthy();
  });
  expect(ctx.router.state.location.search).toEqual({ sort: "updated" });
});
