import type { Doc } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import type { SupportedLocale } from "../src/i18n";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "../src/i18n";
import { resolveTimeZone } from "../src/timeZone";

/** Locale and time zone a baby page renders in, after inheriting from the owner's profile. */
export type BabyPreferences = {
  resolvedLocale: SupportedLocale;
  timeZone: string;
};

export async function resolveBabyPreferences(
  db: DatabaseReader,
  baby: Doc<"baby">,
): Promise<BabyPreferences> {
  const profile = await db
    .query("userProfiles")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", baby.ownerTokenIdentifier))
    .unique();

  return {
    resolvedLocale: baby.locale
      ? resolveSupportedLocale(baby.locale)
      : profile
        ? resolveSupportedLocale(profile.locale)
        : DEFAULT_LOCALE,
    timeZone: resolveTimeZone(profile?.timeZone),
  };
}
