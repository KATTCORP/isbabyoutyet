import { TranslateIcon } from "@phosphor-icons/react";
import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import { SUPPORTED_LOCALES } from "@baby-outlet/backend/src/i18n";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { z } from "zod";
import { useWatch } from "react-hook-form";
import { Form, useZodForm } from "@/components/Form";
import { getLanguageName } from "@/lib/i18n";
import { shouldApplyLocaleChange } from "@/lib/should-apply-locale-change";

type LanguagePickerProps = {
  disabled: boolean;
  label: string;
  onValueChange: (locale: SupportedLocale) => Promise<void>;
  value: SupportedLocale;
};

const languageOptions = SUPPORTED_LOCALES.map((locale) => ({
  label: getLanguageName(locale),
  value: locale,
}));

const localeSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

export function LanguagePicker(props: LanguagePickerProps) {
  const form = useZodForm({
    defaultValues: { locale: props.value },
    schema: localeSchema,
  });
  const selectedLocale = useWatch({ control: form.control, name: "locale" });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        try {
          await props.onValueChange(values.locale);
        } catch (error) {
          form.reset({ locale: props.value });
          throw error;
        }
      }}
    >
      <Select
        disabled={props.disabled}
        items={languageOptions}
        onValueChange={(value) => {
          if (!shouldApplyLocaleChange(value, selectedLocale)) {
            return;
          }
          form.setValue("locale", value, { shouldDirty: true });
          form.formRef.current?.requestSubmit();
        }}
        value={selectedLocale}
      >
        <SelectTrigger aria-label={props.label}>
          <TranslateIcon data-icon="inline-start" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {languageOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Form>
  );
}
