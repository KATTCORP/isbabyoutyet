/**
 * First-time owner tour steps. IDs are persisted in `userOnboarding.completedSteps`.
 * Keep the web UI checklist in sync with this list.
 */
export const ONBOARDING_STEP_IDS = [
  "add_baby",
  "share_link",
  "post_update",
  "explore_settings",
  "learn_encouragements",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export function isOnboardingStepId(value: string): value is OnboardingStepId {
  return ONBOARDING_STEP_IDS.some((stepId) => stepId === value);
}
