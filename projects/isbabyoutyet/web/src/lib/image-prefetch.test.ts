import { createQueryClient, getData, removeAll } from "@raf-query/react";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { expect, test, vi } from "vitest";
import { browserImageQuery, prefetchBrowserImage } from "@/lib/image-prefetch";
import { stubNoWindowResource } from "@/test/stubJsdomWindow";

function queryClientResource(opts: { isServer: boolean } = { isServer: false }) {
  const queryClient = createQueryClient({ isServer: opts.isServer });
  return makeResource(queryClient, () => {
    removeAll(queryClient);
  });
}

test("keeps a stable query key scoped by image URL", () => {
  const url = "https://cdn.example/full.jpg";
  expect(browserImageQuery(url).queryKey).toEqual(["browserImagePrefetch", url]);
});

test("prefetches the image into the query cache in the browser", async () => {
  using queryClient = queryClientResource();
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
    expect(getData(queryClient, browserImageQuery, url)).toEqual({
      ok: true,
      url,
    });
  });
});

test("does not construct Image while prefetching on the server", async () => {
  using _window = stubNoWindowResource();
  using queryClient = queryClientResource({ isServer: true });
  const url = "https://cdn.example/full.jpg";

  const OriginalImage = globalThis.Image;
  const ImageSpy = vi.fn<() => void>();
  vi.stubGlobal("Image", ImageSpy);
  await using _image = makeResource({}, () => {
    vi.stubGlobal("Image", OriginalImage);
  });

  prefetchBrowserImage(queryClient, url);
  await Promise.resolve();

  expect(ImageSpy).not.toHaveBeenCalled();
  expect(getData(queryClient, browserImageQuery, url)).toBeUndefined();
});

test("soft-fails when the image fails to load", async () => {
  using queryClient = queryClientResource();
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
    expect(getData(queryClient, browserImageQuery, url)).toEqual({
      ok: false,
      url,
    });
  });
});
