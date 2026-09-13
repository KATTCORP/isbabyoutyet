import { useDeferredValue } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import type { SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";
import { formatDurationMinutes, formatDurationRange } from "@/lib/duration";
import { groupSousVideEntriesByCut } from "@/lib/group-cuts";
import type { TemperatureUnit } from "@/lib/temperature";
import { formatTemperature } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";

const categoryMessage = {
  beef: () => m.category_beef(),
  eggs: () => m.category_eggs(),
  fish: () => m.category_fish(),
  game: () => m.category_game(),
  pork: () => m.category_pork(),
  poultry: () => m.category_poultry(),
  shellfish: () => m.category_shellfish(),
  vegetables: () => m.category_vegetables(),
} as const;

type SousVideToolbarProps = {
  q: string;
  unit: TemperatureUnit;
};

/**
 * Search + category jump links. Categories are in-page anchors (not filters);
 * the sticky header offset is handled via `scroll-mt-*` on sections.
 * Query updates go straight to the URL without remounting the input or
 * resetting scroll; the page defers filtering with `useDeferredValue`.
 */
export function SousVideToolbar(props: SousVideToolbarProps) {
  const navigate = useNavigate({ from: "/" });
  const search = useRouterState({ select: (state) => state.location.search });

  return (
    <div className="sticky top-[3.25rem] z-10 -mx-4 space-y-3 border-b border-border/60 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label={m.search_entries_placeholder()}
          autoComplete="off"
          className="h-12 bg-background/90 text-base sm:h-11 sm:text-sm"
          enterKeyHint="search"
          name="q"
          onChange={(event) => {
            void navigate({
              replace: true,
              resetScroll: false,
              search: {
                ...search,
                q: event.currentTarget.value,
                unit: props.unit,
              },
            });
          }}
          placeholder={m.search_entries_placeholder()}
          type="search"
          value={props.q}
        />
        {props.q.length > 0 ? (
          <Button
            className="h-12 min-h-12 touch-manipulation sm:h-11"
            onClick={() => {
              void navigate({
                replace: true,
                resetScroll: false,
                search: { ...search, q: "", unit: props.unit },
              });
            }}
            type="button"
            variant="outline"
          >
            {m.clear_search()}
          </Button>
        ) : null}
      </div>

      <nav aria-label={m.categories_label()} className="-mx-1">
        <div className="flex flex-wrap gap-2 px-1 pb-1">
          {SOUS_VIDE_CATEGORIES.map((category) => (
            <Button
              className="h-10 shrink-0 snap-start rounded-full px-4 touch-manipulation"
              key={category}
              render={<a href={`#${category}`} />}
              size="sm"
              type="button"
              variant="outline"
            >
              {categoryMessage[category]()}
            </Button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function SousVideResults(props: {
  entries: ReadonlyArray<SousVideEntry>;
  unit: TemperatureUnit;
}) {
  const locale = getLocale();
  const deferredEntries = useDeferredValue(props.entries);
  const cutGroups = groupSousVideEntriesByCut(deferredEntries);

  if (cutGroups.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">{m.no_results()}</p>;
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {cutGroups.length === 1
          ? m.results_cuts_count_one()
          : m.results_cuts_count({ count: cutGroups.length })}
      </p>

      {/* Always keep category sections so search does not swap layout and jump scroll. */}
      {SOUS_VIDE_CATEGORIES.map((category) => {
        const groups = cutGroups.filter((group) => group.category === category);
        if (groups.length === 0) {
          return null;
        }
        const categoryLabel = categoryMessage[category]();

        return (
          <section
            className="scroll-mt-36 space-y-4 sm:scroll-mt-24"
            id={category}
            key={category}
          >
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--guide-ink)]">
              <span>{categoryLabel}</span>{" "}
              <a
                aria-label={m.category_permalink_label({ category: categoryLabel })}
                className="text-base text-[var(--guide-copper)] underline-offset-4 hover:underline"
                href={`#${category}`}
              >
                #
              </a>
            </h2>
            <div className="space-y-4">
              {groups.map((group) => (
                <CutTable
                  cutId={group.cutId}
                  key={group.cutId}
                  locale={locale}
                  name={group.name}
                  rows={group.rows}
                  unit={props.unit}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CutTable(props: {
  cutId: string;
  locale: string;
  name: string;
  rows: ReadonlyArray<SousVideEntry>;
  unit: TemperatureUnit;
}) {
  return (
    <article
      className="scroll-mt-40 overflow-hidden rounded-2xl border border-border/80 bg-[color-mix(in_oklab,var(--card)_92%,white)] sm:scroll-mt-28"
      id={props.cutId}
    >
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border/70 px-4 py-3 sm:px-5">
        <h3 className="font-display text-lg font-semibold text-[var(--guide-ink)] sm:text-xl">
          <span>{props.name}</span>{" "}
          <a
            aria-label={m.permalink_cut_label()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-[var(--guide-copper)] underline-offset-4 hover:underline sm:min-h-0 sm:min-w-0"
            href={`#${props.cutId}`}
          >
            #
          </a>
        </h3>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium sm:px-5">{m.doneness_label()}</th>
              <th className="px-3 py-2 font-medium">{m.recommended_time()}</th>
              <th className="px-3 py-2 font-medium">{m.max_time()}</th>
              <th className="px-4 py-2 text-right font-medium sm:px-5">
                {m.temperature_label()}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((entry) => {
              const recommendedTime = formatDurationRange(
                entry.recommendedMinutes,
                props.locale,
              );
              const maxTime =
                entry.maxMinutes === null
                  ? "—"
                  : formatDurationMinutes(entry.maxMinutes, props.locale);

              return (
                <tr className="border-t border-border/60" key={entry.id}>
                  <td className="px-4 py-3 text-foreground/90 sm:px-5">
                    {entry.doneness ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{recommendedTime}</td>
                  <td className="px-3 py-3 text-muted-foreground">{maxTime}</td>
                  <td className="temp-number px-4 py-3 text-right text-2xl font-semibold leading-none text-[var(--guide-copper)] sm:px-5 sm:text-3xl">
                    {formatTemperature(entry.temperatureC, {
                      locale: props.locale,
                      unit: props.unit,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
