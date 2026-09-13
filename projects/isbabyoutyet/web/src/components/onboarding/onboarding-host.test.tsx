import { fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { OnboardingStepId } from "@isbabyoutyet/backend/src/onboardingSteps";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { LocaleProvider } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser, postTestUpdate } from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { OnboardingHostWithSession, useCompleteOnboardingStep } from "./onboarding-host";

type CompleteOnboardingStep = (args: { stepId: OnboardingStepId }) => Promise<null>;
type CompleteStepHolder = {
  completeStep: CompleteOnboardingStep | null;
};

async function renderOnboardingHost(opts: {
  harness: Awaited<ReturnType<typeof createConvexTestHarness>>;
  session: { data: { user: { id: string } } | null; isPending: boolean };
  surface: "dashboard" | "baby";
}) {
  const onboarding = await opts.harness.convexPreloader.ensureQueryData(api.onboarding.getMine, {});
  return await renderWithTestRouter(
    <QueryClientProvider client={opts.harness.queryClient}>
      <ConvexProvider
        // @ts-expect-error — integration client is not ConvexReactClient
        client={opts.harness.convexClient}
      >
        <LocaleProvider locale="en-GB">
          <OnboardingHostWithSession
            enabled={undefined}
            onboarding={onboarding}
            session={opts.session}
            spotlight={undefined}
            surface={opts.surface}
          />
        </LocaleProvider>
      </ConvexProvider>
    </QueryClientProvider>,
    { path: "/" },
  );
}

function plantTourTarget(targetId: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("data-tour-id", targetId);
  el.textContent = targetId;
  el.style.cssText = "position:fixed;top:80px;left:80px;width:40px;height:40px;";
  el.scrollIntoView = () => {};
  el.getBoundingClientRect = () =>
    // SAFETY: Test fixture is a subset of the production type.
    ({
      bottom: 120,
      height: 40,
      left: 80,
      right: 120,
      toJSON: () => ({}),
      top: 80,
      width: 40,
      x: 80,
      y: 80,
    }) as DOMRect;
  document.body.append(el);
  return makeResource(el, () => {
    el.remove();
  });
}

async function seedAllOnboardingStepsDone(
  harness: Awaited<ReturnType<typeof createConvexTestHarness>>,
  babyId: Awaited<ReturnType<typeof seedOwnedBaby>>["babyId"],
) {
  await postTestUpdate(harness, {
    babyId,
    message: "First update",
  });
  for (const stepId of ["share_link", "explore_settings", "learn_encouragements"] as const) {
    await harness.client.mutation(api.onboarding.completeStep, { stepId });
  }
}

test("returns null for anonymous visitors", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const onboarding = await harness.convexPreloader.ensureQueryData(api.onboarding.getMine, {});

  await using view = await renderWithConvexTest({
    harness,
    ui: (
      <OnboardingHostWithSession
        enabled={undefined}
        onboarding={onboarding}
        session={{ data: null, isPending: false }}
        spotlight={undefined}
        surface="dashboard"
      />
    ),
    wrap: null,
  });

  expect(view.queryByText(/getting started/i)).toBeNull();
  expect(view.queryByRole("button", { name: "Dismiss guide" })).toBeNull();
});

test("shows the checklist on first run without a welcome dialog", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "dashboard",
  });

  expect(view.getAllByText("Add your first baby").length).toBeGreaterThan(0);
  expect(view.queryByRole("dialog", { name: /welcome/i })).toBeNull();
});

test("mounts authed onboarding host when progress is loaded", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "dashboard",
  });

  expect(view.getAllByText(/getting started/i).length).toBeGreaterThan(0);
});

test("minimizes the checklist through the host mutation", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "dashboard",
  });

  fireEvent.click(view.getByRole("button", { name: /^minimize$/i }));
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.minimized).toBe(true);
  });
  await vi.waitFor(() => {
    expect(view.queryByRole("button", { name: /^minimize$/i })).toBeNull();
  });
  fireEvent.click(view.getByRole("button", { name: /getting started: \d+ of 5 done\. expand\./i }));
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.minimized).toBe(false);
  });
});

test("highlights how to restore the guide after dismissal", async () => {
  await using _target = plantTourTarget("restart_tour");

  await using harness = await createConvexTestHarness({ identity: null });
  const scrollTo = vi.spyOn(window, "scrollTo");
  await using _scrollTo = makeResource({}, () => {
    scrollTo.mockRestore();
  });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "dashboard",
  });

  fireEvent.click(view.getAllByRole("button", { name: "Dismiss guide" })[0]!);
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.checklistDismissed).toBe(true);
  });
  await vi.waitFor(() => {
    expect(view.getByText("Guide dismissed")).toBeTruthy();
  });
  expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", top: 0 });

  fireEvent.click(view.getByRole("button", { name: "Hide tip" }));
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.restartHintVisible).toBe(false);
  });
});

test("renders the guide on any owner baby page", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });
  await seedOwnedBaby(harness, { dueDate: "2026-10-01", name: "Other" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "baby",
  });

  expect(view.getAllByText(/share the link/i).length).toBeGreaterThan(0);
});

