import { Link, useNavigate } from "@tanstack/react-router";
import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES, pickLocalized } from "@/data/sousVide";
import { formatDurationMinutes, formatDurationRange } from "@/lib/duration";
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
  const navigate = useNavigate({ from: "/guides/sous-vide" });

  return (
    <div className="sticky top-[3.25rem] z-10 -mx-4 space-y-3 border-b border-border/60 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const q = String(formData.get("q") ?? "").trim();
          void navigate({
            search: {
              q,
              category: props.category,
              unit: props.unit,
            },
          });
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          key={props.q}
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          defaultValue={props.q}
          placeholder={m.search_entries_placeholder()}
          aria-label={m.search_entries_placeholder()}
          className="h-12 bg-background/90 text-base sm:h-11 sm:text-sm"
        />
        <div className="flex gap-2">
          <Button
            type="submit"
            className="h-12 min-h-12 flex-1 touch-manipulation sm:h-11 sm:flex-none"
          >
            {m.submit_search()}
          </Button>
          {props.q.length > 0 || props.category !== "all" ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 min-h-12 touch-manipulation sm:h-11"
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

      <nav aria-label={m.categories_label()} className="-mx-1">
        <div className="flex flex-wrap gap-2 px-1 pb-1">
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
      </nav>

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
      className="h-10 shrink-0 snap-start rounded-full px-4 touch-manipulation"
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
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
      role="group"
      aria-label={m.temperature_unit()}
    >
      <span className="col-span-2 text-sm text-muted-foreground sm:mr-1">
        {m.temperature_unit()}
      </span>
      <Button
        type="button"
        size="sm"
        variant={props.search.unit === "c" ? "default" : "outline"}
        className="h-11 touch-manipulation sm:h-9"
        render={<Link to="/guides/sous-vide" search={{ ...props.search, unit: "c" }} />}
      >
        {m.unit_celsius()}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={props.search.unit === "f" ? "default" : "outline"}
        className="h-11 touch-manipulation sm:h-9"
        render={<Link to="/guides/sous-vide" search={{ ...props.search, unit: "f" }} />}
      >
        {m.unit_fahrenheit()}
      </Button>
    </div>
  );
}

export function SousVideResults(props: {
  entries: ReadonlyArray<SousVideEntry>;
  unit: TemperatureUnit;
  query: string;
}) {
  const locale = getLocale();

  if (props.entries.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">{m.no_results()}</p>;
  }

  const hasQuery = props.query.trim().length > 0;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {props.entries.length === 1
          ? m.results_count_one()
          : m.results_count({ count: props.entries.length })}
      </p>

      {hasQuery ? (
        <EntryList
          entries={props.entries}
          unit={props.unit}
          locale={locale}
          categoryLabel={undefined}
        />
      ) : (
        SOUS_VIDE_CATEGORIES.map((category) => {
          const entries = props.entries.filter((entry) => entry.category === category);
          if (entries.length === 0) {
            return null;
          }
          const categoryLabel = categoryMessage[category]();

          return (
            <section
              key={category}
              id={category}
              className="scroll-mt-36 space-y-3 sm:scroll-mt-24"
            >
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--guide-ink)]">
                <span>{categoryLabel}</span>{" "}
                <a
                  href={`#${category}`}
                  className="text-base text-[var(--guide-copper)] underline-offset-4 hover:underline"
                  aria-label={m.category_permalink_label({ category: categoryLabel })}
                >
                  #
                </a>
              </h2>
              <EntryList
                entries={entries}
                unit={props.unit}
                locale={locale}
                categoryLabel={categoryLabel}
              />
            </section>
          );
        })
      )}
    </div>
  );
}

function EntryList(props: {
  entries: ReadonlyArray<SousVideEntry>;
  unit: TemperatureUnit;
  locale: string;
  categoryLabel: string | undefined;
}) {
  return (
    <ul className="divide-y divide-border/80 overflow-hidden rounded-2xl border border-border/80 bg-[color-mix(in_oklab,var(--card)_92%,white)]">
      {props.entries.map((entry) => {
        const name = pickLocalized(entry.name, props.locale);
        const doneness = entry.doneness ? pickLocalized(entry.doneness, props.locale) : null;
        const recommendedTime = formatDurationRange(entry.recommendedMinutes, props.locale);
        const maxTime =
          entry.maxMinutes === null ? null : formatDurationMinutes(entry.maxMinutes, props.locale);
        const categoryLabel = props.categoryLabel ?? categoryMessage[entry.category]();

        return (
          <li
            key={entry.id}
            id={entry.id}
            className="grid scroll-mt-40 gap-3 px-4 py-4 sm:scroll-mt-28 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-5"
          >
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-semibold text-[var(--guide-ink)]">
                  <span>{name}</span>{" "}
                  <a
                    href={`#${entry.id}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-[var(--guide-copper)] underline-offset-4 hover:underline sm:min-h-0 sm:min-w-0"
                    aria-label={m.permalink_label()}
                  >
                    #
                  </a>
                </h3>
                {doneness ? <Badge variant="outline">{doneness}</Badge> : null}
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
              {formatTemperature(entry.temperatureC, { unit: props.unit, locale: props.locale })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
