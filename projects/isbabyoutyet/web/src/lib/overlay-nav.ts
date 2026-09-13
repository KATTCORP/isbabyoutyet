/**
 * Route-backed overlays (settings sheet, post composer, share preview, photo
 * lightboxes): open with a pushed history entry, close by going back.
 *
 * Two hooks per overlay share one spec (`open` / `close` link options):
 *
 * - `use…Overlay` — mounted by the overlay's route component. Owns the open
 *   state (deferred one frame so Base UI plays its enter transition), the
 *   form guard, and the close navigation that runs once the exit transition
 *   ends. Spread `rootProps` onto the Base UI Root and wrap forms in
 *   `FormGuardProvider guard={overlay.guard}`.
 * - `use…OverlayLinks` — for layouts and nav docks. `openLink` pushes the
 *   overlay route; `dismiss()` asks the mounted overlay to close through its
 *   guard (exit animation, discard prompt) and only falls back to a raw
 *   history navigation when nothing is mounted (cold load).
 *
 * Closing navigates with `ignoreBlocker`: the guard already vetted the
 * dismissal (or the caller closed imperatively after a save), and a blocked
 * replace / reverted `history.back()` would strand the URL on the overlay
 * route with nothing visible.
 *
 * The mounted-overlay registry is a module store (allowed in this audited lib
 * seam) so a layout can reach the overlay rendered in its `<Outlet />`.
 */
import { useRouter } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useFormGuard } from "@workspace/form-guard";
import type { FormGuardHandle } from "@workspace/form-guard";

/** History state marker for push-opened overlays. */
const overlayHistoryState = { overlay: true as const };

function isOverlayHistoryState(state: { overlay: true | undefined }) {
  return state.overlay === true;
}

type OverlayOpenInput = Omit<
  LinkProps,
  "resetScroll" | "state" | "replace" | "preload" | "ignoreBlocker"
>;
type OverlayCloseInput = Omit<LinkProps, "resetScroll" | "replace" | "ignoreBlocker">;

/**
 * Link/navigate options to *open* an overlay: push a history entry, preload
 * while its real Link is visible, keep scroll, and mark `state.overlay` so
 * dismiss can prefer `history.back()`.
 *
 * Pass to `<Link {...opts} />` or `navigate(opts)`.
 *
 * @public
 */
export function openOverlayLink(options: OverlayOpenInput): LinkProps {
  return {
    ...options,
    preload: "viewport",
    resetScroll: false,
    state: overlayHistoryState,
  };
}

/**
 * Link/navigate options to *close* an overlay via replace (the fallback when
 * there is no push-opened history entry to go back to).
 *
 * Pass to `<Link {...opts} />` or `navigate(opts)`. Prefer the overlay's
 * `close()` / the links' `dismiss()` when the overlay may have been push-opened.
 *
 * @public
 */
export function closeOverlayLink(options: OverlayCloseInput): LinkProps {
  return {
    ...options,
    replace: true,
    resetScroll: false,
  };
}

/**
 * Spread onto an in-overlay `<Link>` close CTA. Primary click closes through
 * the overlay (exit transition, then dismiss); modifier-clicks keep the href.
 *
 * @public
 */
export function overlayCloseLinkProps(
  closeLink: LinkProps,
  close: () => void,
): OverlayCloseLinkProps {
  return {
    ...closeLink,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      close();
    },
  };
}

/** Link props for an in-overlay close CTA (`href` + dismiss-on-primary-click). */
export type OverlayCloseLinkProps = LinkProps & {
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};

type OverlayHistory = {
  back: (options: { ignoreBlocker: boolean }) => void;
  canGoBack: () => boolean;
  location: { state: { overlay: true | undefined } };
};

/**
 * Close an overlay the best-in-class way:
 * - If this entry was push-opened (`overlay` state) and TanStack can go back,
 *   use `history.back()` so Back/swipe matches dialog dismiss.
 * - Otherwise navigate with the provided close link (replace fallback).
 *
 * `ignoreBlocker: true` is for the overlay's own close-after-exit path, where
 * the form guard already answered; `false` lets router blockers ask.
 *
 * @public
 */
