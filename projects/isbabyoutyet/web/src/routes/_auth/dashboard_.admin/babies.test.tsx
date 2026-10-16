import type { QueryClient } from "@raf-query/react";
import type { ConvexReader } from "@workspace/convex-query";
import { getFunctionName } from "convex/server";
import type { ReactElement } from "react";
import { expect, test } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import type { TranslationFunction } from "@/lib/i18n";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import {
  ADMIN_BABIES_DEFAULT_SEARCH,
  BabiesSection,
  Route as AdminBabiesRoute,
  nextSortSearch,
  statusLabel,
} from "@/routes/_auth/dashboard_.admin/babies";

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
    path: "/dashboard/admin/babies",
  });
}

test("statusLabel covers every baby status", () => {
  expect(statusLabel("not_yet", t)).toBe("Not yet");
  expect(statusLabel("labor_started", t)).toBe("Labour started");
  expect(statusLabel("gone_to_hospital", t)).toBe("Gone to hospital");
  expect(statusLabel("born", t)).toBe("Baby born");
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

test("babies tab default search is newest created first with demos hidden", () => {
  expect(ADMIN_BABIES_DEFAULT_SEARCH).toEqual({ hideDemo: true, order: "desc", sort: "created" });
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
  expect(created.getAttribute("href")).toContain("/dashboard/admin/babies?");
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
    />,
  );
  expect(loadingMore.getByText("Avery")).toBeTruthy();
  expect(loadingMore.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
});

test("babies loader prefetches only the babies page for the URL's sort and filter", async () => {
  const called: Array<string> = [];
  await using stub = stubQueryClientResource(async (query) => {
    called.push(getFunctionName(query));
    return { continueCursor: "", isDone: true, page: [] };
  });
  // @ts-expect-error — stub loader opts are the fields this route reads
  const loader: (opts: {
    context: { queryClient: QueryClient<ConvexReader> };
    deps: { hideDemo: boolean; order: string; sort: string };
  }) => Promise<object> = AdminBabiesRoute.options.loader;

  const result = await loader({
    context: { queryClient: stub.queryClient },
    deps: { hideDemo: false, order: "asc", sort: "updated" },
  });

  expect(result).toMatchObject({
    ensured: true,
    input: { args: { hideDemo: false, sortBy: "updated", sortOrder: "asc" }, numItems: 20 },
  });
  expect(called).toEqual(["admin:listBabies"]);
});
