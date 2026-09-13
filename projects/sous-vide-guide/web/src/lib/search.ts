import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
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

export function filterSousVideEntries(opts: {
  category: SousVideCategory | "all";
  entries: ReadonlyArray<SousVideEntry>;
  query: string;
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
    .toSorted((a, b) => b.score - a.score)
    .map((row) => row.entry);
}
