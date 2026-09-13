import type { GuideSummary } from "@/data/guides";
import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";

export function normalizeQuery(query: string) {
  return query.trim().toLocaleLowerCase("sv-SE");
}

export function filterGuides(guides: ReadonlyArray<GuideSummary>, query: string) {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) {
    return [...guides];
  }

  return guides.filter((guide) => {
    const haystack = [
      guide.titleSv,
      guide.titleEn,
      guide.summarySv,
      guide.summaryEn,
      ...guide.searchTerms,
    ]
      .join(" ")
      .toLocaleLowerCase("sv-SE");
    return haystack.includes(normalized);
  });
}

export function isSousVideCategory(value: string): value is SousVideCategory {
  return (SOUS_VIDE_CATEGORIES as ReadonlyArray<string>).includes(value);
}

export function filterSousVideEntries(opts: {
  entries: ReadonlyArray<SousVideEntry>;
  query: string;
  category: SousVideCategory | "all";
}) {
  const normalized = normalizeQuery(opts.query);

  return opts.entries.filter((entry) => {
    if (opts.category !== "all" && entry.category !== opts.category) {
      return false;
    }
    if (normalized.length === 0) {
      return true;
    }
    const haystack = [
      entry.nameSv,
      entry.nameEn,
      entry.donenessSv ?? "",
      entry.donenessEn ?? "",
      entry.category,
      ...entry.searchTerms,
      `${entry.temperatureC}`,
    ]
      .join(" ")
      .toLocaleLowerCase("sv-SE");
    return haystack.includes(normalized);
  });
}
