import { fireEvent } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { getConvexQueryPreloader } from "@workspace/convex-prefetch";
import { api } from "@workspace/convex/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import type { TranslationFunction } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRouteWithRouterContext } from "@/test/renderMountedFileRoute";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import {
  ADMIN_DEFAULT_SEARCH,
  AdminDashboardPage,
  AdminDashboardView,
  BabiesSection,
  PermalinkTransfersSection,
  Route as AdminRoute,
  TransferPublicIdForm,
  UsersSection,
  formatWhen,
  isAdminTab,
  nextSortSearch,
  statusLabel,
} from "@/routes/_auth/dashboard_.admin";

// SAFETY: Test fixture is a subset of the production type.
const t = ((key: string) => key) as TranslationFunction;

const sampleBaby = {
  _id: "baby-1",
  createdAt: 1,
  demo: true,
  managerEmails: ["owner@example.com", "co@example.com"],
  name: "Avery",
  publicId: "baby-waiting",
  status: "not_yet" as const,
  updatedAt: 2,
};

function renderAdmin(ui: ReactElement) {
  return renderWithTestRouter(<LocaleProvider locale="en-GB">{ui}</LocaleProvider>, {
    path: "/dashboard/admin",
  });
}

test("admin remains a standalone non-nested dashboard route", () => {
  // Underscored `dashboard_` keeps this sibling of `/dashboard`, not a child.
  expect(AdminRoute.options.component).toBe(AdminDashboardPage);
});

test("statusLabel covers every baby status", () => {
  expect(statusLabel("not_yet", t)).toBe("Not yet");
  expect(statusLabel("labor_started", t)).toBe("Labour started");
  expect(statusLabel("gone_to_hospital", t)).toBe("Gone to hospital");
  expect(statusLabel("born", t)).toBe("Baby born");
});

test("formatWhen returns a locale-aware timestamp", () => {
  expect(formatWhen(Date.UTC(2026, 0, 15, 12, 30), "en-GB")).toMatch(/15/);
});

test("nextSortSearch defaults to desc and only toggles to asc on the active desc column", () => {
  expect(
    nextSortSearch({ clicked: "updated", currentOrder: "desc", currentSort: "updated" }),
  ).toEqual({ order: "asc", sort: "updated" });
  expect(
    nextSortSearch({ clicked: "updated", currentOrder: "asc", currentSort: "updated" }),
  ).toEqual({ order: "desc", sort: "updated" });
  expect(
    nextSortSearch({ clicked: "created", currentOrder: "asc", currentSort: "updated" }),
  ).toEqual({ order: "desc", sort: "created" });
  expect(
    nextSortSearch({ clicked: "updated", currentOrder: "desc", currentSort: "created" }),
  ).toEqual({ order: "desc", sort: "updated" });
});

test("permalink transfers section shows empty and audit rows", async () => {
  await using empty = await renderAdmin(
    <PermalinkTransfersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      transfers={[]}
    />,
  );
  expect(empty.getByText("No permalink transfers yet")).toBeTruthy();

  await using filled = await renderAdmin(
    <PermalinkTransfersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      transfers={[
        {
          _id: "xfer-1",
          actorEmail: "staff@example.com",
          actorUserId: "user-staff",
          babyName: "Baby",
          createdAt: Date.UTC(2026, 8, 3, 12, 0),
          displacedPublicId: "baby-3",
          fromPublicId: "baby-2",
          motivation: "Give the real page the canonical slug",
          toPublicId: "baby",
        },
        {
          _id: "xfer-2",
          actorEmail: null,
          actorUserId: "user-2",
          babyName: "River",
          createdAt: Date.UTC(2026, 8, 2, 12, 0),
          displacedPublicId: null,
          fromPublicId: "river-1",
          motivation: "Shorter URL",
          toPublicId: "river",
        },
      ]}
    />,
  );
  expect(filled.getByText("baby-2")).toBeTruthy();
  expect(filled.getByText("Baby")).toBeTruthy();
  expect(filled.getByText("baby")).toBeTruthy();
  expect(filled.getByText("baby-3")).toBeTruthy();
  expect(filled.getByText("staff@example.com")).toBeTruthy();
  expect(filled.getByText("Give the real page the canonical slug")).toBeTruthy();
  expect(filled.getByText("user-2")).toBeTruthy();
  expect(filled.getByText("Shorter URL")).toBeTruthy();
});

