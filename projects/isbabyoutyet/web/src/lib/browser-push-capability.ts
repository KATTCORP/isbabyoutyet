import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { ConvexReader } from "@workspace/convex-query";
import { readConvexQuery, runConvexEffect } from "@workspace/convex-query";
import { isFunction } from "@workspace/runtime/guards";
import { Effect, Option } from "effect";
import { queryOptions } from "@/lib/raf";

export type BrowserPushCapability =
  | { kind: "unsupported" }
  | { kind: "needsIosInstall" }
  | { kind: "serviceWorkerTimeout" }
  | { kind: "unsubscribed" }
  | {
      family: boolean;
      kind: "subscribed";
      messages: boolean;
      subscription: PushSubscription;
    };

const BROWSER_PUSH_CAPABILITY_KEY = "browserPushCapability";

const SERVICE_WORKER_READY_TIMEOUT_MS = 5000;

/**
 * This device's push state for a baby page. Only a browser can tell, so it
 * is `ssr: false`: the server renders it pending, and the browser detects
 * once it renders. `staleTime` 0: every loader prefetch and window focus
 * rechecks, as permission can change outside the app.
 */
export function browserPushCapabilityQuery(babyRef: string) {
  return queryOptions({
    queryFn: (context) => runConvexEffect(context, resolveBrowserPushCapability(babyRef)),
    queryKey: [BROWSER_PUSH_CAPABILITY_KEY, babyRef],
    retry: false,
    ssr: false,
    staleTime: 0,
  });
}

function hasLegacyMSStream(value: Window): value is Window & { MSStream: unknown } {
  return "MSStream" in value;
}

function hasStandaloneFlag(
  value: Navigator,
): value is Navigator & { standalone: boolean | undefined } {
  return "standalone" in value;
}

function getIOSStatus() {
  if (globalThis.window === undefined) {
    return { isIOS: false, isStandalone: false };
  }

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    (!hasLegacyMSStream(window) || !window.MSStream);
  if (!isIOS) {
    return { isIOS: false, isStandalone: false };
  }

  const isStandalone =
    (isFunction(window.matchMedia) && window.matchMedia("(display-mode: standalone)").matches) ||
    (hasStandaloneFlag(navigator) && navigator.standalone === true);

  return { isIOS: true, isStandalone };
}

export function needsIosPushInstall() {
  const iosStatus = getIOSStatus();
  return iosStatus.isIOS && !iosStatus.isStandalone;
}

function isPushSupported() {
  return (
    globalThis.window !== undefined &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function readSubscriptionFlags(args: { babyId: string; endpoint: string }) {
  return Effect.all(
    {
      family: readConvexQuery(api.pushSubscriptions.isSubscribed, args),
      messages: readConvexQuery(api.pushSubscriptions.isOwnerSubscribed, args),
    },
    { concurrency: "unbounded" },
  );
}

/** This device's push subscription, before Convex says what it is for. */
type DevicePushState =
  | { kind: "unsupported" }
  | { kind: "needsIosInstall" }
  | { kind: "serviceWorkerTimeout" }
  | { kind: "unsubscribed" }
  | { kind: "subscription"; subscription: PushSubscription };

function resolveDevicePushState(): Effect.Effect<DevicePushState> {
  if (needsIosPushInstall()) {
    return Effect.succeed({ kind: "needsIosInstall" });
  }
  if (!isPushSupported()) {
    return Effect.succeed({ kind: "unsupported" });
  }
  return Effect.gen(function* () {
    const registration = yield* Effect.tryPromise(() => navigator.serviceWorker.ready).pipe(
      Effect.timeoutOption(SERVICE_WORKER_READY_TIMEOUT_MS),
    );
    if (Option.isNone(registration)) {
      return { kind: "serviceWorkerTimeout" } as const;
    }
    const subscription = yield* Effect.tryPromise(() =>
      registration.value.pushManager.getSubscription(),
    );
    if (!subscription) {
      return { kind: "unsubscribed" } as const;
    }
    return { kind: "subscription", subscription } as const;
  }).pipe(Effect.catch(() => Effect.succeed({ kind: "unsubscribed" } as const)));
}

function resolveBrowserPushCapability(
  babyRef: string,
): Effect.Effect<BrowserPushCapability, never, ConvexReader> {
  return Effect.gen(function* () {
    const device = yield* resolveDevicePushState();
    if (device.kind !== "subscription") {
      return device;
    }
    const flags = yield* readSubscriptionFlags({
      babyId: babyRef,
      endpoint: device.subscription.endpoint,
    });
    return {
      family: Boolean(flags.family),
      kind: "subscribed",
      messages: Boolean(flags.messages),
      subscription: device.subscription,
    } as const;
  }).pipe(Effect.catch(() => Effect.succeed({ kind: "unsubscribed" } as const)));
}

export type AdminBrowserPushCapability =
  | { kind: "unsupported" }
  | { kind: "needsIosInstall" }
  | { kind: "serviceWorkerTimeout" }
  | { kind: "unsubscribed" }
  | { kind: "subscribed" };

const ADMIN_BROWSER_PUSH_CAPABILITY_KEY = "adminBrowserPushCapability";

function resolveAdminBrowserPushCapability(): Effect.Effect<
  AdminBrowserPushCapability,
  never,
  ConvexReader
> {
  return Effect.gen(function* () {
    const device = yield* resolveDevicePushState();
    if (device.kind !== "subscription") {
      return device;
    }
    const subscribed = yield* readConvexQuery(api.adminPushSubscriptions.isSubscribed, {
      endpoint: device.subscription.endpoint,
    });
    return subscribed ? ({ kind: "subscribed" } as const) : ({ kind: "unsubscribed" } as const);
  }).pipe(Effect.catch(() => Effect.succeed({ kind: "unsubscribed" } as const)));
}

/**
 * Whether this device gets the signed-in admin's new-baby pushes. Browser
 * only and never stale, like `browserPushCapabilityQuery`.
 */
export function adminBrowserPushCapabilityQuery() {
  return queryOptions({
    queryFn: (context) => runConvexEffect(context, resolveAdminBrowserPushCapability()),
    queryKey: [ADMIN_BROWSER_PUSH_CAPABILITY_KEY],
    retry: false,
    ssr: false,
    staleTime: 0,
  });
}
