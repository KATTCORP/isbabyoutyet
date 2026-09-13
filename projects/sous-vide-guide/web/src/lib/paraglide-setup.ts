import {
  overwriteSetLocale,
  setLocale as paraglideSetLocale,
} from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";

const persistLocale = paraglideSetLocale;

/**
 * Paraglide's getLocale() calls `setLocale(resolved, { reload: false })` on the
 * first client resolve. That stamps PARAGLIDE_LOCALE from the browser language
 * and then permanently wins over Accept-Language.
 *
 * Cookie persistence should only happen for an explicit user choice. The
 * locale switcher uses {@link setLocaleInPlace} so it can toast / update the
 * URL in the same turn without a full document reload.
 */
overwriteSetLocale((newLocale, options) => {
  if (options?.reload === false) {
    return;
  }
  return persistLocale(newLocale, options);
});

/** Persist an explicit locale choice without reloading the document. */
export async function setLocaleInPlace(locale: Locale) {
  await persistLocale(locale, { reload: false });
}
