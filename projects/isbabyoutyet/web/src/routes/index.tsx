import { BabyIcon } from "@phosphor-icons/react";
import { allKeyed, useQuery } from "@raf-query/react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { homepageDemoBabyFor } from "@isbabyoutyet/backend/src/seedCredentials";
import { Button } from "@workspace/ui/components/button";
import { LanguagePicker } from "@/components/language-picker";
import { homepageCacheHeaders } from "@/lib/cachePolicy";
import { splitMessageList, translate, useI18n } from "@/lib/i18n";
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

const NAME_ROTATE_INTERVAL_MS = 2400;
function RotatingBabyName(props: { words: ReadonlyArray<string> }) {
  const indices = useRotatingIndex({
    intervalMs: NAME_ROTATE_INTERVAL_MS,
    itemCount: props.words.length,
  });
  const [measureCurrentWord, width] = useMeasuredWidth();
  const currentWord = props.words[indices.current] ?? "";

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
      {indices.previous !== null ? (
        <span className="pointer-events-none absolute inset-0 overflow-hidden">
          <span
            className="hero-word-out absolute left-0 top-0"
            key={`out-${indices.previous}-${indices.current}`}
          >
            {props.words[indices.previous]}
          </span>
        </span>
      ) : null}
      {/*
        Skip `hero-word-in` on the first paint. That animation starts at
        opacity 0, so a slow hydration would flash the name away and back.
        Rotations still animate once `previous` is set.
      */}
      <span
        className={indices.previous === null ? "inline-block" : "hero-word-in inline-block"}
        key={`in-${indices.current}`}
        ref={measureCurrentWord}
      >
        {currentWord}
      </span>
    </span>
  );
}

const HERO_SPARKLES = [
  { delay: "0s", scale: 1.4, x: 96, y: 118 },
  { delay: "0.8s", scale: 0.9, x: 300, y: 50 },
  { delay: "1.6s", scale: 1.1, x: 640, y: 380 },
  { delay: "0.4s", scale: 1.5, x: 884, y: 318 },
  { delay: "1.2s", scale: 0.8, x: 236, y: 370 },
] as const;

const HERO_CONFETTI = [
  { className: "fill-primary", rotate: 20, x: 330, y: 160 },
  { className: "fill-primary/50", rotate: -30, x: 622, y: 40 },
  { className: "fill-foreground/25", rotate: 45, x: 612, y: 210 },
  { className: "fill-primary/70", rotate: -15, x: 270, y: 210 },
  { className: "fill-foreground/20", rotate: 60, x: 160, y: 240 },
  { className: "fill-primary/60", rotate: 10, x: 800, y: 250 },
  { className: "fill-primary", rotate: -50, x: 900, y: 70 },
  { className: "fill-primary/40", rotate: 35, x: 60, y: 380 },
] as const;

const SPARKLE_PATH = "M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12Z";
const HEART_PATH =
  "M0 8 C-14 -2 -12 -14 -4 -14 C-1 -14 0 -11 0 -10 C0 -11 1 -14 4 -14 C12 -14 14 -2 0 8Z";

/**
 * Decorative hero art: a phone showing a just-born baby page, surrounded by
 * the notifications and encouragements it replaces the group chat with. Every
 * fill keys off theme tokens so dark mode and baby themes recolour it.
 */
function HeroIllustration() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto mt-14 w-full max-w-4xl"
      data-testid="hero-illustration"
    >
      {/*
        Below `md`, frame only the middle of the scene (x 180–780). Every shape
        is either fully inside or fully outside that window, so nothing is cut
        off at the screen edge.
      */}
      <svg className="aspect-[600/440] w-full md:hidden" viewBox="180 0 600 440">
        <HeroScene />
      </svg>
      <svg className="hidden aspect-[960/440] w-full md:block" viewBox="0 0 960 440">
        <HeroScene />
      </svg>
    </div>
  );
}

