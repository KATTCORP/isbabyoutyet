import { Link } from "@tanstack/react-router";
import type { BabyData, BabyStatus } from "@isbabyoutyet/backend/src/types";
import { getCurrentStatus, milestoneVisibilityForPreset } from "@isbabyoutyet/backend/src/types";
import { DEFAULT_TIME_ZONE } from "@isbabyoutyet/backend/src/timeZone";
import { ProgressIndicator } from "@/components/baby/progress-indicator";
import { StatusDisplay } from "@/components/baby/status-display";
import { THEME_OPTIONS, getThemeCss } from "@/components/baby/utils";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { useClientDate } from "@/lib/use-client-date";
import { useThemeStage } from "@/lib/use-theme-stage";

/** Matches the homepage's SSR snapshot so stage dates hydrate identically. */
const SERVER_DATE_SNAPSHOT = "2026-01-01T10:30:00.000Z";
/**
 * The hero's beat: the headline name changes every beat, and the stage moves
 * one step every two beats (4.8s), slow enough to read each step.
 */
const BEAT_MS = 2400;
const STEP_EVERY_BEATS = 2;

type ThemeValue = (typeof THEME_OPTIONS)[number]["value"];

const STAGES = [
  { answerKey: "Not yet", emoji: "👶", labelKey: "Waiting", type: "not_yet" },
  { answerKey: "Labour started!", emoji: "💫", labelKey: "Labour started", type: "labor_started" },
  {
    answerKey: "Gone to hospital!",
    emoji: "🏥",
    labelKey: "Gone to hospital",
    type: "gone_to_hospital",
  },
  { answerKey: "Yes! Baby is out", emoji: "🎉", labelKey: "Baby born!", type: "born" },
] as const satisfies ReadonlyArray<{
  answerKey: TranslationKey;
  emoji: string;
  labelKey: TranslationKey;
  type: BabyStatus["type"];
}>;

type Stage = (typeof STAGES)[number];

/** `data-baby-theme` value for a theme option (Mango is the unset default). */
function themeKey(value: ThemeValue) {
  return value ?? "mango";
}

/**
 * Re-scope a theme stylesheet from the document root to one container, so a
 * page can show several themes at once.
 */
export function scopeThemeCss(opts: { css: string; scope: string }) {
  const selector = `[data-theme-scope="${opts.scope}"]`;
  return opts.css
    .replace(/^:root\s*\{/m, `${selector} {`)
    .replace(/^\.dark\s*\{/m, `.dark ${selector} {`);
}

/** Mango needs no CSS: it is the homepage's own palette. */
function ThemeScope(props: { value: ThemeValue }) {
  const css = getThemeCss(props.value);
  return css ? (
    <style
      dangerouslySetInnerHTML={{ __html: scopeThemeCss({ css, scope: themeKey(props.value) }) }}
    />
  ) : null;
}

function stageBaby(opts: { name: string; now: string; stage: Stage; theme: ThemeValue }): BabyData {
  const now = new Date(opts.now).getTime();
  const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const reached = STAGES.findIndex((stage) => stage.type === opts.stage.type);
  return {
    babyBorn: reached >= 3 ? hoursAgo(0.5) : null,
    dueDate: new Date(now + 12 * 86_400_000).toISOString(),
    dueDateDisplayMode: "exact",
    laborStarted: reached >= 1 ? hoursAgo(reached === 1 ? 2 : 7) : null,
    milestoneVisibility: milestoneVisibilityForPreset("labor"),
    name: opts.name,
    photoId: null,
    publicDueDateText: null,
    theme: opts.theme,
    timeZone: DEFAULT_TIME_ZONE,
    wentToHospital: reached >= 2 ? hoursAgo(reached === 2 ? 1 : 3) : null,
  };
}

const CONFETTI_PIECES = Array.from({ length: 14 }, (_, index) => ({
  color: ["var(--primary)", "var(--secondary)", "var(--accent)"][index % 3],
  delay: `${(index % 7) * 0.09}s`,
  id: `confetti-${index}`,
  left: `${6 + ((index * 37) % 88)}%`,
  rotate: `${(index * 47) % 180}deg`,
}));

function StageConfetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-full">
      {CONFETTI_PIECES.map((piece) => (
        <span
          className="stage-confetti absolute top-0 block h-2.5 w-1.5 rounded-sm"
          key={piece.id}
          style={{
            animationDelay: piece.delay,
            backgroundColor: piece.color,
            left: piece.left,
            rotate: piece.rotate,
          }}
        />
      ))}
    </div>
  );
}

