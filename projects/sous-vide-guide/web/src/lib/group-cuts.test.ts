import { describe, expect, it } from "vitest";

import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { cutIdFromEntryId, groupSousVideEntriesByCut } from "@/lib/group-cuts";

describe("cutIdFromEntryId", () => {
  it("strips doneness suffixes and leaves single-row cuts alone", () => {
    expect(cutIdFromEntryId("pork-fillet-rare")).toBe("pork-fillet");
    expect(cutIdFromEntryId("chicken-breast-mr")).toBe("chicken-breast");
    expect(cutIdFromEntryId("pork-shoulder-pull")).toBe("pork-shoulder");
    expect(cutIdFromEntryId("lobster-near-raw")).toBe("lobster");
    expect(cutIdFromEntryId("pork-belly")).toBe("pork-belly");
  });
});

describe("groupSousVideEntriesByCut", () => {
  it("groups pork fillet doneness rows under one cut permalink", () => {
    const entries = getSousVideEntries(createContentT("en-GB")).filter((entry) =>
      entry.id.startsWith("pork-fillet"),
    );
    const groups = groupSousVideEntriesByCut(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.cutId).toBe("pork-fillet");
    expect(groups[0]?.rows.map((row) => row.doneness)).toEqual([
      "Rare",
      "Medium",
      "Well done",
    ]);
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
