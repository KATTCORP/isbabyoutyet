import { useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";

const useIsomorphicLayoutEffect = globalThis.window === undefined ? useEffect : useLayoutEffect;

/**
 * Runs `onComplete` when an `<img>` is already complete after layout (or on
 * the server via useEffect). Covers the hydration race where load finished
 * before React attached an onLoad handler.
 */
export function useCompleteImageLoad(opts: {
  imgRef: RefObject<HTMLImageElement | null>;
  onComplete: (img: HTMLImageElement) => void;
  srcKey: string;
}) {
  useIsomorphicLayoutEffect(() => {
    const img = opts.imgRef.current;
    if (!img || !img.complete) {
      return;
    }
    opts.onComplete(img);
  }, [opts.imgRef, opts.onComplete, opts.srcKey]);
}
