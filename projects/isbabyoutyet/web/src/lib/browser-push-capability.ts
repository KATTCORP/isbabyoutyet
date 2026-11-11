import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { ConvexRequest } from "@workspace/convex-query";
import { readConvexQuery } from "@workspace/convex-query";
import { isFunction } from "@workspace/runtime/guards";
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
    queryFn: (context) => resolveBrowserPushCapability(context, babyRef),
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

async function readSubscriptionFlags(
  request: ConvexRequest,
  args: { babyId: string; endpoint: string },
) {
  const [family, messages] = await Promise.all([
    readConvexQuery(request, { args, query: api.pushSubscriptions.isSubscribed }),
    readConvexQuery(request, { args, query: api.pushSubscriptions.isOwnerSubscribed }),
  ]);
  return { family, messages };
}

/** This device's push subscription, before Convex says what it is for. */
type DevicePushState =
  | { kind: "unsupported" }
  | { kind: "needsIosInstall" }
  | { kind: "serviceWorkerTimeout" }
  | { kind: "unsubscribed" }
  | { kind: "subscription"; subscription: PushSubscription };

/** The service worker registration, or `null` if it isn't ready in time. */
async function readyServiceWorker() {
  const timedOut = Promise.withResolvers<null>();
  const timer = setTimeout(() => {
    timedOut.resolve(null);
  }, SERVICE_WORKER_READY_TIMEOUT_MS);
  const registration = await Promise.race([navigator.serviceWorker.ready, timedOut.promise]);
  clearTimeout(timer);
  return registration;
}

async function resolveDevicePushState(): Promise<DevicePushState> {
  if (needsIosPushInstall()) {
    return { kind: "needsIosInstall" };
  }
  if (!isPushSupported()) {
    return { kind: "unsupported" };
  }
  const registration = await readyServiceWorker();
  if (!registration) {
    return { kind: "serviceWorkerTimeout" };
  }
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? { kind: "subscription", subscription } : { kind: "unsubscribed" };
}

/** A capability that couldn't be detected reads as not subscribed. */
async function orUnsubscribed<TCapability>(
  detect: Promise<TCapability>,
): Promise<TCapability | { kind: "unsubscribed" }> {
  return await detect.catch(() => ({ kind: "unsubscribed" }) as const);
}

function resolveBrowserPushCapability(
  request: ConvexRequest,
  babyRef: string,
): Promise<BrowserPushCapability> {
  const detect = async (): Promise<BrowserPushCapability> => {
    const device = await resolveDevicePushState();
    if (device.kind !== "subscription") {
      return device;
    }
    const flags = await readSubscriptionFlags(request, {
      babyId: babyRef,
      endpoint: device.subscription.endpoint,
    });
    return {
      family: Boolean(flags.family),
      kind: "subscribed",
      messages: Boolean(flags.messages),
      subscription: device.subscription,
    };
  };
  return orUnsubscribed(detect());
}

export type AdminBrowserPushCapability =
  | { kind: "unsupported" }
  | { kind: "needsIosInstall" }
  | { kind: "serviceWorkerTimeout" }
  | { kind: "unsubscribed" }
  | { kind: "subscribed" };

const ADMIN_BROWSER_PUSH_CAPABILITY_KEY = "adminBrowserPushCapability";

function resolveAdminBrowserPushCapability(
  request: ConvexRequest,
): Promise<AdminBrowserPushCapability> {
  const detect = async (): Promise<AdminBrowserPushCapability> => {
    const device = await resolveDevicePushState();
    if (device.kind !== "subscription") {
      return device;
    }
    const subscribed = await readConvexQuery(request, {
      args: { endpoint: device.subscription.endpoint },
      query: api.adminPushSubscriptions.isSubscribed,
    });
    return subscribed ? { kind: "subscribed" } : { kind: "unsubscribed" };
  };
  return orUnsubscribed(detect());
}

/**
 * Whether this device gets the signed-in admin's new-baby pushes. Browser
 * only and never stale, like `browserPushCapabilityQuery`.
 */
export function adminBrowserPushCapabilityQuery() {
  return queryOptions({
    queryFn: (context) => resolveAdminBrowserPushCapability(context),
    queryKey: [ADMIN_BROWSER_PUSH_CAPABILITY_KEY],
    retry: false,
    ssr: false,
    staleTime: 0,
  });
}
