/**
 * Shared demo login + seeded babies used by the Convex seeder and the web auth forms.
 *
 * DEMO_USER / DEMO_EMPTY_USER / DEMO_COPARENT_USER / DEMO_BABIES: local
 * development and Vercel preview only — never production.
 * HOMEPAGE_DEMO_BABIES: seeded in every environment, including production — one live
 * demo page per supported locale, sharing photos and timeline shape.
 *
 * Keep AGENTS.md in sync when changing publicIds.
 */
import type { SupportedLocale } from "./i18n";
import { SUPPORTED_LOCALES } from "./i18n";

export const DEMO_USER = {
  email: "test@example.com",
  name: "Demo Parent",
  password: "password",
} as const;

/** Same password as DEMO_USER, but no babies — empty-dashboard / first-run flow. */
export const DEMO_EMPTY_USER = {
  email: "test+newuser@example.com",
  name: "New Parent",
  password: "password",
} as const;

/** Co-parent on Milo (`baby-born`) — manager overlays without owning the page. */
export const DEMO_COPARENT_USER = {
  email: "test+coparent@example.com",
  name: "Demo Co-parent",
  password: "password",
} as const;

export const DEMO_ACCOUNTS = [
  {
    ...DEMO_USER,
    label: "test@example.com — with babies",
  },
  {
    ...DEMO_EMPTY_USER,
    label: "test+newuser@example.com — no babies",
  },
  {
    ...DEMO_COPARENT_USER,
    label: "test+coparent@example.com — co-parent on Milo",
  },
] as const;

export const DEMO_BABIES = [
  {
    label: "Not yet",
    name: "Avery",
    publicId: "baby-waiting",
    state: "not_yet",
  },
  {
    label: "Labour started",
    name: "Frankie",
    publicId: "baby-in-labor",
    state: "labor_started",
  },
  {
    label: "Gone to hospital",
    name: "Rowan",
    publicId: "baby-at-hospital",
    state: "gone_to_hospital",
  },
  {
    label: "Born",
    name: "Milo",
    publicId: "baby-born",
    state: "born",
  },
] as const;

/**
 * Historical slug for Milo. `/baby/milo` resolves via `babyPublicIdHistory` and
 * the baby route canonicalizes to `/baby/baby-born`.
 */
export const MILO_LEGACY_PUBLIC_ID = "milo";

export const HOMEPAGE_DEMO_OWNER_USER_ID = "homepage-demo";
export const HOMEPAGE_DEMO_THEME = "sunny-days";

/**
 * One public live-demo baby per locale. Same sentinel owner so they never
 * appear on a real dashboard. Re-seeded on every deploy.
 */
export const HOMEPAGE_DEMO_BABIES = {
  "en-GB": { locale: "en-GB", name: "Juniper Hale", publicId: "juniper-hale" },
  "en-US": { locale: "en-US", name: "Willow Brooks", publicId: "willow-brooks" },
  es: { locale: "es", name: "Lucía Navarro", publicId: "lucia-navarro" },
  "pt-BR": { locale: "pt-BR", name: "Helena Costa", publicId: "helena-costa" },
  sv: { locale: "sv", name: "Ella Holm", publicId: "ella-holm" },
} as const satisfies Record<
  SupportedLocale,
  { locale: SupportedLocale; name: string; publicId: string }
>;

/** Default / English homepage demo (British English). */
export const HOMEPAGE_DEMO_BABY = {
  ...HOMEPAGE_DEMO_BABIES["en-GB"],
  ownerUserId: HOMEPAGE_DEMO_OWNER_USER_ID,
  theme: HOMEPAGE_DEMO_THEME,
} as const;

export function homepageDemoBabyFor(locale: SupportedLocale) {
  return HOMEPAGE_DEMO_BABIES[locale];
}

export function isHomepageDemoPublicId(publicId: string) {
  return SUPPORTED_LOCALES.some((locale) => HOMEPAGE_DEMO_BABIES[locale].publicId === publicId);
}
