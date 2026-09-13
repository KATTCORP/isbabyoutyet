import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "convex",
    // Approximate the Convex runtime better than node
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    env: {
      SITE_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-vitest-at-least-32-chars",
      CONVEX_SITE_URL: "https://convex.test",
      NODE_ENV: "test",
      VAPID_PRIVATE_KEY: "test-vapid-private-key",
      VAPID_PUBLIC_KEY: "test-vapid-public-key",
      VAPID_SUBJECT: "mailto:test@example.com",
    },
    server: {
      deps: {
        // Bundle component packages so their source can be imported directly
        // in tests via t.registerComponent
        inline: ["convex-table-history", "@convex-dev/better-auth"],
      },
    },
  },
});
