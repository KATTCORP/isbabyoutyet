import "@/lib/paraglide-setup";
import { TranslateIcon } from "@phosphor-icons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

import { setLocaleInPlace } from "@/lib/paraglide-setup";
import type { TemperatureUnit } from "@/lib/temperature";
import { defaultTemperatureUnit } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale, locales } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";

const localeLabels = {
  "en-GB": () => m.locale_en_gb(),
  "en-US": () => m.locale_en_us(),
  sv: () => m.locale_sv(),
} satisfies Record<Locale, () => string>;

/** Region codes on the trigger — compact, no emoji flags. */
const localeRegionCodes = {
  "en-GB": "GB",
  "en-US": "US",
  sv: "SE",
} satisfies Record<Locale, string>;

type LocaleSwitcherProps = {
  unit: TemperatureUnit;
};

/**
 * Compact language menu in the top nav. Switching language also applies that
 * locale’s default temperature unit; toast immediately when the unit flips.
 */
export function LocaleSwitcher(props: LocaleSwitcherProps) {
  const current = getLocale();
  const navigate = useNavigate({ from: "/" });
  const search = useRouterState({ select: (state) => state.location.search });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={m.language()}
            className="h-10 gap-1.5 touch-manipulation px-2.5 sm:h-9"
            size="sm"
            title={localeLabels[current]()}
            type="button"
            variant="ghost"
          />
        }
      >
        <TranslateIcon aria-hidden className="size-4 opacity-80" />
        <span className="text-xs font-semibold tracking-wide">{localeRegionCodes[current]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            if (!isLocale(value) || value === current) {
              return;
            }
            const nextUnit = defaultTemperatureUnit(value);
            if (nextUnit !== props.unit) {
              toast.message(
                nextUnit === "f" ? m.toast_switched_to_fahrenheit() : m.toast_switched_to_celsius(),
              );
            }
            void setLocaleInPlace(value).then(() =>
              navigate({
                replace: true,
                search: { ...search, unit: nextUnit },
              }),
            );
          }}
          value={current}
        >
          {locales.map((locale) => (
            <DropdownMenuRadioItem
              className="min-h-10 touch-manipulation"
              key={locale}
              value={locale}
            >
              <span className="mr-2 font-mono text-xs text-muted-foreground">
                {localeRegionCodes[locale]}
              </span>
              {localeLabels[locale]()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isLocale(value: string): value is Locale {
  for (const locale of locales) {
    if (locale === value) {
      return true;
    }
  }
  return false;
}
