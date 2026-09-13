import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

const config = defineConfig({
  plugins: [
    paraglideVitePlugin({
      cookieName: "PARAGLIDE_LOCALE",
      emitTsDeclarations: true,
      outdir: "./src/paraglide",
      outputStructure: "message-modules",
      project: "./project.inlang",
      strategy: ["cookie", "custom-acceptLanguage", "baseLocale"],
    }),
    nitro({
      preset: "vercel",
    }),
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
