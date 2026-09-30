import { expect, test } from "vitest";
import { translate, type TranslationFunction } from "@/lib/i18n";
import { passkeyAuthErrorMessage, passkeyRemovalErrorMessage } from "./passkey-errors";

const t: TranslationFunction = (key, ...args) => translate("en-GB", key, ...args);

test("passkey signup tells an existing email to sign in and link the device", () => {
  expect(passkeyAuthErrorMessage({ code: "PASSKEY_EMAIL_TAKEN", message: undefined }, t)).toBe(
    "This email already has an account. Sign in, then add this device in account settings.",
  );
});

test("a cancelled device prompt stays distinct from a failure", () => {
  expect(passkeyAuthErrorMessage({ code: "AUTH_CANCELLED", message: undefined }, t)).toBe(
    "Device sign-in was cancelled.",
  );
  expect(passkeyAuthErrorMessage({ code: undefined, message: "Registration cancelled" }, t)).toBe(
    "Device sign-in was cancelled.",
  );
});

test("a missing passkey points back to the password", () => {
  expect(passkeyAuthErrorMessage({ code: "PASSKEY_NOT_FOUND", message: undefined }, t)).toBe(
    "No device sign-in on this account yet. Use your password, then add this device in settings.",
  );
});

test("removing the last sign-in method uses the guard copy", () => {
  expect(passkeyRemovalErrorMessage({ code: "PASSKEY_LAST_METHOD", message: undefined }, t)).toBe(
    "Add a password or another device before removing this one.",
  );
  expect(passkeyRemovalErrorMessage({ code: undefined, message: "" }, t)).toBe("Could not remove");
});
