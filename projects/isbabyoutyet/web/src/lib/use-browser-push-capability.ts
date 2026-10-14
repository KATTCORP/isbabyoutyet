import type { QueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import { use } from "react";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";

export type BrowserPushHandle = QueryHandle<typeof browserPushCapabilityQuery>;

function noRefetch() {
  return Promise.resolve();
}

/** The server can't detect push, so it renders the pending state. */
function useServerBrowserPushCapability(_handle: BrowserPushHandle) {
  return [null, noRefetch] as const;
}

/**
 * This device's push capability without suspending: `null` while detection
 * runs (it can wait seconds on the service worker), as on the server.
 */
function useDetectedBrowserPushCapability(handle: BrowserPushHandle) {
  const [promise, controls] = useQuery(browserPushCapabilityQuery, handle);
  const capability = controls.isPending ? null : use(promise);
  return [capability, controls.refetch] as const;
}

/**
 * Picked once per module instance: server and browser bundles each get one
 * hook, so the call order never changes between renders.
 */
export const useBrowserPushCapability =
  globalThis.window === undefined
    ? useServerBrowserPushCapability
    : useDetectedBrowserPushCapability;
