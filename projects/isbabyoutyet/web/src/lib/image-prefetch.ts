import { queryOptions, skipToken } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { InitiatedQuery } from "@workspace/query-prefetch";
import { getQueryInitiator } from "@workspace/query-prefetch";

const browserImagePrefetchQueryKey = ["browserImagePrefetch"] as const;

function browserImageQueryOptions(imageUrl: string) {
  return queryOptions({
    queryFn: globalThis.window !== undefined ? () => loadBrowserImage(imageUrl) : skipToken,
    queryKey: [...browserImagePrefetchQueryKey, imageUrl],
  });
}

export function browserImageFactory(imageUrl: string) {
  return browserImageQueryOptions(imageUrl);
}

export type BrowserImageFactory = typeof browserImageFactory;

type RuntimeInitiatedBrowserImage = Partial<{
  readonly input: unknown;
}>;

function initiatedBrowserImage(imageUrl: string): InitiatedQuery<BrowserImageFactory>;
function initiatedBrowserImage(imageUrl: string): RuntimeInitiatedBrowserImage {
  return { input: imageUrl };
}

/**
 * Fire-and-forget image warm in route loaders. On the server returns a
 * serializable handle without touching `Image` / the network.
 */
export function prefetchBrowserImage(
  queryClient: QueryClient,
  imageUrl: string,
): InitiatedQuery<BrowserImageFactory> {
  if (globalThis.window === undefined) {
    return initiatedBrowserImage(imageUrl);
  }
  return getQueryInitiator(queryClient).ensureQueryData(browserImageFactory, imageUrl);
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
