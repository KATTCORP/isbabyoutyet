import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { claimPendingInvitesForAuthUser } from "./coParentInviteClaims";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function findUserByEmail(ctx: MutationCtx, email: string) {
  return await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  });
}

async function changeAccountEmail(ctx: MutationCtx, newEmail: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const nextEmail = normalizeEmail(newEmail);
  if (!nextEmail.includes("@")) {
    throw new Error("Invalid email address");
  }

  const user = await authComponent.getAnyUserById(ctx, identity.subject);
  if (!user) {
    throw new Error("Not authenticated");
  }

  const currentEmail = normalizeEmail(user.email);
  if (nextEmail === currentEmail) {
    throw new Error("Choose a different email address.");
  }

  const existing = await findUserByEmail(ctx, nextEmail);
  if (existing && String(existing._id) !== identity.subject) {
    throw new Error("Email already in use");
  }

  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      update: {
        email: nextEmail,
        emailVerified: false,
        updatedAt: Date.now(),
      },
      where: [{ field: "_id", value: identity.subject }],
    },
  });

  await claimPendingInvitesForAuthUser(ctx, {
    email: nextEmail,
    name: user.name,
    userId: identity.subject,
  });
}

/**
 * Updates the signed-in Better Auth user's email without sending mail.
 * Marks the address unverified until they complete a password reset from
 * that inbox.
 */
export const change = mutation({
  args: {
    newEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await changeAccountEmail(ctx, args.newEmail);
    return null;
  },
  returns: v.null(),
});
