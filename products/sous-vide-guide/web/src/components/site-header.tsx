import { Link } from "@tanstack/react-router";

import { LocaleSwitcher } from "@/components/locale-switcher";
import * as m from "@/paraglide/messages";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-[color-mix(in_oklab,var(--background)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="font-display text-xl font-semibold tracking-tight text-[var(--kitchen-ink)]"
        >
          {m.app_name()}
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/guides/sous-vide"
            search={{ q: "", category: "all", unit: "" }}
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            {m.nav_guides()}
          </Link>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
