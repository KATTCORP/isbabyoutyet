import { FormControl, FormField, FormItem, useFormField } from "@workspace/ui/components/form";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useI18n } from "@/lib/i18n";

type ShowExactDueDateToggleFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues, unknown, unknown>;
  name: TName;
  rowClassName: string | undefined;
  titleClassName: string | undefined;
};

function ShowExactDueDateToggleRow(props: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  rowClassName: string | undefined;
  titleClassName: string | undefined;
}) {
  const { t } = useI18n();
  const { formDescriptionId, formItemId } = useFormField();
  const titleId = `${formItemId}-title`;

  return (
    <label
      className={cn("flex items-center justify-between", props.rowClassName)}
      htmlFor={formItemId}
    >
      <div className="flex flex-col gap-1">
        <span className={cn("text-sm leading-none font-medium", props.titleClassName)} id={titleId}>
          {t("Show exact due date")}
        </span>
        <span className="text-muted-foreground text-sm" id={formDescriptionId}>
          {props.checked
            ? t("Visitors see the exact date and countdown.")
            : t("Visitors see only your message.")}
        </span>
      </div>
      <FormControl aria-labelledby={titleId}>
        <Switch checked={props.checked} id={formItemId} onCheckedChange={props.onCheckedChange} />
      </FormControl>
    </label>
  );
}

export function ShowExactDueDateToggleField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: ShowExactDueDateToggleFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={(renderProps) => (
        <FormItem className="border-0 p-0">
          <ShowExactDueDateToggleRow
            checked={renderProps.field.value}
            onCheckedChange={renderProps.field.onChange}
            rowClassName={props.rowClassName}
            titleClassName={props.titleClassName}
          />
        </FormItem>
      )}
    />
  );
}
