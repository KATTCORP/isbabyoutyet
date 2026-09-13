import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { stubJsdomWindow } from "@/test/stubJsdomWindow";

/**
 * RTL `render` plus jsdom host-API stubs, disposed with `await using`.
 *
 * Feature tests that do not go through `renderWithTestRouter` /
 * `renderWithConvexTest` / `renderMountedFileRoute` should use this instead of
 * calling `render()` directly.
 */
export function renderResource(ui: ReactElement, options: RenderOptions | undefined = undefined) {
  const jsdomWindow = stubJsdomWindow();
  try {
    const view = options === undefined ? render(ui) : render(ui, options);
    return makeResource(view, () => {
      view.unmount();
      jsdomWindow.restore();
    });
  } catch (error) {
    jsdomWindow.restore();
    throw error;
  }
}
