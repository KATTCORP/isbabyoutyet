import { QueryClient } from "@raf-query/react";
import { makeAsyncResource, makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { expect, test, vi } from "vitest";
import { browserImageQuery, prefetchBrowserImage } from "@/lib/image-prefetch";

function queryClientResource() {
  const queryClient = new QueryClient({ isServer: false });
  return makeAsyncResource(queryClient, async () => {
    await queryClient.dispose();
  });
}

test("keeps a stable query key scoped by image URL", () => {
  const url = "https://cdn.example/full.jpg";
  expect(browserImageQuery(url).queryKey).toEqual(["browserImagePrefetch", url]);
});

test("prefetches the image into the query cache in the browser", async () => {
  await using queryClient = queryClientResource();
  const url = "https://cdn.example/full.jpg";

  const OriginalImage = globalThis.Image;
  class MockImage {
    #load: (() => void) | null = null;
    addEventListener(type: string, listener: () => void) {
      if (type === "load") {
        this.#load = listener;
      }
    }
    set src(_value: string) {
      queueMicrotask(() => {
        this.#load?.();
      });
    }
  }
  vi.stubGlobal("Image", MockImage);
  await using _image = makeResource({}, () => {
    vi.stubGlobal("Image", OriginalImage);
  });

  prefetchBrowserImage(queryClient, url);

  await vi.waitFor(() => {
    expect(queryClient.getData(browserImageQuery, url)).toEqual({
      ok: true,
      url,
    });
  });
});

test("does not construct Image while prefetching on the server", async () => {
  await using queryClient = queryClientResource();
  const url = "https://cdn.example/full.jpg";
  const originalWindow = globalThis.window;
  vi.stubGlobal("window", undefined);
  await using _window = makeResource({}, () => {
    vi.unstubAllGlobals();
    globalThis.window = originalWindow;
  });

  const ImageSpy = vi.fn<() => void>();
  vi.stubGlobal("Image", ImageSpy);

  const prefetchSpy = vi.spyOn(queryClient, "prefetch");
  prefetchBrowserImage(queryClient, url);

  expect(prefetchSpy).not.toHaveBeenCalled();
  expect(ImageSpy).not.toHaveBeenCalled();
  expect(queryClient.getData(browserImageQuery, url)).toBeUndefined();
});

test("soft-fails when the image fails to load", async () => {
  await using queryClient = queryClientResource();
  const url = "https://cdn.example/missing.jpg";

  const OriginalImage = globalThis.Image;
  class MockImage {
    #error: (() => void) | null = null;
    addEventListener(type: string, listener: () => void) {
      if (type === "error") {
        this.#error = listener;
      }
    }
    set src(_value: string) {
      queueMicrotask(() => {
        this.#error?.();
      });
    }
  }
  vi.stubGlobal("Image", MockImage);
  await using _image = makeResource({}, () => {
    vi.stubGlobal("Image", OriginalImage);
  });

  prefetchBrowserImage(queryClient, url);

  await vi.waitFor(() => {
    expect(queryClient.getData(browserImageQuery, url)).toEqual({
      ok: false,
      url,
    });
  });
});
