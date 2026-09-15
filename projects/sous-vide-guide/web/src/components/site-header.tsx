import { Link, useRouterState } from "@tanstack/react-router";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { TemperatureUnitToggle } from "@/components/temperature-unit-toggle";
import { defaultTemperatureUnit } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { ModeToggle } from "@workspace/ui/components/mode-toggle";

/**
 * Fixed (not sticky) so mobile browsers cannot leave a 1px compositor gap above
 * the bar. Height is mirrored by `--site-header-h` and a flow spacer so category
 * stickies / scroll-margin still line up under it.
 */
export function SiteHeader() {
  const search = useRouterState({ select: (state) => state.location.search });
  const unit = search.unit ?? defaultTemperatureUnit(getLocale());

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-20 border-b border-border/70 bg-background pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6">
          <Link
            className="min-w-0 truncate font-display text-lg font-semibold tracking-tight text-[var(--guide-ink)] sm:text-xl"
            to="/"
          >
            {m.app_name()}
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <TemperatureUnitToggle unit={unit} />
            <LocaleSwitcher unit={unit} />
            <ModeToggle />
          </div>
        </div>
      </header>
      {/* Keeps document flow clear of the fixed bar; height === --site-header-h. */}
      <div aria-hidden className="h-[var(--site-header-h)]" />
    </>
  );
}
