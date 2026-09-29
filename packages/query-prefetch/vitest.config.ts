import { defineConfig } from "vitest/config";
import { workspaceCoverage } from "../../vitest.coverage.ts";

export default defineConfig({
  test: {
    coverage: workspaceCoverage(["src/**/*.ts"]),
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    name: "query-prefetch",
  },
});