export function dismissOverlay(opts: {
  closeLink: LinkProps;
  history: OverlayHistory;
  ignoreBlocker: boolean;
  navigate: (closeLink: LinkProps) => void;
}) {
  if (isOverlayHistoryState(opts.history.location.state) && opts.history.canGoBack()) {
    // oxlint-disable-next-line no-console -- dismiss-flow debugging aid (see PR)
    console.log("dismissOverlay: history.back", { ignoreBlocker: opts.ignoreBlocker });
    opts.history.back({ ignoreBlocker: opts.ignoreBlocker });
    return;
  }
  // oxlint-disable-next-line no-console -- dismiss-flow debugging aid (see PR)
  console.log("dismissOverlay: navigate", opts.closeLink, { ignoreBlocker: opts.ignoreBlocker });
  void opts.navigate({ ...opts.closeLink, ignoreBlocker: opts.ignoreBlocker });
}

type OverlaySpec = {
  close: OverlayCloseInput;
  open: OverlayOpenInput;
};

/** Props for the Base UI Root of a route-backed overlay. */
type OverlayRootProps = FormGuardHandle["rootProps"] & {
  onOpenChangeComplete: (open: boolean) => void;
};

type RouteOverlay = {
  /**
   * Close unconditionally (after a successful save, "Cancel"): starts the
   * exit transition; navigation follows once it completes.
   */
  close: () => void;
  /** Spread onto `<Link>` / pass to `navigate` for the replace-close fallback. */
  closeLink: LinkProps;
  /**
   * Spread onto an in-overlay `<Link>` close CTA: real href, primary click
   * closes through the overlay so the exit transition runs first.
   */
  closeLinkProps: OverlayCloseLinkProps;
  /** Wrap the overlay's forms: `<FormGuardProvider guard={overlay.guard}>`. */
  guard: FormGuardHandle;
  /** Whether the overlay should currently be visible. */
  open: boolean;
  /** Spread onto `<Link>` / pass to `navigate` to open the overlay (push). */
  openLink: LinkProps;
  /**
   * Close like a user dismissal: blocked mid-submit, confirmed while dirty,
   * otherwise starts the exit transition.
   */
  requestClose: () => void;
  /** Spread onto the Base UI Root (`open`, guarded `onOpenChange`, `onOpenChangeComplete`). */
  rootProps: OverlayRootProps;
};

/** What a presentational overlay component needs from its route overlay. */
export type OverlayControl = Pick<RouteOverlay, "close" | "closeLinkProps" | "guard" | "rootProps">;

type OverlayLinks = {
  /** Spread onto `<Link>` / pass to `navigate` for the replace-close fallback. */
  closeLink: LinkProps;
  /**
   * Close the overlay from outside it (nav toggle): asks the mounted overlay
   * to close through its guard; falls back to `history.back()` / replace when
   * no overlay component is mounted.
   */
  dismiss: () => void;
  /** Spread onto `<Link>` / pass to `navigate` to open the overlay (push). */
  openLink: LinkProps;
};

/**
 * Overlays currently mounted by their route component, keyed by spec, so a
 * layout's `dismiss()` can hand off to the overlay's guarded close.
 */
const mountedOverlays = new Map<string, Pick<RouteOverlay, "requestClose">>();

function overlayKey(spec: OverlaySpec) {
  return JSON.stringify({ params: spec.open.params ?? null, to: spec.open.to });
}

