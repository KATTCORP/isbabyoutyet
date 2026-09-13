import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
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
 * `@resvg/resvg-js` loads a NAPI `.node` binary. Rolldown (Vite 8 dep
 * optimization + SSR) tries to parse that file as UTF-8 and crashes
 * (`UNLOADABLE_DEPENDENCY` / "stream did not contain valid UTF-8"). Keep the
 * package as a Node builtin-style require so OG PNG rendering still works.
 */
function skipNativeNodeAddons(): Plugin {
  return {
    enforce: "pre",
    name: "skip-native-node-addons",
    resolveId(source) {
      if (!source.endsWith(".node")) {
        return null;
      }
      return { external: true, id: source };
    },
  };
}

/**
 * Nitro's Vite dev middleware classifies every `Sec-Fetch-Dest: image`
 * request as a static asset before TanStack Start can dispatch extensionless
 * server routes. Keep generated `/og` images on the SSR path in development.
 */
function routeGeneratedImagesThroughSsr(): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use((...args) => {
        const request = args[0];
        const next = args[2];
        const pathname = request.url?.split(/[?#]/, 1)[0];
        if (
          request.headers["sec-fetch-dest"] === "image" &&
          (pathname === "/og" || pathname?.startsWith("/og/"))
        ) {
          delete request.headers["sec-fetch-dest"];
        }
        next();
      });
    },
    enforce: "pre",
    name: "route-generated-images-through-ssr",
  };
}

/**
 * `@tanstack/devtools-ui` is Solid and imports `use` from `solid-js/web`.
 * That export exists only in the browser build; Nitro resolves
 * `solid-js/web/dist/server.js` and fails (`MISSING_EXPORT`, tanstack/devtools#187).
 * Replace our host module on server environments so preview can keep Devtools
 * in the client bundle without pulling Solid into the serverless graph.
 */
function stubTanstackDevtoolsOnServer(): Plugin {
  const stubId = "\0stub-tanstack-devtools-ssr";
  return {
    applyToEnvironment(environment) {
      return environment.config.consumer === "server";
    },
    enforce: "pre",
    load(id) {
      if (id !== stubId) {
        return null;
      }
      return "export function TanStackAppDevtools() { return null; }\n";
    },
    name: "stub-tanstack-devtools-on-server",
    resolveId(source) {
      if (!/(?:^|[/\\])tanstack-devtools(?:\.[cm]?[jt]sx?)?$/.test(source)) {
        return null;
      }
      return stubId;
    },
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
  optimizeDeps: {
    exclude: ["@resvg/resvg-js"],
  },
  plugins: [
    // Docs require devtools() as the first Vite plugin:
    // https://tanstack.com/devtools/latest/docs/quick-start#vite-plugin
    // Preview sets VITE_HAS_DEMO_LOGIN so `vite build` keeps the UI; production
    // leaves it unset and the plugin strips every TanStack Devtools import.
    // Local `vite dev` never runs the strip pass.
    devtools({
      removeDevtoolsOnBuild: process.env.VITE_HAS_DEMO_LOGIN !== "true",
    }),
    stubTanstackDevtoolsOnServer(),
    aliasUseSyncExternalStoreShim(),
    skipNativeNodeAddons(),
    routeGeneratedImagesThroughSsr(),
    paraglideVitePlugin({
      cookieName: "PARAGLIDE_LOCALE",
      emitTsDeclarations: true,
      outdir: "./src/paraglide",
      outputStructure: "message-modules",
      project: "./project.inlang",
      strategy: ["cookie", "preferredLanguage", "baseLocale"],
    }),
    // Nitro Vite plugin is what Vercel uses to turn TanStack Start into
    // Functions + Fluid compute:
    // https://vercel.com/kb/guide/deploy-a-tanstack-start-app-to-vercel
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
    tanstackStart({
      server: {
        entry: "./src/server.ts",
      },
    }),
    viteReact({ compiler: true }),
  ],
  ssr: {
    external: ["@resvg/resvg-js"],
    noExternal: ["@convex-dev/better-auth"],
    optimizeDeps: {
      exclude: ["@resvg/resvg-js"],
    },
  },
});

export default config;
