type GuideId = "sous-vide";

export type GuideSummary = {
  id: GuideId;
  slug: string;
  titleSv: string;
  titleEn: string;
  summarySv: string;
  summaryEn: string;
  searchTerms: ReadonlyArray<string>;
};

export const GUIDES: ReadonlyArray<GuideSummary> = [
  {
    id: "sous-vide",
    slug: "sous-vide",
    titleSv: "Sous vide — temperaturer & koktider",
    titleEn: "Sous vide — temperatures & cook times",
    summarySv:
      "Sökbara temperaturer och tider för fläsk, nötkött, fågel, fisk, skaldjur, grönsaker och ägg.",
    summaryEn:
      "Searchable temperatures and times for pork, beef, poultry, fish, shellfish, vegetables, and eggs.",
    searchTerms: [
      "sous vide",
      "sousvide",
      "temperatur",
      "temperature",
      "koktid",
      "cook time",
      "anova",
      "vattenbad",
    ],
  },
];
