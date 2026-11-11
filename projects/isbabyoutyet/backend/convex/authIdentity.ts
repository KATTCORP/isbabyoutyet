import type { UserIdentity } from "convex/server";
import { env } from "./_generated/server";

export type AppIdentity = {
  authUserId: string;
  tokenIdentifier: string;
};

/**
 * Better Auth puts its user id in the JWT subject. Keep that provider-local id
 * only for Better Auth joins; use tokenIdentifier for ownership and lookups.
 */
export function appIdentity(identity: UserIdentity): AppIdentity {
  return {
    authUserId: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
  };
}

/**
 * Backfills identities created by this app's single Better Auth issuer.
 * Convex defines tokenIdentifier as `${issuer}|${subject}`.
 */
export function tokenIdentifierForAuthUserId(authUserId: string) {
  return `${env.CONVEX_SITE_URL}|${authUserId}`;
}
