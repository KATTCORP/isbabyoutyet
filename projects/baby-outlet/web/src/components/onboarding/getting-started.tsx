import { Button } from "@workspace/ui/components/button";
import { Progress, ProgressLabel, ProgressValue } from "@workspace/ui/components/progress";
import { cn } from "@workspace/ui/lib/utils";
import { CaretDown, CaretUp, Check, Sparkle, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import type { OnboardingStepId } from "@baby-outlet/backend/src/onboardingSteps";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { ONBOARDING_STEPS } from "./steps";

type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type TourBaby = {
  publicId: string;
  name: string;
};

type GettingStartedCardProps = {
  effectiveSteps: string[];
  minimized: boolean;
  onMinimize: (minimized: boolean) => void;
  onDismiss: () => void;
  onAcknowledgeStep: (stepId: OnboardingStepId) => void;
  /** Current route context for CTAs */
  surface: "dashboard" | "baby";
  /** First created baby — checklist links go here, not to later babies */
  tourBaby: TourBaby | null;
  /** Baby-page actions: open a dialog or scroll to a control */
  onGoToStep: ((stepId: OnboardingStepId) => void) | undefined;
  className: string | undefined;
};

type StepAction =
  | { kind: "link"; link: LinkProps; label: string; onClick: (() => void) | undefined }
  | { kind: "button"; onClick: () => void; label: string };

function babyPageLink(opts: { publicId: string; settings: boolean | undefined }): LinkProps {
  return {
    to: "/baby/$publicId",
    params: { publicId: opts.publicId },
    search: opts.settings ? { settings: true } : undefined,
  };
}

function getStepAction(opts: {
  step: OnboardingStep;
  surface: "dashboard" | "baby";
  tourBaby: TourBaby | null;
  onGoToStep: ((stepId: OnboardingStepId) => void) | undefined;
  onAcknowledge: (stepId: OnboardingStepId) => void;
  t: TranslationFunction;
}): StepAction | null {
  const step = opts.step;
  const t = opts.t;
  if (step.id === "add_baby") {
    if (opts.surface !== "dashboard") {
      return null;
    }
    const ctaLabel = step.ctaLabel;
    if (!ctaLabel) {
      return null;
    }
    return {
      kind: "link",
      link: { to: "/dashboard/add" },
      label: t(ctaLabel),
      onClick: undefined,
    };
  }

  if (opts.surface === "dashboard") {
    if (!opts.tourBaby) {
      return null;
    }
    const publicId = opts.tourBaby.publicId;
    const name = opts.tourBaby.name;
    if (step.id === "share_link") {
      return {
        kind: "link",
        link: babyPageLink({ publicId, settings: undefined }),
        label: t("Open {{name}}'s page", { name }),
        onClick: undefined,
      };
    }
    if (step.id === "post_update") {
      return {
        kind: "link",
        link: babyPageLink({ publicId, settings: undefined }),
        label: t("Post an update"),
        onClick: undefined,
      };
    }
    if (step.id === "explore_settings") {
      return {
        kind: "link",
        link: babyPageLink({ publicId, settings: true }),
        label: t("Open settings"),
        onClick: () => opts.onAcknowledge(step.id),
      };
    }
    if (step.id === "learn_encouragements") {
      return {
        kind: "link",
        link: babyPageLink({ publicId, settings: undefined }),
        label: t("See {{name}}'s page", { name }),
        onClick: undefined,
      };
    }
    return null;
  }

  if (step.id === "post_update") {
    return {
      kind: "button",
      onClick: () => opts.onGoToStep?.(step.id),
      label: t("Post an update"),
    };
  }
  if (step.id === "explore_settings") {
    return {
      kind: "button",
      onClick: () => opts.onGoToStep?.(step.id),
      label: t("Open settings"),
    };
  }
  if (step.id === "share_link") {
    return {
      kind: "button",
      onClick: () => opts.onGoToStep?.(step.id),
      label: t("Show Share"),
    };
  }
  if (step.id === "learn_encouragements") {
    return {
      kind: "button",
      onClick: () => opts.onAcknowledge(step.id),
      label: t("Got it"),
    };
  }
  return null;
}

export function GettingStartedCard(props: GettingStartedCardProps) {
  const { t } = useI18n();
  const done = new Set(props.effectiveSteps);
  const completedCount = ONBOARDING_STEPS.filter((step) => done.has(step.id)).length;
  const total = ONBOARDING_STEPS.length;
  const percent = Math.round((completedCount / total) * 100);
  const nextStep = ONBOARDING_STEPS.find((step) => !done.has(step.id));
  const allDone = !nextStep;

  if (props.minimized) {
    return (
      <button
        type="button"
        onClick={() => props.onMinimize(false)}
        className={cn(
          "fixed z-40 flex items-center gap-2 rounded-full border border-primary/20 bg-popover/95 px-3 py-2 text-sm font-medium shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm transition hover:border-primary/40",
          "right-4 bottom-6",
          props.className,
        )}
        aria-label={t("Getting started: {{completed}} of {{total}} done. Expand.", {
          completed: completedCount,
          total,
        })}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkle className="size-3.5" />
        </span>
        <span className="tabular-nums text-foreground">
          {completedCount}/{total}
        </span>
        <CaretUp className="size-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <aside
      className={cn(
        "fixed z-40 w-[min(100%-2rem,22rem)] rounded-xl border border-border/60 bg-popover/95 p-4 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md",
        "right-4 bottom-6",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
        props.className,
      )}
      aria-label={t("Getting started checklist")}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkle className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{t("Getting started")}</p>
            <p className="text-xs text-muted-foreground">
              {allDone ? t("You're all set") : t("Tap a step to jump there")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("Minimize")}
            onClick={() => props.onMinimize(true)}
          >
            <CaretDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("Dismiss tour")}
            onClick={props.onDismiss}
          >
            <X />
          </Button>
        </div>
      </div>

      <Progress value={percent} className="mb-3">
        <ProgressLabel className="sr-only">{t("Tour progress")}</ProgressLabel>
        <ProgressValue />
      </Progress>

      <ul className="flex flex-col gap-1.5 mb-3">
        {ONBOARDING_STEPS.map((step) => {
          const isDone = done.has(step.id);
          const isNext = nextStep?.id === step.id;
          const action = isDone
            ? null
            : getStepAction({
                step,
                surface: props.surface,
                tourBaby: props.tourBaby,
                onGoToStep: props.onGoToStep,
                onAcknowledge: props.onAcknowledgeStep,
                t,
              });
          return (
            <li
              key={step.id}
              className={cn("rounded-lg text-sm", isNext && "bg-primary/8 ring-1 ring-primary/15")}
            >
              <StepRow step={step} isDone={isDone} action={action} title={t(step.title)} />
            </li>
          );
        })}
      </ul>

      {nextStep ? (
        <NextStepHint
          step={nextStep}
          surface={props.surface}
          tourBaby={props.tourBaby}
          onGoToStep={props.onGoToStep}
          onAcknowledge={() => props.onAcknowledgeStep(nextStep.id)}
          t={t}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("Nice work — share your page and enjoy the quiet inbox.")}
          </p>
          <Button size="sm" variant="outline" onClick={props.onDismiss}>
            {t("Close checklist")}
          </Button>
        </div>
      )}
    </aside>
  );
}

