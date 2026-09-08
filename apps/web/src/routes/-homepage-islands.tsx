"use client";

import { Link } from "@tanstack/react-router";
import type { SupportedLocale } from "@workspace/convex/src/i18n";
import { Button } from "@workspace/ui/components/button";
import { LanguagePicker } from "@/components/language-picker";
import { setLocale } from "@/lib/paraglide-setup";
import { useRotatingIndex } from "@/lib/use-delayed-action";
import { useMeasuredWidth } from "@/lib/use-measured-width";
import { NAME_ROTATE_INTERVAL_MS, type HomepagePreviewStage } from "@/routes/-homepage-copy";

export function HomepageHeroHeadline(props: {
  after: string;
  before: string;
  words: ReadonlyArray<string>;
}) {
  return (
    <h1 className="mx-auto mt-8 max-w-3xl text-5xl font-black tracking-tight text-foreground text-balance md:text-7xl">
      {props.before === "" ? null : <>{props.before} </>}
      <span className="inline-block -rotate-1 rounded-3xl bg-primary/15 px-4 text-primary">
        <span className="sr-only">{props.words[0]}</span>
        <RotatingBabyName words={props.words} />
      </span>{" "}
      {props.after}
    </h1>
  );
}

function RotatingBabyName(props: { words: ReadonlyArray<string> }) {
  const indices = useRotatingIndex({
    intervalMs: NAME_ROTATE_INTERVAL_MS,
    itemCount: props.words.length,
  });
  const [measureCurrentWord, width] = useMeasuredWidth();

  return (
    <span
      aria-hidden="true"
      className="relative inline-block overflow-hidden whitespace-nowrap transition-[width] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
      style={width === null ? undefined : { width }}
    >
      {indices.previous !== null ? (
        <span
          className="hero-word-out absolute left-0 top-0"
          key={`out-${indices.previous}-${indices.current}`}
        >
          {props.words[indices.previous]}
        </span>
      ) : null}
      <span
        className="hero-word-in inline-block"
        key={`in-${indices.current}`}
        ref={measureCurrentWord}
      >
        {props.words[indices.current]}
      </span>
    </span>
  );
}

export function HomepageAuthHeaderActions(props: {
  dashboardLabel: string;
  getStartedLabel: string;
  isSignedIn: boolean;
  signInLabel: string;
}) {
  if (props.isSignedIn) {
    return (
      <Button
        className="rounded-full font-bold"
        nativeButton={false}
        render={<Link to="/dashboard" />}
        size="sm"
      >
        {props.dashboardLabel}
      </Button>
    );
  }

  return (
    <>
      <Button
        className="rounded-full font-bold border-2"
        nativeButton={false}
        render={<Link to="/auth/login" />}
        size="sm"
        variant="outline"
      >
        {props.signInLabel}
      </Button>
      <Button
        className="rounded-full font-bold"
        nativeButton={false}
        render={<Link to="/auth/signup" />}
        size="sm"
      >
        {props.getStartedLabel}
      </Button>
    </>
  );
}

export function HomepageHeroCtas(props: {
  createPageLabel: string;
  demoPublicId: string;
  goToDashboardLabel: string;
  isSignedIn: boolean;
  seeLivePageLabel: string;
  signInLabel: string;
}) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-3">
        {props.isSignedIn ? (
          <Button
            className="h-auto rounded-full px-8 py-4 text-base font-extrabold pop-shadow-strong"
            nativeButton={false}
            render={<Link to="/dashboard" />}
            size="lg"
          >
            {props.goToDashboardLabel}
          </Button>
        ) : (
          <>
            <Button
              className="h-auto rounded-full px-8 py-4 text-base font-extrabold pop-shadow-strong"
              nativeButton={false}
              render={<Link to="/auth/signup" />}
              size="lg"
            >
              {props.createPageLabel}
            </Button>
            <Button
              className="h-auto rounded-full border-2 bg-background/70 px-8 py-4 text-base font-extrabold"
              nativeButton={false}
              render={<Link to="/auth/login" />}
              size="lg"
              variant="outline"
            >
              {props.signInLabel}
            </Button>
          </>
        )}
      </div>
      <Button
        className="h-auto rounded-full border-2 border-primary/30 bg-primary/10 px-6 py-3 text-sm font-extrabold text-primary pop-shadow hover:bg-primary/20 hover:text-primary"
        nativeButton={false}
        render={<Link params={{ publicId: props.demoPublicId }} to="/baby/$publicId" />}
        size="lg"
        variant="secondary"
      >
        {props.seeLivePageLabel} 👀
      </Button>
    </div>
  );
}

