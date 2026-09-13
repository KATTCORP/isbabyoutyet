import { useEffect, useEffectEvent, useRef, useState } from "react";
import { isFunction } from "@workspace/runtime/guards";

/**
 * Delayed action after elapsed time. Callers supply domain-level actions;
 * this hook owns timer cleanup. Effects are allowed under `projects/isbabyoutyet/web/src/lib`
 * so feature components stay free of synchronization effects. `action` is
 * read through `useEffectEvent` so the timer always invokes the latest
 * closure without listing it as a dependency.
 */
export function useDelayedAction(opts: { action: () => void; delayMs: number; enabled: boolean }) {
  const onAction = useEffectEvent(opts.action);
  useEffect(() => {
    if (!opts.enabled) {
      return;
    }
    const timeout = window.setTimeout(() => {
      onAction();
    }, opts.delayMs);
    return () => window.clearTimeout(timeout);
  }, [opts.delayMs, opts.enabled]);
}

/**
 * Mirrors `value`, delaying `true` by `delayMs` and applying `false` on the
 * next timeout (0ms). Used for UI that must not flash on instantaneous pulses.
 */
export function useDelayedBoolean(opts: { delayMs: number; value: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setShown(opts.value);
      },
      opts.value ? opts.delayMs : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [opts.value, opts.delayMs]);
  return shown;
}

/**
 * Reports a value transition for a bounded amount of time. Initial values do
 * not count as transitions, which prevents stale query history from replaying.
 */
export function useTimedTransition<$Value>(opts: {
  durationMs: number;
  from: $Value;
  to: $Value;
  value: $Value;
}) {
  const previous = useRef(opts.value);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const transitioned = Object.is(previous.current, opts.from) && Object.is(opts.value, opts.to);
    previous.current = opts.value;
    if (!transitioned) {
      setActive(false);
      return;
    }
    setActive(true);
    const timeout = window.setTimeout(() => setActive(false), opts.durationMs);
    return () => window.clearTimeout(timeout);
  }, [opts.durationMs, opts.from, opts.to, opts.value]);

  return active;
}

/** Keeps a current/previous index pair for animated rotating copy. */
export function useRotatingIndex(opts: { intervalMs: number; itemCount: number }) {
  const [indices, setIndices] = useState<{ current: number; previous: number | null }>({
    current: 0,
    previous: null,
  });
  const [trackedItemCount, setTrackedItemCount] = useState(opts.itemCount);

  if (trackedItemCount !== opts.itemCount) {
    setTrackedItemCount(opts.itemCount);
    setIndices({ current: 0, previous: null });
  }

  useEffect(() => {
    const reducedMotion =
      isFunction(window.matchMedia) &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || opts.itemCount < 2) {
      return;
    }
    const interval = window.setInterval(() => {
      setIndices((previous) => ({
        current: (previous.current + 1) % opts.itemCount,
        previous: previous.current,
      }));
    }, opts.intervalMs);
    return () => window.clearInterval(interval);
  }, [opts.intervalMs, opts.itemCount]);

  return indices;
}
