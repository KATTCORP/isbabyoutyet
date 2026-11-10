import { BabyIcon } from "@phosphor-icons/react";
import { allKeyed, useQuery } from "@raf-query/react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { homepageDemoBabyFor } from "@isbabyoutyet/backend/src/seedCredentials";
import { Button } from "@workspace/ui/components/button";
import { GroupChatVersusLink } from "@/components/home/group-chat";
import { ThemeGallery, ThemeStage, useHomeStage } from "@/components/home/theme-stage";
import { LanguagePicker } from "@/components/language-picker";
import { homepageCacheHeaders } from "@/lib/cachePolicy";
import { splitMessageList, translate, useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { setLocale } from "@/lib/paraglide-setup";
import { searchRobotsMeta } from "@/lib/robots";
import { homepageOgImagePath, openGraphImageMeta } from "@/lib/seo";
import { absoluteUrl, canonicalUrl } from "@/lib/site-url";
import { useMeasuredWidth } from "@/lib/use-measured-width";

export const Route = createFileRoute("/")({
  component: HomePage,
  headers: homepageCacheHeaders,
  loader: async (opts) => {
    return await allKeyed({
      me: opts.context.queryClient.ensure(convexQuery(api.profile.get), {}),
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
 * Hero headline from the translation catalog (`Hero before` / `Hero names` /
 * `Hero after`). `Hero names` is a comma-separated list: the generic "baby"
 * word first, then popular local names. Words carry their own article where
 * the language needs one (pt-BR), so the sentence stays grammatical for every
 * name.
 */
function heroHeadlineFromCatalog(t: (key: TranslationKey) => string) {
  return {
    after: t("Hero after"),
    before: t("Hero before"),
    words: splitMessageList(t("Hero names")),
  };
}

/**
 * The rotating name in the hero headline. The pill hugs the current name and
 * animates its width; the headline's font size is fitted to the longest name
 * (see {@link heroHeadlineLayout}), so a long name never wraps the line.
 * Driven by the hero's shared beat, so it changes together with the live page.
 */
function RotatingBabyName(props: { beat: number; words: ReadonlyArray<string> }) {
  const count = Math.max(props.words.length, 1);
  const current = props.beat % count;
  const previous = props.beat === 0 ? null : (props.beat - 1) % count;
  const [measureCurrentWord, width] = useMeasuredWidth();
  const currentWord = props.words[current] ?? "";

  return (
    <span
      aria-hidden="true"
      className="relative inline-block whitespace-nowrap [clip-path:inset(0)] transition-[width] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
      style={width === null ? undefined : { width }}
    >
      {/*
        Keep the current word in normal flow so it shares the alphabetic
        baseline with "Är" / "ute än?". `overflow: hidden` on this inline-block
        would pin the baseline to the bottom edge and lift the name. Clip only
        the outgoing word on an absolute overlay.
      */}
      {previous === null ? null : (
        <span className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="hero-word-out absolute top-0 left-0" key={`out-${props.beat}`}>
            {props.words[previous]}
          </span>
        </span>
      )}
      {/*
        Skip `hero-word-in` on the first paint. That animation starts at
        opacity 0, so a slow hydration would flash the name away and back.
        Rotations still animate once there is a previous word.
      */}
      <span
        className={previous === null ? "inline-block" : "hero-word-in inline-block"}
        key={`in-${props.beat}`}
        ref={measureCurrentWord}
      >
        {currentWord}
      </span>
    </span>
  );
}

/** Container-relative font size that fits `chars` characters on one line. */
function fitLine(chars: number) {
  // Nunito Black averages about 0.62em per character; the name pill's
  // padding and the word gap add about one em.
  return 100 / (chars * 0.62 + 1);
}

/**
 * Lay the headline out so its longest line stays on one line in its column.
 * Short lead-ins ("Is", "Är") share the name's line; a long one ("¿Ya nació")
 * gets its own line when that lets the headline be noticeably bigger.
 */
function heroHeadlineLayout(headline: ReturnType<typeof heroHeadlineFromCatalog>) {
  const longestWord = Math.max(...headline.words.map((word) => [...word].length), 0);
  const before = [...headline.before].length;
  const after = [...headline.after].length;
  const inline = fitLine(Math.max(before + 1 + longestWord, after));
  const stacked = fitLine(Math.max(before, longestWord, after));
  // A one-word lead-in ("Är") alone on a line reads oddly, so only stack long ones.
  const stackBefore = before >= 5 && inline < stacked * 0.8;
  const fit = stackBefore ? stacked : inline;
  return { fontSize: `min(4.5rem, ${fit.toFixed(2)}cqi)`, stackBefore };
}

const FEATURES = [
  {
    description:
      "One tap to update everyone: labour started, at the hospital, baby's here! No group texts, no repeated calls.",
    emoji: "📣",
    title: "Update your status",
  },
  {
    description:
      'Everyone can see how many days are left, plus a friendly "overdue" counter when baby takes their time.',
    emoji: "📅",
    title: "Countdown to due date",
  },
  {
    description:
      "Pick a theme that matches your style. From soft pastels to bold colours. Your page, your vibe.",
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

function HomePage() {
  const loaderData = Route.useLoaderData();
  const [meData] = useQuery(convexQuery(api.profile.get), loaderData.me);
  return <HomePageView isSignedIn={meData != null} />;
}

/**
 * Presentational homepage. Signed-in CTAs follow the live `profile.get` query.
 *
 * @internal exported for tests
 */
export function HomePageView(props: { isSignedIn: boolean }) {
  const { locale, t } = useI18n();
  const demoBaby = homepageDemoBabyFor(locale);
  const headline = heroHeadlineFromCatalog(t);
  const heroAccessibleName = [headline.before, headline.words[0], headline.after]
    .filter((part) => part !== "" && part !== undefined)
    .join(" ");
  const isSignedIn = props.isSignedIn;
  const demoFirstName = demoBaby.name.split(" ")[0] ?? demoBaby.name;
  const stage = useHomeStage();
  // The headline and the live page show the same name, on the same beat.
  const heroName = headline.words[stage.beat % Math.max(headline.words.length, 1)] ?? demoFirstName;
  const headlineLayout = heroHeadlineLayout(headline);

  return (
    <div className="min-h-screen bg-background bg-dots">
      {/* Floating header */}
      <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <span className="flex items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-2 backdrop-blur-md shadow-sm min-[360px]:pr-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
              <BabyIcon className="h-4 w-4 text-primary" />
            </span>
            <span className="sr-only text-sm font-extrabold tracking-tight min-[360px]:not-sr-only">
              isbabyoutyet
            </span>
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
        {/* Hero: pitch on the left, a live baby page playing through every theme on the right */}
        <section className="grid items-center gap-14 py-12 md:grid-cols-[1.05fr_1fr] md:py-20">
          <div className="@container text-center md:text-left">
            <span className="inline-block -rotate-2 rounded-full border-2 border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-extrabold text-primary pop-shadow">
              ✨ {t("Free forever, no ads")}
            </span>
            <h1
              aria-label={heroAccessibleName}
              className="mt-8 flex flex-col items-center gap-y-1 font-black tracking-tight text-foreground md:items-start"
              style={{ fontSize: headlineLayout.fontSize }}
            >
              {headlineLayout.stackBefore ? (
                <span aria-hidden="true" className="whitespace-nowrap">
                  {headline.before}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className="inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-[0.25em] whitespace-nowrap"
              >
                {headline.before === "" || headlineLayout.stackBefore ? null : (
                  <span>{headline.before}</span>
                )}
                <span className="relative inline-flex items-baseline px-4 text-primary">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -rotate-1 rounded-3xl bg-primary/15"
                  />
                  <RotatingBabyName beat={stage.beat} words={headline.words} />
                </span>
              </span>
              <span aria-hidden="true" className="whitespace-nowrap">
                {headline.after}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-semibold leading-relaxed text-muted-foreground md:text-xl">
              {t(
                'Stop answering "any news yet?" texts. Share one link, let everyone follow along, and tell them all at once when baby arrives. 🍼',
              )}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 md:items-start">
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
                {t("See a live page 👀")}
              </Button>
            </div>
          </div>
          <ThemeStage babyName={heroName} control={stage} />
        </section>

        {/* The problem, and the fix */}
        <section className="py-12">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("Your phone, the week baby is due")}
            </h2>
            <p className="mt-2 font-semibold text-muted-foreground">
              {t("Every relative, every hour, the same question.")}
            </p>
          </div>
          <div className="mt-10">
            <GroupChatVersusLink babyName={demoFirstName} publicId={demoBaby.publicId} />
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
              {t("{{name}}'s page is a live demo. Leave a note, look around, try it out", {
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
                  "A live demo with a two-day labour story, photos, and messages. Send a test encouragement. This is the full experience.",
                )}
              </p>
              <p className="mt-4 text-sm font-extrabold text-primary">
                {t("Open the live page →")}
              </p>
            </div>
          </Link>
        </section>

        {/* Themes */}
        <section className="py-12">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("Pick a look that feels like you")}
            </h2>
            <p className="mt-2 font-semibold text-muted-foreground">
              {t("Eight themes, in light and dark. Change it any time.")}
            </p>
          </div>
          <div className="mt-10">
            <ThemeGallery babyName={demoFirstName} />
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
            href="https://github.com/KATTCORP/isbabyoutyet/tree/main/projects/isbabyoutyet"
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
