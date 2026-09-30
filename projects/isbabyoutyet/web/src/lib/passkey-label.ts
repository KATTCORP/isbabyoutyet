import { getAuthenticatorName } from "@better-auth/passkey";
import { PASSKEY_ANONYMOUS_DEVICE_NAME } from "@isbabyoutyet/backend/src/passkey";
import type { TranslationFunction } from "@/lib/i18n";

/** Provider name when we have one, otherwise the translated fallback. */
export function passkeyDisplayName(
  opts: { aaguid: string | null; name: string | null },
  t: TranslationFunction,
) {
  if (opts.name !== null && opts.name !== "" && opts.name !== PASSKEY_ANONYMOUS_DEVICE_NAME) {
    return opts.name;
  }
  return getAuthenticatorName(opts.aaguid) ?? t("This device");
}