test("users section shows empty and rows", async () => {
  await using empty = await renderAdmin(
    <UsersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      users={[]}
    />,
  );
  expect(empty.getByText("No users yet")).toBeTruthy();

  await using filled = await renderAdmin(
    <UsersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      users={[
        {
          _id: "user-1",
          babies: [
            { demo: false, name: "River", publicId: "baby-river" },
            { demo: true, name: "Sky", publicId: "baby-sky" },
          ],
          createdAt: Date.UTC(2026, 0, 15, 12, 0),
          email: "ada@example.com",
          name: "Ada",
        },
        {
          _id: "user-2",
          babies: [],
          createdAt: Date.UTC(2026, 0, 16, 12, 0),
          email: "bob@example.com",
          name: "Bob",
        },
      ]}
    />,
  );
  expect(filled.getByText("Ada")).toBeTruthy();
  expect(filled.getByText("ada@example.com")).toBeTruthy();
  expect(filled.getByRole("link", { name: "River" })).toBeTruthy();
  expect(filled.getByRole("link", { name: "Sky" })).toBeTruthy();
  expect(filled.getByText(/Demo/)).toBeTruthy();
  expect(filled.getByText("Bob")).toBeTruthy();
  expect(filled.getByText("—")).toBeTruthy();
});

test("users section shows loading-more spinner", async () => {
  await using view = await renderAdmin(
    <UsersSection
      hasNextPage={true}
      isFetchingNextPage={true}
      onLoadMore={() => undefined}
      users={[
        {
          _id: "user-1",
          babies: [{ demo: false, name: "River", publicId: "baby-river" }],
          createdAt: Date.UTC(2026, 0, 15, 12, 0),
          email: "ada@example.com",
          name: "Ada",
        },
      ]}
    />,
  );
  expect(view.getByText("Ada")).toBeTruthy();
  expect(view.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
});

test("babies section sorts via clickable header links", async () => {
  await using view = await renderAdmin(
    <BabiesSection
      babies={[
        sampleBaby,
        {
          _id: "baby-2",
          createdAt: 3,
          demo: false,
          managerEmails: ["owner@example.com"],
          name: "Milo",
          publicId: "baby-born",
          status: "born",
          updatedAt: 4,
        },
      ]}
      hasNextPage={false}
      hideDemo={true}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      order="desc"
      sort="updated"
      tab="babies"
    />,
  );

  expect(view.getByText("Avery")).toBeTruthy();
  expect(view.getByText("Demo")).toBeTruthy();
  expect(view.getByText("baby-waiting")).toBeTruthy();
  expect(view.getByText("baby-born")).toBeTruthy();
  expect(view.getByText("owner@example.com, co@example.com")).toBeTruthy();
  expect(view.getByText("Baby born")).toBeTruthy();

  const created = view.getByRole("link", { name: "Created" });
  const updated = view.getByRole("link", { name: "Updated" });
  expect(created.getAttribute("href")).toContain("sort=created");
  expect(created.getAttribute("href")).toContain("order=desc");
  expect(created.getAttribute("href")).toContain("hideDemo=true");
  expect(updated.getAttribute("href")).toContain("sort=updated");
  expect(updated.getAttribute("href")).toContain("order=asc");
});

test("babies section shows a spinner while loading more", async () => {
  await using loadingMore = await renderAdmin(
    <BabiesSection
      babies={[{ ...sampleBaby, demo: false, managerEmails: [] }]}
      hasNextPage={true}
      hideDemo={true}
      isFetchingNextPage={true}
      onLoadMore={() => undefined}
      order="desc"
      sort="created"
      tab="babies"
    />,
  );
  expect(loadingMore.getByText("Avery")).toBeTruthy();
  expect(loadingMore.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
});

test("transfer permalink form submits current slug, new slug, and motivation", async () => {
  const onTransfer = vi.fn().mockResolvedValue(undefined);
  await using view = await renderAdmin(<TransferPublicIdForm onTransfer={onTransfer} />);

  fireEvent.change(view.getByLabelText("Current permalink"), { target: { value: "baby-2" } });
  fireEvent.change(view.getByLabelText("New permalink"), { target: { value: "baby" } });
  fireEvent.change(view.getByLabelText("Motivation"), {
    target: { value: "Give the real page the canonical slug" },
  });
  fireEvent.click(view.getByRole("button", { name: "Transfer" }));

  await vi.waitFor(() => {
    expect(onTransfer).toHaveBeenCalledWith({
      fromPublicId: "baby-2",
      motivation: "Give the real page the canonical slug",
      toPublicId: "baby",
    });
  });
});

test("infinite scroll sentinel requests another page when visible", async () => {
  const onLoadMore = vi.fn<() => void>();
  type ObserverCallback = IntersectionObserverCallback;
  const observers: Array<ObserverCallback> = [];

  const OriginalObserver = globalThis.IntersectionObserver;
  class MockIntersectionObserver {
    callback: ObserverCallback;
    constructor(callback: ObserverCallback) {
      this.callback = callback;
      observers.push(callback);
    }
    observe() {
      this.callback(
        /* SAFETY: mock entry only needs isIntersecting for this callback. */
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    scrollMargin = "";
    thresholds = [];
  }
  globalThis.IntersectionObserver = MockIntersectionObserver;

  await using _view = await renderAdmin(
    <BabiesSection
      babies={[sampleBaby]}
      hasNextPage={true}
      hideDemo={true}
      isFetchingNextPage={false}
      onLoadMore={onLoadMore}
      order="desc"
      sort="updated"
      tab="babies"
    />,
  );

  expect(onLoadMore).toHaveBeenCalled();
  expect(observers.length).toBeGreaterThan(0);
  globalThis.IntersectionObserver = OriginalObserver;
});

test("admin dashboard page exposes tab links and hide-demo filter", async () => {
  const onTabChange = vi.fn<(tab: "babies" | "transfers" | "users") => void>();
  const onHideDemoChange = vi.fn<(hideDemo: boolean) => void>();

  await using view = await renderAdmin(
    <AdminDashboardView
      babiesTab={<div>babies body</div>}
      hideDemo={true}
      onHideDemoChange={onHideDemoChange}
      onTabChange={onTabChange}
      order="desc"
      sort="created"
      tab="babies"
      transfersTab={<div>transfers body</div>}
      usersTab={<div>users body</div>}
    />,
  );
  expect(view.getByText("Admin dashboard")).toBeTruthy();

  const babiesTab = view.getByRole("tab", { name: "All babies" });
  const transfersTab = view.getByRole("tab", { name: "Transfer permalink" });
  const usersTab = view.getByRole("tab", { name: "Recent users" });
  expect(babiesTab.tagName).toBe("A");
  expect(transfersTab.tagName).toBe("A");
  expect(usersTab.tagName).toBe("A");
  expect(babiesTab.getAttribute("href")).toContain("tab=babies");
  expect(transfersTab.getAttribute("href")).toContain("tab=transfers");
  expect(usersTab.getAttribute("href")).toContain("tab=users");
  expect(view.queryByRole("tab", { name: "Requested languages" })).toBeNull();

  const hideDemo = view.getByRole("switch", { name: "Hide demo babies" });
  expect(hideDemo.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(hideDemo);
  expect(onHideDemoChange).toHaveBeenCalledWith(false);

  fireEvent.click(usersTab);
  // Tab Links navigate via href; onValueChange also fires for the Tabs control.
  expect(onTabChange).toHaveBeenCalled();
});

test("admin defaults to created-desc babies and recognizes every admin tab", () => {
  expect(ADMIN_DEFAULT_SEARCH).toEqual({
    hideDemo: true,
    order: "desc",
    sort: "created",
    tab: "babies",
  });
  expect(isAdminTab("babies")).toBe(true);
  expect(isAdminTab("languages")).toBe(false);
  expect(isAdminTab("transfers")).toBe(true);
  expect(isAdminTab("users")).toBe(true);
  expect(isAdminTab("nope")).toBe(false);
});

test("users tab body renders without the hide-demo filter", async () => {
  await using view = await renderAdmin(
    <AdminDashboardView
      babiesTab={<div>babies body</div>}
      hideDemo={true}
      onHideDemoChange={() => undefined}
      onTabChange={() => undefined}
      order="desc"
      sort="created"
      tab="users"
      transfersTab={<div>transfers body</div>}
      usersTab={
        <UsersSection
          hasNextPage={false}
          isFetchingNextPage={false}
          onLoadMore={() => undefined}
          users={[
            {
              _id: "user-1",
              babies: [{ demo: false, name: "River", publicId: "baby-river" }],
              createdAt: Date.UTC(2026, 0, 15, 12, 0),
              email: "ada@example.com",
              name: "Ada",
            },
          ]}
        />
      }
    />,
  );
  expect(view.getByText("Ada")).toBeTruthy();
  expect(view.getByText("ada@example.com")).toBeTruthy();
  expect(view.getByRole("link", { name: "River" })).toBeTruthy();
  expect(view.queryByRole("switch", { name: "Hide demo babies" })).toBeNull();
});

test("transfers tab body renders the form without the hide-demo filter", async () => {
  const onTransfer = vi.fn().mockResolvedValue(undefined);
  await using view = await renderAdmin(
    <AdminDashboardView
      babiesTab={<div>babies body</div>}
      hideDemo={true}
      onHideDemoChange={() => undefined}
      onTabChange={() => undefined}
      order="desc"
      sort="created"
      tab="transfers"
      transfersTab={<TransferPublicIdForm onTransfer={onTransfer} />}
      usersTab={<div>users body</div>}
    />,
  );
  expect(view.getByRole("tab", { name: "Transfer permalink" })).toBeTruthy();
  expect(view.getByLabelText("Current permalink")).toBeTruthy();
  expect(view.getByLabelText("Motivation")).toBeTruthy();
  expect(view.queryByRole("switch", { name: "Hide demo babies" })).toBeNull();
});

test("transfers tab loads the form and audit table from Convex", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const staffId = await signUpTestUser(harness, {
    email: "staff@example.com",
    name: "Staff",
    password: "password123",
  });
  harness.withIdentity({ subject: staffId });
  await harness.client.mutation(api.profile.updateLocale, { locale: "en-GB" });
  await harness.t.run(async (ctx) => {
    const profiles = await ctx.db.query("userProfiles").collect();
    for (const profile of profiles) {
      await ctx.db.patch(profile._id, { isAdmin: true });
    }
  });

  const bobId = await signUpTestUser(harness, {
    email: "bob@example.com",
    name: "Bob",
    password: "password123",
  });
  harness.withIdentity({ subject: bobId });
  const claimant = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Real Baby" });
  await harness.t.run(async (ctx) => {
    await ctx.db.patch(claimant.babyId, { publicId: "baby-2" });
  });

  harness.withIdentity({ subject: staffId });
  harness.queryClient.clear();
  await harness.client.mutation(api.admin.transferPublicId, {
    fromPublicId: "baby-2",
    motivation: "Give the real page the canonical slug",
    toPublicId: "baby",
  });

  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});
  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: "/dashboard/admin?tab=transfers",
    overlayHistory: null,
    path: "/dashboard/admin",
    route: AdminRoute,
    routerContext: { profile },
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByLabelText("Current permalink")).toBeTruthy();
    expect(ctx.view.getByText("Give the real page the canonical slug")).toBeTruthy();
  });
  expect(ctx.view.getByText("baby-2")).toBeTruthy();
  expect(ctx.view.getByText("baby")).toBeTruthy();
  expect(ctx.view.queryByRole("switch", { name: "Hide demo babies" })).toBeNull();
});

