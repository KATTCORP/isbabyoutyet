import type { QueryClient } from "@raf-query/react";
import type { ConvexReader } from "@workspace/convex-query";
import type { BrowserPushCapability } from "@/lib/browser-push-capability";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";

/**
 * Seeds this device's push capability, as if detection already ran, and
 * returns the handle a baby page loader would pass down. Actions that
 * refetch the capability run real detection against the stubbed browser.
 */
export function seedBrowserPushCapability(
  queryClient: QueryClient<ConvexReader>,
  opts: { babyRef: string; capability: BrowserPushCapability },
) {
  queryClient.setData(browserPushCapabilityQuery, opts.babyRef, opts.capability);
  return queryClient.getQuery(browserPushCapabilityQuery, opts.babyRef).handle;
}
