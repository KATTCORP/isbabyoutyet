import type { ReactNode } from "react";
import { createServerFn } from "@tanstack/react-start";
import { createCompositeComponent } from "@tanstack/react-start/rsc";
import { SUPPORTED_LOCALES } from "@workspace/convex/src/i18n";
import { homepageDemoBabyFor } from "@workspace/convex/src/seedCredentials";
import { z } from "zod";
import {
  FEATURES,
  HERO_HEADLINES,
  HOW_IT_WORKS,
  buildHomepagePreviewStages,
  type HomepagePreviewStage,
} from "@/routes/-homepage-copy";
import {
  HomepageBrandMark,
  HomepageFeaturesSection,
  HomepageGithubLink,
  HomepageHowItWorksSection,
} from "@/routes/-homepage-static";
import { translate } from "@/lib/i18n-catalog";

type HomepageHeroHeadlineData = {
  after: string;
  before: string;
  words: ReadonlyArray<string>;
};

type HomepageHeroCtasData = {
  demoPublicId: string;
};

type HomepageSeeItInActionData = {
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
};

type HomepageFooterLocaleData = {
  languageLabel: string;
  locale: (typeof SUPPORTED_LOCALES)[number];
};

type HomepageRscSlots = {
  /**
   * Named slots are functions on the server proxy — call them
   * (`props.renderHeaderActions()`) so Flight records a ClientSlot
   * placeholder. Passing the function through as JSX children throws
   * "Functions cannot be passed directly to Client Components".
   */
  renderBottomCta: () => ReactNode;
  renderFooterLocale: (data: HomepageFooterLocaleData) => ReactNode;
  renderHeaderActions: () => ReactNode;
  renderHeroCtas: (data: HomepageHeroCtasData) => ReactNode;
  renderHeroHeadline: (data: HomepageHeroHeadlineData) => ReactNode;
  renderSeeItInAction: (data: HomepageSeeItInActionData) => ReactNode;
};

const homepageRscInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

/**
 * Locale-keyed homepage shell as a TanStack Start Composite Component.
 * Static marketing sections render on the server; interactive islands fill slots.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/server-components
 */
export const getHomepageRsc = createServerFn({ method: "GET" })
  .validator(homepageRscInput)
  .handler(async (ctx) => {
    const locale = ctx.data.locale;
    const demoBaby = homepageDemoBabyFor(locale);
    const headline = HERO_HEADLINES[locale];
    const previewStages = buildHomepagePreviewStages(Date.now());

    const features = FEATURES.map((feature) => ({
      description: translate(locale, feature.description),
      emoji: feature.emoji,
      title: translate(locale, feature.title),
    }));

    const steps = HOW_IT_WORKS.map((item) => ({
      description: translate(locale, item.description),
      step: item.step,
      title: translate(locale, item.title),
    }));

    const copy = {
      badge: translate(locale, "Free forever, no ads"),
      featuresSubtitle: translate(locale, "For you, and for everyone waiting by the phone"),
      featuresTitle: translate(locale, "Everything the family needs"),
      githubLabel: translate(locale, "Open source on GitHub"),
      heroSubcopy: translate(
        locale,
        'Stop answering "any news yet?" texts. Share one link, let everyone follow along, and tell them all at once when baby arrives. 🍼',
      ),
      howSubtitle: translate(locale, "Up and running in under a minute"),
      howTitle: translate(locale, "How it works"),
      languageLabel: translate(locale, "Language"),
    };

    const seeItInActionData = {
      demoDescription: translate(
        locale,
        "A live demo with a two-day labour story, photos, and messages. Send a test encouragement — this is the full experience.",
      ),
      demoPublicId: demoBaby.publicId,
      demoTitle: translate(locale, "Follow {{name}}'s arrival", { name: demoBaby.name }),
      openLivePageLabel: translate(locale, "Open the live page →"),
      orPreviewLabel: translate(locale, "Or preview how each stage looks"),
      previewStages,
      stageDescriptions: previewStages.map((stage) => translate(locale, stage.description)),
      stageTitles: previewStages.map((stage) => translate(locale, stage.title)),
      subtitle: translate(
        locale,
        "{{name}}'s page is a live demo — leave a note, look around, try it out",
        { name: demoBaby.name },
      ),
      title: translate(locale, "See it in action"),
    } satisfies HomepageSeeItInActionData;

    function HomepageShell(props: HomepageRscSlots) {
      return (
        <div className="min-h-screen bg-background bg-dots">
          <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
              <HomepageBrandMark />
              <div className="flex items-center gap-2">{props.renderHeaderActions()}</div>
            </div>
          </header>

          <main className="mx-auto max-w-5xl px-6">
            <section className="py-16 text-center md:py-24">
              <span className="inline-block -rotate-2 rounded-full border-2 border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-extrabold text-primary pop-shadow">
                ✨ {copy.badge}
              </span>
              {props.renderHeroHeadline({
                after: headline.after,
                before: headline.before,
                words: headline.words,
              })}
              <p className="mx-auto mt-6 max-w-2xl text-lg font-semibold leading-relaxed text-muted-foreground md:text-xl">
                {copy.heroSubcopy}
              </p>
              {props.renderHeroCtas({ demoPublicId: demoBaby.publicId })}
            </section>

            <HomepageFeaturesSection
              features={features}
              subtitle={copy.featuresSubtitle}
              title={copy.featuresTitle}
            />

            {props.renderSeeItInAction(seeItInActionData)}

            <HomepageHowItWorksSection
              steps={steps}
              subtitle={copy.howSubtitle}
              title={copy.howTitle}
            />

            {props.renderBottomCta()}
          </main>

          <footer className="border-t-2 border-border/60 bg-background/60 px-4 py-8 text-center">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-4">
              {props.renderFooterLocale({
                languageLabel: copy.languageLabel,
                locale,
              })}
              <HomepageGithubLink label={copy.githubLabel} />
            </div>
          </footer>
        </div>
      );
    }

    const src = await createCompositeComponent(HomepageShell);

    return { src };
  });
