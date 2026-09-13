import { Link } from "@tanstack/react-router";

import { LocaleSwitcher } from "@/components/locale-switcher";
import * as m from "@/paraglide/messages";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-[color-mix(in_oklab,var(--background)_82%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
        <Link
          to="/"
          className="min-w-0 truncate font-display text-lg font-semibold tracking-tight text-[var(--guide-ink)] sm:text-xl"
        >
          {m.app_name()}
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <Link
            to="/guides/sous-vide"
            search={(prev) => ({
              q: "",
              category: "all",
              unit: prev.unit,
            })}
            className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {m.nav_guides()}
          </Link>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