const ADMIN_EMPTY_PAGE = { continueCursor: "", isDone: true, page: [] };

import type { JsonValue } from "@workspace/runtime/json";
type AdminQueryHandler = JsonValue | (() => never);
type AdminQueryHandlers = Record<string, AdminQueryHandler>;
type AdminLoaderResult = {
  babies: unknown;
  transfers: unknown;
  users: unknown;
};

function makeAdminLoaderQueryClient(handlers: AdminQueryHandlers) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: (ctx) => {
          const name = String(ctx.queryKey[1]);
          if (name in handlers) {
            return Promise.resolve(handlers[name]);
          }
          return Promise.resolve(null);
        },
        retry: false,
      },
    },
  });
}

async function runAdminLoader(
  handlers: AdminQueryHandlers,
  profile: { isAdmin: boolean; locale: string; timeZone: string },
) {
  // @ts-expect-error — stub loader opts are the fields this route reads
  const route: {
    options: {
      loader: (opts: {
        context: {
          convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
          profile: { initialData: typeof profile; input: Record<string, never> };
          queryClient: QueryClient;
        };
        deps: { hideDemo: boolean; order: string; sort: string; tab: string };
      }) => Promise<AdminLoaderResult>;
    };
  } = AdminRoute;
  const queryClient = makeAdminLoaderQueryClient(handlers);
  return await route.options.loader({
    context: {
      convexPreloader: getConvexQueryPreloader(queryClient),
      profile: { initialData: profile, input: {} },
      queryClient,
    },
    deps: { hideDemo: true, order: "desc", sort: "created", tab: "babies" },
  });
}

