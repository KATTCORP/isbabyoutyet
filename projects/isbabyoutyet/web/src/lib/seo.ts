import type { FunctionReturnType } from "convex/server";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import type { BabyStatus, MilestoneVisibility } from "@isbabyoutyet/backend/src/types";
import { babyOgImageFileName, calendarDayKey } from "@isbabyoutyet/backend/src/babyOgImage";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { DEFAULT_TIME_ZONE } from "@isbabyoutyet/backend/src/timeZone";
import { getCurrentStatus } from "@isbabyoutyet/backend/src/types";
import { getDaysUntilDueDate, getOverdueDays, getThemePrimaryColor } from "@/components/baby/utils";
import { translate } from "@/lib/i18n";
import { isIndexableBabyPublicId, searchRobotsMeta } from "@/lib/robots";
import { absoluteUrl, canonicalUrl } from "@/lib/site-url";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

type BabySeoBase = {
  babyBorn: string | null | undefined;
  laborStarted: string | null | undefined;
  locale: SupportedLocale;
  name: string;
  ogImageHash: string;
  publicId: string;
  theme: string | null | undefined;
  timeZone: string;
  wentToHospital: string | null | undefined;
} & Partial<{
  milestoneVisibility: MilestoneVisibility | null;
}>;

export type BabyDueDateDisplay =
  | { dueDate: string; dueDateDisplayMode: "exact" }
  | { dueDateDisplayMode: "message"; publicDueDateText: string };

type BabySeoInput = BabySeoBase & BabyDueDateDisplay;

function babyPageTitle(baby: BabySeoInput) {
  const exactDueDate = baby.dueDateDisplayMode === "exact" ? baby.dueDate : null;
  const timeZone = baby.timeZone ?? DEFAULT_TIME_ZONE;
  const overdueDays = exactDueDate ? getOverdueDays(exactDueDate, timeZone) : 0;
  const daysUntilDueDate = exactDueDate ? getDaysUntilDueDate(exactDueDate, timeZone) : 0;
  const isBorn = !!baby.babyBorn;
  const locale = baby.locale;

  let title = translate(locale, "Is {{name}} out yet?", { name: baby.name });
  if (!isBorn && exactDueDate) {
    if (overdueDays > 0) {
      title = translate(
        locale,
        overdueDays === 1
          ? "{{count}} day overdue – Is {{name}} out yet?"
          : "{{count}} days overdue – Is {{name}} out yet?",
        { count: overdueDays, name: baby.name },
      );
    } else {
      title = translate(
        locale,
        daysUntilDueDate === 1
          ? "{{count}} day until due date – Is {{name}} out yet?"
          : "{{count}} days until due date – Is {{name}} out yet?",
        { count: daysUntilDueDate, name: baby.name },
      );
    }
  }
  return translate(locale, "{{title}} – Track Your Baby's Journey", { title });
}

