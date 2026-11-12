import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { keepScrollAnchor } from "./keep-scroll-anchor";

type AnchorPosition = {
  top: number;
};

/** An attached element whose on-screen top the test moves, and a spied `scrollBy` that moves it back. */
function anchorResource() {
  const anchor = document.createElement("div");
  document.body.append(anchor);
  const position: AnchorPosition = { top: 100 };
  vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() =>
    DOMRect.fromRect({ height: 50, width: 300, x: 0, y: position.top }),
  );
  const scrollBy = vi.fn<(options: ScrollToOptions) => void>((options) => {
    position.top -= options.top ?? 0;
  });
  const original = window.scrollBy;
  vi.stubGlobal("scrollBy", scrollBy);
  return makeResource({ anchor, position, scrollBy }, () => {
    anchor.remove();
    vi.stubGlobal("scrollBy", original);
  });
}

test("scrolls by however far the anchor moved, so it stays where it was", async () => {
  await using ctx = anchorResource();

  await keepScrollAnchor(ctx.anchor, async () => {
    ctx.position.top += 240;
  });

  expect(ctx.scrollBy).toHaveBeenCalledTimes(1);
  expect(ctx.scrollBy).toHaveBeenCalledWith({ behavior: "instant", top: 240 });
  expect(ctx.position.top).toBe(100);
});

test("corrects a move that lands a frame after the change settles", async () => {
  await using ctx = anchorResource();

  await keepScrollAnchor(ctx.anchor, async () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ctx.position.top += 80;
      });
    });
  });

  expect(ctx.scrollBy).toHaveBeenCalledWith({ behavior: "instant", top: 80 });
  expect(ctx.position.top).toBe(100);
});

test("leaves the scroll alone when the browser's own scroll anchoring kept it in place", async () => {
  await using ctx = anchorResource();

  await keepScrollAnchor(ctx.anchor, async () => {});

  expect(ctx.scrollBy).not.toHaveBeenCalled();
});

test("stops when the anchor leaves the document", async () => {
  await using ctx = anchorResource();

  await keepScrollAnchor(ctx.anchor, async () => {
    ctx.position.top += 240;
    ctx.anchor.remove();
  });

  expect(ctx.scrollBy).not.toHaveBeenCalled();
});
