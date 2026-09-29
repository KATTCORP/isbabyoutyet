import { describe, expect, it } from "vitest";

import { getCutGuide } from "@/data/cutGuide";
import { createContentT } from "@/lib/content-t";

const t = createContentT("en-GB");

const KITCHENLAB_GUIDE_HREF =
  "https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/";

describe("getCutGuide", () => {
  it("returns notes and Swedish-leaning sources for chuck (högrev)", () => {
    const guide = getCutGuide("chuck", t);
    expect(guide).not.toBeNull();
    expect(guide?.notes.length).toBeGreaterThanOrEqual(2);
    expect(guide?.references.map((reference) => reference.href)).toEqual(
      expect.arrayContaining([
        KITCHENLAB_GUIDE_HREF,
        "https://hagshult.se/guider-tips/stora-guiden-till-sous-vide/",
        "https://www.gardssallskapet.se/kottguiden/recept/hogrev-sousvide-chimichurri",
        "http://www.kunskapskokboken.se/4.21514/varufakta/sa-lagas-hogrev-av-not/",
        "https://recipes.anovaculinary.com/recipe/sous-vide-medium-rare-chuck-roast",
      ]),
    );
    expect(guide?.references.some((reference) => /KitchenLab/i.test(reference.label))).toBe(true);
    expect(guide?.references.some((reference) => /Hagshult/i.test(reference.label))).toBe(true);
  });

  it("documents the classic 63C onsen egg on the egg detail sheet", () => {
    const guide = getCutGuide("egg", t);
    expect(guide).not.toBeNull();
    expect(guide?.notes.some((note) => /Onsen-style \(63C/.test(note) && /62\.8C/.test(note))).toBe(
      true,
    );
    expect(
      guide?.notes.some((note) => /Soft and jammy/.test(note) && /Poached \(75C/.test(note)),
    ).toBe(true);
  });

  it("explains yolk thickening past an hour on equilibrium egg baths", () => {
    const guide = getCutGuide("egg", t);
    expect(
      guide?.notes.some(
        (note) =>
          /Past about an hour/.test(note) && /yolk thickens/.test(note) && /2h max/.test(note),
      ),
    ).toBe(true);
    expect(guide?.references.map((reference) => reference.href)).toEqual(
      expect.arrayContaining([
        "https://anovaculinary.com/pages/sous-vide-egg-guide",
        "https://www.seriouseats.com/sous-vide-101-all-about-eggs",
      ]),
    );
    expect(guide?.references.some((reference) => /yolk thickening/i.test(reference.label))).toBe(
      true,
    );
    expect(guide?.references.some((reference) => /thicken.*yolk/i.test(reference.label))).toBe(
      true,
    );
  });

  it("reassures that pink pork is about time-at-temp, with USDA and KitchenLab sources", () => {
    for (const cutId of [
      "pork-fillet",
      "pork-chop",
      "pork-roast",
      "pork-shoulder",
      "pork-belly",
    ] as const) {
      const guide = getCutGuide(cutId, t);
      expect(guide).not.toBeNull();
      expect(
        guide?.notes.some((note) => /Pink pork/.test(note) && /not a safety check/.test(note)),
      ).toBe(true);
      expect(guide?.notes.some((note) => /USDA whole-muscle pork is 63C/.test(note))).toBe(true);
      expect(guide?.references.map((reference) => reference.href)).toEqual(
        expect.arrayContaining([
          "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/meat-fish/fresh-pork-farm-table",
          KITCHENLAB_GUIDE_HREF,
        ]),
      );
    }
  });

  it("covers Trichinella for pork, flagging wild boar, with Livsmedelsverket and CDC sources", () => {
    for (const cutId of [
      "pork-fillet",
      "pork-chop",
      "pork-roast",
      "pork-shoulder",
      "pork-belly",
    ] as const) {
      const guide = getCutGuide(cutId, t);
      expect(guide?.notes.some((note) => note.startsWith("Trichinella die at about 60C"))).toBe(
        true,
      );
      expect(guide?.notes.some((note) => /Wild boar/.test(note) && /74C \/ 165F/.test(note))).toBe(
        true,
      );
      expect(guide?.references.map((reference) => reference.href)).toEqual(
        expect.arrayContaining([
          "https://www.livsmedelsverket.se/livsmedel-och-innehall/bakterier-virus-parasiter-och-mogelsvampar1/parasiter/trikiner",
          "https://www.cdc.gov/mmwr/volumes/73/wr/mm7320a2.htm",
        ]),
      );
    }
  });

  it("uses the word trikiner in the Swedish pork notes", () => {
    const guide = getCutGuide("pork-chop", createContentT("sv"));
    expect(guide?.notes.filter((note) => /trikiner/i.test(note))).toHaveLength(2);
  });

  it("reassures that pink chicken can still be pasteurised, with Anova and Serious Eats sources", () => {
    for (const cutId of ["chicken-breast", "chicken-thigh"] as const) {
      const guide = getCutGuide(cutId, t);
      expect(guide).not.toBeNull();
      expect(
        guide?.notes.some((note) => /stay pink/.test(note) && /time at temperature/.test(note)),
      ).toBe(true);
      expect(guide?.references.map((reference) => reference.href)).toEqual(
        expect.arrayContaining([
          "https://anovaculinary.com/pages/sous-vide-chicken-guide",
          "https://www.seriouseats.com/the-food-lab-complete-guide-to-sous-vide-chicken-breast",
        ]),
      );
    }
  });
});