export function babyPageDescription(
  baby: Pick<BabySeoBase, "babyBorn" | "laborStarted" | "locale" | "name" | "wentToHospital"> &
    Partial<{ milestoneVisibility: MilestoneVisibility | null }>,
) {
  const status = getCurrentStatus(baby);
  const locale = baby.locale;
  switch (status.type) {
    case "born":
      return translate(locale, "{{name}} has arrived! See the announcement and follow along.", {
        name: baby.name,
      });
    case "gone_to_hospital":
      return translate(
        locale,
        "{{name}}'s family has gone to hospital — follow live updates on the baby page.",
        { name: baby.name },
      );
    case "labor_started":
      return translate(
        locale,
        "{{name}}'s labour has started — follow live updates on the baby page.",
        { name: baby.name },
      );
    case "not_yet":
      return translate(locale, "Track {{name}}'s journey – know when baby arrives!", {
        name: baby.name,
      });
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function babyStatusLabel(opts: { locale: SupportedLocale; status: BabyStatus }) {
  switch (opts.status.type) {
    case "born":
      return translate(opts.locale, "Yes! Baby is out");
    case "gone_to_hospital":
      return translate(opts.locale, "Gone to hospital");
    case "labor_started":
      return translate(opts.locale, "Labour started");
    case "not_yet":
      return translate(opts.locale, "Not yet");
    default: {
      const _exhaustive: never = opts.status;
      return _exhaustive;
    }
  }
}

export function babyStatusDetail(opts: {
  baby: Pick<BabySeoBase, "babyBorn" | "locale"> &
    BabyDueDateDisplay & { timeZone: string | undefined };
  status: BabyStatus;
}) {
  const locale = opts.baby.locale;
  if (opts.status.type === "born") {
    return translate(locale, "Yes! Baby is out");
  }
  if (opts.status.type !== "not_yet") {
    return babyStatusLabel({ locale, status: opts.status });
  }
  if (opts.baby.dueDateDisplayMode === "message") {
    const message = opts.baby.publicDueDateText.trim();
    if (message) {
      return message;
    }
    return babyStatusLabel({ locale, status: opts.status });
  }
  const timeZone = opts.baby.timeZone ?? DEFAULT_TIME_ZONE;
  const overdueDays = getOverdueDays(opts.baby.dueDate, timeZone);
  if (overdueDays > 0) {
    return translate(
      locale,
      overdueDays === 1 ? "{{count}} day overdue" : "{{count}} days overdue",
      { count: overdueDays },
    );
  }
  const daysUntil = getDaysUntilDueDate(opts.baby.dueDate, timeZone);
  return translate(
    locale,
    daysUntil === 1 ? "{{count}} day until due date" : "{{count}} days until due date",
    { count: daysUntil },
  );
}

function babyOgImageUrl(opts: { ogImageHash: string; publicId: string; timeZone: string }) {
  return absoluteUrl(
    `/og/baby/${babyOgImageFileName({
      asOfDay: calendarDayKey({ now: Date.now(), timeZone: opts.timeZone }),
      ogImageHash: opts.ogImageHash,
      publicId: opts.publicId,
    })}`,
  );
}

export function homepageOgImagePath() {
  return "/og";
}

export function openGraphImageMeta(opts: { alt: string; imageUrl: string }) {
  return [
    { content: opts.imageUrl, property: "og:image" },
    { content: String(OG_IMAGE_WIDTH), property: "og:image:width" },
    { content: String(OG_IMAGE_HEIGHT), property: "og:image:height" },
    { content: opts.alt, property: "og:image:alt" },
    { content: "summary_large_image", name: "twitter:card" },
    { content: opts.imageUrl, name: "twitter:image" },
    { content: opts.alt, name: "twitter:image:alt" },
  ];
}

type PublicBabyDoc = NonNullable<FunctionReturnType<typeof api.baby.getByPublicId>>;

/** @internal Exported for tests; production uses {@link getBabySeo}. */
export function babySeoHead(baby: BabySeoInput) {
  const title = babyPageTitle(baby);
  const description = babyPageDescription(baby);
  const pagePath = `/baby/${baby.publicId}`;
  const imageUrl = babyOgImageUrl({
    ogImageHash: baby.ogImageHash,
    publicId: baby.publicId,
    timeZone: baby.timeZone,
  });
  const themeColor = getThemePrimaryColor(baby.theme);

  return {
    canonical: canonicalUrl(pagePath),
    description,
    imageAlt: title,
    imageUrl,
    indexable: isIndexableBabyPublicId(baby.publicId),
    locale: baby.locale,
    ogUrl: canonicalUrl(pagePath),
    themeColor,
    title,
  };
}

export function getBabySeo(doc: PublicBabyDoc, routePublicId: string) {
  return babySeoHead({
    name: doc.name,
    ...(doc.dueDateDisplayMode === "exact"
      ? { dueDate: doc.dueDate, dueDateDisplayMode: "exact" as const }
      : {
          dueDateDisplayMode: "message" as const,
          publicDueDateText: doc.publicDueDateText ?? "",
        }),
    // beforeLoad canonicalizes this route parameter. During same-route
    // navigation, reactive query data can briefly belong to the prior slug.
    babyBorn: doc.babyBorn,
    laborStarted: doc.laborStarted,
    locale: doc.resolvedLocale,
    milestoneVisibility: doc.milestoneVisibility,
    ogImageHash: doc.ogImageHash,
    publicId: routePublicId,
    theme: doc.theme,
    timeZone: doc.timeZone,
    wentToHospital: doc.wentToHospital,
  });
}

export function robotsNoIndexMeta() {
  return searchRobotsMeta({ index: false });
}
