import type { QueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import {
  adminBrowserPushCapabilityQuery,
  browserPushCapabilityQuery,
} from "@/lib/browser-push-capability";

/** A loader's handle on {@link browserPushCapabilityQuery}. */
export type BrowserPushHandle = QueryHandle<typeof browserPushCapabilityQuery>;

/** A loader's handle on {@link adminBrowserPushCapabilityQuery}. */
export type AdminBrowserPushHandle = QueryHandle<typeof adminBrowserPushCapabilityQuery>;

/**
 * This device's push capability for a baby page, without suspending: `null`
 * while detection runs (it can wait seconds on the service worker), and on
 * the server, which never detects (`ssr: false`).
 */
export function useBrowserPushCapability(handle: BrowserPushHandle) {
  const [capability, state] = useQuery(browserPushCapabilityQuery, handle);
  return [capability.status === "fulfilled" ? capability.value : null, state.refetch] as const;
}

/** Like `useBrowserPushCapability`, for the admin new-baby push on this device. */
export function useAdminBrowserPushCapability(handle: AdminBrowserPushHandle) {
  const [capability, state] = useQuery(adminBrowserPushCapabilityQuery, handle);
  return [capability.status === "fulfilled" ? capability.value : null, state.refetch] as const;
}
