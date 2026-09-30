import { isJsonObjectValue } from "@workspace/runtime/json";
import { credentialPassword, readAdapterPage, readDocId } from "../src/passkey";
import { components } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const LIST_PAGE = { cursor: null, numItems: 100 } as const;

type AdapterModel = "account" | "passkey";
type DbCtx = MutationCtx | QueryCtx;

export async function listAuthRows(ctx: DbCtx, opts: { model: AdapterModel; userId: string }) {
  const listed = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: opts.model,
    paginationOpts: LIST_PAGE,
    where: [{ field: "userId", value: opts.userId }],
  });
  if (!isJsonObjectValue(listed)) {
    throw new Error("Better Auth returned an invalid page");
  }
  const page = readAdapterPage(listed);
  if (!page.isDone) {
    throw new Error("Too many sign-in methods to list");
  }
  return page.rows;
}

export async function findAuthUserIdByEmail(ctx: DbCtx, email: string) {
  const found = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  });
  if (found === null || !isJsonObjectValue(found)) {
    return null;
  }
  return readDocId(found);
}

export async function loadPasskeySignupTarget(ctx: DbCtx, email: string) {
  const userId = await findAuthUserIdByEmail(ctx, email);
  if (userId === null) {
    return null;
  }
  const accounts = await listAuthRows(ctx, { model: "account", userId });
  const passkeys = await listAuthRows(ctx, { model: "passkey", userId });
  let hasPassword = false;
  for (const account of accounts) {
    if (credentialPassword(account) !== null) {
      hasPassword = true;
    }
  }
  return { hasPassword, passkeyCount: passkeys.length, userId };
}
