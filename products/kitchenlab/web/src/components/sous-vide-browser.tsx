import { Link } from "@tanstack/react-router";

import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES, pickLocalized } from "@/data/sousVide";
import type { TemperatureUnit } from "@/lib/temperature";
import { formatTemperature } from "@/lib/temperature";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";

const categoryMessage = {
  pork: () => m.category_pork(),
  poultry: () => m.category_poultry(),
  beef: () => m.category_beef(),
  game: () => m.category_game(),
  fish: () => m.category_fish(),
  shellfish: () => m.category_shellfish(),
  vegetables: () => m.category_vegetables(),
  eggs: () => m.category_eggs(),
} as const;

type SousVideSearch = {
  q: string;
  category: SousVideCategory | "all";
  unit: TemperatureUnit;
};

export function SousVideFilters(props: SousVideSearch) {
  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="category" value={props.category} />
        <input type="hidden" name="unit" value={props.unit} />
        <Input
          name="q"
          type="search"
          defaultValue={props.q}
          placeholder={m.search_entries_placeholder()}
          aria-label={m.search_entries_placeholder()}
          className="h-11 bg-background/80"
        />
        <div className="flex gap-2">
          <Button type="submit" className="h-11 flex-1 sm:flex-none">
            {m.submit_search()}
          </Button>
          {props.q.length > 0 || props.category !== "all" ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              render={
                <Link
                  to="/guides/sous-vide"
                  search={{ q: "", category: "all", unit: props.unit }}
                />
              }
            >
              {m.clear_search()}
            </Button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap gap-2" role="list" aria-label={m.guides_heading()}>
        <CategoryChip
          category="all"
          active={props.category === "all"}
          query={props.q}
          unit={props.unit}
        />
        {SOUS_VIDE_CATEGORIES.map((category) => (
          <CategoryChip
            key={category}
            category={category}
            active={props.category === category}
            query={props.q}
            unit={props.unit}
          />
        ))}
      </div>

      <TemperatureUnitToggle search={props} />
    </div>
  );
}

function CategoryChip(props: {
  category: SousVideCategory | "all";
  active: boolean;
  query: string;
  unit: TemperatureUnit;
}) {
  const label = props.category === "all" ? m.all_categories() : categoryMessage[props.category]();

  return (
    <Button
      type="button"
      size="sm"
      variant={props.active ? "default" : "outline"}
      className="rounded-full"
      render={
        <Link
          to="/guides/sous-vide"
          search={{
            q: props.query,
            category: props.category,
            unit: props.unit,
          }}
          hash={props.category === "all" ? undefined : props.category}
        />
      }
    >
      {label}
    </Button>
  );
}

function TemperatureUnitToggle(props: { search: SousVideSearch }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={m.temperature_unit()}
    >
      <span className="text-sm text-muted-foreground">{m.temperature_unit()}</span>
      <Button
        type="button"
        size="sm"
        variant={props.search.unit === "c" ? "default" : "outline"}
        render={<Link to="/guides/sous-vide" search={{ ...props.search, unit: "c" }} />}
      >
        {m.unit_celsius()} (°C)
      </Button>
      <Button
        type="button"
        size="sm"
        variant={props.search.unit === "f" ? "default" : "outline"}
        render={<Link to="/guides/sous-vide" search={{ ...props.search, unit: "f" }} />}
      >
        {m.unit_fahrenheit()} (°F)
      </Button>
    </div>
  );
}

export function SousVideResults(props: {
  entries: ReadonlyArray<SousVideEntry>;
  unit: TemperatureUnit;
}) {
  const locale = getLocale();

  if (props.entries.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">{m.no_results()}</p>;
  }

  const grouped = SOUS_VIDE_CATEGORIES.map((category) => ({
    category,
    entries: props.entries.filter((entry) => entry.category === category),
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {m.results_count({ count: props.entries.length })}
      </p>

      {grouped.map((group) => {
        const categoryLabel = categoryMessage[group.category]();

        return (
          <section key={group.category} id={group.category} className="scroll-mt-24 space-y-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--kitchen-ink)]">
              <a
                href={`#${group.category}`}
                className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
                aria-label={m.category_permalink_label({ category: categoryLabel })}
              >
                <span>{categoryLabel}</span>
                <span aria-hidden className="text-base text-[var(--kitchen-copper)]">
                  #
                </span>
              </a>
            </h2>

            <ul className="divide-y divide-border/80 overflow-hidden rounded-2xl border border-border/80 bg-[color-mix(in_oklab,var(--card)_92%,white)]">
              {group.entries.map((entry) => {
                const name = pickLocalized(entry.name, locale);
                const doneness = entry.doneness ? pickLocalized(entry.doneness, locale) : null;
                const recommendedTime = pickLocalized(entry.recommendedTime, locale);
                const maxTime = entry.maxTime ? pickLocalized(entry.maxTime, locale) : null;

                return (
                  <li
                    key={entry.id}
                    id={entry.id}
                    className="grid scroll-mt-28 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-5"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-semibold text-[var(--kitchen-ink)]">
                          <a
                            href={`#${entry.id}`}
                            className="underline-offset-4 hover:underline"
                            aria-label={m.permalink_label()}
                          >
                            {name}
                          </a>
                        </h3>
                        {doneness ? <Badge variant="outline">{doneness}</Badge> : null}
                        <Badge variant="secondary">{categoryLabel}</Badge>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-6">
                        <div>
                          <dt className="inline font-medium text-foreground/80">
                            {m.recommended_time()}:{" "}
                          </dt>
                          <dd className="inline">{recommendedTime}</dd>
                        </div>
                        {maxTime ? (
                          <div>
                            <dt className="inline font-medium text-foreground/80">
                              {m.max_time()}:{" "}
                            </dt>
                            <dd className="inline">{maxTime}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="temp-number text-3xl font-semibold text-[var(--kitchen-copper)] sm:text-right sm:text-4xl">
                      {formatTemperature(entry.temperatureC, props.unit)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
