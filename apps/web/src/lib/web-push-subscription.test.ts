import { expect, test } from "vitest";
import { makeResource } from "@workspace/convex/convex/test.resource";
import type { TranslationFunction } from "./i18n";
import { ensureWebPushSubscription, readWebPushSubscription } from "./web-push-subscription";

// SAFETY: Tests assert on the English catalog keys used as Error messages.
const identityT = ((key: string) => key) as TranslationFunction;

const VAPID_PUBLIC_KEY = btoa("test-vapid-public-key");
const ENDPOINT = "https://push.example/owner";

function pushSubscription(opts: { keys: { auth: string; p256dh: string } | null }) {
  // SAFETY: Test fixture is a subset of the production type.
  return {
    endpoint: ENDPOINT,
    toJSON: (): PushSubscriptionJSON =>
      opts.keys ? { endpoint: ENDPOINT, keys: opts.keys } : { endpoint: ENDPOINT },
  } as PushSubscription;
}

function stubPushEnvironment(opts: {
  existing: PushSubscription | null;
  next: PushSubscription | null;
  permission: NotificationPermission;
  requestPermissionResult: NotificationPermission | null;
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

  const NotificationStub = function Notification() {};
  Object.defineProperty(NotificationStub, "permission", {
    configurable: true,
    get: () => opts.permission,
  });
  Object.defineProperty(NotificationStub, "requestPermission", {
    configurable: true,
    value: () => {
      if (!opts.requestPermissionResult) {
        throw new Error("requestPermission should not run");
      }
      return Promise.resolve(opts.requestPermissionResult);
    },
  });
  replaceProperty(globalThis, {
    descriptor: { value: NotificationStub },
    key: "Notification",
  });

  // SAFETY: Test fixture is a subset of the production type.
  const registration = {
    pushManager: {
      getSubscription: () => Promise.resolve(current),
      subscribe: () => {
        current = opts.next;
        return Promise.resolve(current);
      },
    },
  } as ServiceWorkerRegistration;
  replaceProperty(navigator, {
    descriptor: { value: { ready: Promise.resolve(registration) } },
    key: "serviceWorker",
  });

  return makeResource(registration.pushManager, () => {
    for (const fn of restore.toReversed()) {
      fn();
    }
  });
}

test("readWebPushSubscription returns null when the browser has no push subscription", async () => {
  await using _env = stubPushEnvironment({
    existing: null,
    next: null,
    permission: "granted",
    requestPermissionResult: null,
  });

  expect(await readWebPushSubscription()).toBeNull();
});

test("readWebPushSubscription returns keys from the current browser subscription", async () => {
  await using _env = stubPushEnvironment({
    existing: pushSubscription({ keys: { auth: "auth", p256dh: "p256" } }),
    next: null,
    permission: "granted",
    requestPermissionResult: null,
  });

  expect(await readWebPushSubscription()).toEqual({
    auth: "auth",
    endpoint: ENDPOINT,
    p256dh: "p256",
  });
});

test("readWebPushSubscription returns null when the subscription JSON is incomplete", async () => {
  await using _env = stubPushEnvironment({
    existing: pushSubscription({ keys: null }),
    next: null,
    permission: "granted",
    requestPermissionResult: null,
  });

  expect(await readWebPushSubscription()).toBeNull();
});

test("ensureWebPushSubscription reuses a valid existing subscription", async () => {
  await using _env = stubPushEnvironment({
    existing: pushSubscription({ keys: { auth: "auth", p256dh: "p256" } }),
    next: null,
    permission: "granted",
    requestPermissionResult: null,
  });

  expect(await ensureWebPushSubscription(VAPID_PUBLIC_KEY, { t: identityT })).toEqual({
    auth: "auth",
    endpoint: ENDPOINT,
    p256dh: "p256",
  });
});

test("ensureWebPushSubscription subscribes when permission is already granted", async () => {
  await using _env = stubPushEnvironment({
    existing: null,
    next: pushSubscription({ keys: { auth: "auth", p256dh: "p256" } }),
    permission: "granted",
    requestPermissionResult: null,
  });

  expect(await ensureWebPushSubscription(VAPID_PUBLIC_KEY, { t: identityT })).toEqual({
    auth: "auth",
    endpoint: ENDPOINT,
    p256dh: "p256",
  });
});

test("ensureWebPushSubscription requests permission when it is still default", async () => {
  await using _env = stubPushEnvironment({
    existing: null,
    next: pushSubscription({ keys: { auth: "auth", p256dh: "p256" } }),
    permission: "default",
    requestPermissionResult: "granted",
  });

  expect(await ensureWebPushSubscription(VAPID_PUBLIC_KEY, { t: identityT })).toEqual({
    auth: "auth",
    endpoint: ENDPOINT,
    p256dh: "p256",
  });
});

test("ensureWebPushSubscription throws when the permission prompt is denied", async () => {
  await using _env = stubPushEnvironment({
    existing: null,
    next: null,
    permission: "default",
    requestPermissionResult: "denied",
  });

  await expect(ensureWebPushSubscription(VAPID_PUBLIC_KEY, { t: identityT })).rejects.toThrow(
    "Notification permission denied",
  );
});

test("ensureWebPushSubscription throws when notifications are already blocked", async () => {
  await using _env = stubPushEnvironment({
    existing: null,
    next: null,
    permission: "denied",
    requestPermissionResult: null,
  });

  await expect(ensureWebPushSubscription(VAPID_PUBLIC_KEY, { t: identityT })).rejects.toThrow(
    "Notification permission is required",
  );
});

test("ensureWebPushSubscription resubscribes when the existing subscription lacks keys", async () => {
  await using _env = stubPushEnvironment({
    existing: pushSubscription({ keys: null }),
    next: pushSubscription({ keys: { auth: "fresh-auth", p256dh: "fresh" } }),
    permission: "granted",
    requestPermissionResult: null,
  });

  expect(await ensureWebPushSubscription(VAPID_PUBLIC_KEY, { t: identityT })).toEqual({
    auth: "fresh-auth",
    endpoint: ENDPOINT,
    p256dh: "fresh",
  });
});

test("ensureWebPushSubscription throws when the new subscription lacks keys", async () => {
  await using _env = stubPushEnvironment({
    existing: null,
    next: pushSubscription({ keys: null }),
    permission: "granted",
    requestPermissionResult: null,
  });

  await expect(ensureWebPushSubscription(VAPID_PUBLIC_KEY, { t: identityT })).rejects.toThrow(
    "Failed to get subscription data",
  );
});
