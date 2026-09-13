import { QueryClient } from "@tanstack/react-query";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { expect, test, vi } from "vitest";
import { browserImageFactory, prefetchBrowserImage } from "@/lib/image-prefetch";

function queryClientResource() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return makeResource(queryClient, () => {
    queryClient.clear();
  });
}

test("keeps a stable query key scoped by image URL", () => {
  const url = "https://cdn.example/full.jpg";
  expect(browserImageFactory(url).queryKey).toEqual(["browserImagePrefetch", url]);
  expect(browserImageFactory(url).queryKey).toEqual(browserImageFactory(url).queryKey);
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

  const handle = prefetchBrowserImage(queryClient, url);

  expect(handle).toMatchObject({ input: url });
  await vi.waitFor(() => {
    expect(queryClient.getQueryData(browserImageFactory(url).queryKey)).toEqual({
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

  const ensureSpy = vi.spyOn(queryClient, "ensureQueryData");
  const handle = prefetchBrowserImage(queryClient, url);

  expect(handle).toMatchObject({ input: url });
  expect(ensureSpy).not.toHaveBeenCalled();
  expect(ImageSpy).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(browserImageFactory(url).queryKey)).toBeUndefined();
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
    expect(queryClient.getQueryData(browserImageFactory(url).queryKey)).toEqual({
      ok: false,
      url,
    });
  });
});
