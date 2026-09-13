import { describe, expect, it } from "vitest";

import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { fuzzyScore } from "@/lib/fuzzy";
import { filterSousVideEntries } from "@/lib/search";
import { formatTemperature } from "@/lib/temperature";

const SOUS_VIDE_ENTRIES = getSousVideEntries(createContentT("en-GB"));

describe("filterSousVideEntries", () => {
  it("returns every row in source order for an empty query", () => {
    const all = filterSousVideEntries({ entries: SOUS_VIDE_ENTRIES, query: "   " });
    expect(all.map((entry) => entry.id)).toEqual(SOUS_VIDE_ENTRIES.map((entry) => entry.id));
  });

  it("ignores single-character queries instead of showing no matches", () => {
    const oneChar = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "p",
    });
    expect(oneChar).toEqual(SOUS_VIDE_ENTRIES);

    const spaced = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: " p ",
    });
    expect(spaced).toEqual(SOUS_VIDE_ENTRIES);
  });

  it("matches ingredient names across locales", () => {
    const salmon = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "salmon",
    });
    const lax = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "lax",
    });
    expect(salmon.some((entry) => entry.id.includes("salmon"))).toBe(true);
    expect(lax.some((entry) => entry.id.includes("salmon"))).toBe(true);
    expect(salmon[0]?.id).toBe(lax[0]?.id);
  });

  it("fuzzy-matches typos and American tenderloin wording", () => {
    const typo = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "salmn",
    });
    expect(typo.some((entry) => entry.id.includes("salmon"))).toBe(true);

    const tenderloin = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "tenderloin",
    });
    expect(tenderloin.length).toBeGreaterThan(0);
  });

  it("matches multi-word queries with AND semantics", () => {
    const salmonRare = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "salmon rare",
    });
    expect(salmonRare.some((entry) => entry.id === "salmon-rare")).toBe(true);
    expect(salmonRare.every((entry) => entry.id.includes("salmon"))).toBe(true);
  });

  it("avoids loose subsequence false positives", () => {
    const sea = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "sea",
    });
    expect(sea.every((entry) => !entry.id.includes("carrot"))).toBe(true);
  });

  it("matches Fahrenheit numeric queries", () => {
    const hits = filterSousVideEntries({
      entries: SOUS_VIDE_ENTRIES,
      query: "140",
    });
    expect(hits.some((entry) => Math.round((entry.temperatureC * 9) / 5 + 32) === 140)).toBe(true);
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
    expect(fuzzyScore("sea", "carrot")).toBe(0);
    expect(fuzzyScore("e", "beef")).toBe(0);
  });
});

describe("formatTemperature", () => {
  it("formats Celsius and Fahrenheit", () => {
    expect(formatTemperature(60, { locale: "en-GB", unit: "c" })).toBe("60°C");
    expect(formatTemperature(60, { locale: "en-US", unit: "f" })).toBe("140°F");
  });
});
