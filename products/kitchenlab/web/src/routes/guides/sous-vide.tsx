import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SousVideFilters, SousVideResults } from "@/components/sous-vide-browser";
import { SOUS_VIDE_CATEGORIES, SOUS_VIDE_ENTRIES } from "@/data/sousVide";
import { filterSousVideEntries, isSousVideCategory } from "@/lib/search";
import * as m from "@/paraglide/messages";

const sousVideSearchSchema = z.object({
  q: z.string().default(""),
  category: z
    .string()
    .default("all")
    .transform((value) => (value === "all" || isSousVideCategory(value) ? value : "all")),
});

export const Route = createFileRoute("/guides/sous-vide")({
  validateSearch: sousVideSearchSchema,
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
  const entries = filterSousVideEntries({
    entries: SOUS_VIDE_ENTRIES,
    query: search.q,
    category: search.category,
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="space-y-3">
        <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ← {m.back_home()}
        </Link>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--kitchen-ink)] sm:text-5xl">
          {m.sous_vide_title()}
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {m.sous_vide_summary()}
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">{m.sous_vide_thickness_note()}</p>
      </div>

      <SousVideFilters query={search.q} category={search.category} />
      <SousVideResults entries={entries} />

      <footer className="border-t border-border/70 pt-6 text-sm text-muted-foreground">
        <p>{m.source_attribution()}</p>
        <a
          className="mt-1 inline-flex font-medium text-[var(--kitchen-copper)] underline-offset-4 hover:underline"
          href="https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/"
          rel="noreferrer"
          target="_blank"
        >
          {m.source_link_label()}
        </a>
        <p className="mt-3 text-xs">
          {SOUS_VIDE_CATEGORIES.length} categories · {SOUS_VIDE_ENTRIES.length} rows
        </p>
      </footer>
    </main>
  );
}
