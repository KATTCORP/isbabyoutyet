import { useEffect, useEffectEvent } from "react";
import { isFunction, isPlainObject, isString } from "@workspace/runtime/guards";
import { applyNotificationClickUrl, NOTIFICATION_CLICK_MESSAGE } from "@/lib/notification-click";

/**
 * Scrolls to `location.hash` on load, hashchange, and service-worker
 * notification-click messages. Owns those window subscriptions so feature
 * routes stay free of effects. `scrollToHash` is read through `useEffectEvent`
 * so listeners always invoke the latest closure without listing it as a
 * dependency.
 */
export function useHashScroll() {
  const scrollToHash = useEffectEvent(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
      return;
    }
    const landmark = document.getElementById(hash);
    if (!landmark) {
      return;
    }
    const reducedMotion =
      isFunction(window.matchMedia) &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    landmark.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  });

  useEffect(() => {
    scrollToHash();
    function onHashChange() {
      scrollToHash();
    }
    function onMessage(event: MessageEvent) {
      if (!isPlainObject(event.data)) {
        return;
      }
      if (event.data.type === NOTIFICATION_CLICK_MESSAGE) {
        if (isString(event.data.url)) {
          applyNotificationClickUrl(event.data.url);
        }
        scrollToHash();
      }
    }
    window.addEventListener("hashchange", onHashChange);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
}
