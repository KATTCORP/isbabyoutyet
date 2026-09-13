import { describe, expect, it } from "vitest";

import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { locales } from "@/paraglide/runtime";

describe("sous vide data invariants", () => {
  it("has unique ids", () => {
    const ids = getSousVideEntries(createContentT("en-GB")).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps maxMinutes at or above the recommended upper bound", () => {
    const violations = getSousVideEntries(createContentT("en-GB"))
      .filter((entry) => {
        if (entry.recommendedMinutes.max < entry.recommendedMinutes.min) {
          return true;
        }
        if (entry.maxMinutes === null) {
          return false;
        }
        return entry.maxMinutes < entry.recommendedMinutes.max;
      })
      .map((entry) => entry.id);

    expect(violations).toEqual([]);
  });

  it("resolves a name and search aliases for every locale", () => {
    for (const locale of locales) {
      const t = createContentT(locale);
      for (const entry of getSousVideEntries(t)) {
        expect(entry.name.length, `${entry.id} (${locale})`).toBeGreaterThan(0);
        expect(entry.searchTerms.length, `${entry.id} (${locale})`).toBeGreaterThan(0);
      }
    }
  });
});
