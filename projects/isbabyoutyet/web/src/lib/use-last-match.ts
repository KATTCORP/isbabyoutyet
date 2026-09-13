import { useState } from "react";

/**
 * Keeps the last live value that passed `isMatch`; `null` until one has.
 * Convex and React Query snapshots can briefly flip to a sentinel
 * (`FORBIDDEN`, `null`) while client auth reconnects; overlays keep rendering
 * the last authorized payload.
 *
 * Audited lib seam — feature routes must not call `useState` themselves.
 */
export function useLastMatch<T, TMatch extends T>(
  value: T,
  isMatch: (value: T) => value is TMatch,
): TMatch | null;
export function useLastMatch<T>(value: T, isMatch: (value: T) => boolean): T | null;
export function useLastMatch<T>(value: T, isMatch: (value: T) => boolean) {
  const matched = isMatch(value);
  const [last, setLast] = useState<T | null>(() => (matched ? value : null));
  if (matched && value !== last) {
    setLast(value);
    return value;
  }
  return last;
}
