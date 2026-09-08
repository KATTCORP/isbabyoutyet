import type { SupportedLocale } from "@workspace/convex/src/i18n";
import type { TranslationFunction, TranslationKey } from "@/lib/i18n-catalog";
import { splitMessageList, translate } from "@/lib/i18n-catalog";

/**
 * Hero headline from the translation catalog (`Hero before` / `Hero names` /
 * `Hero after`). `Hero names` is a comma-separated list: the generic "baby"
 * word first, then popular local names. Words carry their own article where
 * the language needs one (pt-BR), so the sentence stays grammatical for every
 * name.
 */
export function heroHeadlineFromCatalog(locale: SupportedLocale) {
  const t = ((key: TranslationKey) => translate(locale, key)) as TranslationFunction;
  return {
    after: t("Hero after"),
    before: t("Hero before"),
    words: splitMessageList(t("Hero names")),
  };
}

export const NAME_ROTATE_INTERVAL_MS = 2400;

export const FEATURES = [
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

export const HOW_IT_WORKS = [
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

type HomepagePreviewStageSearch = {
  babyBorn: string | undefined;
  babyBornMessage: string | undefined;
  dueDate: string | undefined;
  hospitalMessage: string | undefined;
  laborStarted: string | undefined;
  name: string;
  theme: string | undefined;
  wentToHospital: string | undefined;
};

export type HomepagePreviewStage = {
  description:
    | "Almost there!"
    | "Before labour starts"
    | "Celebrate the arrival"
    | "Things are happening!";
  emoji: string;
  rotate: string;
  search: HomepagePreviewStageSearch;
  title: "Baby born!" | "Gone to hospital" | "Labour started" | "Waiting";
};

/** Build preview stage search params from a fixed "now" (server request time). */
export function buildHomepagePreviewStages(
  nowMs: number,
  locale: SupportedLocale,
): ReadonlyArray<HomepagePreviewStage> {
  const hoursAgo = (hours: number) => {
    const date = new Date(nowMs);
    date.setTime(date.getTime() - hours * 60 * 60 * 1000);
    return date.toISOString();
  };

  const previewNames = splitMessageList(translate(locale, "Preview stage names"));
  const previewWaitingName = previewNames[0] ?? "Emma";
  const previewLabourName = previewNames[1] ?? "Oliver";
  const previewHospitalName = previewNames[2] ?? "Sophia";
  const previewBornName = previewNames[3] ?? "Liam";

  return [
    {
      description: "Before labour starts",
      emoji: "👶",
      rotate: "group-hover:-rotate-1",
      search: {
        babyBorn: undefined,
        babyBornMessage: undefined,
        dueDate: undefined,
        hospitalMessage: undefined,
        laborStarted: undefined,
        name: previewWaitingName,
        theme: undefined,
        wentToHospital: undefined,
      },
      title: "Waiting",
    },
    {
      description: "Things are happening!",
      emoji: "💫",
      rotate: "group-hover:rotate-1",
      search: {
        babyBorn: undefined,
        babyBornMessage: undefined,
        dueDate: hoursAgo(0),
        hospitalMessage: undefined,
        laborStarted: hoursAgo(2),
        name: previewLabourName,
        theme: undefined,
        wentToHospital: undefined,
      },
      title: "Labour started",
    },
    {
      description: "Almost there!",
      emoji: "🏥",
      rotate: "group-hover:-rotate-1",
      search: {
        babyBorn: undefined,
        babyBornMessage: undefined,
        dueDate: undefined,
        hospitalMessage: translate(locale, "We've made it in! More news when we have it 💕"),
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
        babyBornMessage: translate(locale, "Welcome to the world, little one! 🎉"),
        dueDate: undefined,
        hospitalMessage: undefined,
        laborStarted: hoursAgo(6),
        name: previewBornName,
        theme: "sunny-days",
        wentToHospital: hoursAgo(3),
      },
      title: "Baby born!",
    },
  ];
}
