import { useEffect, useState } from "react";

/**
 * A user-triggered flag that stays true for `durationMs` after each activate().
 * Retriggering bumps a generation so the timer resets. Lives in
 * `projects/baby-outlet/web/src/lib` so the timeout effect is an audited seam.
 */
export function useTransientFlag(durationMs: number) {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (generation === 0) {
      return;
    }
    const timeout = window.setTimeout(() => setGeneration(0), durationMs);
    return () => window.clearTimeout(timeout);
  }, [generation, durationMs]);

  function activate() {
    setGeneration((current) => current + 1);
  }

  return [generation > 0, activate] as const;
}
