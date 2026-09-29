import { describe, expect, it } from "vitest";

import { getCutGuide } from "@/data/cutGuide";
import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { groupSousVideEntriesByCut } from "@/lib/group-cuts";

const t = createContentT("en-GB");
const cutIds = groupSousVideEntriesByCut(getSousVideEntries(t)).map((group) => group.cutId);

describe("getCutGuide", () => {
  it("gives every detail sheet notes and absolute source links", () => {
    const guides = cutIds.flatMap((cutId) => getCutGuide(cutId, t) ?? []);
    expect(guides.length).toBeGreaterThan(0);
    const violations = guides
      .filter(
        (guide) =>
          guide.notes.length === 0 ||
          guide.references.some((reference) => !/^https?:\/\//.test(reference.href)),
      )
      .map((guide) => guide.cutId);
    expect(violations).toEqual([]);
  });
});
