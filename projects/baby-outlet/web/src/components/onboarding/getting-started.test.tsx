import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { GettingStartedCard } from "./getting-started";
import { htmlElement } from "@/test/htmlElement";

test("shows the next incomplete step and an add-baby CTA on the dashboard", async () => {
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={[]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={null}
    />,
  );

  expect(screen.getAllByText("Add your first baby").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/choose a journey/i).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: /add a baby/i }).length).toBeGreaterThan(0);
});

test("keeps mobile first-use guidance compact until the user opens the checklist", async () => {
  const onDismiss = vi.fn<() => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={[]}
      minimized={false}
      onDismiss={onDismiss}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={null}
    />,
  );

  const expand = screen.getByRole("button", {
    name: /getting started: 0 of 5 done. expand/i,
  });
  const mobileDock = screen.getAllByRole("complementary", {
    name: "Getting started checklist",
  })[0];
  if (!mobileDock) {
    throw new Error("Expected a compact mobile guide");
  }
  expect(within(mobileDock).queryByRole("link", { name: /add a baby/i })).toBeNull();
  fireEvent.click(expand);

  const drawer = await screen.findByRole("dialog", { name: "Getting started" });
  expect(within(drawer).getByText("Tap a step to jump there")).toBeTruthy();
  expect(within(drawer).getByRole("button", { name: "Dismiss guide" })).toBeTruthy();
  fireEvent.click(within(drawer).getByRole("button", { name: /close checklist/i }));
  await vi.waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Getting started" })).toBeNull();
  });
  expect(onDismiss).not.toHaveBeenCalled();

  fireEvent.click(expand);
  const reopenedDrawer = await screen.findByRole("dialog", { name: "Getting started" });
  fireEvent.click(within(reopenedDrawer).getByRole("button", { name: "Dismiss guide" }));
  await vi.waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Getting started" })).toBeNull();
  });
  expect(onDismiss).toHaveBeenCalledOnce();
});

test("dismisses the guide from the explicit labeled action", async () => {
  const onDismiss = vi.fn<() => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={[]}
      minimized={false}
      onDismiss={onDismiss}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={null}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Dismiss guide" }));
  expect(onDismiss).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("anchors the mobile dock and drawer to the visual viewport", async () => {
  const innerHeightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight");
  const visualViewportDescriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");
  await using _viewport = makeResource({}, () => {
    if (innerHeightDescriptor) {
      Object.defineProperty(window, "innerHeight", innerHeightDescriptor);
    } else {
      Reflect.deleteProperty(window, "innerHeight");
    }
    if (visualViewportDescriptor) {
      Object.defineProperty(window, "visualViewport", visualViewportDescriptor);
    } else {
      Reflect.deleteProperty(window, "visualViewport");
    }
  });

  // SAFETY: Test fixture is a subset of the production type.
  const visualViewport = Object.assign(new EventTarget(), {
    height: 844,
    offsetLeft: 0,
    offsetTop: 0,
    width: 390,
  }) as VisualViewport;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 959 });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: visualViewport,
  });

  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={[]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={null}
    />,
  );

  const mobileDock = screen.getAllByRole("complementary", {
    name: "Getting started checklist",
  })[0];
  expect(mobileDock?.style.getPropertyValue("--visual-viewport-bottom")).toBe("115px");

  fireEvent.click(
    screen.getByRole("button", {
      name: /getting started: 0 of 5 done. expand/i,
    }),
  );
  await screen.findByRole("dialog", { name: "Getting started" });
  const drawer = document.querySelector<HTMLElement>('[data-slot="drawer-popup"]');
  expect(drawer?.style.bottom).toBe("115px");
  expect(drawer?.style.left).toBe("0px");
  expect(drawer?.style.width).toBe("390px");

  Object.defineProperty(visualViewport, "height", { configurable: true, value: 800 });
  act(() => {
    visualViewport.dispatchEvent(new Event("resize"));
  });
  expect(mobileDock?.style.getPropertyValue("--visual-viewport-bottom")).toBe("159px");
});

test("dashboard baby-page steps link to the preferred baby's page (not overlays)", async () => {
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  const links = screen.getAllByRole("link", { name: /see ada's page/i });
  expect(links.length).toBeGreaterThan(0);
  expect(links[0]?.getAttribute("href")).toBe("/baby/baby-waiting");
});

test("dashboard post-update step links to the preferred baby's page", async () => {
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  const links = screen.getAllByRole("link", { name: /see ada's page/i });
  expect(links.length).toBeGreaterThan(0);
  expect(links[0]?.getAttribute("href")).toBe("/baby/baby-waiting");
});

test("baby-page Show me is a no-op when onGoToStep is missing", async () => {
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="baby"
      tourBaby={null}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /show me/i })[0]!);
  expect(screen.getAllByRole("button", { name: /show me/i }).length).toBeGreaterThan(0);
});

test("baby-page share step highlights via Show me", async () => {
  const onGoToStep = vi.fn<(stepId: string) => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={onGoToStep}
      onMinimize={vi.fn<() => void>()}
      surface="baby"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /show me/i })[0]!);
  expect(onGoToStep).toHaveBeenCalledWith("share_link");
});

