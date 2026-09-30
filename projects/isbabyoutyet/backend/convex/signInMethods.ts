import { v } from "convex/values";
import { credentialPassword, readPasskeySummary } from "../src/passkey";
import { query } from "./_generated/server";
import { listAuthRows } from "./passkeyRecords";

const passkeySummaryValidator = v.object({
  aaguid: v.union(v.string(), v.null()),
  createdAt: v.union(v.number(), v.null()),
  id: v.string(),
  name: v.union(v.string(), v.null()),
});

const signInMethodsValidator = v.object({
  hasPassword: v.boolean(),
  passkeys: v.array(passkeySummaryValidator),
});

/** Devices and whether a password is set. Null when nobody is signed in. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const accounts = await listAuthRows(ctx, { model: "account", userId: identity.subject });
    const passkeys = await listAuthRows(ctx, { model: "passkey", userId: identity.subject });
    let hasPassword = false;
    for (const account of accounts) {
      if (credentialPassword(account) !== null) {
        hasPassword = true;
      }
    }
    const rows = [];
    for (const passkeyRow of passkeys) {
      const summary = readPasskeySummary(passkeyRow);
      if (summary) {
        rows.push(summary);
      }
    }
    return { hasPassword, passkeys: rows };
  },
  returns: v.union(signInMethodsValidator, v.null()),
});
