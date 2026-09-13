import { betterAuth } from "better-auth/minimal";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import authConfig from "./auth.config";
import { components } from "./_generated/api";
import { env, query } from "./_generated/server";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export function resolveAuthBaseUrl(siteUrl: string | undefined, convexSiteUrl: string) {
  return siteUrl ?? convexSiteUrl;
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    // Fresh preview deployments run the demo seed before deploy-convex.ts can
    // set their branch URL. The Convex site URL is a safe bootstrap origin;
    // subsequent requests use the synced web preview URL.
    baseURL: resolveAuthBaseUrl(env.SITE_URL, env.CONVEX_SITE_URL),
    database: authComponent.adapter(ctx),
    // Configure simple, non-verified email/password to get started
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex({ authConfig }),
    ],
  });
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx);
  },
});
