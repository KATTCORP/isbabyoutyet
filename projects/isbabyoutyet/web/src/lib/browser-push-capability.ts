import { queryOptions } from "@raf-query/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { ConvexReader } from "@workspace/convex-query";
import { readConvexQuery } from "@workspace/convex-query";
import { isFunction } from "@workspace/runtime/guards";
import { Effect, Option } from "effect";

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
 * is only enabled in a browser: the server renders it pending, and the
 * browser detects once it renders. `staleTime` 0: every loader prefetch
 * rechecks, as permission can change outside the app.
 */
export function browserPushCapabilityQuery(babyRef: string) {
  return queryOptions({
    queryFn: () => resolveBrowserPushCapability(babyRef),
    queryKey: [BROWSER_PUSH_CAPABILITY_KEY, babyRef],
    retry: false,
    enabled: typeof window !== "undefined",
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

function resolveBrowserPushCapability(
  babyRef: string,
): Effect.Effect<BrowserPushCapability, never, ConvexReader> {
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
    const flags = yield* readSubscriptionFlags({
      babyId: babyRef,
      endpoint: subscription.endpoint,
    });
    return {
      family: Boolean(flags.family),
      kind: "subscribed",
      messages: Boolean(flags.messages),
      subscription,
    } as const;
  }).pipe(Effect.catch(() => Effect.succeed({ kind: "unsubscribed" } as const)));
}
