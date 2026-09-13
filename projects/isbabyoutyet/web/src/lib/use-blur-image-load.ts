import { useRef, useState } from "react";
import type { Dispatch, ImgHTMLAttributes, RefObject, SetStateAction, SyntheticEvent } from "react";
import { useCompleteImageLoad } from "@/lib/use-complete-image-load";

type HandleLoadingOptions = {
  loadedSrcRef: RefObject<string | null>;
  onLoad: ImgHTMLAttributes<HTMLImageElement>["onLoad"];
  setLoadedSrc: Dispatch<SetStateAction<string | null>>;
  srcKey: string;
};

function callOnLoad(img: HTMLImageElement, onLoad: ImgHTMLAttributes<HTMLImageElement>["onLoad"]) {
  if (!onLoad) {
    return;
  }

  const nativeEvent = new Event("load");
  Object.defineProperty(nativeEvent, "target", { value: img, writable: false });
  let prevented = false;
  let stopped = false;

  onLoad({
    ...nativeEvent,
    currentTarget: img,
    isDefaultPrevented: () => prevented,
    isPropagationStopped: () => stopped,
    nativeEvent,
    persist: () => {},
    preventDefault: () => {
      prevented = true;
      nativeEvent.preventDefault();
    },
    stopPropagation: () => {
      stopped = true;
      nativeEvent.stopPropagation();
    },
    target: img,
  });
}

/**
 * Next.js waits for decode before clearing the placeholder and replays this
 * for an image that completed before hydration attached its load handler.
 * @see https://github.com/vercel/next.js/blob/78b11c37e6eafb92030612c08de4adb5bb5c8a28/packages/next/src/client/image-component.tsx
 */
function handleLoading(img: HTMLImageElement, options: HandleLoadingOptions) {
  if (options.loadedSrcRef.current === img.src) {
    return;
  }
  options.loadedSrcRef.current = img.src;

  const decode = "decode" in img ? img.decode() : Promise.resolve();
  void decode
    .catch(() => {})
    .then(() => {
      if (!img.parentElement || !img.isConnected) {
        return;
      }
      options.setLoadedSrc(options.srcKey);
      callOnLoad(img, options.onLoad);
    });
}

/**
 * Owns BlurImage load/fail tracking. Lives in lib so feature UI stays free of
 * useState (audited seam under no-use-state).
 */
export function useBlurImageLoad(opts: {
  onError: ImgHTMLAttributes<HTMLImageElement>["onError"];
  onLoad: ImgHTMLAttributes<HTMLImageElement>["onLoad"];
  srcKey: string;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === opts.srcKey;
  const showAltText = failedSrc === opts.srcKey;

  useCompleteImageLoad({
    imgRef,
    onComplete: (img) => {
      handleLoading(img, {
        loadedSrcRef,
        onLoad: opts.onLoad,
        setLoadedSrc,
        srcKey: opts.srcKey,
      });
    },
    srcKey: opts.srcKey,
  });

  function onLoad(event: SyntheticEvent<HTMLImageElement>) {
    handleLoading(event.currentTarget, {
      loadedSrcRef,
      onLoad: opts.onLoad,
      setLoadedSrc,
      srcKey: opts.srcKey,
    });
  }

  function onError(event: SyntheticEvent<HTMLImageElement>) {
    setFailedSrc(opts.srcKey);
    setLoadedSrc(opts.srcKey);
    opts.onError?.(event);
  }

  return {
    imgRef,
    loaded,
    onError,
    onLoad,
    showAltText,
  };
}
