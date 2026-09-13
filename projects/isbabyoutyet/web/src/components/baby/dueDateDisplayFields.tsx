import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import type { Control, FieldPath, FieldPathByValue, FieldValues } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { ShowExactDueDateToggleField } from "@/components/baby/showExactDueDateToggleField";
import { useI18n } from "@/lib/i18n";

type DueDateDisplayFieldsProps<
  TFieldValues extends FieldValues,
  TDateName extends FieldPath<TFieldValues>,
  TShowExactName extends FieldPathByValue<TFieldValues, boolean>,
  TPublicTextName extends FieldPathByValue<TFieldValues, string>,
> = {
  className: string | undefined;
  control: Control<TFieldValues, unknown, unknown>;
  dateFieldName: TDateName;
  publicDueDateTextFieldName: TPublicTextName;
  sectionLabelClassName: string | undefined;
  showExactDueDateFieldName: TShowExactName;
  stopPopoverPropagation: boolean;
};

export function DueDateDisplayFields<
  TFieldValues extends FieldValues,
  TDateName extends FieldPath<TFieldValues>,
  TShowExactName extends FieldPathByValue<TFieldValues, boolean>,
  TPublicTextName extends FieldPathByValue<TFieldValues, string>,
>(props: DueDateDisplayFieldsProps<TFieldValues, TDateName, TShowExactName, TPublicTextName>) {
  const { t } = useI18n();
  const showExactDueDate = useWatch({
    control: props.control,
    name: props.showExactDueDateFieldName,
  });

  return (
    <FormItem className={props.className}>
      <Label className={props.sectionLabelClassName}>{t("Due Date")}</Label>
      <div className="overflow-hidden rounded-xl border border-border">
        <ShowExactDueDateToggleField
          control={props.control}
          name={props.showExactDueDateFieldName}
          rowClassName="gap-3 p-3 pb-2"
          titleClassName={undefined}
        />
        <div className="border-t border-border/60 bg-muted/30 px-3 pb-3 pt-2">
          {showExactDueDate ? (
            <FormField
              control={props.control}
              name={props.dateFieldName}
              render={(renderProps) => (
                <FormItem>
                  <FormLabel className="sr-only">{t("Due Date")}</FormLabel>
                  <FormControl>
                    <Input
                      onFocus={
                        props.stopPopoverPropagation
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                      onMouseDown={
                        props.stopPopoverPropagation
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                      type="date"
                      {...renderProps.field}
                      value={renderProps.field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <FormField
              control={props.control}
              name={props.publicDueDateTextFieldName}
              render={(renderProps) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal text-muted-foreground">
                    {t("Public due date message")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      maxLength={80}
                      placeholder={t("September baby")}
                      {...renderProps.field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>
    </FormItem>
  );
}
