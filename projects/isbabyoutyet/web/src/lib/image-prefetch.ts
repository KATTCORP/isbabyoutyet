import { queryOptions } from "@raf-query/react";
import type { QueryClient } from "@raf-query/react";
import type { ConvexReader } from "@workspace/convex-query";

const BROWSER_IMAGE_PREFETCH_KEY = "browserImagePrefetch";

/** Decodes an image into the browser cache. Never runs on the server. */
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
 * downloading the photo alongside the route's data. A no-op on the server:
 * the SSR'd `<img>` loads it there.
 */
export function prefetchBrowserImage(queryClient: QueryClient<ConvexReader>, imageUrl: string) {
  if (globalThis.window === undefined || imageUrl === "") {
    return;
  }
  queryClient.prefetch(browserImageQuery, imageUrl);
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
