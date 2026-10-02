import { defineConfig } from "vitest/config";
import { workspaceCoverage } from "../../../vitest.coverage.ts";

export default defineConfig({
  test: {
    coverage: workspaceCoverage(["convex/**/*.ts", "src/**/*.ts"]),
    name: "convex",
    // Approximate the Convex runtime better than node
    env: {
      BETTER_AUTH_SECRET: "test-secret-for-vitest-at-least-32-chars",
      CONVEX_SITE_URL: "https://convex.test",
      EMAIL_FROM: "noreply@example.com",
      NODE_ENV: "test",
      RESEND_API_KEY: "test-resend-key",
      SITE_URL: "http://localhost:3000",
      VAPID_PRIVATE_KEY: "test-vapid-private-key",
      VAPID_PUBLIC_KEY: "test-vapid-public-key",
      VAPID_SUBJECT: "mailto:test@example.com",
    },
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "scripts/**/*.test.ts", "src/**/*.test.ts"],
    // Each file builds its own convexTest instance, so sharing the module graph
    // per worker is safe and halves the run by importing every module once.
    isolate: false,
    server: {
      deps: {
        // Bundle component packages so their source can be imported directly
        // in tests via t.registerComponent
        inline: [
          "convex-table-history",
          "@convex-dev/better-auth",
          "@isbabyoutyet/email",
          "react-email",
        ],
      },
    },
  },
});
