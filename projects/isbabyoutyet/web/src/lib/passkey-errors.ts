import {
  PASSKEY_EMAIL_TAKEN_CODE,
  PASSKEY_LAST_METHOD_CODE,
} from "@isbabyoutyet/backend/src/passkey";
import type { TranslationFunction } from "@/lib/i18n";

type PasskeyClientError = {
  code: string | undefined;
  message: string | undefined;
};

function errorText(error: PasskeyClientError) {
  return {
    code: error.code ?? "",
    message: error.message ?? "",
  };
}

/** Maps Better Auth / WebAuthn failures onto copy the person can act on. */
export function passkeyAuthErrorMessage(error: PasskeyClientError, t: TranslationFunction) {
  const text = errorText(error);
  if (text.code === PASSKEY_EMAIL_TAKEN_CODE || text.message.includes(PASSKEY_EMAIL_TAKEN_CODE)) {
    return t(
      "This email already has an account. Sign in, then add this device in account settings.",
    );
  }
  if (
    text.code === "AUTH_CANCELLED" ||
    text.code === "ERROR_CEREMONY_ABORTED" ||
    text.message === "Auth cancelled" ||
    text.message === "Registration cancelled"
  ) {
    return t("Device sign-in was cancelled.");
  }
  if (text.code === "PASSKEY_NOT_FOUND" || text.message === "Passkey not found") {
    return t(
      "No device sign-in on this account yet. Use your password, then add this device in settings.",
    );
  }
  return t("Couldn't use this device. Try again, or use your password.");
}

export function passkeyRemovalErrorMessage(error: PasskeyClientError, t: TranslationFunction) {
  const text = errorText(error);
  if (text.code === PASSKEY_LAST_METHOD_CODE || text.message.includes(PASSKEY_LAST_METHOD_CODE)) {
    return t("Add a password or another device before removing this one.");
  }
  if (text.message !== "") {
    return text.message;
  }
  return t("Could not remove");
}
