import { describe, expect, it } from "vitest";

import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { groupSousVideEntriesByCut } from "@/lib/group-cuts";

describe("groupSousVideEntriesByCut", () => {
  it("strips doneness suffixes into one cut id per meat type", () => {
    const entries = getSousVideEntries(createContentT("en-GB")).filter((entry) =>
      entry.id.startsWith("pork-fillet"),
    );
    const groups = groupSousVideEntriesByCut(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.cutId).toBe("pork-fillet");
    expect(groups[0]?.rows.map((row) => row.id)).toEqual([
      "pork-fillet-rare",
      "pork-fillet-medium",
      "pork-fillet-well",
    ]);
  });

  it("groups pork fillet doneness rows under one cut permalink", () => {
    const entries = getSousVideEntries(createContentT("en-GB")).filter((entry) =>
      entry.id.startsWith("pork-fillet"),
    );
    const groups = groupSousVideEntriesByCut(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.cutId).toBe("pork-fillet");
    expect(groups[0]?.rows.map((row) => row.doneness)).toEqual(["Rare", "Medium", "Well done"]);
  });

  it("leaves single-row cuts without a doneness suffix alone", () => {
    const entries = getSousVideEntries(createContentT("en-GB")).filter(
      (entry) => entry.id === "carrot",
    );
    const groups = groupSousVideEntriesByCut(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.cutId).toBe("carrot");
  });

  it("includes chuck (högrev) with rare / medium / well temps", () => {
    const entries = getSousVideEntries(createContentT("en-GB"));
    const chuck = groupSousVideEntriesByCut(entries).find((group) => group.cutId === "chuck");
    expect(chuck).toBeDefined();
    expect(chuck?.rows.map((row) => row.temperatureC)).toEqual([57, 64, 82]);
    expect(chuck?.rows.every((row) => row.searchTerms.some((term) => /högrev/i.test(term)))).toBe(
      true,
    );
  });
});
