import { overwriteSetLocale, setLocale as paraglideSetLocale } from "@/paraglide/runtime";

const persistLocale = paraglideSetLocale;

/**
 * Paraglide's getLocale() calls `setLocale(resolved, { reload: false })` on the
 * first client resolve. That stamps PARAGLIDE_LOCALE from the browser language
 * and then permanently wins over Accept-Language.
 *
 * Cookie persistence should only happen for an explicit user choice
 * (locale switcher calls setLocale with the default reload: true).
 */
overwriteSetLocale((newLocale, options) => {
  if (options?.reload === false) {
    return;
  }
  return persistLocale(newLocale, options);
});

export { setLocale } from "@/paraglide/runtime";
