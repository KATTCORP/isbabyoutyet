import type { QueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";

export type BrowserPushHandle = QueryHandle<typeof browserPushCapabilityQuery>;

/**
 * This device's push capability without suspending: `null` while detection
 * runs (it can wait seconds on the service worker), and on the server, which
 * never detects.
 */
export function useBrowserPushCapability(handle: BrowserPushHandle) {
  const [capability, controls] = useQuery(browserPushCapabilityQuery, handle, {
    throwOnError: true,
  });
  return [capability.status === "fulfilled" ? capability.value : null, controls.refetch] as const;
}