function HeroScene() {
  return (
    <>
      {HERO_CONFETTI.map((piece) => (
        <rect
          className={piece.className}
          height="7"
          key={`${piece.x}-${piece.y}`}
          rx="2"
          transform={`translate(${piece.x} ${piece.y}) rotate(${piece.rotate})`}
          width="16"
        />
      ))}
      {HERO_SPARKLES.map((sparkle) => (
        <g key={`${sparkle.x}-${sparkle.y}`} transform={`translate(${sparkle.x} ${sparkle.y})`}>
          <path
            className="hero-twinkle fill-primary/70"
            d={SPARKLE_PATH}
            style={{ animationDelay: sparkle.delay, scale: sparkle.scale }}
          />
        </g>
      ))}

      {/* Big heart, far left */}
      <g className="hero-float" style={{ animationDelay: "-1s" }}>
        <path
          className="fill-primary/80"
          d={HEART_PATH}
          transform="translate(130 300) rotate(-12) scale(3.4)"
        />
      </g>

      {/* "Any news yet?" bubble, faded: the question nobody has to ask */}
      <g className="hero-float" style={{ animationDelay: "-2.2s" }}>
        <g transform="rotate(-8 280 268)">
          <path
            className="fill-muted stroke-border"
            d="M236 238 h88 a16 16 0 0 1 16 16 v28 a16 16 0 0 1 -16 16 h-62 l-18 14 v-14 h-8 a16 16 0 0 1 -16 -16 v-28 a16 16 0 0 1 16 -16Z"
            strokeWidth="3"
          />
          {[256, 280, 304].map((x) => (
            <g className="stroke-muted-foreground/45" key={x} transform={`translate(${x} 268)`}>
              <path
                d="M-5 -6 a5 5 0 1 1 7 4.6 q-2 1 -2 4"
                fill="none"
                strokeLinecap="round"
                strokeWidth="3.5"
              />
              <circle className="fill-muted-foreground/45" cx="0" cy="9" r="1.5" />
            </g>
          ))}
          <path
            className="stroke-primary"
            d="M238 290 L326 244"
            strokeLinecap="round"
            strokeWidth="5"
          />
        </g>
      </g>

      {/* Balloons, right */}
      <g className="hero-float" style={{ animationDelay: "-0.5s" }}>
        <path
          className="stroke-foreground/30"
          d="M690 150 q-10 30 4 60 q12 26 -2 60"
          fill="none"
          strokeWidth="2.5"
        />
        <ellipse className="fill-primary" cx="690" cy="104" rx="38" ry="46" />
        <ellipse className="fill-white/45" cx="676" cy="86" rx="9" ry="15" />
        <path className="fill-primary" d="M684 152 h12 l-6 -8Z" />
      </g>
      <g className="hero-float" style={{ animationDelay: "-1.8s" }}>
        <path
          className="stroke-foreground/25"
          d="M858 166 q8 26 -4 52 q-10 22 4 48"
          fill="none"
          strokeWidth="2"
        />
        <ellipse className="fill-primary/45" cx="858" cy="130" rx="28" ry="34" />
        <ellipse className="fill-white/45" cx="848" cy="117" rx="6" ry="11" />
        <path className="fill-primary/45" d="M853 166 h10 l-5 -7Z" />
      </g>

      {/* Phone */}
      <rect className="fill-primary/30" height="400" rx="42" width="240" x="372" y="34" />
      <rect
        className="fill-card stroke-border"
        height="400"
        rx="42"
        strokeWidth="4"
        width="240"
        x="360"
        y="22"
      />
      <rect className="fill-background" height="368" rx="30" width="208" x="376" y="38" />
      <rect className="fill-border" height="9" rx="4.5" width="56" x="452" y="50" />

      {/* Baby page hero card */}
      <rect className="fill-primary/15" height="150" rx="24" width="180" x="390" y="72" />
      <circle
        className="fill-card stroke-foreground/80"
        cx="480"
        cy="136"
        r="40"
        strokeWidth="3.5"
      />
      <path className="fill-primary" d="M496 101 L522 116 L530 80Z" />
      <circle className="fill-primary" cx="530" cy="79" r="5" />
      <path
        className="stroke-foreground/80"
        d="M478 97 q-10 -14 4 -18 q10 -2 5 8"
        fill="none"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <path
        className="stroke-foreground/80"
        d="M461 134 q6 6 12 0 M487 134 q6 6 12 0 M472 152 q8 8 16 0"
        fill="none"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <circle className="fill-primary/40" cx="458" cy="148" r="6" />
      <circle className="fill-primary/40" cx="502" cy="148" r="6" />
      <rect className="fill-primary" height="22" rx="11" width="104" x="428" y="188" />
      <path
        className="fill-primary-foreground"
        d={HEART_PATH}
        transform="translate(446 200) scale(0.55)"
      />
      <rect className="fill-primary-foreground/80" height="6" rx="3" width="58" x="460" y="196" />

      {/* Milestone timeline, all four reached */}
      <path className="stroke-primary" d="M406 248 H554" strokeWidth="4" />
      {[406, 455, 505].map((x) => (
        <circle className="fill-primary" cx={x} cy="248" key={x} r="8" />
      ))}
      <circle className="fill-primary stroke-primary/30" cx="554" cy="248" r="10" strokeWidth="6" />

      {/* Copy and encouragements */}
      <rect className="fill-foreground/70" height="9" rx="4.5" width="140" x="392" y="274" />
      <rect className="fill-muted-foreground/30" height="7" rx="3.5" width="170" x="392" y="292" />
      {[316, 360].map((y) => (
        <g key={y}>
          <rect
            className="fill-card stroke-border"
            height="36"
            rx="14"
            strokeWidth="2.5"
            width="176"
            x="392"
            y={y}
          />
          <circle className="fill-primary/30" cx="412" cy={y + 18} r="9" />
          <rect className="fill-foreground/55" height="6" rx="3" width="80" x="428" y={y + 10} />
          <rect
            className="fill-muted-foreground/30"
            height="6"
            rx="3"
            width="118"
            x="428"
            y={y + 21}
          />
        </g>
      ))}

      {/* Push notification overlapping the phone, left */}
      <g className="hero-float" style={{ animationDelay: "-3s" }}>
        <g transform="rotate(-5 313 130)">
          <rect className="fill-primary/25" height="70" rx="20" width="232" x="204" y="102" />
          <rect
            className="fill-card stroke-border"
            height="70"
            rx="20"
            strokeWidth="3"
            width="232"
            x="198"
            y="94"
          />
          <rect className="fill-primary/15" height="40" rx="12" width="40" x="212" y="109" />
          <path className="fill-primary" d="M222 136 h20 l-2.5 -4 v-7 a7.5 7.5 0 0 0 -15 0 v7Z" />
          <circle className="fill-primary" cx="232" cy="139" r="2.6" />
          <rect className="fill-foreground/75" height="9" rx="4.5" width="110" x="264" y="114" />
          <rect
            className="fill-muted-foreground/30"
            height="7"
            rx="3.5"
            width="150"
            x="264"
            y="133"
          />
        </g>
      </g>

      {/* Encouragement arriving, right */}
      <g className="hero-float" style={{ animationDelay: "-1.4s" }}>
        <g transform="rotate(4 633 300)">
          <rect className="fill-primary/25" height="70" rx="20" width="232" x="524" y="272" />
          <rect
            className="fill-card stroke-border"
            height="70"
            rx="20"
            strokeWidth="3"
            width="232"
            x="518"
            y="264"
          />
          <rect className="fill-primary/15" height="40" rx="12" width="40" x="532" y="279" />
          <path
            className="fill-primary"
            d={HEART_PATH}
            transform="translate(552 301) scale(1.05)"
          />
          <rect className="fill-foreground/75" height="9" rx="4.5" width="96" x="584" y="284" />
          <rect
            className="fill-muted-foreground/30"
            height="7"
            rx="3.5"
            width="146"
            x="584"
            y="303"
          />
        </g>
      </g>
    </>
  );
}