function StageStep(props: {
  active: boolean;
  babyName: string;
  now: string;
  stage: Stage;
  theme: ThemeValue;
}) {
  const baby = stageBaby({
    name: props.babyName,
    now: props.now,
    stage: props.stage,
    theme: props.theme,
  });
  const currentStatus = getCurrentStatus(baby);
  // No "latest from the family" box: the notification toast tells that part,
  // and the stage has to fit on one screen together with its controls.
  return (
    <div
      aria-hidden={!props.active}
      className={`[grid-area:1/1] transition-[opacity,visibility] duration-500 ease-out motion-reduce:transition-none ${
        props.active ? "visible opacity-100" : "invisible opacity-0"
      }`}
      data-active={props.active ? "" : undefined}
      inert={!props.active}
    >
      <StatusDisplay
        baby={baby}
        blurDataUrl={null}
        currentStatus={currentStatus}
        latestUpdate={null}
        photoUrl={null}
        publicId={null}
        thumbnailUrl={null}
      />
      <ProgressIndicator baby={baby} currentStatus={currentStatus} />
    </div>
  );
}

/**
 * The homepage hero: a real (mini) baby page that plays through the journey
 * and re-skins itself through every theme, until the visitor takes over.
 */
/** The hero's one clock: stage steps, themes, and the headline name share it. */
export function useHomeStage() {
  return useThemeStage({
    intervalMs: BEAT_MS,
    stageCount: STAGES.length,
    stepEveryBeats: STEP_EVERY_BEATS,
    themeCount: THEME_OPTIONS.length,
  });
}

