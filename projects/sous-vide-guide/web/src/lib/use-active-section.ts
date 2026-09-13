import { useEffect, useEffectEvent, useState } from "react";

/**
 * Scroll spy for in-page section anchors. Lives in lib so the effect may own
 * the window scroll/resize listeners.
 *
 * A section counts as reached once its top has passed its own
 * `scroll-margin-top` — the exact spot a `#hash` jump lands it at — so the
 * highlight and the quick links agree. The last section is also active once
 * the page is scrolled to the bottom, because a short final section may never
 * reach that line. Returns `null` before any section has been reached or
 * while disabled. `onChange` fires with each new active id (not with `null`).
 */
export function useActiveSection(opts: {
  enabled: boolean;
  ids: ReadonlyArray<string>;
  onChange: ((id: string) => void) | null;
}) {
  const [active, setActive] = useState<string | null>(null);
  const idsKey = opts.ids.join("\u0000");
  const notify: (id: string) => void = useEffectEvent((id) => {
    opts.onChange?.(id);
  });

  useEffect(() => {
    if (!opts.enabled) {
      return;
    }
    const ids = idsKey.split("\u0000").filter((id) => id.length > 0);
    let frame = 0;
    let last: string | null = null;

    const measure = () => {
      frame = 0;
      const next = activeSectionId(ids);
      if (next === last) {
        return;
      }
      last = next;
      setActive(next);
      if (next !== null) {
        notify(next);
      }
    };
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(measure);
      }
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [opts.enabled, idsKey]);

  return opts.enabled ? active : null;
}

const REACHED_TOLERANCE_PX = 2;

function activeSectionId(ids: ReadonlyArray<string>) {
  const lastId = ids.at(-1);
  if (lastId === undefined) {
    return null;
  }
  const scrolledToBottom =
    window.scrollY + window.innerHeight >=
    document.documentElement.scrollHeight - REACHED_TOLERANCE_PX;
  if (scrolledToBottom) {
    return lastId;
  }

  let active: string | null = null;
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element === null) {
      continue;
    }
    const snapOffset = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    if (element.getBoundingClientRect().top - snapOffset > REACHED_TOLERANCE_PX) {
      break;
    }
    active = id;
  }
  return active;
}
