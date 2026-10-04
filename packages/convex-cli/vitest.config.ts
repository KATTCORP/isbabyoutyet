import { defineConfig } from "vitest/config";
import { workspaceCoverage } from "../../vitest.coverage.ts";

export default defineConfig({
  test: {
    coverage: workspaceCoverage(["src/**/*.ts"]),
    environment: "node",
    include: ["src/**/*.test.ts"],
    name: "convex-cli",
  },
});
