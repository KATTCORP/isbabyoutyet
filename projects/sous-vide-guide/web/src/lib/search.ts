import type { SousVideEntry } from "@/data/sousVide";
import { fuzzyScore } from "@/lib/fuzzy";

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

function celsiusToFahrenheit(temperatureC: number) {
  return Math.round((temperatureC * 9) / 5 + 32);
}

function entryFields(entry: SousVideEntry) {
  const fahrenheit = celsiusToFahrenheit(entry.temperatureC);
  return [
    entry.name,
    entry.doneness ?? "",
    entry.category,
    ...entry.searchTerms,
    `${entry.temperatureC}`,
    `${fahrenheit}`,
    `${entry.temperatureC}°C`,
    `${fahrenheit}°F`,
  ];
}

/**
 * Fuzzy matching ignores needles shorter than 2 chars; treat those as "not
 * searching yet" so a lone keystroke never empties the list. The UI uses the
 * same rule to decide when to switch from category sections to ranked results.
 */
export function isSearchQuery(query: string) {
  return query.trim().length >= 2;
}

/**
 * Rank rows for a free-text query. An empty or one-character query returns
 * every row in source order; otherwise rows are sorted by fuzzy score.
 * Categories are browsed via section anchors, not filtered here.
 */
export function filterSousVideEntries(opts: {
  entries: ReadonlyArray<SousVideEntry>;
  query: string;
}) {
  const trimmed = opts.query.trim();

  if (!isSearchQuery(trimmed)) {
    return [...opts.entries];
  }

  return opts.entries
    .map((entry) => ({
      entry,
      score: multiTokenScore(trimmed, entryFields(entry)),
    }))
    .filter((row) => row.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .map((row) => row.entry);
}
