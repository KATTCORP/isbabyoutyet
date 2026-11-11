import { load, prefetch } from "@raf-query/react";
import type { AppQueryClient } from "@/lib/query-client";
import { queryOptions } from "@/lib/raf";

const BROWSER_IMAGE_PREFETCH_KEY = "browserImagePrefetch";

/** Decodes an image into the browser cache. */
export function browserImageQuery(imageUrl: string) {
  return queryOptions({
    queryFn: () => loadBrowserImage(imageUrl),
    queryKey: [BROWSER_IMAGE_PREFETCH_KEY, imageUrl],
    retry: false,
    staleTime: Infinity,
  });
}

/**
 * Fire-and-forget image warm in route loaders, so a client navigation starts
 * downloading the photo alongside the route's data. Browser only: on the
 * server the SSR'd `<img>` loads it.
 */
export function prefetchBrowserImage(queryClient: AppQueryClient, imageUrl: string) {
  if (queryClient.isServer || imageUrl === "") {
    return;
  }
  void load(queryClient, { image: prefetch(browserImageQuery, imageUrl) });
}

function loadBrowserImage(imageUrl: string) {
  return new Promise<{ ok: boolean; url: string }>((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({ ok: true, url: imageUrl });
    });
    image.addEventListener("error", () => {
      // Soft-fail: the lightbox still opens; BlurImage shows the broken state.
      resolve({ ok: false, url: imageUrl });
    });
    image.src = imageUrl;
  });
}
