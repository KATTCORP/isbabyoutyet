import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import {
  HOMEPAGE_DEMO_BABIES,
  HOMEPAGE_DEMO_BABY,
} from "@isbabyoutyet/backend/src/seedCredentials";
import { LocaleProvider } from "@/lib/i18n";
import { cookieName } from "@/paraglide/runtime";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { runRouteLoader } from "@/test/routeTestContext";
import { scopeThemeCss } from "@/components/home/theme-stage";
import { HomePageView, Route } from "./index";

test("homepage links visitors to the live Alba Willis demo page", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  const demoLinks = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.includes(`/baby/${HOMEPAGE_DEMO_BABY.publicId}`));
  expect(demoLinks.length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: /is baby out yet/i })).toBeTruthy();
  expect(screen.getByText(`Follow ${HOMEPAGE_DEMO_BABY.name}'s arrival`)).toBeTruthy();

  // These CTAs render as Base UI Buttons backed by a Link (not native
  // anchors), so Base UI assigns them an accessible role of "button".
  const livePage = screen.getByRole("button", { name: /see a live page/i });
  const createPage = screen.getByRole("button", { name: /create your page/i });
  expect(livePage.parentElement).not.toBe(createPage.parentElement);
});

test("homepage hero is a live baby page visitors can step through", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  const stage = screen.getByTestId("theme-stage");
  // The live page starts on the headline's first name.
  expect(stage.textContent).toContain("Is baby out yet?");
  const activeStep = () => screen.getByTestId("theme-stage").querySelector("[data-active]");
  expect(activeStep()?.textContent).toContain("Not yet");

  fireEvent.click(screen.getByRole("button", { name: "Baby born!" }));
  expect(activeStep()?.textContent).toContain("Yes! Baby is out");
  expect(screen.getByRole("button", { name: "Baby born!" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
});

test("homepage hero keeps every step laid out so the page never jumps", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  // All four steps share one grid cell; only the active one is visible or
  // reachable, so the card is always as tall as the tallest step.
  const steps = screen
    .getByTestId("theme-stage")
    .querySelectorAll("[data-theme-slot='card'] > [aria-hidden]");
  expect(steps).toHaveLength(4);
  const hidden = Array.from(steps).filter((step) => step.getAttribute("aria-hidden") === "true");
  expect(hidden).toHaveLength(3);
  for (const step of hidden) {
    expect(step.hasAttribute("inert")).toBe(true);
  }
});

test("homepage hero re-skins the live page in the picked theme", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  expect(screen.getByTestId("theme-stage").getAttribute("data-baby-theme")).toBe("mango");
  fireEvent.click(screen.getByRole("button", { name: "Bubblegum" }));
  const stage = screen.getByTestId("theme-stage");
  expect(stage.getAttribute("data-baby-theme")).toBe("bubblegum");
  expect(stage.getAttribute("data-theme-scope")).toBe("bubblegum");
});

test("theme CSS is re-scoped from the document root to one container", () => {
  const css = ":root {\n  --primary: pink;\n}\n\n.dark {\n  --primary: plum;\n}\n";
  expect(scopeThemeCss({ css, scope: "bubblegum" })).toBe(
    '[data-theme-scope="bubblegum"] {\n  --primary: pink;\n}\n\n.dark [data-theme-scope="bubblegum"] {\n  --primary: plum;\n}\n',
  );
});

test("homepage theme gallery previews every theme", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  const previews = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/preview"));
  expect(previews).toHaveLength(8);
  expect(previews.some((link) => link.getAttribute("href")?.includes("theme=quantum-rose"))).toBe(
    true,
  );
});

test("homepage source link opens this product's folder in the monorepo", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  const sourceLink = screen.getByRole("link", { name: /open source on github/i });
  expect(new URL(sourceLink.getAttribute("href") ?? "").pathname).toMatch(
    /\/tree\/main\/projects\/isbabyoutyet$/,
  );
});

test("signed-out homepage shows sign-in CTAs", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  expect(screen.getAllByRole("button", { name: /^sign in$/i }).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /get started$/i })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /dashboard/i })).toBeNull();
});

test("signed-in homepage shows dashboard CTAs", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={true} />);

  expect(screen.getByRole("button", { name: /^dashboard$/i })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /go to dashboard/i }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: /create your page/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
});

/** One beat of the hero's shared clock: the name changes every beat, the stage every two. */
const BEAT_MS = 2400;

test("hero name changes every beat, matches the live page, and keeps rolling after a visitor takes over", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => vi.useRealTimers());
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  const heading = screen.getByRole("heading", { name: /is baby out yet/i });
  const nameSlot = (name: string) => within(heading).getByText(name).parentElement;
  expect(nameSlot("baby")?.classList.contains("visible")).toBe(true);
  expect(within(heading).getByText("baby").classList.contains("hero-word-in")).toBe(false);
  // Every name is laid out (invisible) so the slot never changes width.
  expect(nameSlot("Alba")?.classList.contains("invisible")).toBe(true);

  const stage = () => screen.getByTestId("theme-stage");
  const activeStep = () => stage().querySelector("[data-active]");
  expect(stage().textContent).toContain("Is baby out yet?");

  act(() => vi.advanceTimersByTime(BEAT_MS));
  expect(nameSlot("Alba")?.classList.contains("visible")).toBe(true);
  expect(within(heading).getByText("Alba").classList.contains("hero-word-in")).toBe(true);
  // Same name on the live page; the stage itself steps every second beat.
  expect(stage().textContent).toContain("Is Alba out yet?");
  expect(activeStep()?.textContent).toContain("Not yet");

  act(() => vi.advanceTimersByTime(BEAT_MS));
  expect(activeStep()?.textContent).toContain("Labour started!");

  fireEvent.click(screen.getByRole("button", { name: "Baby born!" }));
  act(() => vi.advanceTimersByTime(BEAT_MS));
  expect(nameSlot("Poppy")?.classList.contains("visible")).toBe(true);
  expect(stage().textContent).toContain("Is Poppy out yet?");
  expect(activeStep()?.textContent).toContain("Yes! Baby is out");
});

test("Swedish homepage hero uses Swedish name pool", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => vi.useRealTimers());
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="sv">
      <HomePageView isSignedIn={false} />
    </LocaleProvider>,
  );

  act(() => vi.advanceTimersByTime(BEAT_MS));
  const heading = screen.getByRole("heading", { level: 1 });
  expect(within(heading).getByText("Ella").classList.contains("hero-word-in")).toBe(true);
});

test("Swedish homepage links visitors to Ella Holm", async () => {
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="sv">
      <HomePageView isSignedIn={false} />
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
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

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

test("homepage loader prefetches profile.get", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const data = await runRouteLoader<{ me: { data: unknown } }>({
    harness,
    location: { pathname: "/" },
    params: {},
    route: Route,
  });
  expect(data.me).toMatchObject({ data: null, input: {} });
  expect(harness.queryClient.getData(convexQuery(api.profile.get), {})).toBeNull();
});

test("signed-in profile.get flips homepage CTAs to the dashboard", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  await harness.withIdentity({ subject: userId });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: "/",
    overlayHistory: null,
    path: "/",
    route: Route,
    wrap: null,
  });

  expect(ctx.view.getByRole("button", { name: /^dashboard$/i })).toBeTruthy();
  expect(ctx.view.queryByRole("button", { name: /create your page/i })).toBeNull();
});
