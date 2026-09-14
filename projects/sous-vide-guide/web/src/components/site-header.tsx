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
    // `top: -1px` + 1px extra safe-area padding: Safari leaves a 1px hairline
    // above `sticky; top: 0` where page chrome shows through. The extra pad
    // keeps the header's bottom edge (and `--site-header-h`) unchanged.
    <header className="sticky top-[-1px] z-20 border-b border-border/70 bg-[color-mix(in_oklab,var(--background)_82%,transparent)] pt-[calc(env(safe-area-inset-top,0px)+1px)] backdrop-blur-md">
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
