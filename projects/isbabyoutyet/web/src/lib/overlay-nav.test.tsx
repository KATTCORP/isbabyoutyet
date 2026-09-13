import { act, fireEvent } from "@testing-library/react";
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { Form, FormGuardProvider, useZodForm } from "@/components/Form";
import { LocaleProvider } from "@/lib/i18n";
import { renderResource } from "@/test/renderResource";
import {
  closeOverlayLink,
  dismissOverlay,
  openOverlayLink,
  useBabyPostOverlay,
  useBabyPostOverlayLinks,
} from "@/lib/overlay-nav";
import type { LinkProps } from "@tanstack/react-router";

type BabyPostOverlayRef = {
  current: ReturnType<typeof useBabyPostOverlay> | null;
};

test("openOverlayLink preloads through a real link and keeps overlay history", () => {
  expect(
    openOverlayLink({
      params: { publicId: "baby-smith" },
      to: "/baby/$publicId/post",
    }),
  ).toEqual({
    params: { publicId: "baby-smith" },
    preload: "viewport",
    resetScroll: false,
    state: { overlay: true },
    to: "/baby/$publicId/post",
  });
});

test("closeOverlayLink replaces to the close target without scroll reset", () => {
  expect(
    closeOverlayLink({
      params: { publicId: "baby-smith" },
      to: "/baby/$publicId",
    }),
  ).toEqual({
    params: { publicId: "baby-smith" },
    replace: true,
    resetScroll: false,
    to: "/baby/$publicId",
  });
});

test("dismissOverlay prefers history.back when the overlay was push-opened", () => {
  const back = vi.fn<(options: { ignoreBlocker: boolean }) => void>();
  const navigate = vi.fn<(opts: LinkProps) => void>();
  const closeLink = closeOverlayLink({
    params: { publicId: "baby-smith" },
    to: "/baby/$publicId",
  });

  dismissOverlay({
    closeLink,
    history: {
      back,
      canGoBack: () => true,
      location: { state: { overlay: true } },
    },
    ignoreBlocker: true,
    navigate,
  });

  expect(back).toHaveBeenCalledExactlyOnceWith({ ignoreBlocker: true });
  expect(navigate).not.toHaveBeenCalled();
});

test("dismissOverlay navigates with closeLink without overlay history", () => {
  const back = vi.fn<(options: { ignoreBlocker: boolean }) => void>();
  const navigate = vi.fn<(opts: LinkProps) => void>();
  const closeLink = closeOverlayLink({
    params: { publicId: "baby-smith" },
    to: "/baby/$publicId",
  });

  dismissOverlay({
    closeLink,
    history: {
      back,
      canGoBack: () => true,
      location: { state: { overlay: undefined } },
    },
    ignoreBlocker: true,
    navigate,
  });

  expect(back).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith({ ...closeLink, ignoreBlocker: true });
});

test("dismissOverlay navigates with closeLink when history cannot go back", () => {
  const back = vi.fn<(options: { ignoreBlocker: boolean }) => void>();
  const navigate = vi.fn<(opts: LinkProps) => void>();
  const closeLink = closeOverlayLink({
    params: { publicId: "baby-smith" },
    to: "/baby/$publicId",
  });

  dismissOverlay({
    closeLink,
    history: {
      back,
      canGoBack: () => false,
      location: { state: { overlay: true } },
    },
    ignoreBlocker: false,
    navigate,
  });

  expect(back).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith({ ...closeLink, ignoreBlocker: false });
});

