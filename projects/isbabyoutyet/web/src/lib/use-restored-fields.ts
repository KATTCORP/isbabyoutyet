/**
 * Fills a form in with what only the browser knows, once the page's JS
 * runs: what the visitor already typed into the server's HTML, and failing
 * that what the browser's storage has, like a draft or a remembered name.
 * The server's HTML cannot have either: a shared page is the same for every
 * visitor.
 *
 * Owns the one layout effect that does it, so the form's component stays
 * free of effects and is not mounted a second time, which would take the
 * visitor's focus away.
 */
import { isString } from "@workspace/runtime/guards";
import { useEffectEvent, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { DefaultValues, FieldValues, UseFormGetValues, UseFormReset } from "react-hook-form";

export function useRestoredFields<TValues extends FieldValues>(opts: {
  formRef: RefObject<HTMLFormElement | null>;
  getValues: UseFormGetValues<TValues>;
  /** Reads the browser's storage. `null` for a form that keeps nothing there. */
  read: (() => DefaultValues<TValues>) | null;
  reset: UseFormReset<TValues>;
}) {
  const restore = useEffectEvent(() => {
    const current = opts.getValues();
    const element = opts.formRef.current;
    // Text fields the visitor changed before React took over: the input no
    // longer says what the form started it as.
    const typed = [...(element ? new FormData(element) : [])].filter(
      ([name, value]) => isString(current[name]) && isString(value) && value !== current[name],
    );
    if (opts.read === null && typed.length === 0) {
      return;
    }
    opts.reset(
      { ...(opts.read ? opts.read() : current), ...Object.fromEntries(typed) },
      { keepDirtyValues: true },
    );
  });
  // Once per form. React runs a layout effect again when it shows a subtree
  // it had hidden, and twice for a new component in development. By then
  // the inputs may not have caught up with the first run, and what they
  // still say would pass for something the visitor typed.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current) {
      return;
    }
    restored.current = true;
    restore();
  }, []);
}
