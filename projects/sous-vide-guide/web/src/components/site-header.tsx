import { Link, useRouterState } from "@tanstack/react-router";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { TemperatureUnitToggle } from "@/components/temperature-unit-toggle";
import { defaultTemperatureUnit } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { ModeToggle } from "@workspace/ui/components/mode-toggle";

/** Height is fixed (`--site-header-h` in app.css) so sticky toolbars can sit flush under it. */
export function SiteHeader() {
  const search = useRouterState({ select: (state) => state.location.search });
  const unit = search.unit ?? defaultTemperatureUnit(getLocale());

  return (
    // Sticky layers can land a fractional device-pixel below the viewport top
    // (DPR / zoom), so scrolled chrome peeks through as a 1px hairline. An
    // opaque upward box-shadow paints with the sticky layer and covers that
    // slit; keep the fill mostly opaque so blur alone cannot leave a dark edge.
    <header className="sticky top-0 z-20 border-b border-border/70 bg-[color-mix(in_oklab,var(--background)_94%,transparent)] pt-[env(safe-area-inset-top,0px)] shadow-[0_-1px_0_0_var(--background)] backdrop-blur-md">
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
  );
}
