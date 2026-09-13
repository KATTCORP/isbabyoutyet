import "@/lib/paraglide-setup";
import { getLocale, locales } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";
import { setLocale } from "@/lib/paraglide-setup";
import * as m from "@/paraglide/messages";
import { Button } from "@workspace/ui/components/button";

const localeLabels: Record<Locale, () => string> = {
  sv: () => m.locale_sv(),
  "en-GB": () => m.locale_en_gb(),
  "en-US": () => m.locale_en_us(),
};

export function LocaleSwitcher() {
  const current = getLocale();

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={m.language()}>
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
