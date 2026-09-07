import { useMutation } from "convex/react";
import { api } from "@workspace/convex/convex/_generated/api";
import { isFunction } from "@workspace/runtime/guards";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import type { PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { useI18n } from "@/lib/i18n";
import { useDelayedAction } from "@/lib/use-delayed-action";
import { GettingStartedCard } from "./getting-started";
import { Coachmark } from "./coachmark";
import {
  optimisticallyCompleteStep,
  optimisticallyDismissChecklist,
  optimisticallySetActiveCoachmarkStepId,
  optimisticallySetMinimized,
  optimisticallySetRestartHintVisible,
  patchOnboardingMine,
} from "./onboarding-optimistic";
import { ONBOARDING_STEPS } from "./steps";

type OnboardingSession = {
  data: { user: { id: string } } | null;
  isPending: boolean;
};

type OnboardingHostProps = {
  /** Baby-page owners only — visitors never see the tour */
  enabled: boolean | undefined;
  onboarding: PreloadedConvexQuery<typeof api.onboarding.getMine>;
  /** Hide spotlight tips (e.g. while a modal is open) */
  spotlight: boolean | undefined;
  surface: "dashboard" | "baby";
};

function isHtmlElement(value: Element | null): value is HTMLElement {
  return value !== null && Object.prototype.isPrototypeOf.call(HTMLElement.prototype, value);
}

function scrollToTourTarget(targetId: string) {
  const el = document.querySelector(`[data-tour-id="${targetId}"]`);
  if (!isHtmlElement(el) || !isFunction(el.scrollIntoView)) {
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}

function useOnboardingMutations() {
  const setMinimized = useMutation(api.onboarding.setMinimized).withOptimisticUpdate(
    (localStore, args) => {
      patchOnboardingMine(localStore, (progress) =>
        optimisticallySetMinimized(progress, args.minimized),
      );
    },
  );
  const dismissChecklist = useMutation(api.onboarding.dismissChecklist).withOptimisticUpdate(
    (localStore) => {
      patchOnboardingMine(localStore, optimisticallyDismissChecklist);
    },
  );
  const completeStep = useMutation(api.onboarding.completeStep).withOptimisticUpdate(
    (localStore, args) => {
      patchOnboardingMine(localStore, (progress) =>
        optimisticallyCompleteStep(progress, args.stepId),
      );
    },
  );
  const setActiveCoachmarkStepId = useMutation(
    api.onboarding.setActiveCoachmarkStepId,
  ).withOptimisticUpdate((localStore, args) => {
    patchOnboardingMine(localStore, (progress) =>
      optimisticallySetActiveCoachmarkStepId(progress, args.stepId),
    );
  });
  const setRestartHintVisible = useMutation(
    api.onboarding.setRestartHintVisible,
  ).withOptimisticUpdate((localStore, args) => {
    patchOnboardingMine(localStore, (progress) =>
      optimisticallySetRestartHintVisible(progress, args.visible),
    );
  });

  return {
    completeStep,
    dismissChecklist,
    setActiveCoachmarkStepId,
    setMinimized,
    setRestartHintVisible,
  };
}

/**
 * Owns the first-run floating checklist + one active coachmark.
 * Mount on the dashboard (behind `/_auth`) and owner-managed baby pages
 * (`canManage`). Callers already know the viewer is signed in — do not
 * re-check Better Auth's session here.
 */
export function OnboardingHost(props: OnboardingHostProps) {
  if (props.enabled === false) {
    return null;
  }
  return <OnboardingHostAuthed {...props} />;
}

/**
 * Test seam: inject signed-in vs anonymous without Better Auth's session hook.
 * Production goes through {@link OnboardingHost} on routes that already know
 * the viewer (`/_auth`, baby `canManage`).
 *
 * @internal exported for tests
 */
export function OnboardingHostWithSession(
  props: OnboardingHostProps & { session: OnboardingSession },
) {
  if (props.enabled === false || props.session.data === null || props.session.isPending) {
    return null;
  }
  return <OnboardingHostAuthed {...props} />;
}

function OnboardingHostAuthed(props: OnboardingHostProps) {
  const progressQuery = usePreloadedConvexQuery(api.onboarding.getMine, props.onboarding);
  const {
    completeStep,
    dismissChecklist,
    setActiveCoachmarkStepId,
    setMinimized,
    setRestartHintVisible,
  } = useOnboardingMutations();
  const { t } = useI18n();
  const spotlight = props.spotlight !== false;
  const progress = progressQuery.data;

  function dismissFinishedChecklist() {
    void dismissChecklist({});
  }
  useDelayedAction({
    action: dismissFinishedChecklist,
    delayMs: 4000,
    enabled: progress.allDone && !progress.checklistDismissed,
  });

  const nextStep = ONBOARDING_STEPS.find((step) => !progress.effectiveSteps.includes(step.id));

  const showChecklist = !progress.checklistDismissed;
  const showCoachmark =
    spotlight &&
    showChecklist &&
    nextStep &&
    progress.activeCoachmarkStepId === nextStep.id &&
    nextStep.surface === props.surface;

  const coachmarkTargetId = nextStep?.targetId;
  const coachmarkTitle = nextStep ? t(nextStep.title) : "";
  const coachmarkDescription = nextStep ? t(nextStep.description) : "";
  const showRestartHint = props.surface === "dashboard" && progress.restartHintVisible;
  const coachmarkCompletesStep = nextStep != null && nextStep.surface === "baby";

  return (
    <>
      {showChecklist && !showCoachmark && !showRestartHint ? (
        <GettingStartedCard
          className={undefined}
          effectiveSteps={progress.effectiveSteps}
          minimized={progress.minimized}
          onDismiss={() => {
            void dismissChecklist({});
            if (props.surface === "dashboard") {
              window.scrollTo({ behavior: "auto", top: 0 });
              void setRestartHintVisible({ visible: true });
            }
          }}
          onGoToStep={(stepId) => {
            const step = ONBOARDING_STEPS.find((item) => item.id === stepId);
            if (!step) {
              return;
            }
            void setActiveCoachmarkStepId({ stepId: step.id });
            scrollToTourTarget(step.targetId);
          }}
          onMinimize={(minimized) => {
            void setMinimized({ minimized });
          }}
          surface={props.surface}
          tourBaby={progress.tourBaby}
        />
      ) : null}

      {showCoachmark && nextStep && coachmarkTargetId && coachmarkDescription ? (
        <Coachmark
          completeOnDismiss={coachmarkCompletesStep}
          description={coachmarkDescription}
          onComplete={() => {
            void completeStep({ stepId: nextStep.id });
          }}
          onDismiss={() => {
            void setActiveCoachmarkStepId({ stepId: null });
          }}
          targetId={coachmarkTargetId}
          title={coachmarkTitle}
        />
      ) : null}

      {showRestartHint ? (
        <Coachmark
          completeOnDismiss={undefined}
          description={t("Use this sparkle button to bring the guide back anytime.")}
          onComplete={undefined}
          onDismiss={() => {
            void setRestartHintVisible({ visible: false });
          }}
          targetId="restart_tour"
          title={t("Guide dismissed")}
        />
      ) : null}
    </>
  );
}

/** Mark a tour step complete from UI actions (share, settings open, …). */
export function useCompleteOnboardingStep() {
  return useMutation(api.onboarding.completeStep).withOptimisticUpdate((localStore, args) => {
    patchOnboardingMine(localStore, (progress) =>
      optimisticallyCompleteStep(progress, args.stepId),
    );
  });
}
