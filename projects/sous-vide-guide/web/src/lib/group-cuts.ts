import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";

/**
 * Doneness / outcome suffixes on entry ids. Longest first so
 * `-near-raw` wins over a hypothetical `-raw`.
 */
const CUT_ID_SUFFIXES = [
  "-near-raw",
  "-medium",
  "-well",
  "-rare",
  "-mr",
  "-pull",
  "-pink",
  "-tender",
  "-firm",
  "-soft",
  "-poached",
  "-hard",
  "-jammy",
] as const;

/** Stable in-page anchor for a cut (meat type), not a doneness row. */
function cutIdFromEntryId(entryId: string) {
  for (const suffix of CUT_ID_SUFFIXES) {
    if (entryId.endsWith(suffix)) {
      return entryId.slice(0, -suffix.length);
    }
  }
  return entryId;
}

export type SousVideCutGroup = {
  category: SousVideCategory;
  cutId: string;
  name: string;
  rows: ReadonlyArray<SousVideEntry>;
};

/**
 * Group flat doneness rows into cut cards so one meat type shows every
 * temperature outcome in a single glance (KitchenLab table style).
 * Preserves first-seen cut order within the filtered list.
 */
export function groupSousVideEntriesByCut(
  entries: ReadonlyArray<SousVideEntry>,
): ReadonlyArray<SousVideCutGroup> {
  const groups: Array<{
    category: SousVideCategory;
    cutId: string;
    name: string;
    rows: Array<SousVideEntry>;
  }> = [];
  const indexByCutId = new Map<string, number>();

  for (const entry of entries) {
    const cutId = cutIdFromEntryId(entry.id);
    const existingIndex = indexByCutId.get(cutId);
    if (existingIndex === undefined) {
      indexByCutId.set(cutId, groups.length);
      groups.push({
        category: entry.category,
        cutId,
        name: entry.name,
        rows: [entry],
      });
      continue;
    }
    groups[existingIndex]?.rows.push(entry);
  }

  return groups;
}
