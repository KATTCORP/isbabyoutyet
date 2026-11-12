import { createHash } from "node:crypto";
import compat from "core-js-compat";
import { rolldown } from "rolldown";
import { BROWSER_FLOOR, MODERN_FEATURE_CHECK } from "./targets.ts";

const ENTRY_ID = "\0legacy-polyfills";

/**
 * Every stable core-js module (`es.*` and `web.*`) that some `BROWSER_FLOOR`
 * browser needs. `core-js` itself is only imported from the generated entry,
 * so knip ignores it as a dependency.
 *
 * @internal exported for tests
 */
export function legacyPolyfillModules() {
  return compat({ modules: [/^es\./, /^web\./], targets: BROWSER_FLOOR }).list;
}

/** The polyfill script and the path it is served from. */
export interface LegacyPolyfillsBundle {
  code: string;
  fileName: string;
}

/** Bundles `legacyPolyfillModules()` into one minified classic script. */
export async function buildLegacyPolyfills(): Promise<LegacyPolyfillsBundle> {
  const entry = legacyPolyfillModules()
    .map((name) => `import "core-js/modules/${name}.js";`)
    .join("\n");
  const bundle = await rolldown({
    cwd: import.meta.dirname,
    input: ENTRY_ID,
    logLevel: "silent",
    plugins: [
      {
        load: (id) => (id === ENTRY_ID ? entry : null),
        name: "legacy-polyfills-entry",
        resolveId: (id) => (id === ENTRY_ID ? id : null),
      },
    ],
  });
  const result = await bundle.generate({ format: "iife", minify: true });
  await bundle.close();
  const code = result.output[0].code;
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 10);
  return { code, fileName: `assets/legacy-polyfills-${hash}.js` };
}

/**
 * Inline `<head>` script that loads the polyfills only in browsers missing a
 * modern built-in. `document.write` makes the injected script parser-blocking,
 * so it runs before the deferred module scripts that start the app. Modern
 * browsers pay for this snippet and one check, nothing else.
 */
export function legacyPolyfillsLoader(src: string) {
  return `if(!(${MODERN_FEATURE_CHECK}))document.write('<script src="${src}"><\\/script>')`;
}
