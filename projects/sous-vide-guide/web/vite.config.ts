import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

/**
 * Base UI pulls in `use-sync-external-store/shim`, a CJS-only module. Vite/Rolldown
 * SSR lowers its `require("react")` to a runtime `createRequire` call. On Vercel
 * that fails with `Cannot find module 'react'` because the serverless function has
 * no node_modules (nitrojs/nitro#4171, rolldown#9407). React 19 already exports
 * `useSyncExternalStore`, so alias the basic shim to `react`.
 *
 * Do NOT alias `shim/with-selector` — that exports `useSyncExternalStoreWithSelector`,
 * which is not on the React package.
 */
function aliasUseSyncExternalStoreShim(): Plugin {
  return {
    config() {
      return {
        resolve: {
          alias: [
            {
              find: /^use-sync-external-store\/shim$/,
              replacement: "react",
            },
            {
              find: /^use-sync-external-store\/shim\/index\.js$/,
              replacement: "react",
            },
          ],
        },
      };
    },
    enforce: "pre",
    name: "alias-use-sync-external-store-shim",
  };
}

/**
 * Belt-and-suspenders for any remaining leaked `__require("react")` after the
 * shim alias (same rewrite as discussed on nitro#4171).
 */
function patchLeakedReactRequire(): Plugin {
  return {
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.code.includes('__require("react")')) {
          continue;
        }
        const match = chunk.code.match(/\brequire_react(?:\$\d+)?\b/);
        if (!match) {
          continue;
        }
        chunk.code = chunk.code.replaceAll('__require("react")', `${match[0]}()`);
      }
    },
    name: "patch-leaked-react-require",
  };
}

const config = defineConfig({
  plugins: [
    aliasUseSyncExternalStoreShim(),
    paraglideVitePlugin({
      cookieName: "PARAGLIDE_LOCALE",
      emitTsDeclarations: true,
      outdir: "./src/paraglide",
      outputStructure: "message-modules",
      project: "./project.inlang",
      strategy: ["cookie", "custom-acceptLanguage", "baseLocale"],
    }),
    // Keep the SSR service graph in one chunk; still split real node_modules
    // into `_libs`. Avoid `inlineDynamicImports` — it worsens the leaked
    // `require('react')` failure on Vercel (nitro#4171).
    nitro({
      preset: "vercel",
      rolldownConfig: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "ssr",
                test: /[/\\]node_modules[/\\]\.nitro[/\\]vite[/\\]services[/\\]ssr[/\\]/,
              },
              {
                name(id: string) {
                  const match =
                    /[/\\]node_modules[/\\](?:\.pnpm[/\\][^/]+[/\\]node_modules[/\\])?(?:(@[^/]+[/\\][^/]+)|([^/]+))/i.exec(
                      id,
                    );
                  const name = match?.[1] ?? match?.[2];
                  return name ? name.replaceAll(/[/\\+@]/g, "_") : "vendor";
                },
                test: /node_modules[/\\](?!(?:nitro|nitro-nightly)[/\\])[^.]/,
              },
            ],
          },
        },
      },
    }),
    patchLeakedReactRequire(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    // Server entry is the default `src/server.ts` (paraglideMiddleware + Accept-Language).
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
