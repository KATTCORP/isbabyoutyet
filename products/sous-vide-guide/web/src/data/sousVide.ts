/** Content locale keys used by the static guide database. */
type ContentLocale = "sv" | "en-GB" | "en-US";

export type LocalizedText = Record<ContentLocale, string>;

export const SOUS_VIDE_CATEGORIES = [
  "pork",
  "poultry",
  "beef",
  "game",
  "fish",
  "shellfish",
  "vegetables",
  "eggs",
] as const;

export type SousVideCategory = (typeof SOUS_VIDE_CATEGORIES)[number];

export type SousVideEntry = {
  id: string;
  category: SousVideCategory;
  name: LocalizedText;
  doneness: LocalizedText | null;
  temperatureC: number;
  recommendedTime: LocalizedText;
  maxTime: LocalizedText | null;
  /** Extra tokens for fuzzy search (all locales). */
  searchTerms: ReadonlyArray<string>;
};

export function pickLocalized(text: LocalizedText, locale: string) {
  if (locale === "en-US" || locale === "en-GB" || locale === "sv") {
    return text[locale];
  }
  if (locale.startsWith("en")) {
    return text["en-GB"];
  }
  return text.sv;
}

/**
 * Static, translated sous vide reference rows adapted from KitchenLab’s
 * köksguide #9 (source attribution only). Times assume ~25 mm thickness
 * and room-temperature ingredients.
 */
