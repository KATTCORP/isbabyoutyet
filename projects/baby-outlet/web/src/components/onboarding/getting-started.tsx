import { Button } from "@workspace/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer";
import { Progress, ProgressLabel, ProgressValue } from "@workspace/ui/components/progress";
import { cn } from "@workspace/ui/lib/utils";
import { CaretDownIcon, CaretUpIcon, CheckIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import type { OnboardingStepId } from "@baby-outlet/backend/src/onboardingSteps";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { ONBOARDING_STEPS } from "./steps";
import { useVisualViewportMetrics } from "@/lib/use-visual-viewport";

type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

type TourBaby = {
  name: string;
  publicId: string;
};

type GettingStartedCardProps = {
  className: string | undefined;
  effectiveSteps: Array<string>;
  minimized: boolean;
  onDismiss: () => void;
  /** Baby-page: scroll to and highlight a control */
  onGoToStep: ((stepId: OnboardingStepId) => void) | undefined;
  onMinimize: (minimized: boolean) => void;
  /** Current route context for CTAs */
  surface: "dashboard" | "baby";
  /** First owned baby — preferred deep-link target from dashboard CTAs only */
  tourBaby: TourBaby | null;
};

type StepAction =
  | { kind: "link"; label: string; link: LinkProps; onClick: (() => void) | undefined }
  | { kind: "button"; label: string; onClick: () => void };

function babyPageLink(publicId: string): LinkProps {
  return {
    params: { publicId },
    to: "/baby/$publicId",
  };
}

function getStepAction(opts: {
  onGoToStep: ((stepId: OnboardingStepId) => void) | undefined;
  step: OnboardingStep;
  surface: "dashboard" | "baby";
  t: TranslationFunction;
  tourBaby: TourBaby | null;
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
      label: t(ctaLabel),
      link: { to: "/dashboard/add" },
      onClick: undefined,
    };
  }

  if (opts.surface === "dashboard") {
    if (!opts.tourBaby) {
      return null;
    }
    const publicId = opts.tourBaby.publicId;
    const name = opts.tourBaby.name;
    // Preferred-baby deep link onto the page (not overlays). Highlight tips run on the baby surface.
    if (
      step.id === "share_link" ||
      step.id === "post_update" ||
      step.id === "explore_settings" ||
      step.id === "learn_encouragements"
    ) {
      return {
        kind: "link",
        label: t("See {{name}}'s page", { name }),
        link: babyPageLink(publicId),
        onClick: undefined,
      };
    }
    return null;
  }

  if (
    step.id === "share_link" ||
    step.id === "post_update" ||
    step.id === "explore_settings" ||
    step.id === "learn_encouragements"
  ) {
    return {
      kind: "button",
      label: t("Show me"),
      onClick: () => opts.onGoToStep?.(step.id),
    };
  }
  return null;
}