test("route overlay owns enter/exit state and goes back past blockers after the exit animation", async () => {
  const frames: Array<FrameRequestCallback> = [];
  const requestFrame = vi
    .spyOn(globalThis, "requestAnimationFrame")
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  const cancelFrame = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  await using _animationFrame = makeResource({}, () => {
    requestFrame.mockRestore();
    cancelFrame.mockRestore();
  });

  const latest: BabyPostOverlayRef = { current: null };
  function Harness() {
    latest.current = useBabyPostOverlay("baby-smith");
    return null;
  }

  const history = createMemoryHistory({ initialEntries: ["/"] });
  history.push("/post", { overlay: true });
  const back = vi.spyOn(history, "back");
  const rootRoute = createRootRoute({
    component: Harness,
  });
  const router = createRouter({
    defaultPendingMinMs: 0,
    history,
    routeTree: rootRoute,
  });
  await router.load();
  await using _view = renderResource(<RouterProvider router={router} />);

  expect(latest.current?.open).toBe(false);
  expect(latest.current?.rootProps.open).toBe(false);
  act(() => {
    frames[0]?.(0);
  });
  expect(latest.current?.open).toBe(true);
  act(() => {
    latest.current?.close();
  });
  expect(latest.current?.open).toBe(false);
  expect(back).not.toHaveBeenCalled();

  const overlay = latest.current;
  if (!overlay) {
    throw new Error("expected overlay nav");
  }
  act(() => {
    overlay.rootProps.onOpenChangeComplete(false);
  });
  expect(back).toHaveBeenCalledExactlyOnceWith({ ignoreBlocker: true });
});

/**
 * Real baby page + post overlay routes: the layout renders the nav-style
 * links hook, the child route mounts the guarded dialog with a form.
 */
function createPostOverlayRouter(history: RouterHistory) {
  const rootRoute = createRootRoute({
    component: () => (
      <LocaleProvider locale="en-GB">
        <Outlet />
      </LocaleProvider>
    ),
  });
  const babyRoute = createRoute({
    component: function BabyLayout() {
      const links = useBabyPostOverlayLinks("baby-smith");
      return (
        <>
          <button onClick={links.dismiss} type="button">
            NavDismiss
          </button>
          <Outlet />
        </>
      );
    },
    getParentRoute: () => rootRoute,
    path: "/baby/$publicId",
  });
  const postRoute = createRoute({
    component: function PostOverlay() {
      const post = useBabyPostOverlay("baby-smith");
      const form = useZodForm({
        defaultValues: { note: "" },
        schema: z.object({ note: z.string() }),
      });
      return (
        <Dialog {...post.rootProps}>
          <DialogContent>
            <DialogTitle>Post</DialogTitle>
            <FormGuardProvider guard={post.guard}>
              <Form form={form} handleSubmit={async () => undefined}>
                <input aria-label="Note" {...form.register("note")} />
              </Form>
            </FormGuardProvider>
          </DialogContent>
        </Dialog>
      );
    },
    getParentRoute: () => babyRoute,
    path: "/post",
  });
  return createRouter({
    defaultPendingMinMs: 0,
    history,
    routeTree: rootRoute.addChildren([babyRoute.addChildren([postRoute])]),
  });
}

function clickDialogBackdrop(baseElement: Element) {
  const backdrop = baseElement.querySelector("[data-slot=dialog-overlay]");
  if (!backdrop) {
    throw new Error("dialog backdrop missing");
  }
  fireEvent.pointerDown(backdrop, { pointerType: "mouse" });
  fireEvent.mouseDown(backdrop);
  fireEvent.mouseUp(backdrop);
  fireEvent.click(backdrop);
}

test("discarding a dirty overlay on a cold load replaces to the parent despite the navigation guard", async () => {
  const history = createMemoryHistory({ initialEntries: ["/baby/baby-smith/post"] });
  const router = createPostOverlayRouter(history);
  await router.load();
  await using view = renderResource(<RouterProvider router={router} />);

  await vi.waitFor(() => {
    expect(view.getByRole("dialog")).toBeTruthy();
  });
  fireEvent.change(view.getByLabelText("Note"), { target: { value: "draft" } });
  clickDialogBackdrop(view.baseElement);
  await vi.waitFor(() => {
    expect(view.getByRole("alertdialog")).toBeTruthy();
  });
  expect(router.state.location.pathname).toBe("/baby/baby-smith/post");

  fireEvent.click(view.getByRole("button", { name: "Discard" }));

  await vi.waitFor(() => {
    expect(router.state.location.pathname).toBe("/baby/baby-smith");
  });
  expect(view.queryByRole("dialog")).toBeNull();
});

