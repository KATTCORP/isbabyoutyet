import { useDeferredValue } from "react";
import { createFileRoute, retainSearchParams, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { SousVideBrowser } from "@/components/sous-vide-browser";
import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { filterSousVideEntries } from "@/lib/search";
import { defaultTemperatureUnit, temperatureUnitSearchSchema } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const SEARCH_DEFAULTS = { info: "", q: "" } as const;

const sousVideSearchSchema = z.object({
  /** Cut id for the More info drawer (`?info=egg`). Empty when closed. */
  info: z.string().default(SEARCH_DEFAULTS.info),
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
    // Keep the front-page URL bare: the empty query never round-trips as `?q=`.
    middlewares: [retainSearchParams(["unit"]), stripSearchParams(SEARCH_DEFAULTS)],
  },
  validateSearch: sousVideSearchSchema,
});

function SousVideGuidePage() {
  const search = Route.useSearch();
  const unit = search.unit ?? defaultTemperatureUnit(getLocale());
  // Filtering follows the field one render behind so typing never waits on it.
  const deferredQuery = useDeferredValue(search.q);
  const allEntries = getSousVideEntries(createContentT(getLocale()));
  const entries = filterSousVideEntries({ entries: allEntries, query: deferredQuery });

  return (
    <SousVideBrowser
      allEntries={allEntries}
      entries={entries}
      info={search.info}
      q={deferredQuery}
      unit={unit}
    />
  );
}