export function ThemeStage(props: { babyName: string; control: ReturnType<typeof useHomeStage> }) {
  const { t } = useI18n();
  const now = useClientDate({ serverSnapshot: SERVER_DATE_SNAPSHOT });
  const { announced, pickStage, pickTheme, stageIndex, themeIndex } = props.control;

  const stage = STAGES[stageIndex] ?? STAGES[0];
  const theme = THEME_OPTIONS[themeIndex] ?? THEME_OPTIONS[0];

  return (
    <div className="mx-auto w-full max-w-[25rem]">
      <div className="relative">
        {announced > 0 && stage.type !== "not_yet" ? (
          <div
            aria-live="polite"
            className="stage-toast absolute -top-6 right-0 left-6 z-20 flex items-center gap-3 rounded-2xl border-2 border-border bg-card/95 px-4 py-3 text-left shadow-xl backdrop-blur md:-right-10 md:left-auto md:w-72"
            data-theme-scope={themeKey(theme.value)}
            key={`${themeIndex}-${stageIndex}-${announced}`}
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg"
            >
              🔔
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-foreground">
                {props.babyName}
              </span>
              <span className="block truncate text-sm font-bold text-muted-foreground">
                {t(stage.answerKey)}
              </span>
            </span>
          </div>
        ) : null}

        <div
          className="stage-mockup stage-theme-in relative overflow-hidden rounded-[2.5rem] border-2 border-border bg-background bg-dots px-4 pt-4 pb-5 pop-shadow-strong"
          data-baby-theme={themeKey(theme.value)}
          data-testid="theme-stage"
          data-theme-scope={themeKey(theme.value)}
          data-theme-stage=""
          // Re-keyed per theme so the fade-in replays on every theme change.
          key={themeKey(theme.value)}
        >
          <ThemeScope value={theme.value} />
          <div className="flex items-center justify-between px-1">
            <span className="rounded-full border-2 border-border bg-background/85 px-3 py-1 text-xs font-extrabold text-foreground">
              isbabyoutyet
            </span>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-extrabold text-primary">
              {t(theme.labelKey)}
            </span>
          </div>
          {/* One line whatever the name, so the stage never changes height. */}
          <p className="truncate px-2 pt-5 pb-4 text-center text-2xl font-black tracking-tight whitespace-nowrap text-foreground">
            {t("Is {{name}} out yet?", { name: props.babyName })}
          </p>
          {/*
          Every step renders in the same grid cell and only the active one is
          visible, so the card is always as tall as its tallest step and the
          page never bounces while the demo plays.
        */}
          <section
            className="grid rounded-[2rem] border-2 border-border bg-card px-4 pb-5 text-center pop-shadow-strong"
            data-theme-slot="card"
          >
            {STAGES.map((option, index) => (
              <StageStep
                active={index === stageIndex}
                babyName={props.babyName}
                key={option.type}
                now={now}
                stage={option}
                theme={theme.value}
              />
            ))}
          </section>
          {stage.type === "born" ? <StageConfetti key={`${themeIndex}-${announced}`} /> : null}
        </div>
      </div>

      {/*
        Compact controls: a stepper of emoji dots (the stage already shows the
        status in words, so labels live in tooltips and accessible names) and
        the theme swatches, in two short rows under the stage.
      */}
      <div className="mt-5 flex flex-col items-center gap-4">
        <div className="relative flex items-center gap-3">
          <span
            aria-hidden="true"
            className="absolute top-1/2 right-4 left-4 h-0.5 -translate-y-1/2 bg-border"
          />
          {STAGES.map((option, index) => (
            <button
              aria-label={t(option.labelKey)}
              aria-pressed={index === stageIndex}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg transition-[transform,background-color,border-color] duration-300 hover:scale-110 ${
                index === stageIndex
                  ? "scale-110 border-primary bg-primary shadow-md"
                  : "border-border bg-card"
              }`}
              key={option.type}
              onClick={() => {
                pickStage(index);
              }}
              title={t(option.labelKey)}
              type="button"
            >
              <span aria-hidden="true">{option.emoji}</span>
            </button>
          ))}
        </div>
        <div aria-label={t("Pick a theme")} className="flex justify-center gap-2" role="group">
          {THEME_OPTIONS.map((option, index) => (
            <button
              aria-label={t(option.labelKey)}
              aria-pressed={index === themeIndex}
              className={`h-7 w-7 overflow-hidden rounded-full border-2 transition-transform duration-300 hover:scale-110 ${
                index === themeIndex ? "scale-110 border-foreground" : "border-border"
              }`}
              key={themeKey(option.value)}
              onClick={() => {
                pickTheme(index);
              }}
              style={{
                background: `conic-gradient(${option.colors[0]} 0 50%, ${option.colors[2]} 50% 75%, ${option.colors[1]} 75%)`,
              }}
              title={t(option.labelKey)}
              type="button"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Every theme as a tiny page, each linking to the full preview in that theme.
 */
export function ThemeGallery(props: { babyName: string }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {THEME_OPTIONS.map((option, index) => (
        <Link
          className={`group relative block overflow-hidden rounded-[2rem] border-2 border-border bg-background bg-dots p-4 text-center pop-shadow transition-transform hover:-translate-y-1 ${
            index % 2 === 0 ? "hover:-rotate-1" : "hover:rotate-1"
          }`}
          data-baby-theme={themeKey(option.value)}
          data-theme-scope={themeKey(option.value)}
          data-theme-stage=""
          key={themeKey(option.value)}
          search={{ name: props.babyName, theme: option.value }}
          to="/preview"
        >
          <ThemeScope value={option.value} />
          <div className="flex justify-center pt-6">
            <div className="relative inline-flex" data-theme-slot="avatar-frame">
              <div
                className="inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-primary/25 bg-primary/10 text-4xl pop-shadow"
                data-theme-slot="avatar"
              >
                <span aria-hidden="true">👶</span>
              </div>
            </div>
          </div>
          <p
            className="mt-6 text-2xl font-black tracking-tight text-primary"
            data-theme-slot="answer"
          >
            {t("Not yet")}
          </p>
          <p className="mt-1 text-sm font-extrabold text-foreground">{t(option.labelKey)}</p>
          <p className="mt-3 text-xs font-extrabold text-primary opacity-80 group-hover:opacity-100">
            {t("Try it →")}
          </p>
        </Link>
      ))}
    </div>
  );
}
