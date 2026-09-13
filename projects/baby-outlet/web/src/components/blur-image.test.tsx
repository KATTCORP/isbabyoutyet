import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { ImgHTMLAttributes } from "react";
import { BlurImage } from "./blur-image";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";

const BLUR = "data:image/jpeg;base64,/9j/blur";

test("paints a blurred SVG background until the image decodes", async () => {
  const view = render(
    <BlurImage src="https://example.com/photo.jpg" alt="Nova" blurDataUrl={BLUR} />,
  );
  using _view = makeResource(view, () => {
    view.unmount();
  });

  const img = view.getByAltText("Nova") as HTMLImageElement;
  expect(img.src).toContain("photo.jpg");
  expect(img.className).not.toContain("blur-xl");
  expect(img.style.color).toBe("transparent");
  expect(img.style.backgroundImage).toContain("data:image/svg+xml");
  expect(img.style.backgroundImage).toContain(BLUR);

  fireEvent.load(img);
  await vi.waitFor(() => {
    expect(img.style.backgroundImage).toBe("");
  });
});

test("keeps the placeholder until decode completes", async () => {
  let finishDecode = () => {};
  const onLoad = vi.fn<NonNullable<ImgHTMLAttributes<HTMLImageElement>["onLoad"]>>((event) => {
    expect(event.isDefaultPrevented()).toBe(false);
    expect(event.isPropagationStopped()).toBe(false);
    event.preventDefault();
    event.stopPropagation();
    event.persist();
    expect(event.isDefaultPrevented()).toBe(true);
    expect(event.isPropagationStopped()).toBe(true);
  });
  const view = render(
    <BlurImage src="https://example.com/photo.jpg" alt="Nova" blurDataUrl={BLUR} onLoad={onLoad} />,
  );
  using _view = makeResource(view, () => {
    view.unmount();
  });

  const img = view.getByAltText("Nova") as HTMLImageElement;
  img.decode = () =>
    new Promise<void>((resolve) => {
      finishDecode = resolve;
    });

  fireEvent.load(img);
  expect(img.style.backgroundImage).toContain("data:image/svg+xml");
  expect(onLoad).not.toHaveBeenCalled();

  finishDecode();
  await vi.waitFor(() => {
    expect(img.style.backgroundImage).toBe("");
  });
  expect(onLoad).toHaveBeenCalledOnce();
});

test("clears the placeholder when a cached image completed before hydration", async () => {
  const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => true,
  });
  using _restoreComplete = makeResource({}, () => {
    if (complete) {
      Object.defineProperty(HTMLImageElement.prototype, "complete", complete);
    }
  });

  const view = render(
    <BlurImage src="https://example.com/cached.jpg" alt="Nova" blurDataUrl={BLUR} />,
  );
  using _view = makeResource(view, () => {
    view.unmount();
  });

  const img = view.getByAltText("Nova") as HTMLImageElement;
  await vi.waitFor(() => {
    expect(img.style.backgroundImage).toBe("");
  });
});

test("skips the placeholder when no blur data URL is provided", () => {
  const view = render(
    <BlurImage src="https://example.com/photo.jpg" alt="Nova" blurDataUrl={null} />,
  );
  using _view = makeResource(view, () => {
    view.unmount();
  });

  const img = view.getByAltText("Nova") as HTMLImageElement;
  expect(img.style.backgroundImage).toBe("");
  expect(img.className).not.toContain("blur-xl");
});

test("restores a caller background after the placeholder clears", async () => {
  const view = render(
    <BlurImage
      src="https://example.com/photo.jpg"
      alt="Nova"
      blurDataUrl={BLUR}
      style={{ backgroundImage: "linear-gradient(red, blue)" }}
    />,
  );
  using _view = makeResource(view, () => {
    view.unmount();
  });

  const img = view.getByAltText("Nova") as HTMLImageElement;
  expect(img.style.backgroundImage).toContain("data:image/svg+xml");
  fireEvent.load(img);
  await vi.waitFor(() => {
    expect(img.style.backgroundImage).toBe("linear-gradient(red, blue)");
  });
});

test("removes the placeholder and reveals alt text when loading fails", () => {
  const onError = vi.fn<NonNullable<ImgHTMLAttributes<HTMLImageElement>["onError"]>>();
  const view = render(
    <BlurImage
      src="https://example.com/missing.jpg"
      alt="Nova"
      blurDataUrl={BLUR}
      onError={onError}
    />,
  );
  using _view = makeResource(view, () => {
    view.unmount();
  });

  const img = view.getByAltText("Nova") as HTMLImageElement;
  expect(img.style.color).toBe("transparent");
  fireEvent.error(img);
  expect(img.style.color).toBe("");
  expect(img.style.backgroundImage).toBe("");
  expect(onError).toHaveBeenCalledOnce();
});

test("server HTML starts the real src with Next.js-style placeholder mechanics", () => {
  const html = renderToString(
    <BlurImage src="https://cdn.example/full.jpg" alt="Nova" blurDataUrl={BLUR} />,
  );

  expect(html).toContain('src="https://cdn.example/full.jpg"');
  expect(html).toContain(BLUR);
  expect(html).toContain("data:image/svg+xml");
  expect(html).toContain("color:transparent");
  expect(html.match(/<img\b/g)).toHaveLength(1);
  expect(html).not.toMatch(/<img\b[^>]*blur-xl/);
});