function useRouteOverlay(spec: OverlaySpec): RouteOverlay {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Defer open until after the first paint so Base UI sees closed→open and
    // applies `data-starting-style` enter transitions. Must stay async (rAF),
    // not useLayoutEffect — the browser needs one closed frame first.
    const frame = requestAnimationFrame(() => {
      setOpen(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const guard = useFormGuard({ onOpenChange: setOpen, open });
  const key = overlayKey(spec);
  const requestClose = guard.requestClose;
  useEffect(() => {
    mountedOverlays.set(key, { requestClose });
    return () => {
      mountedOverlays.delete(key);
    };
  }, [key, requestClose]);
  const openLink = openOverlayLink(spec.open);
  const closeLink = closeOverlayLink(spec.close);

  return {
    close: guard.close,
    closeLink,
    closeLinkProps: overlayCloseLinkProps(closeLink, guard.close),
    guard,
    open,
    openLink,
    requestClose,
    rootProps: {
      ...guard.rootProps,
      onOpenChangeComplete: (nextOpen) => {
        if (nextOpen) {
          return;
        }
        dismissOverlay({
          closeLink,
          history: router.history,
          ignoreBlocker: true,
          navigate: (link) => {
            void router.navigate(link);
          },
        });
      },
    },
  };
}

function useRouteOverlayLinks(spec: OverlaySpec): OverlayLinks {
  const router = useRouter();
  const openLink = openOverlayLink(spec.open);
  const closeLink = closeOverlayLink(spec.close);
  const key = overlayKey(spec);
  return {
    closeLink,
    dismiss: () => {
      const mounted = mountedOverlays.get(key);
      if (mounted) {
        mounted.requestClose();
        return;
      }
      dismissOverlay({
        closeLink,
        history: router.history,
        ignoreBlocker: false,
        navigate: (link) => {
          void router.navigate(link);
        },
      });
    },
    openLink,
  };
}

function dashboardSettingsOverlay(): OverlaySpec {
  return {
    close: { to: "/dashboard" },
    open: { to: "/dashboard/settings" },
  };
}

export function useDashboardSettingsOverlay() {
  return useRouteOverlay(dashboardSettingsOverlay());
}

export function useDashboardSettingsOverlayLinks() {
  return useRouteOverlayLinks(dashboardSettingsOverlay());
}

function babySettingsOverlay(publicId: string): OverlaySpec {
  return {
    close: { params: { publicId }, to: "/baby/$publicId" },
    open: { params: { publicId }, to: "/baby/$publicId/settings" },
  };
}

export function useBabySettingsOverlay(publicId: string) {
  return useRouteOverlay(babySettingsOverlay(publicId));
}

export function useBabySettingsOverlayLinks(publicId: string) {
  return useRouteOverlayLinks(babySettingsOverlay(publicId));
}

function babyPostOverlay(publicId: string): OverlaySpec {
  return {
    close: { params: { publicId }, to: "/baby/$publicId" },
    open: { params: { publicId }, to: "/baby/$publicId/post" },
  };
}

export function useBabyPostOverlay(publicId: string) {
  return useRouteOverlay(babyPostOverlay(publicId));
}

export function useBabyPostOverlayLinks(publicId: string) {
  return useRouteOverlayLinks(babyPostOverlay(publicId));
}

function babyShareOverlay(publicId: string): OverlaySpec {
  return {
    close: { params: { publicId }, to: "/baby/$publicId" },
    open: { params: { publicId }, to: "/baby/$publicId/share" },
  };
}

export function useBabyShareOverlay(publicId: string) {
  return useRouteOverlay(babyShareOverlay(publicId));
}

export function useBabyShareOverlayLinks(publicId: string) {
  return useRouteOverlayLinks(babyShareOverlay(publicId));
}

function babyLoginOverlay(publicId: string): OverlaySpec {
  return {
    close: { params: { publicId }, to: "/baby/$publicId" },
    open: { params: { publicId }, to: "/baby/$publicId/login" },
  };
}

export function useBabyLoginOverlay(publicId: string) {
  return useRouteOverlay(babyLoginOverlay(publicId));
}

export function useBabyLoginOverlayLinks(publicId: string) {
  return useRouteOverlayLinks(babyLoginOverlay(publicId));
}

function babySignupOverlay(publicId: string): OverlaySpec {
  return {
    close: { params: { publicId }, to: "/baby/$publicId" },
    open: { params: { publicId }, to: "/baby/$publicId/signup" },
  };
}

export function useBabySignupOverlay(publicId: string) {
  return useRouteOverlay(babySignupOverlay(publicId));
}

export function useBabySignupOverlayLinks(publicId: string) {
  return useRouteOverlayLinks(babySignupOverlay(publicId));
}

function babyPhotoOverlay(publicId: string): OverlaySpec {
  return {
    close: { params: { publicId }, to: "/baby/$publicId" },
    open: { params: { publicId }, to: "/baby/$publicId/photo" },
  };
}

export function useBabyPhotoOverlay(publicId: string) {
  return useRouteOverlay(babyPhotoOverlay(publicId));
}

export function useBabyPhotoOverlayLinks(publicId: string) {
  return useRouteOverlayLinks(babyPhotoOverlay(publicId));
}

function babyUpdatePhotoOverlay(opts: { publicId: string; updateId: string }): OverlaySpec {
  return {
    close: { params: { publicId: opts.publicId }, to: "/baby/$publicId" },
    open: {
      params: { publicId: opts.publicId, updateId: opts.updateId },
      to: "/baby/$publicId/updates/$updateId/photo",
    },
  };
}

export function useBabyUpdatePhotoOverlay(opts: { publicId: string; updateId: string }) {
  return useRouteOverlay(babyUpdatePhotoOverlay(opts));
}

export function useBabyUpdatePhotoOverlayLinks(opts: { publicId: string; updateId: string }) {
  return useRouteOverlayLinks(babyUpdatePhotoOverlay(opts));
}
