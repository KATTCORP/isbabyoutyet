import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";

export type CategorySection = {
  category: SousVideCategory;
  entries: ReadonlyArray<SousVideEntry>;
  /** Inclusive Celsius span across the section's rows. */
  temperatureRangeC: { max: number; min: number };
};

/**
 * Split rows into the fixed category order used for the page sections and the
 * quick links. Categories without rows are omitted so an empty section never
 * renders.
 */
export function groupEntriesByCategory(
  entries: ReadonlyArray<SousVideEntry>,
): ReadonlyArray<CategorySection> {
  const sections: Array<CategorySection> = [];
  for (const category of SOUS_VIDE_CATEGORIES) {
    const rows = entries.filter((entry) => entry.category === category);
    const first = rows[0];
    if (first === undefined) {
      continue;
    }
    let min = first.temperatureC;
    let max = first.temperatureC;
    for (const row of rows) {
      min = Math.min(min, row.temperatureC);
      max = Math.max(max, row.temperatureC);
    }
    sections.push({ category, entries: rows, temperatureRangeC: { max, min } });
  }
  return sections;
}
