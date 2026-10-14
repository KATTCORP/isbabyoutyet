import { ClockIcon, TranslateIcon } from "@phosphor-icons/react";
import type { EnsuredQueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import { queries } from "@/lib/convex-queries";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@workspace/ui/components/item";
import { DEFAULT_TIME_ZONE } from "@isbabyoutyet/backend/src/timeZone";
import { LanguagePicker } from "@/components/language-picker";
import { getLanguageName, useI18n } from "@/lib/i18n";
import { setLocale } from "@/lib/paraglide-setup";
import { useOptimisticOverride } from "@/lib/use-optimistic-override";

function formatTimeZoneLabel(timeZone: string) {
  const [firstPart, ...locationParts] = timeZone.split("/");
  const area = firstPart ?? timeZone;
  const location = locationParts.join(" / ").replaceAll("_", " ");
  return location ? `${location} (${area})` : area;
}

const timeZoneOptions = Array.from(
  new Set([DEFAULT_TIME_ZONE, ...Intl.supportedValuesOf("timeZone")]),
)
  .toSorted()
  .map((timeZone) => ({
    label: formatTimeZoneLabel(timeZone),
    value: timeZone,
  }));

const defaultTimeZoneOption = {
  label: formatTimeZoneLabel(DEFAULT_TIME_ZONE),
  value: DEFAULT_TIME_ZONE,
};

export function LanguageSettings(props: {
  profile: EnsuredQueryHandle<typeof queries.profile.get>;
}) {
  const [profile] = useQuery(queries.profile.get, props.profile);
  const onUpdateLocale = useMutation(api.profile.updateLocale);
  const onUpdateTimeZone = useMutation(api.profile.updateTimeZone);
  const { locale, t } = useI18n();
  const selectedLocale = profile?.locale ?? locale;
  const selectedTimeZone = profile?.timeZone ?? DEFAULT_TIME_ZONE;
  const [optimisticTimeZone, setOptimisticTimeZone] = useOptimisticOverride({
    base: selectedTimeZone,
    isEqual: (left, right) => left === right,
  });
  const selectedTimeZoneOption =
    timeZoneOptions.find((option) => option.value === optimisticTimeZone) ?? defaultTimeZoneOption;

  return (
    <>
      <ItemSeparator />
      <Item>
        <ItemMedia variant="icon">
          <TranslateIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t("Language")}</ItemTitle>
          <ItemDescription>{getLanguageName(selectedLocale, locale)}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <LanguagePicker
            disabled={!profile}
            label={t("Profile language")}
            onValueChange={async (value) => {
              await onUpdateLocale({ locale: value });
              await setLocale(value);
            }}
            value={selectedLocale}
          />
        </ItemActions>
      </Item>

      <ItemSeparator />

      <Item>
        <ItemMedia variant="icon">
          <ClockIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t("Time zone")}</ItemTitle>
          <ItemDescription>{formatTimeZoneLabel(optimisticTimeZone)}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Combobox
            disabled={!profile}
            items={timeZoneOptions}
            itemToStringValue={(option) => option.label}
            onValueChange={(option) => {
              if (!option || option.value === optimisticTimeZone) {
                return;
              }
              const previousTimeZone = optimisticTimeZone;
              setOptimisticTimeZone(option.value);
              void onUpdateTimeZone({ timeZone: option.value })
                .then(() => {
                  toast.success(t("Time zone saved"));
                })
                .catch((error) => {
                  setOptimisticTimeZone(previousTimeZone);
                  toast.error(error instanceof Error ? error.message : t("Failed to submit form"));
                });
            }}
            value={selectedTimeZoneOption}
          >
            <ComboboxInput
              aria-label={t("Profile time zone")}
              className="w-40"
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              placeholder={t("Search time zones")}
            />
            <ComboboxContent>
              <ComboboxEmpty>{t("No time zones found")}</ComboboxEmpty>
              <ComboboxList>
                {(option) => (
                  <ComboboxItem key={option.value} value={option}>
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </ItemActions>
      </Item>
    </>
  );
}
