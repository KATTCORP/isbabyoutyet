import { describe, expect, it } from "vitest";

import { SOUS_VIDE_CATEGORIES, getSousVideEntries } from "@/data/sousVide";
import { groupEntriesByCategory } from "@/lib/categories";
import { createContentT } from "@/lib/content-t";
import { filterSousVideEntries } from "@/lib/search";

const SOUS_VIDE_ENTRIES = getSousVideEntries(createContentT("en-GB"));

describe("groupEntriesByCategory", () => {
  it("keeps the fixed category order and every row", () => {
    const sections = groupEntriesByCategory(SOUS_VIDE_ENTRIES);
    expect(sections.map((section) => section.category)).toEqual([...SOUS_VIDE_CATEGORIES]);
    const total = sections.reduce((sum, section) => sum + section.entries.length, 0);
    expect(total).toBe(SOUS_VIDE_ENTRIES.length);
    for (const section of sections) {
      expect(section.entries.every((entry) => entry.category === section.category)).toBe(true);
    }
  });

  it("computes the Celsius span per section", () => {
    const sections = groupEntriesByCategory(SOUS_VIDE_ENTRIES);
    const fish = sections.find((section) => section.category === "fish");
    expect(fish?.temperatureRangeC).toEqual({ max: 55, min: 41 });
  });

  it("omits categories with no rows", () => {
    const salmon = filterSousVideEntries({ entries: SOUS_VIDE_ENTRIES, query: "salmon" });
    const sections = groupEntriesByCategory(salmon);
    expect(sections.map((section) => section.category)).toEqual(["fish"]);
    expect(groupEntriesByCategory([])).toEqual([]);
  });
});
