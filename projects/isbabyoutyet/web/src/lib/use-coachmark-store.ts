import { useEffectEvent, useState, useSyncExternalStore } from "react";
import { isFunction } from "@workspace/runtime/guards";

type Rect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type CoachmarkSnapshot = {
  isMobile: boolean;
  placement: "above" | "below";
  rect: Rect;
  viewportWidth: number;
};

function mobileMediaQuery() {
  if (!isFunction(window.matchMedia)) {
    return null;
  }
  return window.matchMedia("(max-width: 767px)");
}

function isHtmlElement(value: Element | null): value is HTMLElement {
  return value !== null && Object.prototype.isPrototypeOf.call(HTMLElement.prototype, value);
}

function noop() {}

function createCoachmarkStore(opts: { targetId: string }) {
  let snapshot: CoachmarkSnapshot | null = null;
  let onDismiss = noop;

  return {
    getSnapshot: () => snapshot,
    setOnDismiss: (next: () => void) => {
      onDismiss = next;
    },
    subscribe: (notify: () => void) => {
      let target: HTMLElement | null = null;
      let resizeObserver: ResizeObserver | null = null;
      let scrolledTarget: HTMLElement | null = null;
      const mediaQuery = mobileMediaQuery();

      function onTargetClick() {
        onDismiss();
      }

      function resolveTarget() {
        const element = document.querySelector(`[data-tour-id="${opts.targetId}"]`);
        const nextTarget = isHtmlElement(element) ? element : null;
        if (target === nextTarget) {
          return target;
        }
        if (target) {
          target.removeEventListener("click", onTargetClick);
        }
        resizeObserver?.disconnect();
        target = nextTarget;
        if (target && globalThis.ResizeObserver !== undefined) {
          resizeObserver = new ResizeObserver(measure);
          resizeObserver.observe(target);
        }
        if (target) {
          target.addEventListener("click", onTargetClick);
        }
        if (target && scrolledTarget !== target) {
          scrolledTarget = target;
          target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
        return target;
      }

      function measure() {
        const currentTarget = resolveTarget();
        if (!currentTarget) {
          if (snapshot !== null) {
            snapshot = null;
            notify();
          }
          return;
        }
        const rect = currentTarget.getBoundingClientRect();
        // Collapsed/hidden targets (0×0) should hide the tip, not anchor a
        // degenerate spotlight — restore pre-fold semantics.
        if (rect.width === 0 && rect.height === 0) {
          if (snapshot !== null) {
            snapshot = null;
            notify();
          }
          return;
        }
        const next: CoachmarkSnapshot = {
          isMobile: mediaQuery?.matches === true,
          placement:
            window.innerHeight - rect.bottom < 160 ? ("above" as const) : ("below" as const),
          rect: { height: rect.height, left: rect.left, top: rect.top, width: rect.width },
          viewportWidth: window.innerWidth,
        };
        if (
          snapshot?.rect.top === next.rect.top &&
          snapshot.rect.left === next.rect.left &&
          snapshot.rect.width === next.rect.width &&
          snapshot.rect.height === next.rect.height &&
          snapshot.placement === next.placement &&
          snapshot.viewportWidth === next.viewportWidth &&
          snapshot.isMobile === next.isMobile
        ) {
          return;
        }
        snapshot = next;
        notify();
      }

      measure();
      window.addEventListener("resize", measure);
      window.addEventListener("scroll", measure, true);
      mediaQuery?.addEventListener("change", measure);
      const interval = window.setInterval(measure, 500);
      const mutationObserver =
        globalThis.MutationObserver === undefined ? null : new MutationObserver(measure);
      mutationObserver?.observe(document.body, { childList: true, subtree: true });

      return () => {
        window.removeEventListener("resize", measure);
        window.removeEventListener("scroll", measure, true);
        mediaQuery?.removeEventListener("change", measure);
        target?.removeEventListener("click", onTargetClick);
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        window.clearInterval(interval);
      };
    },
  };
}

/**
 * Subscribes to the coachmark target’s layout. Store init lives in lib
 * (useState) so feature UI avoids both useState and render-time ref access.
 * `onDismiss` is an Effect Event assigned onto the store each render so click
 * handlers always invoke the latest closure without passing the event into
 * the one-shot initializer.
 */
export function useCoachmarkSnapshot(opts: { onDismiss: () => void; targetId: string }) {
  const onDismiss = useEffectEvent(opts.onDismiss);
  const [store] = useState(() => createCoachmarkStore({ targetId: opts.targetId }));
  store.setOnDismiss(onDismiss);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}
