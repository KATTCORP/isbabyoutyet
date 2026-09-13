import type { MilestoneVisibility } from "./types";

export type BabyOgImageHashInput = {
  babyBorn: string | null;
  dueDate: string | null;
  dueDateDisplayMode: "exact" | "message";
  laborStarted: string | null;
  locale: string;
  milestoneVisibility: MilestoneVisibility;
  name: string;
  photoId: string | null;
  publicDueDateText: string | null;
  theme: string | null;
  wentToHospital: string | null;
};

/**
 * Content hash for the public OG image. Does not include "today" — Convex
 * queries cannot clock themselves, so the web layer appends the calendar day
 * in {@link babyOgImageFileName}.
 */
export function babyOgImageHash(baby: BabyOgImageHashInput) {
  return stableHash(
    JSON.stringify([
      "baby-og-v3",
      baby.name,
      baby.dueDateDisplayMode,
      baby.dueDate,
      baby.publicDueDateText,
      baby.theme,
      baby.locale,
      baby.babyBorn,
      baby.wentToHospital,
      baby.laborStarted,
      baby.milestoneVisibility.showLabor,
      baby.milestoneVisibility.showHospital,
      baby.photoId,
    ]),
  );
}

export function calendarDayKey(opts: { now: number; timeZone: string }) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: opts.timeZone,
    year: "numeric",
  }).formatToParts(new Date(opts.now));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return "19700101";
  }
  return `${year}${month}${day}`;
}

export function babyOgImageFileName(opts: {
  asOfDay: string;
  ogImageHash: string;
  publicId: string;
}) {
  return `${opts.publicId}-${opts.ogImageHash}-${opts.asOfDay}`;
}

export function parseBabyOgImageFileName(fileName: string) {
  const match = /^(.+)-([0-9a-z]+)-(\d{8})$/.exec(fileName);
  if (!match) {
    return null;
  }
  const publicId = match[1];
  const ogImageHash = match[2];
  const asOfDay = match[3];
  if (!publicId || !ogImageHash || !asOfDay) {
    return null;
  }
  return { asOfDay, ogImageHash, publicId };
}

export function babyOgImagePublicIdFromFileName(fileName: string) {
  return parseBabyOgImageFileName(fileName)?.publicId ?? fileName;
}

function stableHash(source: string) {
  let first = 0x81_1c_9d_c5;
  let second = 0x9e_37_79_b9;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01_00_01_93);
    second = Math.imul(second ^ code, 0x85_eb_ca_6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}
