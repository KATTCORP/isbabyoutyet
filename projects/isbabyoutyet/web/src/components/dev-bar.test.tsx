import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEMO_BABIES, HOMEPAGE_DEMO_BABIES } from "@isbabyoutyet/backend/src/seedCredentials";
import { activeBabyPublicId, DevBar } from "@/components/dev-bar";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";

const HOMEPAGE_DEMO = HOMEPAGE_DEMO_BABIES["en-GB"];

async function openDevBar() {
  fireEvent.click(screen.getByRole("button", { name: /developer shortcuts/i }));
  await vi.waitFor(() => {
    expect(screen.getByRole("menu")).toBeTruthy();
  });
}

test("sits below the page chrome on small screens", async () => {
  await using _view = await renderWithTestRouter(<DevBar />, { path: "/dashboard" });
  const trigger = screen.getByRole("button", { name: /developer shortcuts/i });
  const overlay = trigger.closest("[class*='fixed']");
  expect(overlay?.className).toMatch(/max-sm:top-16/);
  expect(screen.getByText("Dev").className).toMatch(/max-sm:sr-only/);
});

test("opens a menu of seeded baby shortcuts", async () => {
  await using _view = await renderWithTestRouter(<DevBar />, {
    path: "/dashboard",
  });

  expect(screen.queryByRole("menuitem", { name: /not yet/i })).toBeNull();
  await openDevBar();

  for (const baby of DEMO_BABIES) {
    const link = screen.getByRole("menuitem", { name: new RegExp(baby.label, "i") });
    expect(link.getAttribute("href")).toBe(`/baby/${baby.publicId}`);
  }

  const juniper = screen.getByRole("menuitem", { name: new RegExp(HOMEPAGE_DEMO.name, "i") });
  expect(juniper.getAttribute("href")).toBe(`/baby/${HOMEPAGE_DEMO.publicId}`);
});

test("closes when the route changes", async () => {
  await using view = await renderWithTestRouter(<DevBar />, { path: "/dashboard" });
  await openDevBar();

  // The test tree registers only a root route, so drive the location through
  // history instead of a typed `navigate({ to })`.
  act(() => {
    view.router.history.push("/baby/baby-waiting");
  });

  await vi.waitFor(() => {
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

test("page shortcut links point at dashboard, login, and preview", async () => {
  await using _view = await renderWithTestRouter(<DevBar />, { path: "/" });
  await openDevBar();

  expect(screen.getByRole("menuitem", { name: /dashboard/i }).getAttribute("href")).toBe(
    "/dashboard",
  );
  expect(screen.getByRole("menuitem", { name: /login/i }).getAttribute("href")).toBe("/auth/login");
  expect(screen.getByRole("menuitem", { name: /preview/i }).getAttribute("href")).toBe("/preview");
});

test("marks the current baby when opened on a baby page", async () => {
  await using _view = await renderWithTestRouter(<DevBar />, {
    path: "/baby/baby-in-labor",
  });
  await openDevBar();

  expect(
    screen.getByRole("menuitem", { name: /labour started/i }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen.getByRole("menuitem", { name: /not yet/i }).getAttribute("aria-current"),
  ).toBeNull();
});

test("marks the current homepage demo baby", async () => {
  await using _view = await renderWithTestRouter(<DevBar />, {
    path: `/baby/${HOMEPAGE_DEMO.publicId}`,
  });
  await openDevBar();

  expect(
    screen
      .getByRole("menuitem", { name: new RegExp(HOMEPAGE_DEMO.name, "i") })
      .getAttribute("aria-current"),
  ).toBe("page");
});

test.each([
  { name: /dashboard/i, path: "/dashboard" },
  { name: /login/i, path: "/auth/login" },
  { name: /preview/i, path: "/preview" },
])("marks the current page shortcut on $path", async (testCase) => {
  await using _view = await renderWithTestRouter(<DevBar />, {
    path: testCase.path,
  });
  await openDevBar();

  const items = screen.getAllByRole("menuitem");
  const current = items.filter((item) => item.getAttribute("aria-current") === "page");
  expect(current).toHaveLength(1);
  expect(current[0]?.textContent).toMatch(testCase.name);
});

test.each([
  { expected: "baby-waiting", pathname: "/baby/baby-waiting" },
  { expected: "baby-waiting", pathname: "/baby/baby-waiting/settings" },
  { expected: null, pathname: "/dashboard" },
  { expected: null, pathname: "/babysitter" },
])("activeBabyPublicId($pathname) is $expected", (testCase) => {
  expect(activeBabyPublicId(testCase.pathname)).toBe(testCase.expected);
});
