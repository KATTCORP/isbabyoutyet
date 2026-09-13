import type { Plugin } from "vite";
import { defineConfig } from "vite";
import babel from "@rolldown/plugin-babel";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

/**
 * Base UI (and recharts, etc.) pull in `use-sync-external-store/shim`, a CJS-only
 * module. Vite/Rolldown SSR lowers its `require("react")` to a runtime
 * `createRequire` call. On Vercel that fails with `Cannot find module 'react'`
 * because the serverless function has no node_modules (nitrojs/nitro#4171,
 * rolldown#9407). React 19 already exports `useSyncExternalStore`, so alias the
 * basic shim to `react`.
 *
 * Do NOT alias `shim/with-selector` — that exports `useSyncExternalStoreWithSelector`,
 * which is not on the React package (client crash: "is not a function").
 */
function aliasUseSyncExternalStoreShim(): Plugin {
  return {
    name: "alias-use-sync-external-store-shim",
    enforce: "pre",
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
  };
}

/**
 * Belt-and-suspenders for any remaining leaked `__require("react")` after the
 * shim alias (same rewrite as discussed on nitro#4171).
 */
function patchLeakedReactRequire(): Plugin {
  return {
    name: "patch-leaked-react-require",
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
  };
}

const config = defineConfig({
  plugins: [
    // Docs require devtools() as the first Vite plugin:
    // https://tanstack.com/devtools/latest/docs/quick-start#vite-plugin
    devtools(),
    aliasUseSyncExternalStoreShim(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      outputStructure: "message-modules",
      emitTsDeclarations: true,
      cookieName: "PARAGLIDE_LOCALE",
      strategy: ["cookie", "preferredLanguage", "baseLocale"],
    }),
    // Base UI grows the Nitro SSR rebundle enough that Rolldown's default split
    // creates circular `ssr`/`ssr2` chunks and drops `ssr_exports` (preview 500).
    // Keep the SSR service graph in one chunk; still split real node_modules
    // into `_libs`. Avoid `inlineDynamicImports` — it worsens the leaked
    // `require('react')` failure on Vercel (nitro#4171).
    nitro({
      rolldownConfig: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "ssr",
                test: /[/\\]node_modules[/\\]\.nitro[/\\]vite[/\\]services[/\\]ssr[/\\]/,
              },
              {
                test: /node_modules[/\\](?!(?:nitro|nitro-nightly)[/\\])[^.]/,
                name(id: string) {
                  const match =
                    /[/\\]node_modules[/\\](?:\.pnpm[/\\][^/]+[/\\]node_modules[/\\])?(?:(@[^/]+[/\\][^/]+)|([^/]+))/i.exec(
                      id,
                    );
                  const name = match?.[1] ?? match?.[2];
                  return name ? name.replace(/[/\\+@]/g, "_") : "vendor";
                },
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
    tanstackStart({
      server: {
        entry: "./src/server.ts",
      },
    }),
    viteReact(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  ssr: {
    noExternal: ["@convex-dev/better-auth"],
  },
});

export default config;
