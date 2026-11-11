// @vitest-environment jsdom
import { createMemoryHistory } from "@tanstack/react-router";
import { expect, test } from "vitest";

import { getLocale } from "./paraglide/runtime";
import { getRouter } from "./router";

/** The app's router, loaded at `entry` as a browser would on a navigation. */
async function loadAt(entry: string) {
  const router = getRouter();
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  await router.load();
  return router;
}

test("a legacy ?info= share link opens the cut's #info- hash and keeps the rest of the search", async () => {
  const router = await loadAt("/?info=pork-fillet-rare&q=pork");

  expect(router.state.location.pathname).toBe("/");
  expect(router.state.location.hash).toBe("info-pork-fillet-rare");
  expect(router.state.location.search).toEqual({ q: "pork" });
});

test("a link without ?info= stays where it is", async () => {
  const router = await loadAt("/?q=pork");

  expect(router.state.location.hash).toBe("");
  expect(router.state.location.search).toEqual({ q: "pork" });
});

test("route context carries the locale the page renders in", async () => {
  const router = await loadAt("/");

  expect(router.state.matches[0]?.context).toMatchObject({ locale: getLocale() });
});
