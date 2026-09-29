import { describe, expect, it } from "vitest";

import enUSMessages from "../../messages/en-US.json";
import svMessages from "../../messages/sv.json";
import { getCutGuide } from "@/data/cutGuide";
import { getSousVideEntries } from "@/data/sousVide";
import type { ContentT } from "@/lib/content-t";
import { createContentT } from "@/lib/content-t";
import { groupSousVideEntriesByCut } from "@/lib/group-cuts";

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

  it("translates every content string into every locale catalog", () => {
    const keys = new Set<string>();
    const recordingT: ContentT = (message) => {
      keys.add(message);
      return message;
    };
    const entries = getSousVideEntries(recordingT);
    for (const group of groupSousVideEntriesByCut(entries)) {
      getCutGuide(group.cutId, recordingT);
    }

    const missing = Object.entries({ "en-US": enUSMessages, sv: svMessages }).flatMap(
      ([locale, catalog]) =>
        [...keys].filter((key) => !Object.hasOwn(catalog, key)).map((key) => `${locale}: ${key}`),
    );
    expect(missing).toEqual([]);
  });
});
