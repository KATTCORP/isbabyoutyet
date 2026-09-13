import type { BirthJourney, PresetBirthJourney } from "@isbabyoutyet/backend/src/types";
import type { TranslationKey } from "@/lib/i18n";

export const JOURNEY_PRESET_OPTIONS = [
  {
    descriptionKey: "Visitors see: Labour started → Gone to hospital → Baby born",
    labelKey: "Labour",
    value: "labor",
  },
  {
    descriptionKey: "Visitors see: Labour started → Baby born",
    labelKey: "Home birth",
    value: "home_birth",
  },
  {
    descriptionKey: "Visitors see: Gone to hospital → Baby born",
    labelKey: "Planned C-section",
    value: "planned_c_section",
  },
] as const satisfies ReadonlyArray<{
  descriptionKey: TranslationKey;
  labelKey: TranslationKey;
  value: PresetBirthJourney;
}>;

export const JOURNEY_OPTION_BY_VALUE = {
  custom: {
    descriptionKey: "Visitors see: Baby born",
    labelKey: "Custom",
    value: "custom",
  },
  home_birth: JOURNEY_PRESET_OPTIONS[1],
  labor: JOURNEY_PRESET_OPTIONS[0],
  planned_c_section: JOURNEY_PRESET_OPTIONS[2],
} as const satisfies Record<
  BirthJourney,
  {
    descriptionKey: TranslationKey;
    labelKey: TranslationKey;
    value: BirthJourney;
  }
>;
