import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { buildLegacyPolyfills, legacyPolyfillModules, legacyPolyfillsLoader } from "./polyfills.ts";

const SRC = "/assets/legacy-polyfills-abc.js";

function runLoader(setup: string) {
  const write = vi.fn<(html: string) => void>();
  runInNewContext(`${setup};${legacyPolyfillsLoader(SRC)}`, { document: { write } });
  return write;
}

test("covers the ES2023 array methods behind PERSONAL-ISBABYOUTYET-8", () => {
  expect(legacyPolyfillModules()).toEqual(
    expect.arrayContaining(["es.array.to-sorted", "es.array.to-reversed", "es.object.group-by"]),
  );
});

test("the bundle restores a missing built-in and is content-hashed", async () => {
  const polyfills = await buildLegacyPolyfills();

  // Browser globals that the `web.*` modules patch rather than create.
  const sorted = runInNewContext(
    `delete Array.prototype.toSorted;${polyfills.code};[3, 1, 2].toSorted().join()`,
    { DOMException, URL, URLSearchParams },
  );

  expect(sorted).toBe("1,2,3");
  expect(polyfills.fileName).toMatch(/^assets\/legacy-polyfills-[\da-f]{10}\.js$/);
});

test("the loader writes the polyfill script when a modern built-in is missing", () => {
  const write = runLoader("delete Object.groupBy");

  expect(write).toHaveBeenCalledWith(`<script src="${SRC}"></script>`);
});

test("the loader does nothing in a modern browser", () => {
  const write = runLoader("");

  expect(write).not.toHaveBeenCalled();
});
