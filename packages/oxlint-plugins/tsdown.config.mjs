import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: ["workspace.ts", "anti-slop/index.ts", "anti-slop/effect/index.ts", "nkzw/index.ts"],
  format: "esm",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
});
