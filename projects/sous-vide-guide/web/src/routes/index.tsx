import { useDeferredValue } from "react";
import { createFileRoute, retainSearchParams, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { SousVideResults, SousVideToolbar } from "@/components/sous-vide-browser";
import { SOUS_VIDE_CATEGORIES, getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { filterSousVideEntries } from "@/lib/search";
import { defaultTemperatureUnit, temperatureUnitSearchSchema } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const SEARCH_DEFAULTS = { q: "" } as const;

const sousVideSearchSchema = z.object({
  q: z.string().default(SEARCH_DEFAULTS.q),
  unit: temperatureUnitSearchSchema,
});

export const Route = createFileRoute("/")({
  component: SousVideGuidePage,
  head: () => ({
    meta: [
      { title: `${m.sous_vide_title()} — ${m.app_name()}` },
      { content: m.sous_vide_summary(), name: "description" },
    ],
  }),
  search: {
    // Keep the front-page URL bare: empty `q` never round-trips.
    middlewares: [retainSearchParams(["unit"]), stripSearchParams(SEARCH_DEFAULTS)],
  },
  validateSearch: sousVideSearchSchema,
});

function SousVideGuidePage() {
  const search = Route.useSearch();
  const unit = search.unit ?? defaultTemperatureUnit(getLocale());
  const deferredQuery = useDeferredValue(search.q);
  const allEntries = getSousVideEntries(createContentT(getLocale()));
  const entries = filterSousVideEntries({
    category: "all",
    entries: allEntries,
    query: deferredQuery,
  });

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-8 sm:px-6 sm:py-12"
      id="sous-vide"
    >
      <div className="space-y-3">
        <h1 className="scroll-mt-28 font-display text-3xl font-semibold tracking-tight text-[var(--guide-ink)] sm:scroll-mt-24 sm:text-5xl">
          <a
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
            href="#sous-vide"
          >
            <span>{m.sous_vide_title()}</span>
            <span aria-hidden className="text-2xl text-[var(--guide-copper)]">
              #
            </span>
          </a>
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {m.sous_vide_summary()}
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">{m.sous_vide_thickness_note()}</p>
        <p className="max-w-3xl rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          {m.food_safety_disclaimer()}
        </p>
      </div>

      <SousVideToolbar q={search.q} unit={unit} />
      <SousVideResults entries={entries} unit={unit} />

      <footer className="border-t border-border/70 pt-6 text-sm text-muted-foreground">
        <p>{m.source_attribution()}</p>
        <a
          className="mt-1 inline-flex min-h-11 items-center font-medium text-[var(--guide-copper)] underline-offset-4 hover:underline"
          href="https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/"
          rel="noreferrer"
          target="_blank"
        >
          {m.source_link_label()}
        </a>
        <p className="mt-3 text-xs">
          {m.stats_line({
            categories: SOUS_VIDE_CATEGORIES.length,
            rows: allEntries.length,
          })}
        </p>
      </footer>
    </main>
  );
}
