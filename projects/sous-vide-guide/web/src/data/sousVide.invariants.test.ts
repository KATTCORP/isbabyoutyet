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

  it("gives every row a non-empty outcome label", () => {
    for (const locale of locales) {
      const t = createContentT(locale);
      for (const entry of getSousVideEntries(t)) {
        expect(entry.doneness.length, `${entry.id} (${locale})`).toBeGreaterThan(0);
      }
    }
  });

  it("labels short-cook vegetables Crisp and longer baths Tender", () => {
    const byId = new Map(
      getSousVideEntries(createContentT("en-GB")).map((entry) => [entry.id, entry]),
    );
    expect(byId.get("carrot")?.doneness).toBe("Crisp");
    expect(byId.get("asparagus")?.doneness).toBe("Crisp");
    expect(byId.get("potato")?.doneness).toBe("Tender");
    expect(byId.get("beet")?.doneness).toBe("Tender");
    expect(byId.get("pumpkin")?.doneness).toBe("Tender");
  });

  it("translates vegetable outcome labels in Swedish", () => {
    const byId = new Map(
      getSousVideEntries(createContentT("sv")).map((entry) => [entry.id, entry]),
    );
    expect(byId.get("asparagus")?.doneness).toBe("Krispig");
    expect(byId.get("potato")?.doneness).toBe("Mör");
    expect(byId.get("creme-brulee")?.doneness).toBe("Stelnad");
    expect(byId.get("yogurt")?.doneness).toBe("Syrad");
  });

  it("marks short cooks as fridge-start and keeps poached eggs on the high-and-fast profile", () => {
    const byId = new Map(
      getSousVideEntries(createContentT("en-GB")).map((entry) => [entry.id, entry]),
    );
    const poached = byId.get("egg-poached");
    expect(poached?.temperatureC).toBe(75);
    expect(poached?.recommendedMinutes).toEqual({ max: 14, min: 13 });
    expect(poached?.start).toBe("fridge");
    expect(byId.get("egg-soft")?.start).toBe("fridge");
    expect(byId.get("pork-fillet-rare")?.start).toBeNull();
  });
});
