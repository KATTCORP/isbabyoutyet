import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { Coachmark } from "./coachmark";
import { renderResource } from "@/test/renderResource";
import { createMatchMediaStub, stubJsdomWindow } from "@/test/stubJsdomWindow";

test("scrolls the target into view and can hide the tip", async () => {
  const onDismiss = vi.fn<() => void>();
  const scrollIntoView = vi.fn<() => void>();
  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "share_link");
  target.textContent = "Share";
  target.scrollIntoView = scrollIntoView;
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({ bottom: 72, height: 32, left: 40, right: 120, top: 40, width: 80 }),
  });
  document.body.append(target);

  await using _view = renderResource(
    <Coachmark
      completeOnDismiss={undefined}
      description="Copy the page URL for family."
      onComplete={undefined}
      onDismiss={onDismiss}
      targetId="share_link"
      title="Share the link"
    />,
  );

  expect(scrollIntoView).toHaveBeenCalled();
  expect(screen.getByText("Share the link")).toBeTruthy();
  fireEvent.click(target);
  expect(onDismiss).toHaveBeenCalledOnce();
  onDismiss.mockClear();
  fireEvent.click(screen.getByRole("button", { name: /hide tip/i }));
  expect(onDismiss).toHaveBeenCalledOnce();

  target.remove();
});

test("Got it completes the step when completeOnDismiss is set", async () => {
  const onDismiss = vi.fn<() => void>();
  const onComplete = vi.fn<() => void>();
  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "explore_settings");
  target.scrollIntoView = vi.fn<() => void>();
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({ bottom: 72, height: 32, left: 40, right: 120, top: 40, width: 80 }),
  });
  document.body.append(target);

  await using _view = renderResource(
    <Coachmark
      completeOnDismiss
      description="Themes, names, and language — all in Settings."
      onComplete={onComplete}
      onDismiss={onDismiss}
      targetId="explore_settings"
      title="Peek at settings"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /got it/i }));
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledOnce();

  target.remove();
});

test("appears when its target mounts after the coachmark", async () => {
  await using _view = renderResource(
    <Coachmark
      completeOnDismiss={undefined}
      description="Mounted after the coachmark."
      onComplete={undefined}
      onDismiss={() => undefined}
      targetId="late-target"
      title="Late target"
    />,
  );
  expect(screen.queryByText("Late target")).toBeNull();

  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "late-target");
  target.scrollIntoView = vi.fn<() => void>();
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({ bottom: 72, height: 32, left: 40, right: 120, top: 40, width: 80 }),
  });
  document.body.append(target);
  await using _target = makeResource({}, () => target.remove());

  await vi.waitFor(() => {
    expect(screen.getByText("Late target")).toBeTruthy();
  });
});

test("hides the tip while the target has a zero-size rect", async () => {
  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "collapsed-target");
  target.scrollIntoView = vi.fn<() => void>();
  let rect = { bottom: 40, height: 0, left: 40, right: 40, top: 40, width: 0 };
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => rect,
  });
  document.body.append(target);
  await using _target = makeResource({}, () => target.remove());

  await using _view = renderResource(
    <Coachmark
      completeOnDismiss={undefined}
      description="Should stay hidden until sized."
      onComplete={undefined}
      onDismiss={() => undefined}
      targetId="collapsed-target"
      title="Collapsed target"
    />,
  );

  expect(screen.queryByText("Collapsed target")).toBeNull();

  rect = { bottom: 72, height: 32, left: 40, right: 120, top: 40, width: 80 };
  window.dispatchEvent(new Event("resize"));

  await vi.waitFor(() => {
    expect(screen.getByText("Collapsed target")).toBeTruthy();
  });

  rect = { bottom: 40, height: 0, left: 40, right: 40, top: 40, width: 0 };
  window.dispatchEvent(new Event("resize"));

  await vi.waitFor(() => {
    expect(screen.queryByText("Collapsed target")).toBeNull();
  });
});

test("uses a bounded mobile card on narrow viewports", async () => {
  const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  await using _matchMedia = makeResource({}, () => {
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
  const mediaQuery = createMatchMediaStub("(max-width: 767px)", true);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn<(query: string) => ReturnType<typeof createMatchMediaStub>>(() => mediaQuery),
  });

  const onDismiss = vi.fn<() => void>();
  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "share_link");
  target.scrollIntoView = vi.fn<() => void>();
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({ bottom: 72, height: 32, left: 40, right: 120, top: 40, width: 80 }),
  });
  document.body.append(target);
  await using _target = makeResource({}, () => target.remove());

  await using _view = renderResource(
    <Coachmark
      completeOnDismiss={undefined}
      description="Copy the page URL for family."
      onComplete={undefined}
      onDismiss={onDismiss}
      targetId="share_link"
      title="Share the link"
    />,
  );

  const dialog = screen.getByRole("dialog", { name: "Share the link" });
  await vi.waitFor(() => {
    expect(dialog.className).toContain("max-w-xs");
  });
  fireEvent.click(screen.getByRole("button", { name: /hide tip/i }));
  expect(onDismiss).toHaveBeenCalledOnce();
});

test("still highlights the target when matchMedia is missing", async () => {
  await using _window = stubJsdomWindow();
  const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  await using _matchMedia = makeResource({}, () => {
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: undefined,
  });

  const onDismiss = vi.fn<() => void>();
  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "share_link");
  target.textContent = "Share";
  target.scrollIntoView = vi.fn<() => void>();
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({ bottom: 72, height: 32, left: 40, right: 120, top: 40, width: 80 }),
  });
  document.body.append(target);
  await using _target = makeResource({}, () => target.remove());

  await using _view = renderResource(
    <Coachmark
      completeOnDismiss={undefined}
      description="Copy the page URL for family."
      onComplete={undefined}
      onDismiss={onDismiss}
      targetId="share_link"
      title="Share the link"
    />,
  );

  expect(screen.getByText("Share the link")).toBeTruthy();
  fireEvent.click(target);
  expect(onDismiss).toHaveBeenCalledOnce();
});
