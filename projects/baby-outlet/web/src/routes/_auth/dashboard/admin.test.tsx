import { fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { LocaleProvider } from "@/lib/i18n";
import type { TranslationFunction } from "@/lib/i18n";
import { testPreloadedConvexInfiniteQuery } from "@workspace/convex-prefetch/test-helpers";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn<(opts: unknown) => void>(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: (
    props: React.ComponentProps<"a"> & {
      to: string | undefined;
      search: Record<string, string> | undefined;
      replace: boolean | undefined;
    },
  ) => {
    const { to, search, children, replace: _replace, ...rest } = props;
    const query = search
      ? `?${new URLSearchParams(search as Record<string, string>).toString()}`
      : "";
    return (
      <a href={`${typeof to === "string" ? to : "#"}${query}`} {...rest}>
        {children}
      </a>
    );
  },
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useSearch: () => ({ tab: "babies", sort: "updated", order: "desc", hideDemo: true }),
    useLoaderData: () => ({
      babies: testPreloadedConvexInfiniteQuery<typeof api.admin.listBabies>({
        input: { sortBy: "updated", sortOrder: "desc", hideDemo: true },
        numItems: 20,
        initialData: {
          pages: [{ page: [], isDone: true, continueCursor: "" }],
          pageParams: [{ numItems: 20, cursor: null }],
        },
      }),
      languages: testPreloadedConvexInfiniteQuery<typeof api.admin.listLanguageRequests>({
        input: {},
        numItems: 20,
        initialData: {
          pages: [{ page: [], isDone: true, continueCursor: "" }],
          pageParams: [{ numItems: 20, cursor: null }],
        },
      }),
    }),
  }),
  redirect: vi.fn<() => never>(),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@workspace/convex-prefetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/convex-prefetch")>();
  return {
    ...actual,
    usePreloadedConvexInfiniteQuery: () => ({
      data: {
        pages: [{ page: [], isDone: true, continueCursor: "" }],
        pageParams: [{ numItems: 20, cursor: null }],
      },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn<() => Promise<unknown>>(),
    }),
  };
});

const {
  AdminDashboardPage,
  BabiesSection,
  LanguageRequestsSection,
  formatWhen,
  nextSortSearch,
  statusLabel,
} = await import("@/routes/_auth/dashboard/admin");

function renderResource(ui: ReactElement) {
  const view = render(<LocaleProvider locale="en-GB">{ui}</LocaleProvider>);
  return makeResource(view, () => {
    view.unmount();
  });
}

const t = ((key: string) => key) as TranslationFunction;

const sampleBaby = {
  _id: "baby-1",
  name: "Avery",
  publicId: "baby-waiting",
  status: "not_yet" as const,
  demo: true,
  createdAt: 1,
  updatedAt: 2,
  managerEmails: ["owner@example.com", "co@example.com"],
};

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
    nextSortSearch({ currentSort: "updated", currentOrder: "desc", clicked: "updated" }),
  ).toEqual({ sort: "updated", order: "asc" });
  expect(
    nextSortSearch({ currentSort: "updated", currentOrder: "asc", clicked: "updated" }),
  ).toEqual({ sort: "updated", order: "desc" });
  expect(
    nextSortSearch({ currentSort: "updated", currentOrder: "asc", clicked: "created" }),
  ).toEqual({ sort: "created", order: "desc" });
  expect(
    nextSortSearch({ currentSort: "created", currentOrder: "desc", clicked: "updated" }),
  ).toEqual({ sort: "updated", order: "desc" });
});