test("keeps the coachmark tip hidden until a tip target is activated", async () => {
  await using _target = plantTourTarget("share_link");

  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "baby",
  });

  expect(view.queryByRole("button", { name: "Hide tip" })).toBeNull();
  expect(view.getAllByRole("button", { name: /show me/i }).length).toBeGreaterThan(0);
  expect(view.getAllByRole("button", { name: "Dismiss guide" }).length).toBeGreaterThan(0);
});

test("auto-dismisses the checklist shortly after all steps are done", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });

  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });
  await seedAllOnboardingStepsDone(harness, baby.babyId);

  await using _view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "dashboard",
  });

  await vi.advanceTimersByTimeAsync(4000);
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.checklistDismissed).toBe(true);
  });
});

test("auto-dismiss timer survives progress re-renders", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });

  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });
  await seedAllOnboardingStepsDone(harness, baby.babyId);

  await using _view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "dashboard",
  });

  await vi.advanceTimersByTimeAsync(2000);
  await harness.client.mutation(api.onboarding.setMinimized, { minimized: true });
  await vi.advanceTimersByTimeAsync(2000);

  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.checklistDismissed).toBe(true);
  });
});

test("Show me for settings scrolls, highlights, and completes on Got it", async () => {
  await using _target = plantTourTarget("explore_settings");

  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });
  await postTestUpdate(harness, {
    babyId: baby.babyId,
    message: "First update",
  });
  await harness.client.mutation(api.onboarding.completeStep, { stepId: "share_link" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "baby",
  });

  fireEvent.click(view.getAllByRole("button", { name: /show me/i })[0]!);
  await vi.waitFor(() => {
    expect(view.getByRole("button", { name: "Got it" })).toBeTruthy();
  });
  expect(view.getByText("Peek at settings")).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Got it" }));
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.completedSteps).toContain("explore_settings");
    expect(progress.activeCoachmarkStepId).toBeNull();
  });
});

test("Show me for share scrolls the tour target into view", async () => {
  await using target = plantTourTarget("share_link");
  const scrollIntoView = vi.fn();
  target.scrollIntoView = scrollIntoView;

  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "baby",
  });

  fireEvent.click(view.getAllByRole("button", { name: /show me/i })[0]!);
  await vi.waitFor(() => {
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  });
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.activeCoachmarkStepId).toBe("share_link");
  });
});

test("Show me activates the tip even when the tour target is not in the DOM", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "baby",
  });

  fireEvent.click(view.getAllByRole("button", { name: /show me/i })[0]!);
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.activeCoachmarkStepId).toBe("share_link");
  });
});

test("messages-from-visitors tip scrolls, highlights, and completes on Got it without posting", async () => {
  await using _target = plantTourTarget("learn_encouragements");

  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });
  await postTestUpdate(harness, {
    babyId: baby.babyId,
    message: "First update",
  });
  for (const stepId of ["share_link", "explore_settings"] as const) {
    await harness.client.mutation(api.onboarding.completeStep, { stepId });
  }

  const encouragementsBefore = await harness.client.query(api.encouragements.listByBaby, {
    babyId: baby.babyId,
    paginationOpts: { cursor: null, numItems: 20 },
    visitorId: null,
  });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "baby",
  });

  fireEvent.click(view.getAllByRole("button", { name: /show me/i })[0]!);
  await vi.waitFor(() => {
    expect(view.getByRole("button", { name: "Got it" })).toBeTruthy();
  });
  expect(view.getByText("Messages from visitors")).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Got it" }));
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.completedSteps).toContain("learn_encouragements");
    expect(progress.activeCoachmarkStepId).toBeNull();
  });

  const encouragementsAfter = await harness.client.query(api.encouragements.listByBaby, {
    babyId: baby.babyId,
    paginationOpts: { cursor: null, numItems: 20 },
    visitorId: null,
  });
  expect(encouragementsAfter.page).toEqual(encouragementsBefore.page);
});

test("authed onboarding host wires Convex mutations into the view", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "dashboard",
  });

  expect(view.getAllByText(/getting started/i).length).toBeGreaterThan(0);
});

test("useCompleteOnboardingStep returns the Convex mutation", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });

  const holder: CompleteStepHolder = { completeStep: null };
  function Probe() {
    holder.completeStep = useCompleteOnboardingStep();
    return null;
  }

  await using _view = await renderWithConvexTest({
    harness,
    ui: <Probe />,
    wrap: null,
  });

  expect(holder.completeStep).toEqual(expect.any(Function));
  await holder.completeStep!({ stepId: "share_link" });
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.completedSteps).toContain("share_link");
  });
});

test("baby-page settings tip completes through the host Show me action", async () => {
  await using _target = plantTourTarget("explore_settings");

  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Smith" });
  await harness.client.mutation(api.onboarding.completeStep, { stepId: "add_baby" });
  await harness.client.mutation(api.onboarding.completeStep, { stepId: "share_link" });
  await harness.client.mutation(api.onboarding.completeStep, { stepId: "post_update" });

  await using view = await renderOnboardingHost({
    harness,
    session: { data: { user: { id: userId } }, isPending: false },
    surface: "baby",
  });

  fireEvent.click(view.getAllByRole("button", { name: /show me/i })[0]!);
  await vi.waitFor(() => {
    expect(view.getByRole("button", { name: "Got it" })).toBeTruthy();
  });
  fireEvent.click(view.getByRole("button", { name: "Got it" }));
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.completedSteps).toContain("explore_settings");
  });
});