export function HomepageSeeItInAction(props: {
  demoDescription: string;
  demoPublicId: string;
  demoTitle: string;
  openLivePageLabel: string;
  orPreviewLabel: string;
  previewStages: ReadonlyArray<HomepagePreviewStage>;
  stageDescriptions: ReadonlyArray<string>;
  stageTitles: ReadonlyArray<string>;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="py-12">
      <div className="text-center">
        <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
          {props.title}
        </h2>
        <p className="mt-2 font-semibold text-muted-foreground">{props.subtitle}</p>
      </div>
      <Link
        className="group mt-10 block"
        params={{ publicId: props.demoPublicId }}
        to="/baby/$publicId"
      >
        <div className="rounded-[2rem] border-2 border-primary/30 bg-primary/10 p-8 text-center pop-shadow-strong transition-transform group-hover:-translate-y-1 md:p-10">
          <span aria-hidden="true" className="text-5xl">
            🍼
          </span>
          <h3 className="mt-4 text-2xl font-black text-foreground">{props.demoTitle}</h3>
          <p className="mx-auto mt-2 max-w-lg font-medium text-muted-foreground">
            {props.demoDescription}
          </p>
          <p className="mt-4 text-sm font-extrabold text-primary">{props.openLivePageLabel}</p>
        </div>
      </Link>
      <p className="mt-10 text-center font-semibold text-muted-foreground">
        {props.orPreviewLabel}
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {props.previewStages.map((stage, index) => (
          <Link className="group" key={stage.title} search={stage.search} to="/preview">
            <div
              className={`h-full rounded-3xl border-2 border-border bg-card p-6 text-center pop-shadow transition-transform group-hover:-translate-y-1 ${stage.rotate}`}
            >
              <span aria-hidden="true" className="text-4xl">
                {stage.emoji}
              </span>
              <h3 className="mt-3 font-extrabold text-foreground">{props.stageTitles[index]}</h3>
              <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                {props.stageDescriptions[index]}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function HomepageBottomCta(props: {
  body: string;
  buttonLabel: string;
  isSignedIn: boolean;
  title: string;
}) {
  return (
    <section className="py-16 text-center">
      <div className="mx-auto max-w-2xl rounded-[2rem] border-2 border-primary/25 bg-primary/10 px-8 py-12 pop-shadow-strong">
        <p aria-hidden="true" className="text-4xl">
          💖
        </p>
        <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-4xl">
          {props.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-lg font-semibold text-muted-foreground">
          {props.body}
        </p>
        <div className="mt-7">
          {props.isSignedIn ? (
            <Button
              className="rounded-full font-extrabold"
              nativeButton={false}
              render={<Link to="/dashboard" />}
              size="lg"
            >
              {props.buttonLabel}
            </Button>
          ) : (
            <Button
              className="rounded-full font-extrabold"
              nativeButton={false}
              render={<Link to="/auth/signup" />}
              size="lg"
            >
              {props.buttonLabel}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export function HomepageLocalePicker(props: { label: string; locale: SupportedLocale }) {
  return (
    <LanguagePicker
      disabled={false}
      label={props.label}
      onValueChange={async (value) => {
        // Paraglide's configured cookie strategy persists explicit choices, then
        // reloads so SSR and the hydrated page use the same locale.
        await setLocale(value);
      }}
      value={props.locale}
    />
  );
}