export function GettingStartedCard(props: GettingStartedCardProps) {
  const { t } = useI18n();
  const visualViewport = useVisualViewportMetrics();
  const done = new Set(props.effectiveSteps);
  const completedCount = ONBOARDING_STEPS.filter((step) => done.has(step.id)).length;
  const total = ONBOARDING_STEPS.length;
  const percent = Math.round((completedCount / total) * 100);
  const nextStep = ONBOARDING_STEPS.find((step) => !done.has(step.id));
  const allDone = !nextStep;
  const NextStepIcon = nextStep?.icon;

  if (props.minimized) {
    return (
      <button
        aria-label={t("Getting started: {{completed}} of {{total}} done. Expand.", {
          completed: completedCount,
          total,
        })}
        className={cn(
          "fixed z-40 flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-popover/95 px-3 py-2 text-sm font-medium shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm transition hover:border-primary/40",
          "right-[calc(0.75rem+env(safe-area-inset-right)+max(0px,100vw-100dvw))] bottom-[calc(4rem+env(safe-area-inset-bottom)+var(--visual-viewport-bottom))] sm:right-4 sm:bottom-20",
          props.className,
        )}
        onClick={() => props.onMinimize(false)}
        style={visualViewport.style}
        type="button"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <SparkleIcon className="size-3.5" />
        </span>
        <span className="tabular-nums text-foreground">
          {completedCount}/{total}
        </span>
        <CaretUpIcon className="size-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <>
      <Drawer showSwipeHandle>
        <aside
          aria-label={t("Getting started checklist")}
          className={cn(
            "fixed left-[calc(0.75rem+env(safe-area-inset-left))] bottom-[calc(4rem+env(safe-area-inset-bottom)+var(--visual-viewport-bottom))] z-40 w-[calc(100dvw-1.5rem-env(safe-area-inset-left)-env(safe-area-inset-right))] rounded-xl border border-border/60 bg-popover/95 p-3 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md md:hidden",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
            props.className,
          )}
          style={visualViewport.style}
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              {NextStepIcon ? (
                <NextStepIcon className="size-5" />
              ) : (
                <CheckIcon className="size-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("Getting started")} · {completedCount}/{total}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {nextStep ? t(nextStep.title) : t("You're all set")}
              </p>
            </div>
            <DrawerTrigger
              render={
                <Button
                  aria-label={t("Getting started: {{completed}} of {{total}} done. Expand.", {
                    completed: completedCount,
                    total,
                  })}
                  className="size-11"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <CaretUpIcon />
            </DrawerTrigger>
          </div>
          <Progress className="mt-3" value={percent}>
            <ProgressLabel className="sr-only">{t("Tour progress")}</ProgressLabel>
          </Progress>
        </aside>

        <DrawerContent
          className="right-auto w-dvw max-w-dvw max-h-[calc(100dvh-2rem)] md:hidden"
          style={{
            bottom: `${visualViewport.bottom}px`,
            left: `${visualViewport.left}px`,
            maxWidth: visualViewport.width > 0 ? `${visualViewport.width}px` : "100dvw",
            right: "auto",
            width: visualViewport.width > 0 ? `${visualViewport.width}px` : "100dvw",
          }}
        >
          <DrawerHeader className="flex-row items-start text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <SparkleIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DrawerTitle>{t("Getting started")}</DrawerTitle>
              <DrawerDescription>
                {allDone ? t("You're all set") : t("Tap a step to jump there")}
              </DrawerDescription>
            </div>
            <DrawerClose
              render={
                <Button
                  aria-label={t("Close checklist")}
                  className="size-11"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <XIcon />
            </DrawerClose>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto p-4 pt-3">
            <ChecklistContents
              {...props}
              closeWithDrawerClose
              done={done}
              nextStep={nextStep}
              onBeforeAction={undefined}
              onRequestDismiss={props.onDismiss}
              percent={percent}
              showDismissAction={false}
              t={t}
            />
          </div>
          {nextStep ? (
            <DrawerFooter className="relative bg-popover pt-2">
              <DrawerClose
                render={
                  <Button
                    className="min-h-11 w-full"
                    onClick={props.onDismiss}
                    variant="secondary"
                  />
                }
              >
                {t("Dismiss guide")}
              </DrawerClose>
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>

      <aside
        aria-label={t("Getting started checklist")}
        className={cn(
          "fixed right-4 bottom-20 z-40 hidden w-[min(100%-2rem,22rem)] rounded-xl border border-border/60 bg-popover/95 p-4 shadow-xl ring-1 ring-foreground/10 backdrop-blur-md md:block",
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
          props.className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <SparkleIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("Getting started")}</p>
              <p className="text-xs text-muted-foreground">
                {allDone ? t("You're all set") : t("Tap a step to jump there")}
              </p>
            </div>
          </div>
          <Button
            aria-label={t("Minimize")}
            onClick={() => props.onMinimize(true)}
            size="icon-sm"
            variant="ghost"
          >
            <CaretDownIcon />
          </Button>
        </div>
        <ChecklistContents
          {...props}
          closeWithDrawerClose={false}
          done={done}
          nextStep={nextStep}
          onBeforeAction={undefined}
          onRequestDismiss={props.onDismiss}
          percent={percent}
          showDismissAction
          t={t}
        />
      </aside>
    </>
  );
}

type ChecklistContentsProps = GettingStartedCardProps & {
  closeWithDrawerClose: boolean;
  done: Set<string>;
  nextStep: OnboardingStep | undefined;
  onBeforeAction: (() => void) | undefined;
  onRequestDismiss: () => void;
  percent: number;
  showDismissAction: boolean;
  t: TranslationFunction;
};

function ChecklistContents(props: ChecklistContentsProps) {
  const { t } = props;
  return (
    <>
      <Progress className="mb-3" value={props.percent}>
        <ProgressLabel className="sr-only">{t("Tour progress")}</ProgressLabel>
        <ProgressValue />
      </Progress>

      <ul className="mb-3 flex flex-col gap-1.5">
        {ONBOARDING_STEPS.map((step) => {
          const isDone = props.done.has(step.id);
          const isNext = props.nextStep?.id === step.id;
          const action = isDone
            ? null
            : getStepAction({
                onGoToStep: props.onGoToStep,
                step,
                surface: props.surface,
                t,
                tourBaby: props.tourBaby,
              });
          return (
            <li
              className={cn("rounded-lg text-sm", isNext && "bg-primary/8 ring-1 ring-primary/15")}
              key={step.id}
            >
              <StepRow
                action={action}
                closeWithDrawerClose={props.closeWithDrawerClose}
                isDone={isDone}
                onBeforeAction={props.onBeforeAction}
                step={step}
                title={t(step.title)}
              />
            </li>
          );
        })}
      </ul>

      {props.nextStep ? (
        <>
          <NextStepHint
            closeWithDrawerClose={props.closeWithDrawerClose}
            onBeforeAction={props.onBeforeAction}
            onGoToStep={props.onGoToStep}
            step={props.nextStep}
            surface={props.surface}
            t={t}
            tourBaby={props.tourBaby}
          />
          {props.showDismissAction ? (
            <Button
              className="mt-2 min-h-11 w-full"
              onClick={props.onRequestDismiss}
              size="sm"
              variant="secondary"
            >
              {t("Dismiss guide")}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("Nice work — share your page and enjoy the quiet inbox.")}
          </p>
          <Button onClick={props.onDismiss} size="sm" variant="outline">
            {t("Close checklist")}
          </Button>
        </div>
      )}
    </>
  );
}

function StepRow(props: {
  action: StepAction | null;
  closeWithDrawerClose: boolean;
  isDone: boolean;
  onBeforeAction: (() => void) | undefined;
  step: OnboardingStep;
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
        {props.isDone ? <CheckIcon className="size-2.5" /> : null}
      </span>
      <span className={cn("leading-snug", props.isDone && "text-muted-foreground line-through")}>
        {props.title}
      </span>
    </>
  );

  const rowClass = "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left";

  if (props.action?.kind === "link") {
    const action = props.action;
    const link = (
      <Link
        {...action.link}
        aria-label={action.label}
        className={cn(rowClass, "transition hover:bg-primary/6")}
        onClick={() => {
          if (props.onBeforeAction) {
            props.onBeforeAction();
          }
          if (action.onClick) {
            action.onClick();
          }
        }}
      >
        {inner}
      </Link>
    );
    if (props.closeWithDrawerClose) {
      return <DrawerClose nativeButton={false} render={link} />;
    }
    return link;
  }

  if (props.action?.kind === "button") {
    const action = props.action;
    const button = (
      <button
        aria-label={action.label}
        className={cn(rowClass, "transition hover:bg-primary/6")}
        onClick={() => {
          if (props.onBeforeAction) {
            props.onBeforeAction();
          }
          action.onClick();
        }}
        type="button"
      >
        {inner}
      </button>
    );
    if (props.closeWithDrawerClose) {
      return <DrawerClose render={button} />;
    }
    return button;
  }

  return <div className={rowClass}>{inner}</div>;
}

function NextStepHint(props: {
  closeWithDrawerClose: boolean;
  onBeforeAction: (() => void) | undefined;
  onGoToStep: ((stepId: OnboardingStepId) => void) | undefined;
  step: OnboardingStep;
  surface: "dashboard" | "baby";
  t: TranslationFunction;
  tourBaby: TourBaby | null;
}) {
  const { t } = props;
  const Icon = props.step.icon;
  const action = getStepAction({
    onGoToStep: props.onGoToStep,
    step: props.step,
    surface: props.surface,
    t,
    tourBaby: props.tourBaby,
  });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{t(props.step.title)}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t(props.step.description)}
          </p>
        </div>
      </div>
      {action ? (
        <div className="flex flex-wrap gap-2">
          <StepActionControl
            action={action}
            closeWithDrawerClose={props.closeWithDrawerClose}
            onBeforeAction={props.onBeforeAction}
            size="sm"
          />
        </div>
      ) : null}
    </div>
  );
}

function StepActionControl(props: {
  action: StepAction;
  closeWithDrawerClose: boolean;
  onBeforeAction: (() => void) | undefined;
  size: "sm" | "default";
}) {
  if (props.action.kind === "link") {
    const action = props.action;
    const button = (
      <Button
        className="min-h-11"
        nativeButton={false}
        render={
          <Link
            {...action.link}
            onClick={() => {
              if (props.onBeforeAction) {
                props.onBeforeAction();
              }
              if (action.onClick) {
                action.onClick();
              }
            }}
          />
        }
        size={props.size}
      >
        {action.label}
      </Button>
    );
    if (props.closeWithDrawerClose) {
      return <DrawerClose nativeButton={false} render={button} />;
    }
    return button;
  }

  const action = props.action;
  const button = (
    <Button
      className="min-h-11"
      onClick={() => {
        if (props.onBeforeAction) {
          props.onBeforeAction();
        }
        action.onClick();
      }}
      size={props.size}
    >
      {action.label}
    </Button>
  );
  if (props.closeWithDrawerClose) {
    return <DrawerClose render={button} />;
  }
  return button;
}
