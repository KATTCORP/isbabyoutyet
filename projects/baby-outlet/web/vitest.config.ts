import { defineConfig, defineProject } from "vitest/config";
import viteReact from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import type { BrowserCommand } from "vitest/node";

const VIEWPORT = { height: 924, width: 393 };
const APP_BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WEB_ROOT = import.meta.dirname;

type PageCheckOptions = {
  expectedText: string | null;
  heading: string;
  path: string;
};

type OverflowResult = {
  documentWidth: number;
  viewportWidth: number;
  widest: {
    className: string;
    right: number;
    tagName: string;
  } | null;
};

const measureMobileOverflow: BrowserCommand<[PageCheckOptions], OverflowResult> = async (
  context,
  options,
) => {
  if (context.provider.name !== "playwright") {
    throw new Error(`Unsupported browser provider: ${context.provider.name}`);
  }

  const page = await context.context.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.goto(new URL(options.path, APP_BASE_URL).href);
  await page.getByRole("heading", { name: options.heading }).waitFor();
  if (options.expectedText) {
    await page.getByText(options.expectedText, { exact: false }).first().waitFor();
  }

  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const widest =
      [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          // className is string | SVGAnimatedString; coerce without typeof (browser bundle).
          const className = element.className;
          return {
            className: `${className}` === className ? className : "",
            right: rect.right,
            tagName: element.tagName,
          };
        })
        .toSorted((left, right) => right.right - left.right)[0] ?? null;

    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
      widest,
    };
  });
  await page.close();
  return result;
};

export const webUnitProject = defineProject({
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  root: WEB_ROOT,
  test: {
    environment: "jsdom",
    exclude: ["src/**/*.browser.test.{ts,tsx}"],
    include: ["src/**/*.test.{ts,tsx}"],
    name: "web",
    // Loads better-auth host stubs (broadcast, focus, online) before that
    // package is imported. Window API stubs are opt-in via `stubJsdomWindow()`.
    setupFiles: ["./src/test/stubJsdomWindow.ts"],
    // Keep auth/Convex clients off real backends so unit tests never dial the
    // developer's running `pnpm dev` / Convex backend (ports 3000 / 3210) or
    // a publicly resolvable Convex host (example.convex.cloud resolves in DNS).
    env: {
      VITE_CONVEX_SITE_URL: "https://example.invalid",
      VITE_CONVEX_URL: "https://example.invalid",
      VITE_SITE_URL: "https://example.test",
      // convex-test runs real Convex functions (including scheduled cache purge).
      BETTER_AUTH_SECRET: "test-secret-for-vitest-at-least-32-chars",
      CONVEX_SITE_URL: "https://convex.test",
      SITE_URL: "http://localhost:3000",
      VAPID_PRIVATE_KEY: "test-vapid-private-key",
      VAPID_PUBLIC_KEY: "test-vapid-public-key",
    },
    server: {
      deps: {
        // Needed when web tests pull in convex-test + the table-history component
        inline: ["convex-table-history"],
      },
    },
  },
});

export const webBrowserProject = defineProject({
  root: WEB_ROOT,
  test: {
    browser: {
      commands: {
        measureMobileOverflow,
      },
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
    include: ["src/**/*.browser.test.ts"],
    name: "web-browser",
  },
});

export default defineConfig({
  test: {
    projects: [webUnitProject, webBrowserProject],
  },
});
