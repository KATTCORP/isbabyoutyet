import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group";
import type { BirthJourney } from "@baby-outlet/backend/src/types";
import { useI18n } from "@/lib/i18n";
import { JOURNEY_OPTIONS } from "./journey-options";

type JourneySelectorProps = {
  value: BirthJourney;
  onValueChange: (value: BirthJourney) => void;
  /** Keeps radio labels unique when the shared selector appears in overlays. */
  idPrefix: string;
};

export function JourneySelector(props: JourneySelectorProps) {
  const { t } = useI18n();

  return (
    <RadioGroup
      value={props.value}
      onValueChange={(value) => props.onValueChange(value as BirthJourney)}
      aria-label={t("Choose a journey")}
      className="grid gap-3"
    >
      {JOURNEY_OPTIONS.map((option) => {
        const labelId = `${props.idPrefix}-${option.value}`;
        return (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border p-4 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary/5"
          >
            <RadioGroupItem value={option.value} aria-labelledby={labelId} />
            <span>
              <span id={labelId} className="block font-bold">
                {t(option.labelKey)}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t(option.descriptionKey)}
              </span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
