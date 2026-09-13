import { betterAuth } from "better-auth/minimal";
import { createAuthMiddleware } from "better-auth/api";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import authConfig from "./auth.config";
import { convexTokenInAuthResponse } from "./authConvexToken";
import { sendPasswordResetEmail } from "./authEmail";
import { components, internal } from "./_generated/api";
import { env, query } from "./_generated/server";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";
import { TIME_ZONE_HINT_HEADER } from "../src/timeZone";
import { parseVisitorIdHint, VISITOR_ID_HINT_HEADER } from "../src/visitorId";
import { isJsonObjectValue, parseOptionalString } from "@workspace/runtime/json";

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export function resolveAuthBaseUrl(siteUrl: string | undefined, convexSiteUrl: string) {
  return siteUrl ?? convexSiteUrl;
}

/**
 * Better Auth only invokes this from the HTTP action that serves
 * `/api/auth/*`. `requireActionCtx` rejects query/mutation contexts.
 */
export async function sendAuthResetPassword(
  ctx: GenericCtx<DataModel>,
  data: { url: string; user: { email: string } },
) {
  requireActionCtx(ctx);
  await sendPasswordResetEmail({
    deps: null,
    recipient: data.user.email,
    resetUrl: data.url,
  });
}

/**
 * Better Auth `onPasswordReset` hook. Completing forgot-password proves
 * inbox access, so mark the address verified. Logged-in change-password
 * does not call this.
 */
export async function markEmailVerifiedAfterPasswordReset(
  ctx: GenericCtx<DataModel>,
  userId: string,
) {
  await requireAuthMutationCtx(ctx).runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      update: {
        emailVerified: true,
        updatedAt: Date.now(),
      },
      where: [{ field: "_id", value: userId }],
    },
  });
}

function requireAuthMutationCtx(ctx: GenericCtx<DataModel>) {
  if (!("runMutation" in ctx)) {
    throw new Error("Auth hooks require a context that can run mutations");
  }
  return ctx;
}

/** Parsed Better Auth email auth user extracted from middleware returned. */
type AuthEndpointUser = {
  readonly email: string | null;
  readonly name: string | null;
  readonly userId: string;
};

function parseAuthUserFromReturned<TReturned>(returned: TReturned): AuthEndpointUser | null {
  if (!isJsonObjectValue(returned) || !("user" in returned)) {
    return null;
  }
  const user = returned.user;
  if (!isJsonObjectValue(user)) {
    return null;
  }
  const userId = "id" in user ? parseOptionalString(user.id) : null;
  if (userId === null) {
    return null;
  }
  const email = "email" in user ? parseOptionalString(user.email) : null;
  const name = "name" in user ? parseOptionalString(user.name) : null;
  return { email, name, userId };
}

export const createAuth = (convexCtx: GenericCtx<DataModel>) => {
  return betterAuth({
    // Fresh preview deployments run the demo seed before deploy-convex.ts can
    // set their branch URL. The Convex site URL is a safe bootstrap origin;
    // subsequent requests use the synced web preview URL.
    baseURL: resolveAuthBaseUrl(env.SITE_URL, env.CONVEX_SITE_URL),
    database: authComponent.adapter(convexCtx),
    // Configure simple, non-verified email/password to get started
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await requireAuthMutationCtx(convexCtx).runMutation(
              internal.profileBootstrap.claimInvitesForAuthUserMutation,
              {
                email: null,
                name: null,
                userId: String(session.userId),
              },
            );
          },
        },
      },
      user: {
        create: {
          after: async (user) => {
            if (!user.email) {
              return;
            }
            await requireAuthMutationCtx(convexCtx).runMutation(
              internal.profileBootstrap.claimInvitesForAuthUserMutation,
              {
                email: String(user.email),
                name: parseOptionalString(user.name),
                userId: user.id,
              },
            );
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      onPasswordReset: async (data) => {
        await markEmailVerifiedAfterPasswordReset(convexCtx, data.user.id);
      },
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async (data) => {
        await sendAuthResetPassword(convexCtx, data);
      },
    },
    user: {
      changeEmail: {
        enabled: false,
      },
    },
    // Convex better-auth already exposes a rateLimit table; enable it on
    // preview too (Better Auth defaults to production-only). Password-reset
    // endpoints are capped at 3 requests / 60s by Better Auth's built-ins.
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" && ctx.path !== "/sign-in/email") {
          return;
        }
        const authUser = parseAuthUserFromReturned(ctx.context.returned);
        if (!authUser) {
          return;
        }
        const headers = ctx.headers ?? ctx.request?.headers ?? null;
        await requireAuthMutationCtx(convexCtx).runMutation(
          internal.profileBootstrap.ensureUserProfileForAuthUserMutation,
          {
            localeHint: headers?.get("accept-language") ?? null,
            timeZoneHint: headers?.get(TIME_ZONE_HINT_HEADER) ?? null,
            userId: authUser.userId,
          },
        );
        const visitorId = parseVisitorIdHint(headers?.get(VISITOR_ID_HINT_HEADER) ?? null);
        if (visitorId) {
          await requireAuthMutationCtx(convexCtx).runMutation(
            internal.encouragements.claimVisitorEncouragementsForAuthUserMutation,
            {
              userId: authUser.userId,
              visitorId,
            },
          );
        }
      }),
    },
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex({ authConfig }),
      // Order matters: reads the `convex_jwt` cookie the plugin above sets.
      convexTokenInAuthResponse(),
    ],
    rateLimit: {
      enabled: true,
      storage: "database",
    },
  });
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return await authComponent.getAnyUserById(ctx, identity.subject);
  },
});
