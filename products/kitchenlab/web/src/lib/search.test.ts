import { describe, expect, it } from "vitest";

import { GUIDES } from "@/data/guides";
import { SOUS_VIDE_ENTRIES } from "@/data/sousVide";
import { fuzzyScore } from "@/lib/fuzzy";
import { filterGuides, filterSousVideEntries } from "@/lib/search";
import { formatTemperature } from "@/lib/temperature";

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
    expect(salmon.some((entry) => entry.id.includes("salmon"))).toBe(true);
    expect(lax.some((entry) => entry.id.includes("salmon"))).toBe(true);
    expect(salmon[0]?.id).toBe(lax[0]?.id);
  });

  it("fuzzy-matches typos and American tenderloin wording", () => {
    const typo = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "salmn",
      category: "all",
    });
    expect(typo.some((entry) => entry.id.includes("salmon"))).toBe(true);

    const tenderloin = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "tenderloin",
      category: "all",
    });
    expect(tenderloin.length).toBeGreaterThan(0);
  });
});

describe("fuzzyScore", () => {
  it("scores exact and fuzzy tokens", () => {
    expect(fuzzyScore("salmon", "salmon fillet")).toBeGreaterThan(
      fuzzyScore("salmn", "salmon fillet"),
    );
    expect(fuzzyScore("flask", "fläskfilé")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "pork chop")).toBe(0);
    expect(fuzzyScore("lax", "lammfilé")).toBe(0);
  });
});

describe("formatTemperature", () => {
  it("formats Celsius and Fahrenheit", () => {
    expect(formatTemperature(60, "c")).toBe("60°C");
    expect(formatTemperature(60, "f")).toBe("140°F");
  });
});
