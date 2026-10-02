import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: ["src/collectCoverage.ts", "src/compareCoverage.ts"],
  format: "esm",
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  platform: "node",
});
