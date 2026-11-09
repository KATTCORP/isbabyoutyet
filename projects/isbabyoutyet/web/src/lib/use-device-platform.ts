import { useSyncExternalStore } from "react";

/**
 * Which phone OS to imitate in mock UI (the homepage's lock-screen
 * notifications). Anything that is not Android looks like iOS.
 */
export type DevicePlatform = "android" | "ios";

/**
 * What the browser says about its device: UA Client Hints first, then the UA string.
 *
 * @internal exported for tests
 */
export type DeviceMeta = {
  clientHintsPlatform: string | null;
  userAgent: string;
};

/** @internal exported for tests */
export function detectDevicePlatform(meta: DeviceMeta): DevicePlatform {
  if (meta.clientHintsPlatform !== null && meta.clientHintsPlatform !== "") {
    return meta.clientHintsPlatform.toLowerCase() === "android" ? "android" : "ios";
  }
  return /\bAndroid\b/i.test(meta.userAgent) ? "android" : "ios";
}

function hasUserAgentData(
  value: Navigator,
): value is Navigator & { userAgentData: { platform: string } | undefined } {
  return "userAgentData" in value;
}

function readNavigatorPlatform(): DevicePlatform {
  return detectDevicePlatform({
    clientHintsPlatform: hasUserAgentData(navigator)
      ? (navigator.userAgentData?.platform ?? null)
      : null,
    userAgent: navigator.userAgent,
  });
}

const noopSubscribe = () => () => undefined;

/**
 * Seam over `navigator` (the device's platform, which never changes while the
 * page is open). The server and hydration render iOS, so CDN-cached HTML is
 * the same for everyone; Android visitors switch right after hydration.
 */
export function useDevicePlatform(): DevicePlatform {
  return useSyncExternalStore(noopSubscribe, readNavigatorPlatform, () => "ios");
}
