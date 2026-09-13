import type { OnboardingStepId } from "@baby-outlet/backend/src/onboardingSteps";
import type { Icon } from "@phosphor-icons/react";
import { Baby, ChatCircleText, GearSix, Heart, ShareNetwork } from "@phosphor-icons/react";
import type { TranslationKey } from "@/lib/i18n";

export type OnboardingStepCopy = {
  id: OnboardingStepId;
  title: TranslationKey;
  description: TranslationKey;
  /** Where the tip makes the most sense */
  surface: "dashboard" | "baby" | "any";
  /** Matches `data-tour-id` on the UI target */
  targetId: string;
  icon: Icon;
  ctaLabel: TranslationKey | undefined;
};

export const ONBOARDING_STEPS = [
  {
    id: "add_baby",
    title: "Add your first baby",
    description:
      "Add a name and date, then choose a journey. It only sets which statuses visitors can see.",
    surface: "dashboard",
    targetId: "add_baby",
    icon: Baby,
    ctaLabel: "Add a baby",
  },
  {
    id: "share_link",
    title: "Share the link",
    description:
      "One link for everyone. Tap Share on the baby page to copy it — no group chat spam.",
    surface: "baby",
    targetId: "share_link",
    icon: ShareNetwork,
    ctaLabel: undefined,
  },
  {
    id: "post_update",
    title: "Post an update",
    description:
      "Post milestones and everyday notes from the nav. Only enabled status updates notify subscribers.",
    surface: "baby",
    targetId: "post_update",
    icon: ChatCircleText,
    ctaLabel: undefined,
  },
  {
    id: "explore_settings",
    title: "Peek at settings",
    description: "Themes, names, and whether visitors can leave encouragements — all in Settings.",
    surface: "baby",
    targetId: "explore_settings",
    icon: GearSix,
    ctaLabel: undefined,
  },
  {
    id: "learn_encouragements",
    title: "Encouragements from visitors",
    description:
      "Anyone with the link can leave a short supportive note — no account needed. They show up in your timeline.",
    surface: "baby",
    targetId: "learn_encouragements",
    icon: Heart,
    ctaLabel: undefined,
  },
] as const satisfies ReadonlyArray<OnboardingStepCopy>;

export type WelcomeSlide = {
  title: TranslationKey;
  body: TranslationKey;
  icon: Icon;
};

export const WELCOME_SLIDES = [
  {
    title: "Welcome — here's the idea",
    body: "Is Baby Out Yet gives you one calm page for labour updates, so friends and family stop texting you for news.",
    icon: Baby,
  },
  {
    title: "Create a baby page",
    body: "Add a name and date, then choose a journey. It only sets which statuses visitors can see.",
    icon: ShareNetwork,
  },
  {
    title: "Share once, update as you go",
    body: "Post milestones and messages from the nav. Status updates notify subscribers; everyday notes and encouragements stay quiet.",
    icon: ChatCircleText,
  },
  {
    title: "Skip anytime",
    body: "A tiny checklist follows you around. Tap a step to jump there or highlight the control. Dismiss whenever — restart from the dashboard sparkle.",
    icon: Heart,
  },
] as const satisfies ReadonlyArray<WelcomeSlide>;
