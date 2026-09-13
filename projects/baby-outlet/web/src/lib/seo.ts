import type { BabyStatus, MilestoneVisibility } from "@baby-outlet/backend/src/types";
import { getCurrentStatus } from "@baby-outlet/backend/src/types";
import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import { getDaysUntilDueDate, getOverdueDays, getThemePrimaryColor } from "@/components/baby/utils";
import { translate } from "@/lib/i18n";
import { isIndexableBabyPublicId, searchRobotsMeta } from "@/lib/robots";
import { absoluteUrl, canonicalUrl } from "@/lib/site-url";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

type BabySeoBase = {
  name: string;
  publicId: string;
  theme: string | null | undefined;
  locale: SupportedLocale;
  babyBorn: string | null | undefined;
  wentToHospital: string | null | undefined;
  laborStarted: string | null | undefined;
} & Partial<{ milestoneVisibility: MilestoneVisibility | null }>;

type BabyDueDateDisplay =
  | { dueDateDisplayMode: "exact"; dueDate: string }
  | { dueDateDisplayMode: "message"; publicDueDateText: string };

type BabySeoInput = BabySeoBase & BabyDueDateDisplay;

function babyPageTitle(baby: BabySeoInput) {
  const isMessageMode = baby.dueDateDisplayMode === "message";
  const exactDueDate = isMessageMode ? null : baby.dueDate;
  const overdueDays = exactDueDate ? getOverdueDays(exactDueDate) : 0;
  const daysUntilDueDate = exactDueDate ? getDaysUntilDueDate(exactDueDate) : 0;
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

export function babyPageDescription(baby: BabySeoInput) {
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

export function babyStatusLabel(opts: { status: BabyStatus; locale: SupportedLocale }) {
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
  baby: Pick<BabySeoBase, "babyBorn" | "locale"> & BabyDueDateDisplay;
  status: BabyStatus;
}) {
  const locale = opts.baby.locale;
  if (opts.status.type === "born") {
    return translate(locale, "Yes! Baby is out");
  }
  if (opts.status.type !== "not_yet") {
    return babyStatusLabel({ status: opts.status, locale });
  }
  if (opts.baby.dueDateDisplayMode === "message") {
    return opts.baby.publicDueDateText.trim();
  }
  const overdueDays = getOverdueDays(opts.baby.dueDate);
  if (overdueDays > 0) {
    return translate(
      locale,
      overdueDays === 1 ? "{{count}} day overdue" : "{{count}} days overdue",
      { count: overdueDays },
    );
  }
  const daysUntil = getDaysUntilDueDate(opts.baby.dueDate);
  return translate(
    locale,
    daysUntil === 1 ? "{{count}} day until due date" : "{{count}} days until due date",
    { count: daysUntil },
  );
}

function babyOgImagePath(publicId: string) {
  return `/og/baby/${publicId}`;
}

export function homepageOgImagePath() {
  return "/og";
}

export function openGraphImageMeta(opts: { imageUrl: string; alt: string }) {
  return [
    { property: "og:image", content: opts.imageUrl },
    { property: "og:image:width", content: String(OG_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(OG_IMAGE_HEIGHT) },
    { property: "og:image:alt", content: opts.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: opts.imageUrl },
    { name: "twitter:image:alt", content: opts.alt },
  ];
}

export function babySeoHead(baby: BabySeoInput) {
  const title = babyPageTitle(baby);
  const description = babyPageDescription(baby);
  const pagePath = `/baby/${baby.publicId}`;
  const imageUrl = absoluteUrl(babyOgImagePath(baby.publicId));
  const themeColor = getThemePrimaryColor(baby.theme);

  return {
    title,
    description,
    themeColor,
    canonical: canonicalUrl(pagePath),
    ogUrl: canonicalUrl(pagePath),
    imageUrl,
    imageAlt: title,
    locale: baby.locale,
    indexable: isIndexableBabyPublicId(baby.publicId),
  };
}

export function robotsNoIndexMeta() {
  return searchRobotsMeta({ index: false });
}
