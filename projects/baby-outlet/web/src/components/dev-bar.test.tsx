import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { DEMO_BABIES, HOMEPAGE_DEMO_BABIES } from "@baby-outlet/backend/src/seedCredentials";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  hasDemoLogin: true,
}));

vi.mock("@/lib/has-demo-login", () => ({
  get hasDemoLogin() {
    return mocks.hasDemoLogin;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: (
    props: React.ComponentProps<"a"> & {
      to: string | undefined;
      params: { publicId: string } | undefined;
    },
  ) => {
    const href =
      props.to === "/baby/$publicId" && props.params
        ? `/baby/${props.params.publicId}`
        : typeof props.to === "string"
          ? props.to
          : "#";
    return (
      <a href={href} {...props}>
        {props.children}
      </a>
    );
  },
  useRouterState: (opts: { select: (state: { location: { pathname: string } }) => string }) =>
    opts.select({ location: { pathname: mocks.pathname } }),
}));

const { DevBar } = await import("./dev-bar");

function renderDevBar() {
  const view = render(<DevBar />);
  return makeResource(view, () => {
    view.unmount();
  });
}

async function openDevBar() {
  fireEvent.click(screen.getByRole("button", { name: /developer shortcuts/i }));
  await vi.waitFor(() => {
    expect(screen.getByRole("menu")).toBeTruthy();
  });
}

test("opens a menu of seeded baby shortcuts", async () => {
  mocks.pathname = "/dashboard";
  mocks.hasDemoLogin = true;

  await using _view = renderDevBar();

  expect(screen.queryByRole("menuitem", { name: /not yet/i })).toBeNull();
  await openDevBar();

  for (const baby of DEMO_BABIES) {
    const link = screen.getByRole("menuitem", { name: new RegExp(baby.label, "i") });
    expect(link.getAttribute("href")).toBe(`/baby/${baby.publicId}`);
  }

  const juniper = screen.getByRole("menuitem", {
    name: new RegExp(HOMEPAGE_DEMO_BABIES["en-GB"].name, "i"),
  });
  expect(juniper.getAttribute("href")).toBe(`/baby/${HOMEPAGE_DEMO_BABIES["en-GB"].publicId}`);
});

test("hides entirely when demo login is disabled", async () => {
  mocks.hasDemoLogin = false;
  mocks.pathname = "/";

  await using _view = renderDevBar();

  expect(screen.queryByRole("button", { name: /developer shortcuts/i })).toBeNull();
});

test("closes when the route changes", async () => {
  mocks.pathname = "/dashboard";
  mocks.hasDemoLogin = true;

  await using view = renderDevBar();
  await openDevBar();

  mocks.pathname = "/baby/baby-waiting";
  view.rerender(<DevBar />);

  await vi.waitFor(() => {
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

test("page shortcut links point at dashboard, login, and preview", async () => {
  mocks.pathname = "/";
  mocks.hasDemoLogin = true;

  await using _view = renderDevBar();
  await openDevBar();

  expect(screen.getByRole("menuitem", { name: /dashboard/i }).getAttribute("href")).toBe(
    "/dashboard",
  );
  expect(screen.getByRole("menuitem", { name: /login/i }).getAttribute("href")).toBe("/auth/login");
  expect(screen.getByRole("menuitem", { name: /preview/i }).getAttribute("href")).toBe("/preview");
});

test("marks the current baby when opened on a baby page", async () => {
  mocks.pathname = "/baby/baby-in-labor";
  mocks.hasDemoLogin = true;

  await using _view = renderDevBar();
  await openDevBar();

  expect(screen.getByRole("menuitem", { name: /labour started/i })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: /not yet/i })).toBeTruthy();
});

test("covers page active states for dashboard, login, and preview", async () => {
  mocks.hasDemoLogin = true;

  mocks.pathname = "/dashboard";
  {
    await using _dashboard = renderDevBar();
    await openDevBar();
    expect(screen.getByRole("menuitem", { name: /dashboard/i })).toBeTruthy();
  }

  mocks.pathname = "/auth/login";
  {
    await using _login = renderDevBar();
    await openDevBar();
    expect(screen.getByRole("menuitem", { name: /login/i })).toBeTruthy();
  }

  mocks.pathname = "/preview";
  {
    await using _preview = renderDevBar();
    await openDevBar();
    expect(screen.getByRole("menuitem", { name: /preview/i })).toBeTruthy();
  }
});

test("marks the current homepage demo baby", async () => {
  mocks.pathname = `/baby/${HOMEPAGE_DEMO_BABIES["en-GB"].publicId}`;
  mocks.hasDemoLogin = true;

  await using _view = renderDevBar();
  await openDevBar();

  expect(
    screen.getByRole("menuitem", { name: new RegExp(HOMEPAGE_DEMO_BABIES["en-GB"].name, "i") }),
  ).toBeTruthy();
});
