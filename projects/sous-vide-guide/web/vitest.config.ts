import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    name: "sous-vide-guide-web",
    setupFiles: ["./vitest.setup.ts"],
  },
});
