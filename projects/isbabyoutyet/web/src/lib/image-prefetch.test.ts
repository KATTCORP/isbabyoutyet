import { getData } from "@raf-query/react";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
import { browserImageQuery, prefetchBrowserImage } from "@/lib/image-prefetch";
import { stubNoWindowResource } from "@/test/stubJsdomWindow";
import { stubQueryClientResource } from "@/test/stubQueryClient";

/** The app's client; decoding an image reads nothing from Convex. */
function queryClientResource(opts: { isServer: boolean } = { isServer: false }) {
  return stubQueryClientResource(async (query) => {
    throw new Error(`unexpected query ${getFunctionName(query)}`);
  }, opts);
}

test("keeps a stable query key scoped by image URL", () => {
  const url = "https://cdn.example/full.jpg";
  expect(browserImageQuery(url).queryKey).toEqual(["browserImagePrefetch", url]);
});

test("prefetches the image into the query cache in the browser", async () => {
  await using stub = queryClientResource();
  const queryClient = stub.queryClient;
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
  await using stub = queryClientResource({ isServer: true });
  const queryClient = stub.queryClient;
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
  await using stub = queryClientResource();
  const queryClient = stub.queryClient;
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
