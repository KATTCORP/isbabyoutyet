import { overwriteSetLocale, setLocale as paraglideSetLocale } from "@/paraglide/runtime";

const persistLocale = paraglideSetLocale;

/**
 * Paraglide's getLocale() calls `setLocale(resolved, { reload: false })` on the
 * first client resolve (see inlang/paraglide-js#455). That stamps
 * PARAGLIDE_LOCALE from the browser language and then permanently wins over
 * Accept-Language — so Locale Switcher / changed browser languages stop
 * working after the first homepage visit.
 *
 * Cookie persistence should only happen for an explicit user choice
 * (LanguageSettings calls setLocale with the default reload: true).
 */
overwriteSetLocale((newLocale, options) => {
  if (options?.reload === false) {
    return;
  }
  return persistLocale(newLocale, options);
});

export { setLocale } from "@/paraglide/runtime";
