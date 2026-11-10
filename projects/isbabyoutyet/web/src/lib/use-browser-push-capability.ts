import { useQuery } from "@raf-query/react";
import { browserOnlyHandle } from "@/lib/browser-only";
import {
  adminBrowserPushCapabilityQuery,
  browserPushCapabilityQuery,
} from "@/lib/browser-push-capability";

/**
 * This device's push capability for a baby page, without suspending: `null`
 * while detection runs (it can wait seconds on the service worker), and on
 * the server, which never detects.
 *
 * Only the browser can detect it, so the hook builds its own handle
 * (`browserOnlyHandle`). Loaders still start it in the browser (`inBrowser`),
 * so on a client navigation detection runs alongside the route's data.
 */
export function useBrowserPushCapability(babyRef: string) {
  const [capability, state] = useQuery(
    browserPushCapabilityQuery,
    browserOnlyHandle(browserPushCapabilityQuery, babyRef),
  );
  return [capability.status === "fulfilled" ? capability.value : null, state.refetch] as const;
}

/** Like `useBrowserPushCapability`, for the admin new-baby push on this device. */
export function useAdminBrowserPushCapability() {
  const [capability, state] = useQuery(
    adminBrowserPushCapabilityQuery,
    browserOnlyHandle(adminBrowserPushCapabilityQuery),
  );
  return [capability.status === "fulfilled" ? capability.value : null, state.refetch] as const;
}
