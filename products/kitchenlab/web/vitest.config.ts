import { defineConfig } from "vitest/config";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  test: {
    name: "kitchenlab-web",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
