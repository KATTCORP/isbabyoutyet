import type { QueryClient } from "@raf-query/react";
import { setData } from "@raf-query/react";
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
 * Seeds this device's push capability for the baby page `babyRef`, as if
 * detection already ran, and returns `babyRef` for the component's
 * `publicId`. Actions that refetch the capability run real detection
 * against the stubbed browser.
 */
export function seedBrowserPushCapability(
  queryClient: QueryClient,
  opts: { babyRef: string; capability: BrowserPushCapability },
) {
  setData(queryClient, browserPushCapabilityQuery, opts.babyRef, opts.capability);
  return opts.babyRef;
}

/** {@link seedBrowserPushCapability} for the dashboard's admin new-baby push. */
export function seedAdminBrowserPushCapability(
  queryClient: QueryClient,
  capability: AdminBrowserPushCapability,
) {
  setData(queryClient, adminBrowserPushCapabilityQuery, capability);
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

/**
 * Notification permission already decided and a ready service worker whose
 * PushManager already holds `existing`.
 */
export function stubPushDeviceResource(opts: {
  existing: PushSubscription;
  permission: NotificationPermission;
}) {
  const restore: Array<() => void> = [];

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
    descriptor: { value: { permission: opts.permission } },
    key: "Notification",
  });
  replaceProperty(globalThis, {
    descriptor: { value: {} },
    key: "PushManager",
  });

  // SAFETY: Test fixture is a subset of the production type.
  const registration = {
    pushManager: {
      getSubscription: () => Promise.resolve(opts.existing),
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
