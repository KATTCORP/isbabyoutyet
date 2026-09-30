import { v } from "convex/values";
import { isJsonObjectValue } from "@workspace/runtime/json";
import { decidePasskeySignup, PASSKEY_EMAIL_TAKEN_CODE, readDocId } from "../src/passkey";
import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { claimPendingInvitesForAuthUser } from "./coParentInviteClaims";
import { loadPasskeySignupTarget } from "./passkeyRecords";

async function insertPasskeyUser(ctx: MutationCtx, opts: { email: string; name: string }) {
  const now = Date.now();
  const created = await ctx.runMutation(components.betterAuth.adapter.create, {
    input: {
      data: {
        createdAt: now,
        email: opts.email,
        emailVerified: false,
        name: opts.name,
        updatedAt: now,
      },
      model: "user",
    },
  });
  if (!isJsonObjectValue(created)) {
    throw new Error("Could not create the account");
  }
  const userId = readDocId(created);
  if (userId === null) {
    throw new Error("Could not create the account");
  }
  await claimPendingInvitesForAuthUser(ctx, {
    email: opts.email,
    name: opts.name,
    userId,
  });
  return userId;
}

/**
 * Checks the email before the browser prompt. Returns an existing unfinished
 * user id, or null when a new user should be created after WebAuthn succeeds.
 */
export const prepare = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = decidePasskeySignup(await loadPasskeySignupTarget(ctx, args.email));
    switch (decision.type) {
      case "create":
        return null;
      case "email-taken":
        throw new Error(PASSKEY_EMAIL_TAKEN_CODE);
      case "reuse":
        return decision.userId;
      default: {
        const _exhaustive: never = decision;
        return _exhaustive;
      }
    }
  },
  returns: v.union(v.string(), v.null()),
});

/**
 * Creates the Better Auth user after the authenticator accepts the passkey,
 * or reuses an unfinished signup. Refuses emails that already have a password
 * or a passkey.
 */
export const provision = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = decidePasskeySignup(await loadPasskeySignupTarget(ctx, args.email));
    switch (decision.type) {
      case "create":
        return await insertPasskeyUser(ctx, args);
      case "email-taken":
        throw new Error(PASSKEY_EMAIL_TAKEN_CODE);
      case "reuse":
        await claimPendingInvitesForAuthUser(ctx, {
          email: args.email,
          name: args.name,
          userId: decision.userId,
        });
        return decision.userId;
      default: {
        const _exhaustive: never = decision;
        return _exhaustive;
      }
    }
  },
  returns: v.string(),
});
