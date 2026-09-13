import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Button } from "@workspace/ui/components/button";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { cn } from "@workspace/ui/lib/utils";
import { useI18n } from "@/lib/i18n";
import { JourneyMilestoneEditor } from "./journey-milestone-editor";
import { THEME_OPTIONS } from "./utils";

type AddBabyOptionalSettingsProps<
  TFieldValues extends FieldValues,
  TBirthJourneyName extends FieldPath<TFieldValues>,
  TThemeName extends FieldPath<TFieldValues>,
> = {
  birthJourneyFieldName: TBirthJourneyName;
  control: Control<TFieldValues, unknown, unknown>;
  themeFieldName: TThemeName;
};

export function AddBabyOptionalSettings<
  TFieldValues extends FieldValues,
  TBirthJourneyName extends FieldPath<TFieldValues>,
  TThemeName extends FieldPath<TFieldValues>,
>(props: AddBabyOptionalSettingsProps<TFieldValues, TBirthJourneyName, TThemeName>) {
  const { t } = useI18n();

  return (
    <Collapsible className="rounded-2xl border-2 border-border">
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-bold",
          "hover:bg-muted/40 data-[panel-open]:border-b data-[panel-open]:border-border",
        )}
      >
        <span>{t("Customize your page (optional)")}</span>
        <CaretDownIcon className="size-4 shrink-0 transition-transform [[data-panel-open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-5 px-4 pb-4 pt-1">
        <p className="text-sm text-muted-foreground">
          {t("You can change journey, theme, and other settings anytime after creating your page.")}
        </p>

        <FormField
          control={props.control}
          name={props.birthJourneyFieldName}
          render={(renderProps) => (
            <FormItem>
              <FormLabel className="font-bold">{t("Birth journey")}</FormLabel>
              <FormControl>
                <JourneyMilestoneEditor
                  birthJourney={renderProps.field.value}
                  idPrefix="add-journey"
                  onBirthJourneyChange={renderProps.field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={props.control}
          name={props.themeFieldName}
          render={(renderProps) => (
            <FormItem>
              <FormLabel className="font-bold">{t("Theme")}</FormLabel>
              <FormControl>
                <div className="grid gap-2">
                  {THEME_OPTIONS.map((option) => {
                    const selected = renderProps.field.value === option.value;
                    return (
                      <Button
                        aria-pressed={selected}
                        className="h-auto justify-start gap-3 rounded-xl px-3 py-2"
                        key={option.value ?? "default"}
                        onClick={() => {
                          renderProps.field.onChange(option.value);
                        }}
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        <span className="flex gap-0.5">
                          {option.colors.map((color, index) => (
                            <span
                              className="size-4 rounded-sm border border-border/50"
                              key={index}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                        {t(option.labelKey)}
                      </Button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
