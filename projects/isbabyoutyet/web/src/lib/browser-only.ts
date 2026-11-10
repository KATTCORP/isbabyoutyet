import type { DehydrateOptions, LoadEntry, QueryClient } from "@raf-query/react";
// oxlint-disable-next-line workspace/no-raf-query-waterfall -- re-exported as `browserOnlyHandle`, the one sanctioned use
import { canDehydrate, link, skipToken, waterfallHandle } from "@raf-query/react";
import { Predicate } from "effect";

/**
 * A link for queries that read what only a browser knows (push permission,
 * the service worker, `localStorage`), marked `meta: { browserOnly: true }`.
 *
 * On a server client their request never starts: it stays pending until the
 * request's cache is cleared, so a server render reads them as still loading
 * (render them without suspending), and {@link dehydrateBrowserOnly} keeps
 * them out of the SSR stream, so the browser runs them itself when a
 * component reads them.
 */
export const browserOnly = link<{ meta: { browserOnly: boolean | undefined } }>((op, next) =>
  op.client.isServer && op.meta.browserOnly === true
    ? new Promise((_resolve, reject) => {
        op.signal.addEventListener("abort", () => {
          reject(op.signal.reason);
        });
      })
    : next(op),
);

/** The SSR stream's entries: the default ones, but never a {@link browserOnly} query. */
export const dehydrateBrowserOnly: DehydrateOptions = {
  filter: (entry) => {
    const meta = entry.options?.meta;
    return canDehydrate(entry) && !(Predicate.hasProperty(meta, "browserOnly") && meta.browserOnly);
  },
};

/**
 * A loader's `load` entry for a {@link browserOnly} query: started in the
 * browser, so a client navigation runs it alongside the route's data, and
 * skipped on the server, where it can't run. Its reader builds its own
 * handle with {@link browserOnlyHandle}, since after SSR no loader started it.
 *
 * @example
 * await load(queryClient, { push: inBrowser(queryClient, prefetch(pushQuery, babyRef)) });
 */
export function inBrowser<TEntry extends LoadEntry>(queryClient: QueryClient, entry: TEntry) {
  return queryClient.isServer ? skipToken : entry;
}

/**
 * The handle of a {@link browserOnly} query, built where it's read.
 *
 * `waterfallHandle`, for the one kind of query that has to start while
 * rendering: no loader can start it before SSR, and after hydration nothing
 * reruns the loader. `inBrowser` still starts it in loaders on client
 * navigations, so there the read joins that request.
 */
export const browserOnlyHandle = waterfallHandle;
