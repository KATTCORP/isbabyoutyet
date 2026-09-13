import { describe, expect, it } from "vitest";

import { SOUS_VIDE_ENTRIES } from "@/data/sousVide";

describe("sous vide data invariants", () => {
  it("has unique ids", () => {
    const ids = SOUS_VIDE_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps maxMinutes at or above the recommended upper bound", () => {
    const violations = SOUS_VIDE_ENTRIES.filter((entry) => {
      if (entry.recommendedMinutes.max < entry.recommendedMinutes.min) {
        return true;
      }
      if (entry.maxMinutes === null) {
        return false;
      }
      return entry.maxMinutes < entry.recommendedMinutes.max;
    }).map((entry) => entry.id);

    expect(violations).toEqual([]);

    for (const entry of SOUS_VIDE_ENTRIES) {
      expect(entry.name.sv.length).toBeGreaterThan(0);
      expect(entry.name["en-GB"].length).toBeGreaterThan(0);
      expect(entry.name["en-US"].length).toBeGreaterThan(0);
    }
  });
});
