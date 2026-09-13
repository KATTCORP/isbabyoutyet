import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import tableHistory from "convex-table-history/convex.config";

const app = defineApp({
  env: {
    BETTER_AUTH_SECRET: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
    NODE_ENV: v.optional(v.string()),
    PREVIEW_SCHEMA_FINGERPRINT: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_SUBJECT: v.optional(v.string()),
    VERCEL_ENV: v.optional(v.union(v.literal("production"), v.literal("preview"))),
  },
});
app.use(betterAuth);
app.use(migrations);
app.use(tableHistory, { name: "babyAuditLog" });

export default app;