test("minimized chip shows progress count", async () => {
  const onMinimize = vi.fn<(minimized: boolean) => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link"]}
      minimized
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={onMinimize}
      surface="baby"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /2 of 5 done/i }));
  expect(onMinimize).toHaveBeenCalledWith(false);
});

test("desktop Minimize collapses the checklist panel", async () => {
  const onMinimize = vi.fn<(minimized: boolean) => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={onMinimize}
      surface="dashboard"
      tourBaby={null}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /^minimize$/i }));
  expect(onMinimize).toHaveBeenCalledWith(true);
});

test("dashboard settings CTA opens the preferred baby's page without completing", async () => {
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link", "post_update"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  const links = screen.getAllByRole("link", { name: /see ada's page/i });
  expect(links[0]?.getAttribute("href")).toBe("/baby/baby-waiting");
  fireEvent.click(links[0]!);
});

test("baby-page checklist uses Show me for post and settings tips", async () => {
  const onGoToStep = vi.fn<(stepId: string) => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={onGoToStep}
      onMinimize={vi.fn<() => void>()}
      surface="baby"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /show me/i })[0]!);
  expect(onGoToStep).toHaveBeenCalledWith("post_update");
});

test("baby-page Show me works without a preferred tour baby", async () => {
  const onGoToStep = vi.fn<(stepId: string) => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={onGoToStep}
      onMinimize={vi.fn<() => void>()}
      surface="baby"
      tourBaby={null}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /show me/i })[0]!);
  expect(onGoToStep).toHaveBeenCalledWith("post_update");
});

test("all-done state offers close checklist", async () => {
  const onDismiss = vi.fn<() => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={[
        "add_baby",
        "share_link",
        "post_update",
        "explore_settings",
        "learn_encouragements",
      ]}
      minimized={false}
      onDismiss={onDismiss}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="baby"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  expect(screen.getAllByText(/you're all set/i)).toHaveLength(2);
  const closeButton = screen.getAllByRole("button", { name: /close checklist/i })[0];
  if (!closeButton) {
    throw new Error("Expected a close checklist button");
  }
  fireEvent.click(closeButton);
  expect(onDismiss).toHaveBeenCalledOnce();
});

test("dashboard learn encouragements step links to the first baby's page", async () => {
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link", "post_update", "explore_settings"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  const links = screen.getAllByRole("link", { name: /see ada's page/i });
  expect(links.length).toBeGreaterThan(0);
  expect(links[0]?.getAttribute("href")).toContain("baby-waiting");
});

test("baby-page learn encouragements opens the highlight tip via Show me", async () => {
  const onGoToStep = vi.fn<(stepId: string) => void>();
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link", "post_update", "explore_settings"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={onGoToStep}
      onMinimize={vi.fn<() => void>()}
      surface="baby"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /show me/i })[0]!);
  expect(onGoToStep).toHaveBeenCalledWith("learn_encouragements");
});

test("next-step hint Show me runs the baby-page highlight action", async () => {
  const onGoToStep = vi.fn<(stepId: string) => void>();

  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link", "post_update", "explore_settings"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={onGoToStep}
      onMinimize={vi.fn<() => void>()}
      surface="baby"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  const showMeButtons = screen.getAllByRole("button", { name: /show me/i });
  expect(showMeButtons.length).toBeGreaterThan(1);
  fireEvent.click(showMeButtons[1]!);
  expect(onGoToStep).toHaveBeenCalledWith("learn_encouragements");
});

test("next-step hint See page runs the dashboard deep link", async () => {
  await using _view = await renderWithTestRouter(
    <GettingStartedCard
      className={undefined}
      effectiveSteps={["add_baby", "share_link", "post_update"]}
      minimized={false}
      onDismiss={vi.fn<() => void>()}
      onGoToStep={undefined}
      onMinimize={vi.fn<() => void>()}
      surface="dashboard"
      tourBaby={{ name: "Ada", publicId: "baby-waiting" }}
    />,
  );

  const hintTitles = screen.getAllByText("Peek at settings");
  expect(hintTitles.length).toBeGreaterThan(0);
  const hintPanel = hintTitles.at(-1)!.closest("div.rounded-lg");
  expect(hintPanel).toBeTruthy();
  const seePage =
    within(htmlElement(hintPanel)).queryByRole("link", { name: /see ada's page/i }) ||
    within(htmlElement(hintPanel)).getByRole("button", { name: /see ada's page/i });
  expect(seePage.getAttribute("href") ?? "").toContain("baby-waiting");
  fireEvent.click(seePage);
});
