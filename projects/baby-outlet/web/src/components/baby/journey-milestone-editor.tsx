import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import type {
  BirthJourney,
  MilestoneVisibility,
  PresetBirthJourney,
} from "@baby-outlet/backend/src/types";
import {
  birthJourneyForVisibility,
  milestoneVisibilityForPreset,
} from "@baby-outlet/backend/src/types";
import { useI18n } from "@/lib/i18n";
import { JOURNEY_OPTION_BY_VALUE, JOURNEY_PRESET_OPTIONS } from "./journey-options";

type JourneyMilestoneEditorProps = {
  birthJourney: BirthJourney;
  idPrefix: string;
  onBirthJourneyChange: (birthJourney: BirthJourney) => void;
};

/**
 * Controlled journey preset + visitor-milestone toggles.
 * Callers own persistence (settings Save, add-baby form field, etc.).
 */
export function JourneyMilestoneEditor(props: JourneyMilestoneEditorProps) {
  const { t } = useI18n();
  const visibility = milestoneVisibilityForPreset(props.birthJourney);
  const presetItems = [
    ...JOURNEY_PRESET_OPTIONS.map((option) => ({
      label: t(option.labelKey),
      value: option.value,
    })),
    // Included so the closed trigger can show "Custom" when toggles diverge
    { label: t("Custom"), value: "custom" as const },
  ];

  function requestVisibilityChange(nextVisibility: MilestoneVisibility) {
    props.onBirthJourneyChange(birthJourneyForVisibility(nextVisibility));
  }

  function handlePresetSelect(preset: PresetBirthJourney) {
    if (preset === props.birthJourney) {
      return;
    }
    requestVisibilityChange(milestoneVisibilityForPreset(preset));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t("We save this choice for your settings, but we don't show it to anyone.")}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("Presets")}
        </p>
        <Select
          items={presetItems}
          onValueChange={(value) => {
            if (value === "labor" || value === "home_birth" || value === "planned_c_section") {
              handlePresetSelect(value);
            }
          }}
          value={props.birthJourney}
        >
          <SelectTrigger aria-label={t("Presets")} className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="w-(--anchor-width)">
            <SelectGroup>
              {JOURNEY_PRESET_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("Milestones visitors see")}
        </p>

        <label
          className="flex items-center justify-between gap-3"
          htmlFor={`${props.idPrefix}-show-labor`}
        >
          <span className="text-sm font-medium">{t("Labour started")}</span>
          <Switch
            checked={visibility.showLabor}
            id={`${props.idPrefix}-show-labor`}
            onCheckedChange={(checked) => {
              requestVisibilityChange({ ...visibility, showLabor: checked });
            }}
          />
        </label>

        <label
          className="flex items-center justify-between gap-3"
          htmlFor={`${props.idPrefix}-show-hospital`}
        >
          <span className="text-sm font-medium">{t("Gone to hospital")}</span>
          <Switch
            checked={visibility.showHospital}
            id={`${props.idPrefix}-show-hospital`}
            onCheckedChange={(checked) => {
              requestVisibilityChange({ ...visibility, showHospital: checked });
            }}
          />
        </label>

        <label
          className="flex items-center justify-between gap-3 opacity-70"
          htmlFor={`${props.idPrefix}-show-born`}
        >
          <span className="text-sm font-medium">{t("Baby born")}</span>
          <Switch checked={true} disabled={true} id={`${props.idPrefix}-show-born`} />
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        {t(JOURNEY_OPTION_BY_VALUE[props.birthJourney].descriptionKey)}
      </p>
    </div>
  );
}
