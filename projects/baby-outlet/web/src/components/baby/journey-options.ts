import type { BirthJourney } from "@baby-outlet/backend/src/types";
import type { TranslationKey } from "@/lib/i18n";

export const JOURNEY_OPTIONS = [
  {
    value: "labor",
    labelKey: "Labour",
    descriptionKey: "Visitors see: Labour started → At hospital → Baby born",
  },
  {
    value: "home_birth",
    labelKey: "Home birth",
    descriptionKey: "Visitors see: Labour started → Baby born",
  },
  {
    value: "planned_c_section",
    labelKey: "Planned C-section",
    descriptionKey: "Visitors see: At hospital → Baby born",
  },
] as const satisfies ReadonlyArray<{
  value: BirthJourney;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}>;

export const JOURNEY_OPTION_BY_VALUE = {
  labor: JOURNEY_OPTIONS[0],
  home_birth: JOURNEY_OPTIONS[1],
  planned_c_section: JOURNEY_OPTIONS[2],
} as const satisfies Record<BirthJourney, (typeof JOURNEY_OPTIONS)[number]>;
