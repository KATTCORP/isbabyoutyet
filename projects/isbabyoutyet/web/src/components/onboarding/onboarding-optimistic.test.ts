import { expect, test } from "vitest";
import type { OptimisticLocalStore } from "convex/browser";
import {
  optimisticallyCompleteStep,
  optimisticallyDismissChecklist,
  optimisticallySetActiveCoachmarkStepId,
  optimisticallySetMinimized,
  optimisticallySetRestartHintVisible,
  patchOnboardingMine,
  type OnboardingProgress,
} from "./onboarding-optimistic";

const base: OnboardingProgress = {
  activeCoachmarkStepId: "share_link",
  allDone: false,
  checklistDismissed: false,
  completedSteps: [],
  effectiveSteps: ["add_baby"],
  hasBaby: true,
  hasUpdate: false,
  minimized: false,
  restartHintVisible: false,
  tourBaby: { name: "Juniper", publicId: "juniper" },
  welcomeDismissed: false,
};

function createMineStore(seed: OnboardingProgress | undefined) {
  let value = seed;
  const store = {
    getQuery(...args: [unknown, unknown]) {
      expect(args[1]).toEqual({});
      return value;
    },
    read() {
      return value;
    },
    setQuery(...args: [unknown, unknown, OnboardingProgress]) {
      expect(args[1]).toEqual({});
      value = args[2];
    },
  };
  // SAFETY: Test fixture is a subset of the production type.
  return store as OptimisticLocalStore & {
    read: () => OnboardingProgress | undefined;
  };
}

test("completeStep appends the step, refreshes effectiveSteps, and clears matching coachmark", () => {
  const next = optimisticallyCompleteStep(base, "share_link");
  expect(next.completedSteps).toEqual(["share_link"]);
  expect(next.effectiveSteps).toEqual(["add_baby", "share_link"]);
  expect(next.welcomeDismissed).toBe(true);
  expect(next.activeCoachmarkStepId).toBeNull();
  expect(next.allDone).toBe(false);
});

test("completeStep is a no-op when the step is already completed", () => {
  const started = optimisticallyCompleteStep(base, "share_link");
  expect(optimisticallyCompleteStep(started, "share_link")).toBe(started);
});

test("completeStep credits hasUpdate into effectiveSteps when posting an update", () => {
  const withUpdate = { ...base, effectiveSteps: [], hasBaby: false, hasUpdate: true };
  const next = optimisticallyCompleteStep(withUpdate, "post_update");
  expect(next.effectiveSteps).toEqual(["post_update"]);
});

test("dismissChecklist hides the tour chrome and clears the open coachmark", () => {
  expect(optimisticallyDismissChecklist(base)).toMatchObject({
    activeCoachmarkStepId: null,
    checklistDismissed: true,
    minimized: true,
    welcomeDismissed: true,
  });
});

test("minimize, coachmark, and restart-hint patches are shallow field updates", () => {
  expect(optimisticallySetMinimized(base, true).minimized).toBe(true);
  expect(optimisticallySetActiveCoachmarkStepId(base, null).activeCoachmarkStepId).toBeNull();
  expect(optimisticallySetRestartHintVisible(base, true).restartHintVisible).toBe(true);
});

test("patchOnboardingMine applies the patch when getMine is subscribed", () => {
  const store = createMineStore(base);
  patchOnboardingMine(store, (progress) => optimisticallySetMinimized(progress, true));
  expect(store.read()?.minimized).toBe(true);
});

test("patchOnboardingMine no-ops when getMine is not subscribed", () => {
  const store = createMineStore(undefined);
  patchOnboardingMine(store, (progress) => optimisticallySetMinimized(progress, true));
  expect(store.read()).toBeUndefined();
});
