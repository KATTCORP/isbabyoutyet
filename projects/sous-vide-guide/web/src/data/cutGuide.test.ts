import { describe, expect, it } from "vitest";

import { getCutGuide } from "@/data/cutGuide";
import { createContentT } from "@/lib/content-t";

const t = createContentT("en-GB");

describe("getCutGuide", () => {
  it("returns notes and Swedish-leaning sources for chuck (högrev)", () => {
    const guide = getCutGuide("chuck", t);
    expect(guide).not.toBeNull();
    expect(guide?.notes.length).toBeGreaterThanOrEqual(2);
    expect(guide?.references.map((reference) => reference.href)).toEqual(
      expect.arrayContaining([
        "https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/",
        "https://hagshult.se/guider-tips/stora-guiden-till-sous-vide/",
        "https://www.gardssallskapet.se/kottguiden/recept/hogrev-sousvide-chimichurri",
        "http://www.kunskapskokboken.se/4.21514/varufakta/sa-lagas-hogrev-av-not/",
        "https://recipes.anovaculinary.com/recipe/sous-vide-medium-rare-chuck-roast",
      ]),
    );
    expect(guide?.references.some((reference) => /KitchenLab/i.test(reference.label))).toBe(true);
    expect(guide?.references.some((reference) => /Hagshult/i.test(reference.label))).toBe(true);
  });
});