/** jsdom `window.history`: `back()` fires `popstate`, where TanStack runs blockers. */
function browserHistoryResource(initialPath: string) {
  window.history.replaceState(null, "", initialPath);
  const history = createBrowserHistory({ window });
  return makeResource(history, () => {
    history.destroy?.();
    window.history.replaceState(null, "", "/");
  });
}

test("discarding a dirty push-opened overlay goes back past the navigation guard", async () => {
  await using history = browserHistoryResource("/baby/baby-smith");
  history.push("/baby/baby-smith/post", { overlay: true });
  history.flush?.();
  await Promise.resolve();
  const router = createPostOverlayRouter(history);
  await router.load();
  await using view = renderResource(<RouterProvider router={router} />);

  await vi.waitFor(() => {
    expect(view.getByRole("dialog")).toBeTruthy();
  });
  expect(window.location.pathname).toBe("/baby/baby-smith/post");
  fireEvent.change(view.getByLabelText("Note"), { target: { value: "draft" } });
  clickDialogBackdrop(view.baseElement);
  await vi.waitFor(() => {
    expect(view.getByRole("alertdialog")).toBeTruthy();
  });

  fireEvent.click(view.getByRole("button", { name: "Discard" }));

  await vi.waitFor(() => {
    expect(window.location.pathname).toBe("/baby/baby-smith");
    expect(router.state.location.pathname).toBe("/baby/baby-smith");
  });
  expect(view.queryByRole("dialog")).toBeNull();
});

test("a layout's dismiss asks the mounted overlay to close through its guard", async () => {
  const history = createMemoryHistory({ initialEntries: ["/baby/baby-smith"] });
  history.push("/baby/baby-smith/post", { overlay: true });
  const router = createPostOverlayRouter(history);
  await router.load();
  await using view = renderResource(<RouterProvider router={router} />);

  await vi.waitFor(() => {
    expect(view.getByRole("dialog")).toBeTruthy();
  });
  fireEvent.change(view.getByLabelText("Note"), { target: { value: "draft" } });

  // Dirty: the nav toggle prompts instead of yanking history.
  fireEvent.click(view.getByRole("button", { hidden: true, name: "NavDismiss" }));
  await vi.waitFor(() => {
    expect(view.getByRole("alertdialog")).toBeTruthy();
  });
  expect(router.state.location.pathname).toBe("/baby/baby-smith/post");
  fireEvent.click(view.getByRole("button", { name: "Keep editing" }));
  await vi.waitFor(() => {
    expect(view.queryByRole("alertdialog")).toBeNull();
  });
  expect(view.getByRole("dialog")).toBeTruthy();

  // Discarding from the same toggle closes the overlay and goes back.
  fireEvent.click(view.getByRole("button", { hidden: true, name: "NavDismiss" }));
  fireEvent.click(view.getByRole("button", { name: "Discard" }));
  await vi.waitFor(() => {
    expect(router.state.location.pathname).toBe("/baby/baby-smith");
  });
  expect(view.queryByRole("dialog")).toBeNull();
});

test("a layout's dismiss falls back to history when no overlay is mounted", async () => {
  const history = createMemoryHistory({ initialEntries: ["/baby/baby-smith"] });
  history.push("/baby/baby-smith/post", { overlay: true });
  const back = vi.spyOn(history, "back");
  const rootRoute = createRootRoute({
    component: function Layout() {
      const links = useBabyPostOverlayLinks("baby-smith");
      return (
        <button onClick={links.dismiss} type="button">
          NavDismiss
        </button>
      );
    },
  });
  const router = createRouter({ defaultPendingMinMs: 0, history, routeTree: rootRoute });
  await router.load();
  await using view = renderResource(<RouterProvider router={router} />);

  fireEvent.click(view.getByRole("button", { hidden: true, name: "NavDismiss" }));
  expect(back).toHaveBeenCalledExactlyOnceWith({ ignoreBlocker: false });
});
