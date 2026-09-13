import { Link, createFileRoute } from "@tanstack/react-router";
import { retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { SousVideFilters, SousVideResults } from "@/components/sous-vide-browser";
import { SOUS_VIDE_CATEGORIES, SOUS_VIDE_ENTRIES } from "@/data/sousVide";
import { filterSousVideEntries, isSousVideCategory } from "@/lib/search";
import { defaultTemperatureUnit, isTemperatureUnit } from "@/lib/temperature";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const sousVideSearchSchema = z.object({
  q: z.string().default(""),
  category: z
    .string()
    .default("all")
    .transform((value) => (value === "all" || isSousVideCategory(value) ? value : "all")),
  unit: z
    .string()
    .optional()
    .transform((value) => (value && isTemperatureUnit(value) ? value : undefined))
    .catch(undefined),
});

export const Route = createFileRoute("/guides/sous-vide")({
  validateSearch: sousVideSearchSchema,
  search: {
    middlewares: [retainSearchParams(["unit"])],
  },
  component: SousVideGuidePage,
  head: () => ({
    meta: [
      { title: `${m.sous_vide_title()} — ${m.app_name()}` },
      { name: "description", content: m.sous_vide_summary() },
    ],
  }),
});

function SousVideGuidePage() {
  const search = Route.useSearch();
  const unit = search.unit ?? defaultTemperatureUnit(getLocale());
  const entries = filterSousVideEntries({
    entries: SOUS_VIDE_ENTRIES,
    query: search.q,
    category: search.category,
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-8 sm:px-6 sm:py-12">
      <div className="space-y-3">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← {m.back_home()}
        </Link>
        <h1
          id="sous-vide"
          className="scroll-mt-28 font-display text-3xl font-semibold tracking-tight text-[var(--guide-ink)] sm:scroll-mt-24 sm:text-5xl"
        >
          <a
            href="#sous-vide"
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
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

      <SousVideFilters q={search.q} category={search.category} unit={unit} />
      <SousVideResults entries={entries} unit={unit} query={search.q} />

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
            rows: SOUS_VIDE_ENTRIES.length,
          })}
        </p>
      </footer>
    </main>
  );
}
