import { useState } from "react";

/**
 * Optimistic override that clears once `base` catches up. Audited lib seam for
 * feature UIs that must not call useState directly.
 *
 * `null` is the "no override" sentinel — `$Value` must not include `null`.
 */
export function useOptimisticOverride<$Value>(opts: {
  base: $Value;
  isEqual: (left: $Value, right: $Value) => boolean;
}) {
  const [override, setOverride] = useState<$Value | null>(null);
  if (override !== null && opts.isEqual(override, opts.base)) {
    setOverride(null);
  }
  return [override ?? opts.base, setOverride] as const;
}