function StepRow(props: {
  step: OnboardingStep;
  isDone: boolean;
  action: StepAction | null;
  title: string;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          props.isDone
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30",
        )}
      >
        {props.isDone ? <Check className="size-2.5" /> : null}
      </span>
      <span className={cn("leading-snug", props.isDone && "text-muted-foreground line-through")}>
        {props.title}
      </span>
    </>
  );

  const rowClass = "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left";

  if (props.action?.kind === "link") {
    return (
      <Link
        {...props.action.link}
        className={cn(rowClass, "transition hover:bg-primary/6")}
        aria-label={props.action.label}
        onClick={props.action.onClick}
      >
        {inner}
      </Link>
    );
  }

  if (props.action?.kind === "button") {
    return (
      <button
        type="button"
        className={cn(rowClass, "transition hover:bg-primary/6")}
        onClick={props.action.onClick}
        aria-label={props.action.label}
      >
        {inner}
      </button>
    );
  }

  return <div className={rowClass}>{inner}</div>;
}

function NextStepHint(props: {
  step: OnboardingStep;
  surface: "dashboard" | "baby";
  tourBaby: TourBaby | null;
  onGoToStep: ((stepId: OnboardingStepId) => void) | undefined;
  onAcknowledge: () => void;
  t: TranslationFunction;
}) {
  const Icon = props.step.icon;
  const action = getStepAction({
    step: props.step,
    surface: props.surface,
    tourBaby: props.tourBaby,
    onGoToStep: props.onGoToStep,
    onAcknowledge: (stepId) => {
      if (stepId === props.step.id) {
        props.onAcknowledge();
      }
    },
    t: props.t,
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{props.t(props.step.title)}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {props.t(props.step.description)}
          </p>
        </div>
      </div>
      {action ? (
        <div className="flex flex-wrap gap-2">
          {action.kind === "link" ? (
            <Button
              size="sm"
              render={<Link {...action.link} onClick={action.onClick} />}
              nativeButton={false}
            >
              {action.label}
            </Button>
          ) : (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
