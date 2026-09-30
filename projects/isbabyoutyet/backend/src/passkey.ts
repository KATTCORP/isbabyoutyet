import {
  isJsonObjectValue,
  parseJsonNumber,
  parseOptionalString,
  type JsonObject,
  type JsonValue,
} from "@workspace/runtime/json";

/** Stored when the authenticator does not identify itself (Apple often does this). */
export const PASSKEY_ANONYMOUS_DEVICE_NAME = "This device";

/** Stable Better Auth error code. The client maps it to translated copy. */
export const PASSKEY_EMAIL_TAKEN_CODE = "PASSKEY_EMAIL_TAKEN";

/** Stable Better Auth error code for deleting the last sign-in method. */
export const PASSKEY_LAST_METHOD_CODE = "PASSKEY_LAST_METHOD";

/** Stable Better Auth error code for a malformed passkey signup context. */
export const PASSKEY_SIGNUP_INVALID_CODE = "PASSKEY_SIGNUP_INVALID";

const NAME_MAX = 80;
const NAME_MIN = 2;

export type PasskeySignupDecision =
  | { type: "create" }
  | { type: "email-taken" }
  | { type: "reuse"; userId: string };

/**
 * Challenge user id for a signup that has not created a row yet. Replaced by
 * the real user id in `afterVerification` before the passkey is stored.
 */
export function pendingPasskeyUserId(email: string) {
  return `pending-passkey:${email}`;
}

export function parsePasskeySignupContext(raw: string | null) {
  if (raw === null || raw.trim() === "") {
    return null;
  }
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isJsonObjectValue(parsed)) {
    return null;
  }
  const emailValue = "email" in parsed ? parseOptionalString(parsed.email) : null;
  const nameValue = "name" in parsed ? parseOptionalString(parsed.name) : null;
  if (emailValue === null || nameValue === null) {
    return null;
  }
  const email = emailValue.trim().toLowerCase();
  const name = nameValue.trim();
  if (
    !email.includes("@") ||
    email.length > 320 ||
    name.length < NAME_MIN ||
    name.length > NAME_MAX
  ) {
    return null;
  }
  return { email, name };
}

/**
 * A password account or an existing passkey must sign in and add the device
 * from settings. An unfinished signup (user row, no password, no passkey) is
 * reused so a cancelled ceremony can be retried.
 */
export function decidePasskeySignup(
  existing: { hasPassword: boolean; passkeyCount: number; userId: string } | null,
): PasskeySignupDecision {
  if (existing === null) {
    return { type: "create" };
  }
  if (existing.hasPassword || existing.passkeyCount > 0) {
    return { type: "email-taken" };
  }
  return { type: "reuse", userId: existing.userId };
}

/** `null` when another sign-in method would remain. */
export function passkeyRemovalBlockReason(opts: {
  hasPassword: boolean;
  remainingAfterRemoval: number;
}) {
  if (opts.hasPassword || opts.remainingAfterRemoval > 0) {
    return null;
  }
  return PASSKEY_LAST_METHOD_CODE;
}

export function readDocId(doc: JsonObject) {
  if (!("_id" in doc)) {
    return null;
  }
  return parseOptionalString(doc._id);
}

export function readAdapterPage(value: JsonObject) {
  if (!("page" in value) || !Array.isArray(value.page)) {
    throw new Error("Better Auth returned an invalid page");
  }
  const isDone = "isDone" in value ? value.isDone === true : false;
  return {
    isDone,
    rows: value.page.filter(isJsonObjectValue),
  };
}

/** Non-empty credential password, or null when this account is not one. */
export function credentialPassword(doc: JsonObject) {
  const providerId = "providerId" in doc ? parseOptionalString(doc.providerId) : null;
  const password = "password" in doc ? parseOptionalString(doc.password) : null;
  if (providerId !== "credential" || password === null || password.length === 0) {
    return null;
  }
  return password;
}

export function readPasskeySummary(doc: JsonObject) {
  const id = readDocId(doc);
  if (id === null) {
    return null;
  }
  const name = "name" in doc ? parseOptionalString(doc.name) : null;
  const aaguid = "aaguid" in doc ? parseOptionalString(doc.aaguid) : null;
  const createdAt = "createdAt" in doc ? parseJsonNumber(doc.createdAt) : null;
  return { aaguid, createdAt, id, name };
}
