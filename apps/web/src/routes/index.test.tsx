import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@workspace/convex/convex/test.resource";
import { HOMEPAGE_DEMO_BABIES, HOMEPAGE_DEMO_BABY } from "@workspace/convex/src/seedCredentials";
import { FEATURES, HERO_HEADLINES, HOW_IT_WORKS } from "@/components/homepage/homepage-copy";
import {
  HomepageFeaturesSection,
  HomepageHowItWorksSection,
} from "@/components/homepage/homepage-static";
import { LocaleProvider, translate } from "@/lib/i18n";
import { cookieName } from "@/paraglide/runtime";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { runRouteLoader } from "@/test/routeTestContext";
import { HomePageView, Route } from "./index";

test("static features section renders translated cards", async () => {
  const locale = "en-GB" as const;
  const title = translate(locale, "Everything the family needs");
  await using _view = await renderWithTestRouter(
    <HomepageFeaturesSection
      features={FEATURES.map((feature) => ({
        description: translate(locale, feature.description),
        emoji: feature.emoji,
        title: translate(locale, feature.title),
      }))}
      subtitle={translate(locale, "For you, and for everyone waiting by the phone")}
      title={title}
    />,
  );

  expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: translate(locale, "Update your status") }),
  ).toBeTruthy();
  expect(HOW_IT_WORKS.length).toBe(3);
});

test("static how-it-works section renders steps", async () => {
  const locale = "en-GB" as const;
  const title = translate(locale, "How it works");
  await using _view = await renderWithTestRouter(
    <HomepageHowItWorksSection
      steps={HOW_IT_WORKS.map((item) => ({
        description: translate(locale, item.description),
        step: item.step,
        title: translate(locale, item.title),
      }))}
      subtitle={translate(locale, "Up and running in under a minute")}
      title={title}
    />,
  );

  expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  expect(screen.getByRole("heading", { name: translate(locale, "Create your page") })).toBeTruthy();
});

test("homepage links visitors to the live Juniper Hale demo page", async () => {
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  const demoLinks = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.includes(`/baby/${HOMEPAGE_DEMO_BABY.publicId}`));
  expect(demoLinks.length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: /is baby out yet/i })).toBeTruthy();
  expect(screen.getByText(`Follow ${HOMEPAGE_DEMO_BABY.name}'s arrival`)).toBeTruthy();

  const livePage = screen.getByRole("button", { name: /see a live page/i });
  const createPage = screen.getByRole("button", { name: /create your page/i });
  expect(livePage.parentElement).not.toBe(createPage.parentElement);
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

test("hero headline cycles through baby names", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => vi.useRealTimers());
  await using _view = await renderWithTestRouter(<HomePageView isSignedIn={false} />);

  expect(screen.getByRole("heading", { name: /is baby out yet/i })).toBeTruthy();
  expect(screen.queryByText("Juniper")).toBeNull();
  act(() => vi.advanceTimersByTime(2400));
  expect(screen.getByText("Juniper").classList.contains("hero-word-in")).toBe(true);
  expect(HERO_HEADLINES["en-GB"].words[1]).toBe("Juniper");
});

test("Swedish homepage hero uses Swedish name pool", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => vi.useRealTimers());
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="sv">
      <HomePageView isSignedIn={false} />
    </LocaleProvider>,
  );

  act(() => vi.advanceTimersByTime(2400));
  expect(screen.getByText("Ella").classList.contains("hero-word-in")).toBe(true);
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

test("homepage loader prefetches profile.get and skips RSC in test mode", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const data = await runRouteLoader<{
    homepage: { src: null };
    me: { initialData: unknown };
  }>({
    harness,
    location: { pathname: "/" },
    params: {},
    route: Route,
  });
  expect(data.me.initialData).toBeNull();
  expect(data.homepage.src).toBeNull();
});

test("signed-in profile.get flips homepage CTAs to the dashboard", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });

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
