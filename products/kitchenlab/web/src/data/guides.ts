import type { LocalizedText } from "@/data/sousVide";

type GuideId = "sous-vide";

export type GuideSummary = {
  id: GuideId;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  searchTerms: ReadonlyArray<string>;
};

export const GUIDES: ReadonlyArray<GuideSummary> = [
  {
    id: "sous-vide",
    slug: "sous-vide",
    title: {
      sv: "Sous vide — temperaturer & koktider",
      "en-GB": "Sous vide — temperatures & cook times",
      "en-US": "Sous vide — temperatures & cook times",
    },
    summary: {
      sv: "Sökbara temperaturer och tider för fläsk, nötkött, fågel, fisk, skaldjur, grönsaker och ägg.",
      "en-GB":
        "Searchable temperatures and times for pork, beef, poultry, fish, shellfish, vegetables, and eggs.",
      "en-US":
        "Searchable temperatures and times for pork, beef, poultry, fish, shellfish, vegetables, and eggs.",
    },
    searchTerms: [
      "sous vide",
      "sousvide",
      "temperatur",
      "temperature",
      "koktid",
      "cook time",
      "anova",
      "vattenbad",
      "water bath",
    ],
  },
];