test("language requests section shows empty and rows", async () => {
  await using empty = renderResource(
    <LanguageRequestsSection
      requests={[]}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
    />,
  );
  expect(empty.getByText("No language requests yet")).toBeTruthy();

  await using filled = renderResource(
    <LanguageRequestsSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      requests={[
        {
          _id: "req-1",
          requestedLocale: "French",
          createdAt: Date.UTC(2026, 0, 15, 12, 0),
          userId: "user-1",
          userEmail: "a@example.com",
        },
        {
          _id: "req-2",
          requestedLocale: "German",
          createdAt: Date.UTC(2026, 0, 16, 12, 0),
          userId: "user-2",
          userEmail: null,
        },
      ]}
    />,
  );
  expect(filled.getByText("French")).toBeTruthy();
  expect(filled.getByText("a@example.com")).toBeTruthy();
  expect(filled.getByText("user-2")).toBeTruthy();
});

test("babies section sorts via clickable header links", async () => {
  await using view = renderResource(
    <BabiesSection
      sort="updated"
      order="desc"
      tab="babies"
      hideDemo={true}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      babies={[
        sampleBaby,
        {
          _id: "baby-2",
          name: "Milo",
          publicId: "baby-born",
          status: "born",
          demo: false,
          createdAt: 3,
          updatedAt: 4,
          managerEmails: ["owner@example.com"],
        },
      ]}
    />,
  );

  expect(view.getByText("Avery")).toBeTruthy();
  expect(view.getByText("Demo")).toBeTruthy();
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
  await using loadingMore = renderResource(
    <BabiesSection
      sort="created"
      order="desc"
      tab="babies"
      hideDemo={true}
      hasNextPage={true}
      isFetchingNextPage={true}
      onLoadMore={() => undefined}
      babies={[{ ...sampleBaby, demo: false, managerEmails: [] }]}
    />,
  );
  expect(loadingMore.getByText("Avery")).toBeTruthy();
  expect(loadingMore.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
});

test("language requests section shows loading-more spinner", async () => {
  await using view = renderResource(
    <LanguageRequestsSection
      hasNextPage={true}
      isFetchingNextPage={true}
      onLoadMore={() => undefined}
      requests={[
        {
          _id: "req-1",
          requestedLocale: "French",
          createdAt: Date.UTC(2026, 0, 15, 12, 0),
          userId: "user-1",
          userEmail: "a@example.com",
        },
      ]}
    />,
  );
  expect(view.getByText("French")).toBeTruthy();
  expect(view.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
});

test("infinite scroll sentinel requests another page when visible", async () => {
  const onLoadMore = vi.fn<() => void>();
  type ObserverCallback = IntersectionObserverCallback;
  const observers: ObserverCallback[] = [];

  const OriginalObserver = globalThis.IntersectionObserver;
  class MockIntersectionObserver {
    callback: ObserverCallback;
    constructor(callback: ObserverCallback) {
      this.callback = callback;
      observers.push(callback);
    }
    observe() {
      this.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;

  await using _view = renderResource(
    <BabiesSection
      sort="updated"
      order="desc"
      tab="babies"
      hideDemo={true}
      hasNextPage={true}
      isFetchingNextPage={false}
      onLoadMore={onLoadMore}
      babies={[sampleBaby]}
    />,
  );

  expect(onLoadMore).toHaveBeenCalled();
  expect(observers.length).toBeGreaterThan(0);
  globalThis.IntersectionObserver = OriginalObserver;
});

test("admin dashboard page exposes tab links and hide-demo filter", async () => {
  await using view = renderResource(<AdminDashboardPage />);
  expect(view.getByText("Admin dashboard")).toBeTruthy();

  const babiesTab = view.getByRole("tab", { name: "All babies" });
  const languagesTab = view.getByRole("tab", { name: "Requested languages" });
  expect(babiesTab.tagName).toBe("A");
  expect(languagesTab.tagName).toBe("A");
  expect(babiesTab.getAttribute("href")).toContain("tab=babies");
  expect(languagesTab.getAttribute("href")).toContain("tab=languages");

  const hideDemo = view.getByRole("switch", { name: "Hide demo babies" });
  expect(hideDemo.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(hideDemo);
  expect(mocks.navigate).toHaveBeenCalled();

  fireEvent.click(languagesTab);
  expect(mocks.navigate).toHaveBeenCalled();
});
