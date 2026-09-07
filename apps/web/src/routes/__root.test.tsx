import { act } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@workspace/convex/convex/test.resource";
import { LocaleProvider } from "@/lib/i18n";
import {
  NAVIGATION_PROGRESS_DELAY_MS,
  NavigationProgressBar,
  NotFoundComponent,
  contextLocale,
  localeFromMatches,
  RootDocument,
  RootErrorComponent,
} from "@/routes/__root";
import { renderResource } from "@/test/renderResource";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";

function renderProgress(ui: ReactElement) {
  return renderResource(<LocaleProvider locale="en-GB">{ui}</LocaleProvider>);
}

test("route context locales are narrowed to supported values", () => {
  expect(contextLocale({ locale: "sv" })).toBe("sv");
  expect(contextLocale({ locale: "unsupported" })).toBeUndefined();
  expect(contextLocale({ locale: 1 })).toBeUndefined();
  expect(contextLocale({ locale: true })).toBeUndefined();
  expect(contextLocale({ locale: null })).toBeUndefined();
  expect(contextLocale({})).toBeUndefined();
  expect(contextLocale(null)).toBeUndefined();
  expect(contextLocale(["sv"])).toBeUndefined();
});

test("document locale uses the last route that set one", () => {
  expect(
    localeFromMatches([{ context: { locale: "en-GB" } }, { context: { locale: "sv" } }], "en-US"),
  ).toBe("sv");
});

test("document locale keeps the baby page when a later match has no locale", () => {
  expect(
    localeFromMatches(
      [
        { context: { locale: "en-GB" } },
        { context: { locale: "sv" } },
        { context: { token: "session" } },
      ],
      "en-GB",
    ),
  ).toBe("sv");
});

test("the root document shell sets the html lang attribute", async () => {
  await using _view = await renderWithTestRouter(
    <RootDocument locale="en-GB">
      <div>shell</div>
    </RootDocument>,
  );

  // React 19 hoists the <html> element onto the real document.
  expect(document.documentElement.getAttribute("lang")).toBe("en-GB");
});

test("TanStack Devtools are omitted outside local dev and preview", async () => {
  vi.stubEnv("DEV", false);
  await using _env = makeResource({}, () => {
    vi.unstubAllEnvs();
  });

  await using _view = await renderWithTestRouter(
    <RootDocument locale="en-GB">
      <div>shell</div>
    </RootDocument>,
  );

  expect(document.querySelector("[data-slot=tanstack-devtools]")).toBeNull();
});

test("TanStack Devtools stay on preview builds", async () => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_HAS_DEMO_LOGIN", "true");
  await using _env = makeResource({}, () => {
    vi.unstubAllEnvs();
  });

  await using _view = await renderWithTestRouter(
    <RootDocument locale="en-GB">
      <div>shell</div>
    </RootDocument>,
  );

  expect(document.querySelector("[data-slot=tanstack-devtools]")).not.toBeNull();
});

test("the error page offers reload and go-home recovery, with details in dev", async () => {
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <RootErrorComponent error={new Error("boom")} />
    </LocaleProvider>,
  );

  expect(view.getByText("Something went wrong")).toBeTruthy();
  expect(view.getByText("Go Home")).toBeTruthy();
  expect(view.getByText("boom")).toBeTruthy();

  // Recovery: the reload button triggers a full page reload (jsdom no-ops it).
  view.getByText("Reload page").click();
});

test("the error page hides technical details outside dev", async () => {
  vi.stubEnv("DEV", false);
  await using _env = makeResource({}, () => {
    vi.unstubAllEnvs();
  });

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <RootErrorComponent error={new Error("boom")} />
    </LocaleProvider>,
  );

  expect(view.getByText("Something went wrong")).toBeTruthy();
  expect(view.queryByText("boom")).toBeNull();
});

test("the not-found page offers a way back home", async () => {
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <NotFoundComponent />
    </LocaleProvider>,
  );

  expect(view.getByText("404")).toBeTruthy();
  expect(view.getByText("Go Home")).toBeTruthy();
});

test("no progress bar renders while the router is idle", async () => {
  await using view = renderProgress(<NavigationProgressBar isNavigating={false} />);

  expect(view.queryByRole("progressbar")).toBeNull();
});

test("an indeterminate progress bar renders once loading outlasts the delay", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  await using view = renderProgress(<NavigationProgressBar isNavigating={true} />);

  // The router flips isLoading true on every navigation, cached ones
  // included — nothing may render before the delay elapses.
  expect(view.queryByRole("progressbar")).toBeNull();

  act(() => {
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS);
  });

  const progressbar = view.getByRole("progressbar", { name: "Loading" });
  expect(progressbar.dataset.indeterminate).toBeDefined();
  expect(progressbar.className).toContain("animate-progress-indeterminate");
});

test("fast navigations never flash the progress bar", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  await using view = renderProgress(<NavigationProgressBar isNavigating={true} />);

  // Navigation finishes before the delay elapses (instant, cache-served nav).
  act(() => {
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS - 1);
  });
  view.rerender(
    <LocaleProvider locale="en-GB">
      <NavigationProgressBar isNavigating={false} />
    </LocaleProvider>,
  );

  act(() => {
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS * 5);
  });
  expect(view.queryByRole("progressbar")).toBeNull();
});

test("the progress bar hides as soon as loading resolves", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  await using view = renderProgress(<NavigationProgressBar isNavigating={true} />);

  act(() => {
    vi.advanceTimersByTime(NAVIGATION_PROGRESS_DELAY_MS);
  });
  expect(view.getByRole("progressbar", { name: "Loading" })).toBeTruthy();

  view.rerender(
    <LocaleProvider locale="en-GB">
      <NavigationProgressBar isNavigating={false} />
    </LocaleProvider>,
  );
  act(() => {
    vi.advanceTimersByTime(0);
  });

  expect(view.queryByRole("progressbar")).toBeNull();
});
