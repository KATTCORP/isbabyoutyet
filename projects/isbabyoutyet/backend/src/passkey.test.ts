import { expect, test } from "vitest";
import {
  decidePasskeySignup,
  parsePasskeySignupContext,
  passkeyRemovalBlockReason,
  pendingPasskeyUserId,
} from "./passkey";

test("parsePasskeySignupContext accepts a trimmed email and name", () => {
  expect(
    parsePasskeySignupContext(JSON.stringify({ email: " Ada@Example.com ", name: " Ada " })),
  ).toEqual({ email: "ada@example.com", name: "Ada" });
});

test("parsePasskeySignupContext rejects a missing or short name", () => {
  expect(parsePasskeySignupContext(null)).toBeNull();
  expect(parsePasskeySignupContext("{")).toBeNull();
  expect(
    parsePasskeySignupContext(JSON.stringify({ email: "ada@example.com", name: "A" })),
  ).toBeNull();
  expect(
    parsePasskeySignupContext(JSON.stringify({ email: "not-an-email", name: "Ada" })),
  ).toBeNull();
});

test("decidePasskeySignup creates, reuses, or refuses", () => {
  expect(decidePasskeySignup(null)).toEqual({ type: "create" });
  expect(decidePasskeySignup({ hasPassword: false, passkeyCount: 0, userId: "user_1" })).toEqual({
    type: "reuse",
    userId: "user_1",
  });
  expect(decidePasskeySignup({ hasPassword: true, passkeyCount: 0, userId: "user_1" })).toEqual({
    type: "email-taken",
  });
  expect(decidePasskeySignup({ hasPassword: false, passkeyCount: 1, userId: "user_1" })).toEqual({
    type: "email-taken",
  });
});

test("the last device cannot be removed when there is no password", () => {
  expect(passkeyRemovalBlockReason({ hasPassword: false, remainingAfterRemoval: 0 })).toBe(
    "PASSKEY_LAST_METHOD",
  );
  expect(passkeyRemovalBlockReason({ hasPassword: true, remainingAfterRemoval: 0 })).toBeNull();
  expect(passkeyRemovalBlockReason({ hasPassword: false, remainingAfterRemoval: 1 })).toBeNull();
});

test("a pending signup user id is scoped to the email", () => {
  expect(pendingPasskeyUserId("ada@example.com")).toBe("pending-passkey:ada@example.com");
});
