import type { Doc } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "../src/i18n";
import { resolveTimeZone } from "../src/timeZone";

export async function resolveBabyPreferences(db: DatabaseReader, baby: Doc<"baby">) {
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
