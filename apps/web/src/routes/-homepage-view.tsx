"use client";

import { homepageDemoBabyFor } from "@workspace/convex/src/seedCredentials";
import {
  FEATURES,
  HERO_HEADLINES,
  HOW_IT_WORKS,
  buildHomepagePreviewStages,
} from "@/routes/-homepage-copy";
import {
  HomepageAuthHeaderActions,
  HomepageBottomCta,
  HomepageHeroCtas,
  HomepageHeroHeadline,
  HomepageLocalePicker,
  HomepageSeeItInAction,
} from "@/routes/-homepage-islands";
import {
  HomepageBrandMark,
  HomepageFeaturesSection,
  HomepageGithubLink,
  HomepageHowItWorksSection,
} from "@/routes/-homepage-static";
import { useClientDate } from "@/lib/use-client-date";
import { useI18n } from "@/lib/i18n";

/**
 * Client-composed homepage used by Vitest (no TanStack Start ALS for RSC) and
 * as a fallback when the loader cannot return a composite source.
 */
export function HomePageView(props: { isSignedIn: boolean }) {
  const { locale, t } = useI18n();
  const demoBaby = homepageDemoBabyFor(locale);
  const headline = HERO_HEADLINES[locale];
  const currentDate = useClientDate({ serverSnapshot: "2026-01-01T10:30:00.000Z" });
  const previewStages = buildHomepagePreviewStages(Date.parse(currentDate));
  const isSignedIn = props.isSignedIn;

  return (
    <div className="min-h-screen bg-background bg-dots">
      <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <HomepageBrandMark />
          <div className="flex items-center gap-2">
            <HomepageAuthHeaderActions
              dashboardLabel={t("Dashboard")}
              getStartedLabel={t("Get started")}
              isSignedIn={isSignedIn}
              signInLabel={t("Sign in")}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-16 text-center md:py-24">
          <span className="inline-block -rotate-2 rounded-full border-2 border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-extrabold text-primary pop-shadow">
            ✨ {t("Free forever, no ads")}
          </span>
          <HomepageHeroHeadline
            after={headline.after}
            before={headline.before}
            words={headline.words}
          />
          <p className="mx-auto mt-6 max-w-2xl text-lg font-semibold leading-relaxed text-muted-foreground md:text-xl">
            {t(
              'Stop answering "any news yet?" texts. Share one link, let everyone follow along, and tell them all at once when baby arrives. 🍼',
            )}
          </p>
          <HomepageHeroCtas
            createPageLabel={t("Create your page 🎈")}
            demoPublicId={demoBaby.publicId}
            goToDashboardLabel={t("Go to Dashboard")}
            isSignedIn={isSignedIn}
            seeLivePageLabel={t("See a live page")}
            signInLabel={t("Sign in")}
          />
        </section>

        <HomepageFeaturesSection
          features={FEATURES.map((feature) => ({
            description: t(feature.description),
            emoji: feature.emoji,
            title: t(feature.title),
          }))}
          subtitle={t("For you, and for everyone waiting by the phone")}
          title={t("Everything the family needs")}
        />

        <HomepageSeeItInAction
          demoDescription={t(
            "A live demo with a two-day labour story, photos, and messages. Send a test encouragement — this is the full experience.",
          )}
          demoPublicId={demoBaby.publicId}
          demoTitle={t("Follow {{name}}'s arrival", { name: demoBaby.name })}
          openLivePageLabel={t("Open the live page →")}
          orPreviewLabel={t("Or preview how each stage looks")}
          previewStages={previewStages}
          stageDescriptions={previewStages.map((stage) => t(stage.description))}
          stageTitles={previewStages.map((stage) => t(stage.title))}
          subtitle={t("{{name}}'s page is a live demo — leave a note, look around, try it out", {
            name: demoBaby.name,
          })}
          title={t("See it in action")}
        />

        <HomepageHowItWorksSection
          steps={HOW_IT_WORKS.map((item) => ({
            description: t(item.description),
            step: item.step,
            title: t(item.title),
          }))}
          subtitle={t("Up and running in under a minute")}
          title={t("How it works")}
        />

        <HomepageBottomCta
          body={
            isSignedIn
              ? t("Head back to your dashboard to keep everyone updated.")
              : t(
                  "Join families who've already shared their special moments. Takes less than a minute.",
                )
          }
          buttonLabel={isSignedIn ? t("Go to Dashboard") : t("Get Started Free 🎉")}
          isSignedIn={isSignedIn}
          title={t("Ready to share the journey?")}
        />
      </main>

      <footer className="border-t-2 border-border/60 bg-background/60 px-4 py-8 text-center">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4">
          <HomepageLocalePicker label={t("Language")} locale={locale} />
          <HomepageGithubLink label={t("Open source on GitHub")} />
        </div>
      </footer>
    </div>
  );
}
