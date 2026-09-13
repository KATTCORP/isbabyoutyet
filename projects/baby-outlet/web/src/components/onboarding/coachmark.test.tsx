import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { Coachmark } from "./coachmark";

function renderResource(ui: React.ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("scrolls the target into view and can hide the tip", async () => {
  const onDismiss = vi.fn<() => void>();
  const scrollIntoView = vi.fn<() => void>();
  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "share_link");
  target.textContent = "Share";
  target.scrollIntoView = scrollIntoView;
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({ top: 40, left: 40, width: 80, height: 32, bottom: 72, right: 120 }),
  });
  document.body.appendChild(target);

  await using _view = renderResource(
    <Coachmark
      targetId="share_link"
      title="Share the link"
      description="Copy the page URL for family."
      onDismiss={onDismiss}
      completeOnDismiss={undefined}
      onComplete={undefined}
    />,
  );

  expect(scrollIntoView).toHaveBeenCalled();
  expect(screen.getByText("Share the link")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /hide tip/i }));
  expect(onDismiss).toHaveBeenCalledOnce();

  target.remove();
});

test("Got it completes the step when completeOnDismiss is set", async () => {
  const onDismiss = vi.fn<() => void>();
  const onComplete = vi.fn<() => void>();
  const target = document.createElement("button");
  target.setAttribute("data-tour-id", "learn_encouragements");
  target.scrollIntoView = vi.fn<() => void>();
  Object.defineProperty(target, "getBoundingClientRect", {
    value: () => ({ top: 40, left: 40, width: 80, height: 32, bottom: 72, right: 120 }),
  });
  document.body.appendChild(target);

  await using _view = renderResource(
    <Coachmark
      targetId="learn_encouragements"
      title="Encouragements"
      description="Visitors can leave notes."
      onDismiss={onDismiss}
      completeOnDismiss
      onComplete={onComplete}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /got it/i }));
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledOnce();

  target.remove();
});
