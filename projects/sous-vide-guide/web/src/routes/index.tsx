import { useDeferredValue } from "react";
import {
  createFileRoute,
  redirect,
  rootRouteId,
  stripSearchParams,
  useLoaderData,
  useLocation,
} from "@tanstack/react-router";
import { z } from "zod";

import { SousVideBrowser } from "@/components/sous-vide-browser";
import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { infoCutIdFromHash, infoHash } from "@/lib/info-hash";
import { filterSousVideEntries } from "@/lib/search";
import { defaultTemperatureUnit, temperatureUnitSearchSchema } from "@/lib/temperature";
import { m } from "@/paraglide/messages";

/** Search params the URL leaves out while they hold their default. */
type SearchDefaults = { info: string; q: string };

const SEARCH_DEFAULTS = { info: "", q: "" } as const satisfies SearchDefaults;

const sousVideSearchSchema = z.object({
  /** Legacy `?info=<cutId>` share links; redirected to `#info-<cutId>`. */
  info: z.string().default(SEARCH_DEFAULTS.info),
  q: z.string().default(SEARCH_DEFAULTS.q),
  unit: temperatureUnitSearchSchema,
});

export const Route = createFileRoute("/")({
  loaderDeps: (opts) => ({ info: opts.search.info }),
  loader: (opts) => {
    if (opts.deps.info !== "") {
      throw redirect({
        hash: infoHash(opts.deps.info),
        replace: true,
        search: (search) => ({ ...search, info: "" }),
        to: "/",
      });
    }
  },
  component: SousVideGuidePage,
  head: () => ({
    meta: [
      { title: `${m.sous_vide_title()} · ${m.app_name()}` },
      { content: m.sous_vide_summary(), name: "description" },
    ],
  }),
  search: {
    // Keep the front-page URL bare: the empty query never round-trips as `?q=`.
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },
  validateSearch: sousVideSearchSchema,
});

function SousVideGuidePage() {
  const search = Route.useSearch();
  // Subscribing to the root loader's locale re-renders the page on an in-place
  // language switch, even when the URL (and so the search) is unchanged.
  const locale = useLoaderData({ from: rootRouteId, select: (data) => data.locale });
  const info = useLocation({ select: (location) => infoCutIdFromHash(location.hash) });
  const unit = search.unit ?? defaultTemperatureUnit(locale);
  // Filtering follows the field one render behind so typing never waits on it.
  const deferredQuery = useDeferredValue(search.q);
  const allEntries = getSousVideEntries(createContentT(locale));
  const entries = filterSousVideEntries({ entries: allEntries, query: deferredQuery });

  return (
    <SousVideBrowser
      allEntries={allEntries}
      entries={entries}
      info={info}
      q={deferredQuery}
      unit={unit}
    />
  );
}
