import type { Plugin } from "vite";
import { buildLegacyPolyfills, legacyPolyfillsLoader } from "./polyfills.ts";
import type { LegacyPolyfillsBundle } from "./polyfills.ts";
import { BUILD_TARGET } from "./targets.ts";

/**
 * Lowers client syntax to `BROWSER_FLOOR` and serves core-js polyfills to
 * browsers below it. The inline loader is exposed as
 * `import.meta.env.VITE_LEGACY_POLYFILLS_LOADER`; render it as a `<head>`
 * script in the root route.
 */
export function legacyPolyfills(): Plugin {
  let polyfills: LegacyPolyfillsBundle | undefined;
  return {
    async config() {
      polyfills = await buildLegacyPolyfills();
      return {
        define: {
          "import.meta.env.VITE_LEGACY_POLYFILLS_LOADER": JSON.stringify(
            legacyPolyfillsLoader(`/${polyfills.fileName}`),
          ),
        },
      };
    },
    configEnvironment(name) {
      if (name !== "client") {
        return {};
      }
      return { build: { target: BUILD_TARGET } };
    },
    configureServer(server) {
      server.middlewares.use((...args) => {
        const request = args[0];
        const response = args[1];
        const next = args[2];
        if (!polyfills || request.url !== `/${polyfills.fileName}`) {
          next();
          return;
        }
        response.setHeader("Content-Type", "text/javascript");
        response.end(polyfills.code);
      });
    },
    generateBundle() {
      if (!polyfills || this.environment.name !== "client") {
        return;
      }
      this.emitFile({ fileName: polyfills.fileName, source: polyfills.code, type: "asset" });
    },
    name: "workspace-legacy-polyfills",
  };
}
