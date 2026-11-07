import type { QueryClient } from "@raf-query/react";
import type { ConvexReader } from "@workspace/convex-query";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import type {
  AdminBrowserPushCapability,
  BrowserPushCapability,
} from "@/lib/browser-push-capability";
import {
  adminBrowserPushCapabilityQuery,
  browserPushCapabilityQuery,
} from "@/lib/browser-push-capability";

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

/** {@link seedBrowserPushCapability} for the dashboard's admin new-baby push. */
export function seedAdminBrowserPushCapability(
  queryClient: QueryClient<ConvexReader>,
  capability: AdminBrowserPushCapability,
) {
  queryClient.setData(adminBrowserPushCapabilityQuery, undefined, capability);
  return queryClient.getQuery(adminBrowserPushCapabilityQuery).handle;
}

/** A browser push subscription whose keys are `auth` / `p256`. */
export function testPushSubscription(endpoint: string) {
  // SAFETY: Test fixture is a subset of the production type.
  return {
    endpoint,
    toJSON: (): PushSubscriptionJSON => ({
      endpoint,
      keys: { auth: "auth", p256dh: "p256" },
    }),
  } as PushSubscription;
}

function NotificationStub() {}
Object.defineProperty(NotificationStub, "permission", {
  configurable: true,
  get: () => "granted",
});

function PushManagerStub() {}

/**
 * Notification permission already granted and a ready service worker whose
 * PushManager returns `existing`, or subscribes to `endpoint`.
 */
export function stubGrantedPushResource(opts: {
  endpoint: string;
  existing: PushSubscription | null;
}) {
  const restore: Array<() => void> = [];
  let current = opts.existing;

  function replaceProperty<$Target extends object>(
    target: $Target,
    property: { descriptor: PropertyDescriptor; key: string },
  ) {
    const existing = Object.getOwnPropertyDescriptor(target, property.key);
    Object.defineProperty(target, property.key, { configurable: true, ...property.descriptor });
    restore.push(() => {
      if (existing) {
        Object.defineProperty(target, property.key, existing);
        return;
      }
      Reflect.deleteProperty(target, property.key);
    });
  }

  replaceProperty(globalThis, {
    descriptor: { value: NotificationStub },
    key: "Notification",
  });
  replaceProperty(globalThis, {
    descriptor: { value: PushManagerStub },
    key: "PushManager",
  });

  // SAFETY: Test fixture is a subset of the production type.
  const registration = {
    pushManager: {
      getSubscription: () => Promise.resolve(current),
      subscribe: () => {
        current = testPushSubscription(opts.endpoint);
        return Promise.resolve(current);
      },
    },
  } as ServiceWorkerRegistration;
  replaceProperty(navigator, {
    descriptor: { value: { ready: Promise.resolve(registration) } },
    key: "serviceWorker",
  });

  return makeResource({}, () => {
    for (const fn of restore.toReversed()) {
      fn();
    }
  });
}
