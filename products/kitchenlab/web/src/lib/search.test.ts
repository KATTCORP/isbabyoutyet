import { describe, expect, it } from "vitest";

import { GUIDES } from "@/data/guides";
import { SOUS_VIDE_ENTRIES } from "@/data/sousVide";
import { filterGuides, filterSousVideEntries } from "@/lib/search";

describe("filterGuides", () => {
  it("returns every guide when the query is empty", () => {
    expect(filterGuides(GUIDES, "   ")).toHaveLength(GUIDES.length);
  });

  it("matches Swedish and English guide terms", () => {
    expect(filterGuides(GUIDES, "temperatur")).toHaveLength(1);
    expect(filterGuides(GUIDES, "cook time")).toHaveLength(1);
    expect(filterGuides(GUIDES, "pizza")).toHaveLength(0);
  });
});

describe("filterSousVideEntries", () => {
  it("filters by category", () => {
    const fish = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "",
      category: "fish",
    });
    expect(fish.length).toBeGreaterThan(0);
    expect(fish.every((entry) => entry.category === "fish")).toBe(true);
  });

  it("matches ingredient names across locales", () => {
    const salmon = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "salmon",
      category: "all",
    });
    const lax = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "lax",
      category: "all",
    });
    expect(salmon.length).toBeGreaterThan(0);
    expect(lax).toEqual(salmon);
  });
});
