import { getLocale, locales, setLocale } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";
import * as m from "@/paraglide/messages";
import { Button } from "@workspace/ui/components/button";

const localeLabels: Record<Locale, () => string> = {
  sv: () => m.locale_sv(),
  en: () => m.locale_en(),
};

export function LocaleSwitcher() {
  const current = getLocale();

  return (
    <div className="flex items-center gap-1" role="group" aria-label={m.language()}>
      {locales.map((locale) => (
        <Button
          key={locale}
          type="button"
          size="sm"
          variant={locale === current ? "default" : "ghost"}
          onClick={() => {
            if (locale !== current) {
              void setLocale(locale);
            }
          }}
        >
          {localeLabels[locale]()}
        </Button>
      ))}
    </div>
  );
}
