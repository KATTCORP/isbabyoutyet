import { fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { ImgHTMLAttributes } from "react";
import { BlurImage } from "./blur-image";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { renderResource } from "@/test/renderResource";
import { htmlImage } from "@/test/htmlElement";

const BLUR = "data:image/jpeg;base64,/9j/blur";

test("paints a blurred SVG in front of the real image until it decodes", async () => {
  using view = renderResource(
    <BlurImage alt="Nova" blurDataUrl={BLUR} src="https://example.com/photo.jpg" />,
  );

  const img = htmlImage(view.getByAltText("Nova"));
  const wrapper = img.parentElement;
  const placeholder = wrapper?.querySelector<HTMLImageElement>("[data-blur-image-placeholder]");
  expect(img.src).toContain("photo.jpg");
  expect(img.className).not.toContain("blur-xl");
  expect(img.style.color).toBe("transparent");
  expect(wrapper?.lastElementChild).toBe(placeholder);
  expect(placeholder?.src).toContain("data:image/svg+xml");
  expect(placeholder?.src).toContain(BLUR);
  expect(placeholder?.getAttribute("aria-hidden")).toBe("true");

  fireEvent.load(img);
  await vi.waitFor(() => {
    expect(wrapper?.querySelector("[data-blur-image-placeholder]")).toBeNull();
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
  using view = renderResource(
    <BlurImage alt="Nova" blurDataUrl={BLUR} onLoad={onLoad} src="https://example.com/photo.jpg" />,
  );

  const img = htmlImage(view.getByAltText("Nova"));
  const wrapper = img.parentElement;
  img.decode = () =>
    new Promise<void>((resolve) => {
      finishDecode = resolve;
    });

  fireEvent.load(img);
  expect(wrapper?.querySelector("[data-blur-image-placeholder]")).not.toBeNull();
  expect(onLoad).not.toHaveBeenCalled();

  finishDecode();
  await vi.waitFor(() => {
    expect(wrapper?.querySelector("[data-blur-image-placeholder]")).toBeNull();
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

  using view = renderResource(
    <BlurImage alt="Nova" blurDataUrl={BLUR} src="https://example.com/cached.jpg" />,
  );
  const img = htmlImage(view.getByAltText("Nova"));
  await vi.waitFor(() => {
    expect(img.parentElement?.querySelector("[data-blur-image-placeholder]")).toBeNull();
  });
});

test("skips the placeholder when no blur data URL is provided", () => {
  using view = renderResource(
    <BlurImage alt="Nova" blurDataUrl={null} src="https://example.com/photo.jpg" />,
  );
  const img = htmlImage(view.getByAltText("Nova"));
  expect(img.parentElement).toBe(view.container);
  expect(img.style.backgroundImage).toBe("");
  expect(img.className).not.toContain("blur-xl");
});

test("keeps sizing classes and dimensions on the wrapper and real image", () => {
  using view = renderResource(
    <BlurImage
      alt="Nova"
      blurDataUrl={BLUR}
      className="aspect-square h-full w-full object-cover"
      height={160}
      src="https://example.com/photo.jpg"
      width={160}
    />,
  );
  const img = htmlImage(view.getByAltText("Nova"));
  const placeholder = img.parentElement?.querySelector<HTMLImageElement>(
    "[data-blur-image-placeholder]",
  );
  expect(img.parentElement?.className).toBe("aspect-square h-full w-full object-cover");
  expect(img.className).toBe("aspect-square h-full w-full object-cover");
  expect(placeholder?.className).toBe("aspect-square h-full w-full object-cover");
  expect(placeholder?.style.objectFit).toBe("cover");
  expect(img.width).toBe(160);
  expect(img.height).toBe(160);
});

test("matches placeholder object fit from inline styles and utility classes", () => {
  using view = renderResource(
    <>
      <BlurImage
        alt="Inline fit"
        blurDataUrl={BLUR}
        src="https://example.com/inline.jpg"
        style={{ objectFit: "contain" }}
      />
      <BlurImage
        alt="Fill fit"
        blurDataUrl={BLUR}
        className="object-fill"
        src="https://example.com/fill.jpg"
      />
      <BlurImage
        alt="None fit"
        blurDataUrl={BLUR}
        className="object-none"
        src="https://example.com/none.jpg"
      />
      <BlurImage
        alt="Scale down fit"
        blurDataUrl={BLUR}
        className="object-scale-down"
        src="https://example.com/scale-down.jpg"
      />
    </>,
  );
  const placeholders = view.container.querySelectorAll<HTMLImageElement>(
    "[data-blur-image-placeholder]",
  );
  expect([...placeholders].map((placeholder) => placeholder.style.objectFit)).toEqual([
    "contain",
    "fill",
    "none",
    "scale-down",
  ]);
});

test("preserves caller styles while layering the placeholder separately", async () => {
  using view = renderResource(
    <BlurImage
      alt="Nova"
      blurDataUrl={BLUR}
      src="https://example.com/photo.jpg"
      style={{ backgroundImage: "linear-gradient(red, blue)" }}
    />,
  );
  const img = htmlImage(view.getByAltText("Nova"));
  expect(img.style.backgroundImage).toBe("linear-gradient(red, blue)");
  expect(img.parentElement?.querySelector("[data-blur-image-placeholder]")).not.toBeNull();
  fireEvent.load(img);
  await vi.waitFor(() => {
    expect(img.parentElement?.querySelector("[data-blur-image-placeholder]")).toBeNull();
    expect(img.style.backgroundImage).toBe("linear-gradient(red, blue)");
  });
});

test("removes the placeholder and reveals alt text when loading fails", () => {
  const onError = vi.fn<NonNullable<ImgHTMLAttributes<HTMLImageElement>["onError"]>>();
  using view = renderResource(
    <BlurImage
      alt="Nova"
      blurDataUrl={BLUR}
      onError={onError}
      src="https://example.com/missing.jpg"
    />,
  );
  const img = htmlImage(view.getByAltText("Nova"));
  expect(img.style.color).toBe("transparent");
  expect(img.parentElement?.querySelector("[data-blur-image-placeholder]")).not.toBeNull();
  fireEvent.error(img);
  expect(img.style.color).toBe("");
  expect(img.parentElement?.querySelector("[data-blur-image-placeholder]")).toBeNull();
  expect(img.style.backgroundImage).toBe("");
  expect(onError).toHaveBeenCalledOnce();
});

test("accepts string width/height attributes for the placeholder SVG", () => {
  using view = renderResource(
    <BlurImage
      alt="Nova"
      blurDataUrl={BLUR}
      height="120"
      src="https://example.com/photo.jpg"
      width="240"
    />,
  );
  const img = htmlImage(view.getByAltText("Nova"));
  const placeholder = img.parentElement?.querySelector<HTMLImageElement>(
    "[data-blur-image-placeholder]",
  );
  expect(img.getAttribute("width")).toBe("240");
  expect(img.getAttribute("height")).toBe("120");
  expect(placeholder?.src).toContain("data:image/svg+xml");
});

test("renders without a tracked src key when src is omitted", () => {
  using view = renderResource(<BlurImage alt="Nova" blurDataUrl={BLUR} />);
  expect(view.getByAltText("Nova")).toBeTruthy();
});

test("server HTML starts the real src beneath a foreground placeholder", () => {
  const html = renderToString(
    <BlurImage alt="Nova" blurDataUrl={BLUR} src="https://cdn.example/full.jpg" />,
  );

  expect(html).toContain('src="https://cdn.example/full.jpg"');
  expect(html).toContain(BLUR);
  expect(html).toContain("data:image/svg+xml");
  expect(html).toContain("color:transparent");
  expect(html).toContain("data-blur-image-wrapper");
  expect(html).toContain("data-blur-image-placeholder");
  expect(html.match(/<img\b/g)).toHaveLength(2);
  expect(html.indexOf('src="https://cdn.example/full.jpg"')).toBeLessThan(
    html.indexOf("data-blur-image-placeholder"),
  );
});
