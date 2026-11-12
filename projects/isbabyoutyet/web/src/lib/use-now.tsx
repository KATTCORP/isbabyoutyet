/**
 * The wall clock, for text that ages, like "5 minutes ago". External system:
 * one shared `setInterval`, started by the first subscriber and cleared by
 * the last.
 *
 * The server's HTML can be served from a cache long after it was rendered,
 * so the browser must not hydrate against its own clock: the text would not
 * match and React would throw the page away. While rendering on the server
 * and hydrating in the browser, {@link useNow} is the moment the server
 * rendered ({@link RenderedAtProvider}). From then on it is the browser's
 * clock, moving once a minute.
 */
import { createContext, use, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

const MINUTE_MS = 60_000;

const RenderedAtContext = createContext<number | null>(null);

/** `renderedAt` is when the server rendered the document, in ms. */
export function RenderedAtProvider(props: { children: ReactNode; renderedAt: number }) {
  return <RenderedAtContext value={props.renderedAt}>{props.children}</RenderedAtContext>;
}

const listeners = new Set<() => void>();
let interval: number | undefined;

function subscribeToMinute(notify: () => void) {
  listeners.add(notify);
  interval ??= window.setInterval(() => {
    for (const listener of listeners) {
      listener();
    }
  }, MINUTE_MS);
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      window.clearInterval(interval);
      interval = undefined;
    }
  };
}

/** The start of the current minute, so the snapshot is stable between ticks. */
function currentMinute() {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

/** Now, in ms. */
export function useNow() {
  const renderedAt = use(RenderedAtContext);
  return useSyncExternalStore(
    subscribeToMinute,
    currentMinute,
    () => renderedAt ?? currentMinute(),
  );
}
