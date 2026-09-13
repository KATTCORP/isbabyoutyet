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

/** Short codes for narrow viewports — full name stays in aria-label / title. */
const localeShortLabels: Record<Locale, string> = {
  sv: "SV",
  "en-GB": "UK",
  "en-US": "US",
};

export function LocaleSwitcher() {
  const current = getLocale();

  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label={m.language()}>
      {locales.map((locale) => {
        const fullLabel = localeLabels[locale]();
        return (
          <Button
            key={locale}
            type="button"
            size="sm"
            variant={locale === current ? "default" : "ghost"}
            title={fullLabel}
            aria-label={fullLabel}
            aria-pressed={locale === current}
            className="h-10 min-w-10 touch-manipulation px-2.5 text-xs font-semibold tracking-wide sm:h-9 sm:min-w-0 sm:px-3 sm:text-sm sm:font-medium sm:tracking-normal"
            onClick={() => {
              if (locale !== current) {
                void setLocale(locale);
              }
            }}
          >
            <span className="sm:hidden">{localeShortLabels[locale]}</span>
            <span className="hidden sm:inline">{fullLabel}</span>
          </Button>
        );
      })}
    </div>
  );
}
