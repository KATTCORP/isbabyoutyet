import type { OnboardingStepId } from "@baby-outlet/backend/src/onboardingSteps";
import type { Icon } from "@phosphor-icons/react";
import {
  BabyIcon,
  ChatCircleTextIcon,
  GearSixIcon,
  HeartIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react";
import type { TranslationKey } from "@/lib/i18n";

export type OnboardingStepCopy = {
  ctaLabel: TranslationKey | undefined;
  description: TranslationKey;
  icon: Icon;
  id: OnboardingStepId;
  /** Where the tip makes the most sense */
  surface: "dashboard" | "baby" | "any";
  /** Matches `data-tour-id` on the UI target */
  targetId: string;
  title: TranslationKey;
};

export const ONBOARDING_STEPS = [
  {
    ctaLabel: "Add a baby",
    description:
      "Add a name and date, then choose a journey. It only sets which statuses visitors can see.",
    icon: BabyIcon,
    id: "add_baby",
    surface: "dashboard",
    targetId: "add_baby",
    title: "Add your first baby",
  },
  {
    ctaLabel: undefined,
    description:
      "One link for everyone. Tap Share on the baby page to copy it — no group chat spam.",
    icon: ShareNetworkIcon,
    id: "share_link",
    surface: "baby",
    targetId: "share_link",
    title: "Share the link",
  },
  {
    ctaLabel: undefined,
    description:
      "Post milestones and everyday notes from the nav. Only enabled status updates notify subscribers.",
    icon: ChatCircleTextIcon,
    id: "post_update",
    surface: "baby",
    targetId: "post_update",
    title: "Post an update",
  },
  {
    ctaLabel: undefined,
    description: "Themes, names, and language — all in Settings.",
    icon: GearSixIcon,
    id: "explore_settings",
    surface: "baby",
    targetId: "explore_settings",
    title: "Peek at settings",
  },
  {
    ctaLabel: undefined,
    description:
      "Anyone with the link can leave a short supportive note — no account needed. They show up in your timeline.",
    icon: HeartIcon,
    id: "learn_encouragements",
    surface: "baby",
    targetId: "learn_encouragements",
    title: "Encouragements from visitors",
  },
] as const satisfies ReadonlyArray<OnboardingStepCopy>;
