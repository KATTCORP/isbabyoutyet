import type { QueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import { use } from "react";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";

export type BrowserPushHandle = QueryHandle<typeof browserPushCapabilityQuery>;

/**
 * This device's push capability without suspending: `null` while detection
 * runs (it can wait seconds on the service worker), and on the server, which
 * never detects.
 */
export function useBrowserPushCapability(handle: BrowserPushHandle) {
  const [promise, controls] = useQuery(browserPushCapabilityQuery, handle);
  const capability = controls.isPending ? null : use(promise);
  return [capability, controls.refetch] as const;
}
