import type { SupportedLocale } from "@workspace/convex/src/i18n";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Hero headline per locale. The highlighted slot cycles through the generic
 * "baby" word followed by popular local baby names. Words carry their own
 * article where the language needs one (pt-BR), so the sentence stays
 * grammatical for every name.
 */
export const HERO_HEADLINES = {
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

export type HomepagePreviewStageSearch = {
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
export function buildHomepagePreviewStages(nowMs: number): ReadonlyArray<HomepagePreviewStage> {
  const hoursAgo = (hours: number) => {
    const date = new Date(nowMs);
    date.setTime(date.getTime() - hours * 60 * 60 * 1000);
    return date.toISOString();
  };

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
        name: "Emma",
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
        name: "Oliver",
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
        dueDate: undefined,
        hospitalMessage: undefined,
        laborStarted: hoursAgo(6),
        name: "Liam",
        theme: "sunny-days",
        wentToHospital: hoursAgo(3),
      },
      title: "Baby born!",
    },
  ];
}
