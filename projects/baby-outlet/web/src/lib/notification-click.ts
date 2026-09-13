/**
 * Service-worker notification clicks should reuse the open baby page (hash
 * ignored) instead of stacking windows. Nested overlay paths are a different
 * document and keep their own tab.
 *
 * `projects/baby-outlet/web/public/sw.js` keeps a copy of {@link shouldReuseBabyClient} —
 * only the baby page itself (`/baby/$publicId`) matches.
 */
export const NOTIFICATION_CLICK_MESSAGE = "notification-click";

function babyPagePublicId(pathname: string) {
  const match = /^\/baby\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

/** @internal Exported for tests; the service worker keeps a copy in `sw.js`. */
export function shouldReuseBabyClient(opts: { clientUrl: string; targetUrl: string }) {
  const client = new URL(opts.clientUrl);
  const target = new URL(opts.targetUrl);
  if (client.origin !== target.origin) {
    return false;
  }
  const clientBaby = babyPagePublicId(client.pathname);
  const targetBaby = babyPagePublicId(target.pathname);
  return clientBaby !== null && clientBaby === targetBaby;
}

/**
 * Apply a notification-click target on the already-focused baby page.
 * The service worker posts the URL; we apply its hash here (message push
 * uses `#feed`; status / family push has none) so the SW does not have to
 * `navigate()` (that rejects on uncontrolled / iOS clients and then the
 * click handler never focuses).
 */
export function applyNotificationClickUrl(url: string) {
  const next = new URL(url, window.location.href);
  if (next.origin !== window.location.origin) {
    return;
  }
  if (next.hash && window.location.hash !== next.hash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${next.hash}`,
    );
  }
}
