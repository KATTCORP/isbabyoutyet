import { defineConfig } from "vitest/config";
import { workspaceCoverage } from "../../../vitest.coverage.ts";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: workspaceCoverage(["src/**/*.{ts,tsx}"]),
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    name: "sous-vide-guide-web",
  },
});
