import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { ONBOARDING_STEP_IDS } from "@isbabyoutyet/backend/src/onboardingSteps";
import type { OnboardingStepId } from "@isbabyoutyet/backend/src/onboardingSteps";

export type OnboardingProgress = FunctionReturnType<typeof api.onboarding.getMine>;

/** Read the subscribed `getMine` snapshot from the optimistic local store. */
function getOnboardingMine(localStore: OptimisticLocalStore) {
  return localStore.getQuery(api.onboarding.getMine, {});
}

/** Write a patched `getMine` snapshot into the optimistic local store. */
function setOnboardingMine(localStore: OptimisticLocalStore, next: OnboardingProgress) {
  localStore.setQuery(api.onboarding.getMine, {}, next);
}

function withEffectiveSteps(
  progress: OnboardingProgress,
  completedSteps: Array<string>,
): OnboardingProgress {
  const set = new Set(completedSteps);
  if (progress.hasBaby) {
    set.add("add_baby");
  }
  if (progress.hasUpdate) {
    set.add("post_update");
  }
  const effectiveSteps = ONBOARDING_STEP_IDS.filter((id) => set.has(id));
  return {
    ...progress,
    allDone: effectiveSteps.length >= ONBOARDING_STEP_IDS.length,
    completedSteps,
    effectiveSteps,
  };
}

export function optimisticallySetMinimized(progress: OnboardingProgress, minimized: boolean) {
  return { ...progress, minimized };
}

export function optimisticallyDismissChecklist(progress: OnboardingProgress) {
  return {
    ...progress,
    activeCoachmarkStepId: null,
    checklistDismissed: true,
    minimized: true,
    welcomeDismissed: true,
  };
}

export function optimisticallySetActiveCoachmarkStepId(
  progress: OnboardingProgress,
  stepId: OnboardingStepId | null,
) {
  return { ...progress, activeCoachmarkStepId: stepId };
}

export function optimisticallySetRestartHintVisible(
  progress: OnboardingProgress,
  visible: boolean,
) {
  return { ...progress, restartHintVisible: visible };
}

export function optimisticallyCompleteStep(progress: OnboardingProgress, stepId: OnboardingStepId) {
  if (progress.completedSteps.includes(stepId)) {
    return progress;
  }
  const next = withEffectiveSteps(progress, [...progress.completedSteps, stepId]);
  return {
    ...next,
    activeCoachmarkStepId:
      progress.activeCoachmarkStepId === stepId ? null : progress.activeCoachmarkStepId,
    welcomeDismissed: true,
  };
}

/** Apply a pure progress patch to every subscribed `getMine` query. */
export function patchOnboardingMine(
  localStore: OptimisticLocalStore,
  patch: (progress: OnboardingProgress) => OnboardingProgress,
) {
  const current = getOnboardingMine(localStore);
  if (current === undefined) {
    return;
  }
  setOnboardingMine(localStore, patch(current));
}
