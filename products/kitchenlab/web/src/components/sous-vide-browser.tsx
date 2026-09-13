import { Link } from "@tanstack/react-router";

import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";
import { getLocale } from "@/paraglide/runtime";
import * as m from "@/paraglide/messages";
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

function formatTemp(temperatureC: number) {
  return Number.isInteger(temperatureC) ? `${temperatureC}°C` : `${temperatureC.toFixed(1)}°C`;
}

export function SousVideFilters(props: { query: string; category: SousVideCategory | "all" }) {
  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="category" value={props.category} />
        <Input
          name="q"
          type="search"
          defaultValue={props.query}
          placeholder={m.search_entries_placeholder()}
          aria-label={m.search_entries_placeholder()}
          className="h-11 bg-background/80"
        />
        <div className="flex gap-2">
          <Button type="submit" className="h-11 flex-1 sm:flex-none">
            {m.submit_search()}
          </Button>
          {props.query.length > 0 || props.category !== "all" ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              render={<Link to="/guides/sous-vide" search={{ q: "", category: "all" }} />}
            >
              {m.clear_search()}
            </Button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap gap-2" role="list" aria-label={m.guides_heading()}>
        <CategoryChip category="all" active={props.category === "all"} query={props.query} />
        {SOUS_VIDE_CATEGORIES.map((category) => (
          <CategoryChip
            key={category}
            category={category}
            active={props.category === category}
            query={props.query}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryChip(props: {
  category: SousVideCategory | "all";
  active: boolean;
  query: string;
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
          }}
        />
      }
    >
      {label}
    </Button>
  );
}

export function SousVideResults(props: { entries: ReadonlyArray<SousVideEntry> }) {
  const locale = getLocale();

  if (props.entries.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">{m.no_results()}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {m.results_count({ count: props.entries.length })}
      </p>
      <ul className="divide-y divide-border/80 overflow-hidden rounded-2xl border border-border/80 bg-[color-mix(in_oklab,var(--card)_92%,white)]">
        {props.entries.map((entry) => {
          const name = locale === "en" ? entry.nameEn : entry.nameSv;
          const doneness = locale === "en" ? entry.donenessEn : entry.donenessSv;
          const categoryLabel = categoryMessage[entry.category]();

          return (
            <li
              key={entry.id}
              className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-5"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-semibold text-[var(--kitchen-ink)]">
                    {name}
                  </h3>
                  {doneness ? <Badge variant="outline">{doneness}</Badge> : null}
                  <Badge variant="secondary">{categoryLabel}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-6">
                  <div>
                    <dt className="inline font-medium text-foreground/80">
                      {m.recommended_time()}:{" "}
                    </dt>
                    <dd className="inline">{entry.recommendedTime}</dd>
                  </div>
                  {entry.maxTime ? (
                    <div>
                      <dt className="inline font-medium text-foreground/80">{m.max_time()}: </dt>
                      <dd className="inline">{entry.maxTime}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
              <div className="temp-number text-3xl font-semibold text-[var(--kitchen-copper)] sm:text-right sm:text-4xl">
                {formatTemp(entry.temperatureC)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