function useCurrentDate() {
  return useClientDate({ serverSnapshot: SERVER_DATE_SNAPSHOT });
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

  const currentDate = useCurrentDate();

  // Helper to calculate dates with offsets for realistic demo scenarios
  const hoursAgo = (hours: number) => {
    const date = new Date(currentDate);
    date.setTime(date.getTime() - hours * 60 * 60 * 1000);
    return date.toISOString();
  };

  const previewNames = splitMessageList(t("Preview stage names"));
  const previewWaitingName = previewNames[0] ?? "Emma";
  const previewLabourName = previewNames[1] ?? "Oliver";
  const previewHospitalName = previewNames[2] ?? "Sophia";
  const previewBornName = previewNames[3] ?? "Liam";

  const previewStages = [
    {
      description: "Before labour starts",
      emoji: "👶",
      rotate: "group-hover:-rotate-1",
      search: { name: previewWaitingName },
      title: "Waiting",
    },
    {
      description: "Things are happening!",
      emoji: "💫",
      rotate: "group-hover:rotate-1",
      search: {
        dueDate: hoursAgo(0),
        laborStarted: hoursAgo(2),
        name: previewLabourName,
      },
      title: "Labour started",
    },
    {
      description: "Almost there!",
      emoji: "🏥",
      rotate: "group-hover:-rotate-1",
      search: {
        hospitalMessage: t("We've made it in! More news when we have it 💕"),
        laborStarted: hoursAgo(4),
        name: previewHospitalName,
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
        babyBornMessage: t("Welcome to the world, little one! 🎉"),
        laborStarted: hoursAgo(6),
        name: previewBornName,
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
        {/* Hero */}
        <section className="py-16 text-center md:py-24">
          <span className="inline-block -rotate-2 rounded-full border-2 border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-extrabold text-primary pop-shadow">
            ✨ {t("Free forever, no ads")}
          </span>
          <h1
            aria-label={heroAccessibleName}
            className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-y-1 text-5xl font-black tracking-tight text-foreground md:block md:text-balance md:text-7xl"
          >
            <span
              aria-hidden="true"
              className="inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-[0.25em] whitespace-nowrap"
            >
              {headline.before === "" ? null : <span>{headline.before}</span>}
              <span className="relative inline-flex items-baseline px-4 text-primary">
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -rotate-1 rounded-3xl bg-primary/15"
                />
                <RotatingBabyName words={headline.words} />
              </span>
            </span>
            <span aria-hidden="true" className="whitespace-nowrap md:ml-[0.25em]">
              {headline.after}
            </span>
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
              {t("See a live page 👀")}
            </Button>
          </div>
          <HeroIllustration />
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