test("loader prefetches babies, users, and permalink transfers in parallel for admins", async () => {
  const result = await runAdminLoader(
    {
      "admin:listBabies": ADMIN_EMPTY_PAGE,
      "admin:listPublicIdTransfers": ADMIN_EMPTY_PAGE,
      "admin:listUsers": ADMIN_EMPTY_PAGE,
    },
    { isAdmin: true, locale: "en-GB", timeZone: "Europe/London" },
  );

  expect(result.babies).toMatchObject({
    input: { hideDemo: true, sortBy: "created", sortOrder: "desc" },
    numItems: 20,
  });
  expect(result.transfers).toMatchObject({ input: {}, numItems: 20 });
  expect(result.users).toMatchObject({ input: {}, numItems: 20 });
});

test("loader redirects non-admins without prefetching admin queries", async () => {
  try {
    await runAdminLoader(
      {
        "admin:listBabies": () => {
          throw new Error("admin:listBabies should not run for non-admins");
        },
        "admin:listPublicIdTransfers": () => {
          throw new Error("admin:listPublicIdTransfers should not run for non-admins");
        },
        "admin:listUsers": () => {
          throw new Error("admin:listUsers should not run for non-admins");
        },
      },
      { isAdmin: false, locale: "en-GB", timeZone: "Europe/London" },
    );
    expect.unreachable("expected a redirect");
  } catch (error) {
    expect(isRedirect(error)).toBe(true);
    if (isRedirect(error)) {
      expect(error.options.to).toBe("/dashboard");
    }
  }
});
