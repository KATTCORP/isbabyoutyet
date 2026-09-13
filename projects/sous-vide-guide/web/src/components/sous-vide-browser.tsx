import { useDeferredValue } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import type { SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";
import { formatDurationMinutes, formatDurationRange } from "@/lib/duration";
import type { TemperatureUnit } from "@/lib/temperature";
import { formatTemperature } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { Badge } from "@workspace/ui/components/badge";
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

  if (deferredEntries.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">{m.no_results()}</p>;
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {deferredEntries.length === 1
          ? m.results_count_one()
          : m.results_count({ count: deferredEntries.length })}
      </p>

      {/* Always keep category sections so search does not swap layout and jump scroll. */}
      {SOUS_VIDE_CATEGORIES.map((category) => {
        const entries = deferredEntries.filter((entry) => entry.category === category);
        if (entries.length === 0) {
          return null;
        }
        const categoryLabel = categoryMessage[category]();

        return (
          <section
            className="scroll-mt-36 space-y-3 sm:scroll-mt-24"
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
            <EntryList
              categoryLabel={categoryLabel}
              entries={entries}
              locale={locale}
              unit={props.unit}
            />
          </section>
        );
      })}
    </div>
  );
}

function EntryList(props: {
  categoryLabel: string | undefined;
  entries: ReadonlyArray<SousVideEntry>;
  locale: string;
  unit: TemperatureUnit;
}) {
  return (
    <ul className="divide-y divide-border/80 overflow-hidden rounded-2xl border border-border/80 bg-[color-mix(in_oklab,var(--card)_92%,white)]">
      {props.entries.map((entry) => {
        const recommendedTime = formatDurationRange(entry.recommendedMinutes, props.locale);
        const maxTime =
          entry.maxMinutes === null ? null : formatDurationMinutes(entry.maxMinutes, props.locale);
        const categoryLabel = props.categoryLabel ?? categoryMessage[entry.category]();

        return (
          <li
            className="grid scroll-mt-40 gap-3 px-4 py-4 sm:scroll-mt-28 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-5"
            id={entry.id}
            key={entry.id}
          >
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-semibold text-[var(--guide-ink)]">
                  <span>{entry.name}</span>{" "}
                  <a
                    aria-label={m.permalink_label()}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-[var(--guide-copper)] underline-offset-4 hover:underline sm:min-h-0 sm:min-w-0"
                    href={`#${entry.id}`}
                  >
                    #
                  </a>
                </h3>
                {entry.doneness ? <Badge variant="outline">{entry.doneness}</Badge> : null}
                <Badge variant="secondary">{categoryLabel}</Badge>
              </div>
              <dl className="grid grid-cols-1 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-x-6">
                <div>
                  <dt className="inline font-medium text-foreground/80">
                    {m.recommended_time()}:{" "}
                  </dt>
                  <dd className="inline">{recommendedTime}</dd>
                </div>
                {maxTime ? (
                  <div>
                    <dt className="inline font-medium text-foreground/80">{m.max_time()}: </dt>
                    <dd className="inline">{maxTime}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="temp-number text-4xl font-semibold leading-none text-[var(--guide-copper)] sm:text-right">
              {formatTemperature(entry.temperatureC, {
                locale: props.locale,
                unit: props.unit,
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
