import { Translate } from "@phosphor-icons/react";
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

export function LanguagePicker(props: LanguagePickerProps) {
  return (
    <Select
      items={languageOptions}
      value={props.value}
      onValueChange={(value) => {
        if (!shouldApplyLocaleChange(value, props.value)) {
          return;
        }
        void props.onValueChange(value);
      }}
      disabled={props.disabled}
    >
      <SelectTrigger aria-label={props.label}>
        <Translate data-icon="inline-start" />
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
  );
}
