import { BabyIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@workspace/convex/convex/_generated/api";
import type { SupportedLocale } from "@workspace/convex/src/i18n";
import { homepageDemoBabyFor } from "@workspace/convex/src/seedCredentials";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { allKeyed } from "@workspace/query-prefetch";
import { Button } from "@workspace/ui/components/button";
import { LanguagePicker } from "@/components/language-picker";
import { homepageCacheHeaders } from "@/lib/cachePolicy";
import { translate, useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { setLocale } from "@/lib/paraglide-setup";
import { searchRobotsMeta } from "@/lib/robots";
import { homepageOgImagePath, openGraphImageMeta } from "@/lib/seo";
import { absoluteUrl, canonicalUrl } from "@/lib/site-url";
import { useClientDate } from "@/lib/use-client-date";
import { useRotatingIndex } from "@/lib/use-delayed-action";
import { useMeasuredWidth } from "@/lib/use-measured-width";

// Static date snapshot for SSR/hydration
// This ensures the same date is used on both server and client during hydration
const SERVER_DATE_SNAPSHOT = "2026-01-01T10:30:00.000Z";

export const Route = createFileRoute("/")({
  component: HomePage,
  headers: homepageCacheHeaders,
  loader: async (opts) => {
    return await allKeyed({
      me: opts.context.convexPreloader.ensureQueryData(api.profile.get, {}),
    });
  },
  head: (opts) => {
    const locale = opts.match.context.locale;
    const title = translate(locale, "Is Baby Out Yet? – Share Your Baby's Arrival");
    const description = translate(
      locale,
      "Stop answering 'any news yet?' texts. Create a simple page to keep everyone updated, let them send encouragement, and notify them the moment baby arrives.",
    );
    const imageUrl = absoluteUrl(homepageOgImagePath());
    return {
      links: [{ href: canonicalUrl("/"), rel: "canonical" }],
      meta: [
        {
          title,
        },
        {
          content: description,
          name: "description",
        },
        {
          content: title,
          property: "og:title",
        },
        {
          content: description,
          property: "og:description",
        },
        {
          content: canonicalUrl("/"),
          property: "og:url",
        },
        {
          content: "website",
          property: "og:type",
        },
        ...openGraphImageMeta({ alt: title, imageUrl }),
        {
          content: title,
          name: "twitter:title",
        },
        {
          content: description,
          name: "twitter:description",
        },
        ...searchRobotsMeta({ index: true }),
      ],
    };
  },
});

// lucide-react v1 removed brand icons (including Github), so inline the mark
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/**
 * Hero headline per locale. The highlighted slot cycles through the generic
 * "baby" word followed by popular local baby names. Words carry their own
 * article where the language needs one (pt-BR), so the sentence stays
 * grammatical for every name.
 */
const HERO_HEADLINES = {
  "en-GB": {
    after: "out yet?",
    before: "Is",
    words: ["baby", "Juniper", "Alfie", "Poppy", "Noah", "Ivy", "Oscar", "Freya"],
  },
  "en-US": {
    after: "out yet?",
    before: "Is",
    words: ["baby", "Willow", "Liam", "Olivia", "Wyatt", "Luna", "Ezra", "Hazel"],
  },
  es: {
    after: "o todavía no?",
    before: "¿Ya nació",
    words: ["bebé", "Lucía", "Mateo", "Sofía", "Leo", "Valentina", "Martín", "Emma"],
  },
  "pt-BR": {
    after: "já nasceu?",
    before: "",
    words: [
      "O bebê",
      "A Helena",
      "O Miguel",
      "A Alice",
      "O Arthur",
      "A Laura",
      "O Theo",
      "A Cecília",
    ],
  },
  sv: {
    after: "ute än?",
    before: "Är",
    words: ["bäbisen", "Ella", "Hugo", "Astrid", "Nils", "Maja", "Sixten", "Vera"],
  },
} as const satisfies Record<
  SupportedLocale,
  { after: string; before: string; words: ReadonlyArray<string> }
>;

const NAME_ROTATE_INTERVAL_MS = 2400;

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

function useCurrentDate() {
  return useClientDate({ serverSnapshot: SERVER_DATE_SNAPSHOT });
}

const FEATURES = [
  {
    description:
      "One tap to update everyone — labour started, at the hospital, baby's here! No group texts, no repeated calls.",
    emoji: "📣",
    title: "Update your status",
  },
  {
    description:
      'Everyone can see how many days are left — plus a friendly "overdue" counter when baby takes their time.',
    emoji: "📅",
    title: "Countdown to due date",
  },
  {
    description:
      "Pick a theme that matches your style. From soft pastels to bold colours — your page, your vibe.",
    emoji: "🎨",
    title: "Make it yours",
  },
  {
    description:
      "Anyone with the link can check in anytime. Grandma doesn't need to download an app or create an account.",
    emoji: "🔗",
    title: "No account needed",
  },
  {
    description:
      "Visitors can leave messages of love and support. Like a digital guestbook filled with well-wishes you'll treasure.",
    emoji: "💌",
    title: "Send encouragement",
  },
  {
    description:
      "Family can subscribe to push notifications and be the first to know the moment baby arrives.",
    emoji: "🔔",
    title: "Get notified",
  },
] as const satisfies ReadonlyArray<{
  description: TranslationKey;
  emoji: string;
  title: TranslationKey;
}>;

const HOW_IT_WORKS = [
  {
    description: "Sign up and add your baby's name and due date. That's it.",
    step: "1",
    title: "Create your page",
  },
  {
    description:
      "Send it to family and friends. They can check in anytime and subscribe for notifications.",
    step: "2",
    title: "Share the link",
  },
  {
    description:
      "When things start happening, update your status. Everyone gets notified automatically.",
    step: "3",
    title: "Update as you go",
  },
] as const satisfies ReadonlyArray<{
  description: TranslationKey;
  step: string;
  title: TranslationKey;
}>;

export function HomePage() {
  const loaderData = Route.useLoaderData();
  const meQuery = usePreloadedConvexQuery(api.profile.get, loaderData.me);
  return <HomePageView isSignedIn={meQuery.data != null} />;
}

/**
 * Presentational homepage. Signed-in CTAs follow the live `profile.get` query.
 *
 * @internal exported for tests
 */
export function HomePageView(props: { isSignedIn: boolean }) {
  const { locale, t } = useI18n();
  const demoBaby = homepageDemoBabyFor(locale);
  const headline = HERO_HEADLINES[locale];
  const isSignedIn = props.isSignedIn;

  const currentDate = useCurrentDate();

  // Helper to calculate dates with offsets for realistic demo scenarios
  const hoursAgo = (hours: number) => {
    const date = new Date(currentDate);
    date.setTime(date.getTime() - hours * 60 * 60 * 1000);
    return date.toISOString();
  };

  const previewStages = [
    {
      description: "Before labour starts",
      emoji: "👶",
      rotate: "group-hover:-rotate-1",
      search: { name: "Emma" },
      title: "Waiting",
    },
    {
      description: "Things are happening!",
      emoji: "💫",
      rotate: "group-hover:rotate-1",
      search: { dueDate: hoursAgo(0), laborStarted: hoursAgo(2), name: "Oliver" },
      title: "Labour started",
    },
    {
      description: "Almost there!",
      emoji: "🏥",
      rotate: "group-hover:-rotate-1",
      search: {
        hospitalMessage: "We've made it in! More news when we have it 💕",
        laborStarted: hoursAgo(4),
        name: "Sophia",
        theme: "bubblegum",
        wentToHospital: hoursAgo(1),
      },
      title: "Gone to hospital",
    },
    {
      description: "Celebrate the arrival",
      emoji: "🎉",
      rotate: "group-hover:rotate-1",
      search: {
        babyBorn: hoursAgo(0.5),
        babyBornMessage: "Welcome to the world, little one! 🎉",
        laborStarted: hoursAgo(6),
        name: "Liam",
        theme: "sunny-days",
        wentToHospital: hoursAgo(3),
      },
      title: "Baby born!",
    },
  ] as const;

  return (
    <div className="min-h-screen bg-background bg-dots">
      {/* Floating header */}
      <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <span className="flex items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 backdrop-blur-md shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
              <BabyIcon className="h-4 w-4 text-primary" />
            </span>
            <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
          </span>
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <Button
                className="rounded-full font-bold"
                nativeButton={false}
                render={<Link to="/dashboard" />}
                size="sm"
              >
                {t("Dashboard")}
              </Button>
            ) : (
              <>
                <Button
                  className="rounded-full font-bold border-2"
                  nativeButton={false}
                  render={<Link to="/auth/login" />}
                  size="sm"
                  variant="outline"
                >
                  {t("Sign in")}
                </Button>
                <Button
                  className="rounded-full font-bold"
                  nativeButton={false}
                  render={<Link to="/auth/signup" />}
                  size="sm"
                >
                  {t("Get started")}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* Hero */}
        <section className="py-16 text-center md:py-24">
          <span className="inline-block -rotate-2 rounded-full border-2 border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-extrabold text-primary pop-shadow">
            ✨ {t("Free forever, no ads")}
          </span>
          <h1 className="mx-auto mt-8 max-w-3xl text-5xl font-black tracking-tight text-foreground text-balance md:text-7xl">
            {headline.before === "" ? null : <>{headline.before} </>}
            <span className="inline-block -rotate-1 rounded-3xl bg-primary/15 px-4 text-primary">
              <span className="sr-only">{headline.words[0]}</span>
              <RotatingBabyName words={headline.words} />
            </span>{" "}
            {headline.after}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-semibold leading-relaxed text-muted-foreground md:text-xl">
            {t(
              'Stop answering "any news yet?" texts. Share one link, let everyone follow along, and tell them all at once when baby arrives. 🍼',
            )}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-3">
              {isSignedIn ? (
                <Button
                  className="h-auto rounded-full px-8 py-4 text-base font-extrabold pop-shadow-strong"
                  nativeButton={false}
                  render={<Link to="/dashboard" />}
                  size="lg"
                >
                  {t("Go to Dashboard")}
                </Button>
              ) : (
                <>
                  <Button
                    className="h-auto rounded-full px-8 py-4 text-base font-extrabold pop-shadow-strong"
                    nativeButton={false}
                    render={<Link to="/auth/signup" />}
                    size="lg"
                  >
                    {t("Create your page 🎈")}
                  </Button>
                  <Button
                    className="h-auto rounded-full border-2 bg-background/70 px-8 py-4 text-base font-extrabold"
                    nativeButton={false}
                    render={<Link to="/auth/login" />}
                    size="lg"
                    variant="outline"
                  >
                    {t("Sign in")}
                  </Button>
                </>
              )}
            </div>
            <Button
              className="h-auto rounded-full border-2 border-primary/30 bg-primary/10 px-6 py-3 text-sm font-extrabold text-primary pop-shadow hover:bg-primary/20 hover:text-primary"
              nativeButton={false}
              render={<Link params={{ publicId: demoBaby.publicId }} to="/baby/$publicId" />}
              size="lg"
              variant="secondary"
            >
              {t("See a live page")} 👀
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="py-12">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("Everything the family needs")}
            </h2>
            <p className="mt-2 font-semibold text-muted-foreground">
              {t("For you, and for everyone waiting by the phone")}
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <div
                className={`rounded-3xl border-2 border-border bg-card p-6 pop-shadow transition-transform hover:-translate-y-1 ${
                  index % 2 === 0 ? "hover:-rotate-1" : "hover:rotate-1"
                }`}
                key={feature.title}
              >
                <span aria-hidden="true" className="text-3xl">
                  {feature.emoji}
                </span>
                <h3 className="mt-3 text-lg font-extrabold text-foreground">{t(feature.title)}</h3>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
                  {t(feature.description)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* See it in action */}
        <section className="py-12">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("See it in action")}
            </h2>
            <p className="mt-2 font-semibold text-muted-foreground">
              {t("{{name}}'s page is a live demo — leave a note, look around, try it out", {
                name: demoBaby.name,
              })}
            </p>
          </div>
          <Link
            className="group mt-10 block"
            params={{ publicId: demoBaby.publicId }}
            to="/baby/$publicId"
          >
            <div className="rounded-[2rem] border-2 border-primary/30 bg-primary/10 p-8 text-center pop-shadow-strong transition-transform group-hover:-translate-y-1 md:p-10">
              <span aria-hidden="true" className="text-5xl">
                🍼
              </span>
              <h3 className="mt-4 text-2xl font-black text-foreground">
                {t("Follow {{name}}'s arrival", { name: demoBaby.name })}
              </h3>
              <p className="mx-auto mt-2 max-w-lg font-medium text-muted-foreground">
                {t(
                  "A live demo with a two-day labour story, photos, and messages. Send a test encouragement — this is the full experience.",
                )}
              </p>
              <p className="mt-4 text-sm font-extrabold text-primary">
                {t("Open the live page →")}
              </p>
            </div>
          </Link>
          <p className="mt-10 text-center font-semibold text-muted-foreground">
            {t("Or preview how each stage looks")}
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {previewStages.map((stage) => (
              <Link className="group" key={stage.title} search={stage.search} to="/preview">
                <div
                  className={`h-full rounded-3xl border-2 border-border bg-card p-6 text-center pop-shadow transition-transform group-hover:-translate-y-1 ${stage.rotate}`}
                >
                  <span aria-hidden="true" className="text-4xl">
                    {stage.emoji}
                  </span>
                  <h3 className="mt-3 font-extrabold text-foreground">{t(stage.title)}</h3>
                  <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                    {t(stage.description)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="py-12">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("How it works")}
            </h2>
            <p className="mt-2 font-semibold text-muted-foreground">
              {t("Up and running in under a minute")}
            </p>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div className="flex flex-col items-center text-center" key={item.step}>
                <div className="flex h-14 w-14 -rotate-3 items-center justify-center rounded-2xl border-2 border-primary/30 bg-primary/15 text-2xl font-black text-primary pop-shadow">
                  {item.step}
                </div>
                <h3 className="mt-4 text-lg font-extrabold text-foreground">{t(item.title)}</h3>
                <p className="mt-1.5 font-medium leading-relaxed text-muted-foreground">
                  {t(item.description)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <div className="mx-auto max-w-2xl rounded-[2rem] border-2 border-primary/25 bg-primary/10 px-8 py-12 pop-shadow-strong">
            <p aria-hidden="true" className="text-4xl">
              💖
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("Ready to share the journey?")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-lg font-semibold text-muted-foreground">
              {isSignedIn
                ? t("Head back to your dashboard to keep everyone updated.")
                : t(
                    "Join families who've already shared their special moments. Takes less than a minute.",
                  )}
            </p>
            <div className="mt-7">
              {isSignedIn ? (
                <Button
                  className="rounded-full font-extrabold"
                  nativeButton={false}
                  render={<Link to="/dashboard" />}
                  size="lg"
                >
                  {t("Go to Dashboard")}
                </Button>
              ) : (
                <Button
                  className="rounded-full font-extrabold"
                  nativeButton={false}
                  render={<Link to="/auth/signup" />}
                  size="lg"
                >
                  {t("Get Started Free 🎉")}
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-border/60 bg-background/60 px-4 py-8 text-center">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4">
          <LanguagePicker
            disabled={false}
            label={t("Language")}
            onValueChange={async (value) => {
              // Paraglide's configured cookie strategy persists explicit choices, then
              // reloads so SSR and the hydrated page use the same locale.
              await setLocale(value);
            }}
            value={locale}
          />
          <a
            className="inline-flex items-center gap-2 font-bold text-muted-foreground transition-colors hover:text-foreground"
            href="https://github.com/KATT/isbabyoutyet"
            rel="noopener noreferrer"
            target="_blank"
          >
            <GithubIcon className="h-5 w-5" />
            <span>{t("Open source on GitHub")}</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
