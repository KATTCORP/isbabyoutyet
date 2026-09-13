import { useMutation } from "convex/react";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import type { OnboardingStepId } from "@baby-outlet/backend/src/onboardingSteps";
import { useEffect, useState } from "react";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import type { InitiatedConvexQuery, PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { GettingStartedCard } from "./getting-started";
import { WelcomeTourDialog } from "./welcome-tour";
import { Coachmark } from "./coachmark";
import { ONBOARDING_STEPS } from "./steps";

type OnboardingHostProps = {
  surface: "dashboard" | "baby";
  onboarding:
    | PreloadedConvexQuery<typeof api.onboarding.getMine>
    | InitiatedConvexQuery<typeof api.onboarding.getMine>;
  /** Baby-page owners only — visitors never see the tour */
  enabled: boolean | undefined;
  /** Hide spotlight tips (e.g. while a modal is open) */
  spotlight: boolean | undefined;
  /** When set, the baby-page tour only runs on the first created baby */
  babyPublicId: string | undefined;
  /** Baby-page: open post-update / settings from the checklist */
  onGoToStep: ((stepId: OnboardingStepId) => void) | undefined;
};

function scrollToTourTarget(targetId: string) {
  const el = document.querySelector(`[data-tour-id="${targetId}"]`);
  if (!(el instanceof HTMLElement)) {
    return;
  }
  el.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
}

/**
 * Owns the first-run welcome carousel + floating checklist + one active coachmark.
 * Mount on the dashboard index (not /dashboard/add) and the first baby's owner page.
 *
 * Auth-gated: only mounts the suspense query once the session is known so
 * anonymous visitors never suspend on `onboarding.getMine`.
 */
export function OnboardingHost(props: OnboardingHostProps) {
  const enabled = props.enabled !== false;
  const session = authClient.useSession();
  const isAuthed = !!session.data?.user;

  if (!enabled || !isAuthed || session.isPending) {
    return null;
  }

  return <OnboardingHostAuthed {...props} />;
}

function OnboardingHostAuthed(props: OnboardingHostProps) {
  const { t } = useI18n();
  const spotlight = props.spotlight !== false;
  const progressQuery = usePreloadedConvexQuery(api.onboarding.getMine, props.onboarding);
  const progress = progressQuery.data;
  const dismissWelcome = useMutation(api.onboarding.dismissWelcome);
  const setMinimized = useMutation(api.onboarding.setMinimized);
  const dismissChecklist = useMutation(api.onboarding.dismissChecklist);
  const completeStep = useMutation(api.onboarding.completeStep);

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [coachmarkHidden, setCoachmarkHidden] = useState(false);

  // Open welcome once progress loads — skip if already dismissed or they already have a baby
  useEffect(() => {
    if (progress.welcomeDismissed) return;
    if (progress.hasBaby) {
      void dismissWelcome({});
      return;
    }
    setWelcomeOpen(true);
  }, [progress, dismissWelcome]);

  // Don't leave a finished checklist hanging on the page
  useEffect(() => {
    if (!progress.allDone || progress.checklistDismissed) return;
    const timeout = window.setTimeout(() => {
      void dismissChecklist({});
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [progress.allDone, progress.checklistDismissed, dismissChecklist]);

  const nextStep = ONBOARDING_STEPS.find((step) => !progress.effectiveSteps.includes(step.id));

  useEffect(() => {
    setCoachmarkHidden(false);
  }, [nextStep?.id]);

  const isTourBabyPage =
    props.surface !== "baby" ||
    (progress.tourBaby != null && progress.tourBaby.publicId === props.babyPublicId);

  if (!isTourBabyPage) {
    return null;
  }

  const showChecklist = progress.welcomeDismissed && !progress.checklistDismissed;
  const highlightBabyCard =
    props.surface === "dashboard" && nextStep?.surface === "baby" && progress.tourBaby != null;
  const showCoachmark =
    spotlight &&
    showChecklist &&
    !progress.minimized &&
    !coachmarkHidden &&
    nextStep &&
    (nextStep.surface === props.surface || highlightBabyCard);

  const coachmarkTargetId = highlightBabyCard ? "tour_baby" : nextStep?.targetId;
  const coachmarkTitle = nextStep ? t(nextStep.title) : "";
  const coachmarkDescription = highlightBabyCard
    ? t("Open {{name}}'s page to do this — or tap the step in the checklist.", {
        name: progress.tourBaby?.name ?? "baby",
      })
    : nextStep
      ? t(nextStep.description)
      : "";

  return (
    <>
      <WelcomeTourDialog
        open={welcomeOpen}
        onOpenChange={setWelcomeOpen}
        onFinished={() => {
          void dismissWelcome({});
        }}
      />

      {showChecklist ? (
        <GettingStartedCard
          effectiveSteps={progress.effectiveSteps}
          minimized={progress.minimized}
          onMinimize={(minimized) => {
            void setMinimized({ minimized });
          }}
          onDismiss={() => {
            void dismissChecklist({});
          }}
          onAcknowledgeStep={(stepId) => {
            void completeStep({ stepId });
          }}
          onGoToStep={(stepId) => {
            if (stepId === "post_update") {
              props.onGoToStep?.(stepId);
              return;
            }
            if (stepId === "explore_settings") {
              props.onGoToStep?.(stepId);
              void completeStep({ stepId });
              return;
            }
            const step = ONBOARDING_STEPS.find((item) => item.id === stepId);
            if (step) {
              scrollToTourTarget(step.targetId);
            }
          }}
          surface={props.surface}
          tourBaby={progress.tourBaby}
          className={undefined}
        />
      ) : null}

      {showCoachmark && nextStep && coachmarkTargetId && coachmarkDescription ? (
        <Coachmark
          targetId={coachmarkTargetId}
          title={coachmarkTitle}
          description={coachmarkDescription}
          completeOnDismiss={nextStep.id === "learn_encouragements"}
          onComplete={() => {
            void completeStep({ stepId: nextStep.id });
          }}
          onDismiss={() => setCoachmarkHidden(true)}
        />
      ) : null}
    </>
  );
}

/** Mark a tour step complete from UI actions (share, settings open, …). */
export function useCompleteOnboardingStep() {
  const completeStep = useMutation(api.onboarding.completeStep);
  return completeStep;
}
