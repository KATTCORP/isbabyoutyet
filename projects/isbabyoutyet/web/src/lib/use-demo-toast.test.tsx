import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Toaster, toast } from "sonner";
import {
  HOMEPAGE_DEMO_BABIES,
  HOMEPAGE_DEMO_BABY,
} from "@isbabyoutyet/backend/src/seedCredentials";
import { makeAsyncResource, makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { resetDemoToastDismissals, useDemoToast } from "./use-demo-toast";
import { renderResource } from "@/test/renderResource";

function DemoToastHarness(props: { enabled: boolean; publicId: string }) {
  useDemoToast(props);
  return <Toaster closeButton />;
}

/** Sonner `deleteToast` calls `setToasts` after `TIME_BEFORE_UNMOUNT` (200ms). */
const SONNER_UNMOUNT_FLUSH_MS = 250;

function mountDemoToast(opts: { enabled: boolean; publicId: string }) {
  const view = renderResource(<DemoToastHarness enabled={opts.enabled} publicId={opts.publicId} />);
  return makeAsyncResource(view, async () => {
    toast.dismiss();
    view[Symbol.dispose]();
    // Flush the remove timeout while Vitest's jsdom is still alive. Otherwise
    // sonner setStates after environment teardown (`window is not defined`).
    await new Promise((resolve) => {
      setTimeout(resolve, SONNER_UNMOUNT_FLUSH_MS);
    });
  });
}

function renderDemoToast(opts: { enabled: boolean; publicId: string }) {
  resetDemoToastDismissals();
  toast.dismiss();
  return mountDemoToast(opts);
}

test("shows a persistent demo toast on the homepage demo baby", async () => {
  await using view = renderDemoToast({
    enabled: true,
    publicId: HOMEPAGE_DEMO_BABY.publicId,
  });
  void view;

  // English locale maps the key "This is a demo baby" → "This is a demo page"
  expect(await screen.findByText("This is a demo page")).toBeTruthy();
  expect(
    screen.getByText("Feel free to post test messages — we reset this demo daily."),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
});

test("does not show the toast when disabled or on a real baby", async () => {
  const info = vi.spyOn(toast, "info");
  await using _spy = makeResource({}, () => {
    info.mockRestore();
  });

  await using disabled = renderDemoToast({
    enabled: false,
    publicId: HOMEPAGE_DEMO_BABY.publicId,
  });
  void disabled;
  expect(info).not.toHaveBeenCalled();

  await using realBaby = renderDemoToast({
    enabled: true,
    publicId: "baby-waiting",
  });
  void realBaby;
  expect(info).not.toHaveBeenCalled();
});

test("shows the demo toast on every locale homepage baby", async () => {
  await using view = renderDemoToast({
    enabled: true,
    publicId: HOMEPAGE_DEMO_BABIES.sv.publicId,
  });
  void view;

  expect(await screen.findByRole("button", { name: "Got it" })).toBeTruthy();
});

test("Got it dismisses through sonner and stays gone for that baby", async () => {
  const dismiss = vi.spyOn(toast, "dismiss");
  await using _spy = makeResource({}, () => {
    dismiss.mockRestore();
  });
  await using view = renderDemoToast({
    enabled: true,
    publicId: HOMEPAGE_DEMO_BABY.publicId,
  });

  fireEvent.click(await screen.findByRole("button", { name: "Got it" }));

  await vi.waitFor(() => {
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
  });
  expect(dismiss).toHaveBeenCalled();

  view.rerender(<DemoToastHarness enabled={true} publicId={HOMEPAGE_DEMO_BABY.publicId} />);
  expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();

  view.rerender(<DemoToastHarness enabled={true} publicId={HOMEPAGE_DEMO_BABIES.sv.publicId} />);
  expect(await screen.findByRole("button", { name: "Got it" })).toBeTruthy();
});

test("unmounting does not persist dismiss for that baby", async () => {
  resetDemoToastDismissals();
  toast.dismiss();
  {
    await using first = mountDemoToast({
      enabled: true,
      publicId: HOMEPAGE_DEMO_BABY.publicId,
    });
    void first;
    expect(await screen.findByRole("button", { name: "Got it" })).toBeTruthy();
  }

  await using second = mountDemoToast({
    enabled: true,
    publicId: HOMEPAGE_DEMO_BABY.publicId,
  });
  void second;
  expect(await screen.findByRole("button", { name: "Got it" })).toBeTruthy();
});

test("closing the toast persists dismiss for that baby", async () => {
  await using view = renderDemoToast({
    enabled: true,
    publicId: HOMEPAGE_DEMO_BABY.publicId,
  });

  fireEvent.click(await screen.findByRole("button", { name: "Close toast" }));

  await vi.waitFor(() => {
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
  });

  view.rerender(<DemoToastHarness enabled={true} publicId={HOMEPAGE_DEMO_BABY.publicId} />);
  expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
});
