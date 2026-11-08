/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    /** Set by `legacyPolyfills()`; undefined in tests and anywhere else the plugin is absent. */
    readonly VITE_LEGACY_POLYFILLS_LOADER: string | undefined;
  }
}

/**
 * Root route `head().scripts` entry for the legacy polyfill loader. Head
 * scripts render before the app's module scripts, which are deferred, so
 * the polyfills are in place before any app code runs.
 */
export function legacyPolyfillsHeadScripts() {
  const loader = import.meta.env.VITE_LEGACY_POLYFILLS_LOADER;
  if (loader === undefined) {
    return [];
  }
  return [{ children: loader }];
}
