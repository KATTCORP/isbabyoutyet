import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { HOMEPAGE_DEMO_BABIES, HOMEPAGE_DEMO_BABY } from "@baby-outlet/backend/src/seedCredentials";
import { LocaleProvider } from "@/lib/i18n";
import { cookieName } from "@/paraglide/runtime";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null }),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: () => ReactElement }) => opts,
  Link: (props: {
    to: string | undefined;
    params: { publicId: string | undefined } | undefined;
    search: unknown;
    children: React.ReactNode;
    className: string | undefined;
  }) => {
    const href = props.params?.publicId
      ? `/baby/${props.params.publicId}`
      : typeof props.to === "string"
        ? props.to
        : "#";
    return (
      <a href={href} className={props.className}>
        {props.children}
      </a>
    );
  },
}));

const { HomePage } = await import("./index");

function renderResource(ui: ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("homepage links visitors to the live Juniper Hale demo page", async () => {
  await using _view = renderResource(<HomePage />);

  const demoLinks = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.includes(`/baby/${HOMEPAGE_DEMO_BABY.publicId}`));
  expect(demoLinks.length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: /is baby out yet/i })).toBeTruthy();
  expect(screen.getByText(`Follow ${HOMEPAGE_DEMO_BABY.name}'s arrival`)).toBeTruthy();

  const livePage = screen.getByRole("link", { name: /see a live page/i });
  const createPage = screen.getByRole("link", { name: /create your page/i });
  expect(livePage.parentElement).not.toBe(createPage.parentElement);
});

test("hero headline cycles through baby names", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();
  await using _view = renderResource(<HomePage />);

  expect(screen.getByRole("heading", { name: /is baby out yet/i })).toBeTruthy();

  // Before the first tick only the invisible sizer copy of the name exists.
  expect(screen.getAllByText("Juniper")).toHaveLength(1);

  act(() => {
    vi.advanceTimersByTime(2400);
  });

  // After a tick the name is also rendered as the visible rotating word.
  expect(screen.getAllByText("Juniper")).toHaveLength(2);
});

test("Swedish homepage hero uses Swedish name pool", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();
  await using _view = renderResource(
    <LocaleProvider locale="sv">
      <HomePage />
    </LocaleProvider>,
  );

  act(() => {
    vi.advanceTimersByTime(2400);
  });
  expect(screen.getAllByText("Ella")).toHaveLength(2);
});

test("Swedish homepage links visitors to Ella Holm", async () => {
  await using _view = renderResource(
    <LocaleProvider locale="sv">
      <HomePage />
    </LocaleProvider>,
  );

  const demoLinks = screen
    .getAllByRole("link")
    .filter((link) =>
      link.getAttribute("href")?.includes(`/baby/${HOMEPAGE_DEMO_BABIES.sv.publicId}`),
    );
  expect(demoLinks.length).toBeGreaterThan(0);
  expect(screen.getByText("Följ med tills Ella Holm är här")).toBeTruthy();
});

test("homepage language picker saves an explicit language choice", async () => {
  document.cookie = `${cookieName}=; path=/; max-age=0`;
  await using _cookie = makeResource({}, () => {
    document.cookie = `${cookieName}=; path=/; max-age=0`;
  });
  await using _view = renderResource(<HomePage />);

  const picker = screen.getByRole("combobox", { name: "Language" });
  expect(picker.textContent).toContain("British English");
  fireEvent.click(picker);
  const swedish = await screen.findByRole("option", { name: "svenska" });
  expect(screen.getByRole("option", { name: "British English" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "American English" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "español" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "português (Brasil)" })).toBeTruthy();
  fireEvent.pointerDown(swedish, { pointerType: "mouse" });
  fireEvent.click(swedish);

  await vi.waitFor(() => {
    expect(document.cookie).toContain(`${cookieName}=sv`);
  });
});
