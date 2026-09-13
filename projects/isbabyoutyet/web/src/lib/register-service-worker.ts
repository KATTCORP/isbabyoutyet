/**
 * Service-worker registration is application bootstrap work, not render state.
 * Import this module once from the root route.
 */

/** @internal Keeps this file a module under `noUncheckedSideEffectImports`. */
export const serviceWorkerRegistered = true;

if (globalThis.navigator !== undefined && "serviceWorker" in navigator) {
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    reportError(error);
  }
}
