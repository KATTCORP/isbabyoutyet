import type { GuideSummary } from "@/data/guides";
import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";
import { fuzzyScore } from "@/lib/fuzzy";

export function isSousVideCategory(value: string): value is SousVideCategory {
  return (SOUS_VIDE_CATEGORIES as ReadonlyArray<string>).includes(value);
}

function bestFuzzyScore(query: string, fields: ReadonlyArray<string>) {
  let best = 0;
  for (const field of fields) {
    if (field.length === 0) {
      continue;
    }
    const score = fuzzyScore(query, field);
    if (score > best) {
      best = score;
    }
  }
  return best;
}

/** AND across whitespace tokens; score is the sum of per-token bests. */
function multiTokenScore(query: string, fields: ReadonlyArray<string>) {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return 0;
  }

  let total = 0;
  for (const token of tokens) {
    const score = bestFuzzyScore(token, fields);
    if (score === 0) {
      return 0;
    }
    total += score;
  }
  return total;
}

function guideFields(guide: GuideSummary) {
  return [
    guide.title.sv,
    guide.title["en-GB"],
    guide.title["en-US"],
    guide.summary.sv,
    guide.summary["en-GB"],
    guide.summary["en-US"],
    ...guide.searchTerms,
  ];
}

function entryFields(entry: SousVideEntry) {
  return [
    entry.name.sv,
    entry.name["en-GB"],
    entry.name["en-US"],
    entry.doneness?.sv ?? "",
    entry.doneness?.["en-GB"] ?? "",
    entry.doneness?.["en-US"] ?? "",
    entry.category,
    ...entry.searchTerms,
    `${entry.temperatureC}`,
  ];
}

export function filterGuides(guides: ReadonlyArray<GuideSummary>, query: string) {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [...guides];
  }

  return guides
    .map((guide) => ({
      guide,
      score: multiTokenScore(trimmed, guideFields(guide)),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.guide);
}

export function filterSousVideEntries(opts: {
  entries: ReadonlyArray<SousVideEntry>;
  query: string;
  category: SousVideCategory | "all";
}) {
  const trimmed = opts.query.trim();

  const categoryFiltered =
    opts.category === "all"
      ? opts.entries
      : opts.entries.filter((entry) => entry.category === opts.category);

  if (trimmed.length === 0) {
    return [...categoryFiltered];
  }

  return categoryFiltered
    .map((entry) => ({
      entry,
      score: multiTokenScore(trimmed, entryFields(entry)),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.entry);
}
