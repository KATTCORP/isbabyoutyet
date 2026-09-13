import { useEffect, useEffectEvent, useState } from "react";

/**
 * Connects an IntersectionObserver event directly to an action. Lives in lib
 * so the effect may own observer setup/cleanup; `onIntersect` is kept fresh
 * via `useEffectEvent` (same idiom as sibling timing hooks).
 */
export function useIntersectionAction(opts: {
  enabled: boolean;
  onIntersect: () => void;
  threshold: number;
}) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const onIntersect = useEffectEvent(opts.onIntersect);

  useEffect(() => {
    if (!opts.enabled || node === null || globalThis.IntersectionObserver === undefined) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      { threshold: opts.threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [opts.enabled, opts.threshold, node]);

  return setNode;
}