export const SOUS_VIDE_ENTRIES: ReadonlyArray<SousVideEntry> = [
  {
    id: "pork-fillet-rare",
    category: "pork",
    name: {
      sv: "Fläskfilé",
      "en-GB": "Pork fillet",
      "en-US": "Pork tenderloin",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 60,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2,5 h",
      "en-GB": "2.5 h",
      "en-US": "2.5 h",
    },
    searchTerms: ["fläsk", "pork", "filé", "fillet", "Pork fillet", "Pork tenderloin", "Fläskfilé"],
  },
  {
    id: "pork-fillet-medium",
    category: "pork",
    name: {
      sv: "Fläskfilé",
      "en-GB": "Pork fillet",
      "en-US": "Pork tenderloin",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 65,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: ["fläsk", "pork", "filé", "fillet", "Pork fillet", "Pork tenderloin", "Fläskfilé"],
  },
  {
    id: "pork-fillet-well",
    category: "pork",
    name: {
      sv: "Fläskfilé",
      "en-GB": "Pork fillet",
      "en-US": "Pork tenderloin",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 70,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    searchTerms: ["fläsk", "pork", "filé", "fillet", "Pork fillet", "Pork tenderloin", "Fläskfilé"],
  },
  {
    id: "pork-chop-rare",
    category: "pork",
    name: {
      sv: "Fläskkotlett",
      "en-GB": "Pork chop",
      "en-US": "Pork chop",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 60,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2,5 h",
      "en-GB": "2.5 h",
      "en-US": "2.5 h",
    },
    searchTerms: ["fläsk", "pork", "kotlett", "chop", "Pork chop", "Fläskkotlett"],
  },
  {
    id: "pork-chop-medium",
    category: "pork",
    name: {
      sv: "Fläskkotlett",
      "en-GB": "Pork chop",
      "en-US": "Pork chop",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 65,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: ["fläsk", "pork", "kotlett", "chop", "Pork chop", "Fläskkotlett"],
  },
  {
    id: "pork-chop-well",
    category: "pork",
    name: {
      sv: "Fläskkotlett",
      "en-GB": "Pork chop",
      "en-US": "Pork chop",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 70,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    searchTerms: ["fläsk", "pork", "kotlett", "chop", "Pork chop", "Fläskkotlett"],
  },
  {
    id: "pork-roast-rare",
    category: "pork",
    name: {
      sv: "Fläskstek",
      "en-GB": "Pork roast",
      "en-US": "Pork roast",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 60,
    recommendedTime: {
      sv: "3–3,5 h",
      "en-GB": "3–3.5 h",
      "en-US": "3–3.5 h",
    },
    maxTime: {
      sv: "5–6 h",
      "en-GB": "5–6 h",
      "en-US": "5–6 h",
    },
    searchTerms: ["fläsk", "pork", "stek", "roast", "Pork roast", "Fläskstek"],
  },
  {
    id: "pork-roast-medium",
    category: "pork",
    name: {
      sv: "Fläskstek",
      "en-GB": "Pork roast",
      "en-US": "Pork roast",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 65,
    recommendedTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    maxTime: {
      sv: "4 h",
      "en-GB": "4 h",
      "en-US": "4 h",
    },
    searchTerms: ["fläsk", "pork", "stek", "roast", "Pork roast", "Fläskstek"],
  },
  {
    id: "pork-roast-well",
    category: "pork",
    name: {
      sv: "Fläskstek",
      "en-GB": "Pork roast",
      "en-US": "Pork roast",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 70,
    recommendedTime: {
      sv: "3,5 h",
      "en-GB": "3.5 h",
      "en-US": "3.5 h",
    },
    maxTime: null,
    searchTerms: ["fläsk", "pork", "stek", "roast", "Pork roast", "Fläskstek"],
  },
  {
    id: "pork-shoulder-rare",
    category: "pork",
    name: {
      sv: "Fläskbog",
      "en-GB": "Pork shoulder",
      "en-US": "Pork shoulder",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 60,
    recommendedTime: {
      sv: "14–18 h",
      "en-GB": "14–18 h",
      "en-US": "14–18 h",
    },
    maxTime: {
      sv: "24 h",
      "en-GB": "24 h",
      "en-US": "24 h",
    },
    searchTerms: ["fläsk", "pork", "bog", "shoulder", "karré", "Pork shoulder", "Fläskbog"],
  },
  {
    id: "pork-shoulder-medium",
    category: "pork",
    name: {
      sv: "Fläskbog",
      "en-GB": "Pork shoulder",
      "en-US": "Pork shoulder",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 65,
    recommendedTime: {
      sv: "10–14 h",
      "en-GB": "10–14 h",
      "en-US": "10–14 h",
    },
    maxTime: {
      sv: "24 h",
      "en-GB": "24 h",
      "en-US": "24 h",
    },
    searchTerms: ["fläsk", "pork", "bog", "shoulder", "Pork shoulder", "Fläskbog"],
  },
  {
    id: "pork-shoulder-pull",
    category: "pork",
    name: {
      sv: "Fläskbog",
      "en-GB": "Pork shoulder",
      "en-US": "Pork shoulder",
    },
    doneness: {
      sv: "Trådig / pulled",
      "en-GB": "Pull-apart",
      "en-US": "Pull-apart",
    },
    temperatureC: 85,
    recommendedTime: {
      sv: "16 h",
      "en-GB": "16 h",
      "en-US": "16 h",
    },
    maxTime: null,
    searchTerms: ["fläsk", "pork", "bog", "shoulder", "pulled", "Pork shoulder", "Fläskbog"],
  },
  {
    id: "pork-belly",
    category: "pork",
    name: {
      sv: "Fläsksida",
      "en-GB": "Pork belly",
      "en-US": "Pork belly",
    },
    doneness: null,
    temperatureC: 70,
    recommendedTime: {
      sv: "14–18 h",
      "en-GB": "14–18 h",
      "en-US": "14–18 h",
    },
    maxTime: {
      sv: "16 h",
      "en-GB": "16 h",
      "en-US": "16 h",
    },
    searchTerms: ["fläsk", "pork", "sida", "belly", "ribs", "revben", "Pork belly", "Fläsksida"],
  },
  {
    id: "duck-breast",
    category: "poultry",
    name: {
      sv: "Ankbröst",
      "en-GB": "Duck breast",
      "en-US": "Duck breast",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 58,
    recommendedTime: {
      sv: "1–1,5 h",
      "en-GB": "1–1.5 h",
      "en-US": "1–1.5 h",
    },
    maxTime: {
      sv: "2,5 h",
      "en-GB": "2.5 h",
      "en-US": "2.5 h",
    },
    searchTerms: ["anka", "duck", "fågel", "poultry", "Duck breast", "Ankbröst"],
  },
  {
    id: "chicken-breast-mr",
    category: "poultry",
    name: {
      sv: "Kycklingfilé",
      "en-GB": "Chicken breast",
      "en-US": "Chicken breast",
    },
    doneness: {
      sv: "Medium rare",
      "en-GB": "Medium rare",
      "en-US": "Medium rare",
    },
    temperatureC: 60,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: ["kyckling", "chicken", "filé", "breast", "Chicken breast", "Kycklingfilé"],
  },
  {
    id: "chicken-breast-medium",
    category: "poultry",
    name: {
      sv: "Kycklingfilé",
      "en-GB": "Chicken breast",
      "en-US": "Chicken breast",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 63,
    recommendedTime: {
      sv: "1–1,5 h",
      "en-GB": "1–1.5 h",
      "en-US": "1–1.5 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: ["kyckling", "chicken", "filé", "breast", "Chicken breast", "Kycklingfilé"],
  },
  {
    id: "chicken-breast-well",
    category: "poultry",
    name: {
      sv: "Kycklingfilé",
      "en-GB": "Chicken breast",
      "en-US": "Chicken breast",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 72,
    recommendedTime: {
      sv: "1–1,5 h",
      "en-GB": "1–1.5 h",
      "en-US": "1–1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: ["kyckling", "chicken", "filé", "breast", "Chicken breast", "Kycklingfilé"],
  },
  {
    id: "chicken-thigh-medium",
    category: "poultry",
    name: {
      sv: "Kycklinglår",
      "en-GB": "Chicken thigh",
      "en-US": "Chicken thigh",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 65,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "4–5 h",
      "en-GB": "4–5 h",
      "en-US": "4–5 h",
    },
    searchTerms: ["kyckling", "chicken", "lår", "thigh", "Chicken thigh", "Kycklinglår"],
  },
  {
    id: "chicken-thigh-well",
    category: "poultry",
    name: {
      sv: "Kycklinglår",
      "en-GB": "Chicken thigh",
      "en-US": "Chicken thigh",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 72,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: ["kyckling", "chicken", "lår", "thigh", "Chicken thigh", "Kycklinglår"],
  },
  {
    id: "sirloin-rare",
    category: "beef",
    name: {
      sv: "Ryggbiff",
      "en-GB": "Sirloin",
      "en-US": "Sirloin",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 54,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: ["nöt", "beef", "ryggbiff", "sirloin", "biff", "Sirloin", "Ryggbiff"],
  },
  {
    id: "sirloin-medium",
    category: "beef",
    name: {
      sv: "Ryggbiff",
      "en-GB": "Sirloin",
      "en-US": "Sirloin",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 58,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: ["nöt", "beef", "ryggbiff", "sirloin", "Sirloin", "Ryggbiff"],
  },
  {
    id: "sirloin-well",
    category: "beef",
    name: {
      sv: "Ryggbiff",
      "en-GB": "Sirloin",
      "en-US": "Sirloin",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 70,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: ["nöt", "beef", "ryggbiff", "sirloin", "Sirloin", "Ryggbiff"],
  },
  {
    id: "tenderloin-rare",
    category: "beef",
    name: {
      sv: "Oxfilé",
      "en-GB": "Beef fillet",
      "en-US": "Beef tenderloin",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 54,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: [
      "nöt",
      "beef",
      "oxfilé",
      "tenderloin",
      "filé",
      "Beef fillet",
      "Beef tenderloin",
      "Oxfilé",
    ],
  },
  {
    id: "tenderloin-medium",
    category: "beef",
    name: {
      sv: "Oxfilé",
      "en-GB": "Beef fillet",
      "en-US": "Beef tenderloin",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 58,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: [
      "nöt",
      "beef",
      "oxfilé",
      "tenderloin",
      "Beef fillet",
      "Beef tenderloin",
      "Oxfilé",
    ],
  },
  {
    id: "tenderloin-well",
    category: "beef",
    name: {
      sv: "Oxfilé",
      "en-GB": "Beef fillet",
      "en-US": "Beef tenderloin",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 70,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: [
      "nöt",
      "beef",
      "oxfilé",
      "tenderloin",
      "Beef fillet",
      "Beef tenderloin",
      "Oxfilé",
    ],
  },
  {
    id: "ribeye-rare",
    category: "beef",
    name: {
      sv: "Entrecôte, skivad",
      "en-GB": "Ribeye, sliced",
      "en-US": "Ribeye, sliced",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 54,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "7–8 h",
      "en-GB": "7–8 h",
      "en-US": "7–8 h",
    },
    searchTerms: [
      "nöt",
      "beef",
      "entrecôte",
      "entrecote",
      "ribeye",
      "Ribeye, sliced",
      "Entrecôte, skivad",
    ],
  },
  {
    id: "ribeye-medium",
    category: "beef",
    name: {
      sv: "Entrecôte, skivad",
      "en-GB": "Ribeye, sliced",
      "en-US": "Ribeye, sliced",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 58,
    recommendedTime: {
      sv: "1,5 h",
      "en-GB": "1.5 h",
      "en-US": "1.5 h",
    },
    maxTime: {
      sv: "7–8 h",
      "en-GB": "7–8 h",
      "en-US": "7–8 h",
    },
    searchTerms: ["nöt", "beef", "entrecôte", "ribeye", "Ribeye, sliced", "Entrecôte, skivad"],
  },
  {
    id: "flank-rare",
    category: "beef",
    name: {
      sv: "Flankstek",
      "en-GB": "Flank steak",
      "en-US": "Flank steak",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 58,
    recommendedTime: {
      sv: "12 h",
      "en-GB": "12 h",
      "en-US": "12 h",
    },
    maxTime: {
      sv: "48 h",
      "en-GB": "48 h",
      "en-US": "48 h",
    },
    searchTerms: ["nöt", "beef", "flank", "flankstek", "Flank steak", "Flankstek"],
  },
  {
    id: "flank-medium",
    category: "beef",
    name: {
      sv: "Flankstek",
      "en-GB": "Flank steak",
      "en-US": "Flank steak",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 65,
    recommendedTime: {
      sv: "12 h",
      "en-GB": "12 h",
      "en-US": "12 h",
    },
    maxTime: {
      sv: "24 h",
      "en-GB": "24 h",
      "en-US": "24 h",
    },
    searchTerms: ["nöt", "beef", "flank", "flankstek", "Flank steak", "Flankstek"],
  },
  {
    id: "flank-well",
    category: "beef",
    name: {
      sv: "Flankstek",
      "en-GB": "Flank steak",
      "en-US": "Flank steak",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 82,
    recommendedTime: {
      sv: "8 h",
      "en-GB": "8 h",
      "en-US": "8 h",
    },
    maxTime: {
      sv: "18 h",
      "en-GB": "18 h",
      "en-US": "18 h",
    },
    searchTerms: ["nöt", "beef", "flank", "flankstek", "Flank steak", "Flankstek"],
  },
  {
    id: "deer-pink",
    category: "game",
    name: {
      sv: "Hjort/rådjur, mörare detalj",
      "en-GB": "Venison / deer, tender cut",
      "en-US": "Venison / deer, tender cut",
    },
    doneness: {
      sv: "Rosa",
      "en-GB": "Pink",
      "en-US": "Pink",
    },
    temperatureC: 54.5,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "1 h 30 min",
      "en-GB": "1 h 30 min",
      "en-US": "1 h 30 min",
    },
    searchTerms: [
      "vilt",
      "game",
      "hjort",
      "rådjur",
      "deer",
      "venison",
      "Venison / deer, tender cut",
      "Hjort/rådjur, mörare detalj",
    ],
  },
  {
    id: "moose-rare",
    category: "game",
    name: {
      sv: "Älg/ren, mörare detalj",
      "en-GB": "Moose / reindeer, tender cut",
      "en-US": "Moose / reindeer, tender cut",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 55,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: [
      "vilt",
      "game",
      "älg",
      "ren",
      "moose",
      "reindeer",
      "Moose / reindeer, tender cut",
      "Älg/ren, mörare detalj",
    ],
  },
  {
    id: "moose-medium",
    category: "game",
    name: {
      sv: "Älg/ren",
      "en-GB": "Moose / reindeer",
      "en-US": "Moose / reindeer",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 58,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: ["vilt", "game", "älg", "ren", "moose", "reindeer", "Moose / reindeer", "Älg/ren"],
  },
  {
    id: "salmon-rare",
    category: "fish",
    name: {
      sv: "Laxfilé",
      "en-GB": "Salmon fillet",
      "en-US": "Salmon fillet",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 42,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "lax", "salmon", "Salmon fillet", "Laxfilé"],
  },
  {
    id: "salmon-medium",
    category: "fish",
    name: {
      sv: "Laxfilé",
      "en-GB": "Salmon fillet",
      "en-US": "Salmon fillet",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 50,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "lax", "salmon", "Salmon fillet", "Laxfilé"],
  },
  {
    id: "salmon-well",
    category: "fish",
    name: {
      sv: "Laxfilé",
      "en-GB": "Salmon fillet",
      "en-US": "Salmon fillet",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 55,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "lax", "salmon", "Salmon fillet", "Laxfilé"],
  },
  {
    id: "tuna-rare",
    category: "fish",
    name: {
      sv: "Tonfisk",
      "en-GB": "Tuna",
      "en-US": "Tuna",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 41,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "tonfisk", "tuna", "Tuna", "Tonfisk"],
  },
  {
    id: "tuna-medium",
    category: "fish",
    name: {
      sv: "Tonfisk",
      "en-GB": "Tuna",
      "en-US": "Tuna",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 46,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "tonfisk", "tuna", "Tuna", "Tonfisk"],
  },
  {
    id: "tuna-well",
    category: "fish",
    name: {
      sv: "Tonfisk",
      "en-GB": "Tuna",
      "en-US": "Tuna",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 49,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "tonfisk", "tuna", "Tuna", "Tonfisk"],
  },
  {
    id: "cod-rare",
    category: "fish",
    name: {
      sv: "Torsk",
      "en-GB": "Cod",
      "en-US": "Cod",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 42,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "torsk", "cod", "Cod", "Torsk"],
  },
  {
    id: "cod-medium",
    category: "fish",
    name: {
      sv: "Torsk",
      "en-GB": "Cod",
      "en-US": "Cod",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 50,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "torsk", "cod", "Cod", "Torsk"],
  },
  {
    id: "cod-well",
    category: "fish",
    name: {
      sv: "Torsk",
      "en-GB": "Cod",
      "en-US": "Cod",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 54,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "torsk", "cod", "Cod", "Torsk"],
  },
  {
    id: "halibut-rare",
    category: "fish",
    name: {
      sv: "Hälleflundra",
      "en-GB": "Halibut",
      "en-US": "Halibut",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 42,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "hälleflundra", "halibut", "Halibut", "Hälleflundra"],
  },
  {
    id: "halibut-medium",
    category: "fish",
    name: {
      sv: "Hälleflundra",
      "en-GB": "Halibut",
      "en-US": "Halibut",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 50,
    recommendedTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    maxTime: {
      sv: "45 min",
      "en-GB": "45 min",
      "en-US": "45 min",
    },
    searchTerms: ["fisk", "fish", "hälleflundra", "halibut", "Halibut", "Hälleflundra"],
  },
  {
    id: "halibut-well",
    category: "fish",
    name: {
      sv: "Hälleflundra",
      "en-GB": "Halibut",
      "en-US": "Halibut",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 52,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "hälleflundra", "halibut", "Halibut", "Hälleflundra"],
  },
  {
    id: "turbot-rare",
    category: "fish",
    name: {
      sv: "Piggvar",
      "en-GB": "Turbot",
      "en-US": "Turbot",
    },
    doneness: {
      sv: "Blodig",
      "en-GB": "Rare",
      "en-US": "Rare",
    },
    temperatureC: 42,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "piggvar", "turbot", "Turbot", "Piggvar"],
  },
  {
    id: "turbot-medium",
    category: "fish",
    name: {
      sv: "Piggvar",
      "en-GB": "Turbot",
      "en-US": "Turbot",
    },
    doneness: {
      sv: "Medium",
      "en-GB": "Medium",
      "en-US": "Medium",
    },
    temperatureC: 47,
    recommendedTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    maxTime: {
      sv: "45 min",
      "en-GB": "45 min",
      "en-US": "45 min",
    },
    searchTerms: ["fisk", "fish", "piggvar", "turbot", "Turbot", "Piggvar"],
  },
  {
    id: "turbot-well",
    category: "fish",
    name: {
      sv: "Piggvar",
      "en-GB": "Turbot",
      "en-US": "Turbot",
    },
    doneness: {
      sv: "Välstekt",
      "en-GB": "Well done",
      "en-US": "Well-done",
    },
    temperatureC: 50,
    recommendedTime: {
      sv: "40 min",
      "en-GB": "40 min",
      "en-US": "40 min",
    },
    maxTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    searchTerms: ["fisk", "fish", "piggvar", "turbot", "Turbot", "Piggvar"],
  },
  {
    id: "lobster-near-raw",
    category: "shellfish",
    name: {
      sv: "Hummerstjärt, skalad",
      "en-GB": "Lobster tail, shelled",
      "en-US": "Lobster tail, shelled",
    },
    doneness: {
      sv: "Nästan rå",
      "en-GB": "Nearly raw",
      "en-US": "Nearly raw",
    },
    temperatureC: 49,
    recommendedTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    maxTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    searchTerms: [
      "skaldjur",
      "shellfish",
      "hummer",
      "lobster",
      "Lobster tail, shelled",
      "Hummerstjärt, skalad",
    ],
  },
  {
    id: "lobster-tender",
    category: "shellfish",
    name: {
      sv: "Hummerstjärt, skalad",
      "en-GB": "Lobster tail, shelled",
      "en-US": "Lobster tail, shelled",
    },
    doneness: {
      sv: "Mör",
      "en-GB": "Tender",
      "en-US": "Tender",
    },
    temperatureC: 54,
    recommendedTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    maxTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    searchTerms: [
      "skaldjur",
      "shellfish",
      "hummer",
      "lobster",
      "Lobster tail, shelled",
      "Hummerstjärt, skalad",
    ],
  },
  {
    id: "lobster-firm",
    category: "shellfish",
    name: {
      sv: "Hummerstjärt, skalad",
      "en-GB": "Lobster tail, shelled",
      "en-US": "Lobster tail, shelled",
    },
    doneness: {
      sv: "Fast",
      "en-GB": "Firm",
      "en-US": "Firm",
    },
    temperatureC: 59,
    recommendedTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    maxTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    searchTerms: [
      "skaldjur",
      "shellfish",
      "hummer",
      "lobster",
      "Lobster tail, shelled",
      "Hummerstjärt, skalad",
    ],
  },
  {
    id: "scallop-near-raw",
    category: "shellfish",
    name: {
      sv: "Pilgrimsmusslor",
      "en-GB": "Scallops",
      "en-US": "Scallops",
    },
    doneness: {
      sv: "Nästan råa",
      "en-GB": "Nearly raw",
      "en-US": "Nearly raw",
    },
    temperatureC: 42,
    recommendedTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    maxTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    searchTerms: ["skaldjur", "shellfish", "musslor", "scallops", "Scallops", "Pilgrimsmusslor"],
  },
  {
    id: "scallop-tender",
    category: "shellfish",
    name: {
      sv: "Pilgrimsmusslor",
      "en-GB": "Scallops",
      "en-US": "Scallops",
    },
    doneness: {
      sv: "Möra",
      "en-GB": "Tender",
      "en-US": "Tender",
    },
    temperatureC: 51,
    recommendedTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    maxTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    searchTerms: ["skaldjur", "shellfish", "musslor", "scallops", "Scallops", "Pilgrimsmusslor"],
  },
  {
    id: "scallop-firm",
    category: "shellfish",
    name: {
      sv: "Pilgrimsmusslor",
      "en-GB": "Scallops",
      "en-US": "Scallops",
    },
    doneness: {
      sv: "Fasta",
      "en-GB": "Firm",
      "en-US": "Firm",
    },
    temperatureC: 54,
    recommendedTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    maxTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    searchTerms: ["skaldjur", "shellfish", "musslor", "scallops", "Scallops", "Pilgrimsmusslor"],
  },
  {
    id: "shrimp-near-raw",
    category: "shellfish",
    name: {
      sv: "Räkor",
      "en-GB": "Prawns",
      "en-US": "Shrimp",
    },
    doneness: {
      sv: "Nästan råa",
      "en-GB": "Nearly raw",
      "en-US": "Nearly raw",
    },
    temperatureC: 50,
    recommendedTime: {
      sv: "15 min",
      "en-GB": "15 min",
      "en-US": "15 min",
    },
    maxTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    searchTerms: [
      "skaldjur",
      "shellfish",
      "räkor",
      "räka",
      "shrimp",
      "prawns",
      "Prawns",
      "Shrimp",
      "Räkor",
    ],
  },
  {
    id: "shrimp-tender",
    category: "shellfish",
    name: {
      sv: "Räkor",
      "en-GB": "Prawns",
      "en-US": "Shrimp",
    },
    doneness: {
      sv: "Möra",
      "en-GB": "Tender",
      "en-US": "Tender",
    },
    temperatureC: 56,
    recommendedTime: {
      sv: "15 min",
      "en-GB": "15 min",
      "en-US": "15 min",
    },
    maxTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    searchTerms: ["skaldjur", "shellfish", "räkor", "räka", "shrimp", "Prawns", "Shrimp", "Räkor"],
  },
  {
    id: "shrimp-firm",
    category: "shellfish",
    name: {
      sv: "Räkor",
      "en-GB": "Prawns",
      "en-US": "Shrimp",
    },
    doneness: {
      sv: "Fasta",
      "en-GB": "Firm",
      "en-US": "Firm",
    },
    temperatureC: 60,
    recommendedTime: {
      sv: "15 min",
      "en-GB": "15 min",
      "en-US": "15 min",
    },
    maxTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    searchTerms: ["skaldjur", "shellfish", "räkor", "räka", "shrimp", "Prawns", "Shrimp", "Räkor"],
  },
  {
    id: "carrot",
    category: "vegetables",
    name: {
      sv: "Morot och palsternacka",
      "en-GB": "Carrot and parsnip",
      "en-US": "Carrot and parsnip",
    },
    doneness: null,
    temperatureC: 85,
    recommendedTime: {
      sv: "15 min",
      "en-GB": "15 min",
      "en-US": "15 min",
    },
    maxTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    searchTerms: [
      "grönsaker",
      "vegetables",
      "morot",
      "carrot",
      "palsternacka",
      "parsnip",
      "Carrot and parsnip",
      "Morot och palsternacka",
    ],
  },
  {
    id: "asparagus",
    category: "vegetables",
    name: {
      sv: "Sparris",
      "en-GB": "Asparagus",
      "en-US": "Asparagus",
    },
    doneness: null,
    temperatureC: 82,
    recommendedTime: {
      sv: "22 min",
      "en-GB": "22 min",
      "en-US": "22 min",
    },
    maxTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    searchTerms: ["grönsaker", "vegetables", "sparris", "asparagus", "Asparagus", "Sparris"],
  },
  {
    id: "potato",
    category: "vegetables",
    name: {
      sv: "Potatis",
      "en-GB": "Potato",
      "en-US": "Potato",
    },
    doneness: null,
    temperatureC: 88,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    searchTerms: ["grönsaker", "vegetables", "potatis", "potato", "Potato", "Potatis"],
  },
  {
    id: "beet",
    category: "vegetables",
    name: {
      sv: "Rödbetor",
      "en-GB": "Beetroot",
      "en-US": "Beets",
    },
    doneness: null,
    temperatureC: 86,
    recommendedTime: {
      sv: "3 h",
      "en-GB": "3 h",
      "en-US": "3 h",
    },
    maxTime: {
      sv: "5 h",
      "en-GB": "5 h",
      "en-US": "5 h",
    },
    searchTerms: [
      "grönsaker",
      "vegetables",
      "rödbetor",
      "beet",
      "beetroot",
      "Beetroot",
      "Beets",
      "Rödbetor",
    ],
  },
  {
    id: "pumpkin",
    category: "vegetables",
    name: {
      sv: "Pumpa",
      "en-GB": "Pumpkin",
      "en-US": "Pumpkin",
    },
    doneness: null,
    temperatureC: 90,
    recommendedTime: {
      sv: "30 min",
      "en-GB": "30 min",
      "en-US": "30 min",
    },
    maxTime: {
      sv: "45 min",
      "en-GB": "45 min",
      "en-US": "45 min",
    },
    searchTerms: ["grönsaker", "vegetables", "pumpa", "pumpkin", "squash", "Pumpkin", "Pumpa"],
  },
  {
    id: "egg-soft",
    category: "eggs",
    name: {
      sv: "Ägg, Large",
      "en-GB": "Large egg",
      "en-US": "Large egg",
    },
    doneness: {
      sv: "Löst",
      "en-GB": "Soft",
      "en-US": "Soft",
    },
    temperatureC: 64,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: ["ägg", "egg", "breakfast", "Large egg", "Ägg, Large"],
  },
  {
    id: "egg-poached",
    category: "eggs",
    name: {
      sv: "Ägg, Large",
      "en-GB": "Large egg",
      "en-US": "Large egg",
    },
    doneness: {
      sv: "Pocherat",
      "en-GB": "Poached",
      "en-US": "Poached",
    },
    temperatureC: 72,
    recommendedTime: {
      sv: "13 min",
      "en-GB": "13 min",
      "en-US": "13 min",
    },
    maxTime: {
      sv: "15 min",
      "en-GB": "15 min",
      "en-US": "15 min",
    },
    searchTerms: ["ägg", "egg", "pocherat", "poached", "Large egg", "Ägg, Large"],
  },
  {
    id: "egg-hard",
    category: "eggs",
    name: {
      sv: "Ägg, Large",
      "en-GB": "Large egg",
      "en-US": "Large egg",
    },
    doneness: {
      sv: "Hårdkokt",
      "en-GB": "Hard-cooked",
      "en-US": "Hard-cooked",
    },
    temperatureC: 84,
    recommendedTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    maxTime: {
      sv: "20 min",
      "en-GB": "20 min",
      "en-US": "20 min",
    },
    searchTerms: ["ägg", "egg", "hårdkokt", "Large egg", "Ägg, Large"],
  },
  {
    id: "egg-jammy",
    category: "eggs",
    name: {
      sv: "Ägg, Large",
      "en-GB": "Large egg",
      "en-US": "Large egg",
    },
    doneness: {
      sv: "Bredbar gula med fast yttre",
      "en-GB": "Spreadable yolk, set white",
      "en-US": "Spreadable yolk, set white",
    },
    temperatureC: 65,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "2 h",
      "en-GB": "2 h",
      "en-US": "2 h",
    },
    searchTerms: ["ägg", "egg", "gula", "yolk", "Large egg", "Ägg, Large"],
  },
  {
    id: "creme-brulee",
    category: "eggs",
    name: {
      sv: "Crème brûlée / Crema Catalana",
      "en-GB": "Crème brûlée / Crema Catalana",
      "en-US": "Crème brûlée / Crema Catalana",
    },
    doneness: null,
    temperatureC: 80,
    recommendedTime: {
      sv: "1 h",
      "en-GB": "1 h",
      "en-US": "1 h",
    },
    maxTime: {
      sv: "1 h 30 min",
      "en-GB": "1 h 30 min",
      "en-US": "1 h 30 min",
    },
    searchTerms: [
      "ägg",
      "egg",
      "dessert",
      "crème",
      "brulee",
      "catalana",
      "Crème brûlée / Crema Catalana",
    ],
  },
  {
    id: "yogurt",
    category: "eggs",
    name: {
      sv: "Yoghurt",
      "en-GB": "Yoghurt",
      "en-US": "Yogurt",
    },
    doneness: null,
    temperatureC: 43,
    recommendedTime: {
      sv: "12 h",
      "en-GB": "12 h",
      "en-US": "12 h",
    },
    maxTime: {
      sv: "16 h",
      "en-GB": "16 h",
      "en-US": "16 h",
    },
    searchTerms: ["yoghurt", "yogurt", "ferment", "Yoghurt", "Yogurt"],
  },
];
