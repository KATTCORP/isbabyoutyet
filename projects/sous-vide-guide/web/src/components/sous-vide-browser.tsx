import { ArrowUpIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";

import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";
import type { CategorySection } from "@/lib/categories";
import { groupEntriesByCategory } from "@/lib/categories";
import { formatDurationMinutes, formatDurationRange } from "@/lib/duration";
import type { SousVideCutGroup } from "@/lib/group-cuts";
import { groupSousVideEntriesByCut } from "@/lib/group-cuts";
import { isSearchQuery } from "@/lib/search";
import type { TemperatureUnit } from "@/lib/temperature";
import { formatTemperature } from "@/lib/temperature";
import { THERMAL_RANGE_C, temperatureSwatch, thermalGradient } from "@/lib/temperature-color";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const categoryMessage = {
  beef: () => m.category_beef(),
  eggs: () => m.category_eggs(),
  fish: () => m.category_fish(),
  game: () => m.category_game(),
  pork: () => m.category_pork(),
  poultry: () => m.category_poultry(),
  shellfish: () => m.category_shellfish(),
  vegetables: () => m.category_vegetables(),
} as const satisfies Record<SousVideCategory, () => string>;

const RESULTS_ID = "results";

type BrowserProps = {
  allEntries: ReadonlyArray<SousVideEntry>;
  entries: ReadonlyArray<SousVideEntry>;
  q: string;
  unit: TemperatureUnit;
};

/**
 * "Heat map" layout: every row is a card whose colour comes from its bath
 * temperature (blue = cold fish, orange = hot vegetables). Categories are
 * tiles at the top that jump to their section; the search field stays pinned
 * under the header (the °C/°F switch lives in the header itself).
 */
export function SousVideBrowser(props: BrowserProps) {
  const locale = getLocale();
  const searching = isSearchQuery(props.q);
  const sections = groupEntriesByCategory(props.allEntries);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <GuideIntro locale={locale} rows={props.allEntries.length} unit={props.unit} />

      <Toolbar q={props.q} />

      <div className="scroll-mt-[calc(var(--site-header-h)+4.25rem)]" id={RESULTS_ID}>
        {searching ? (
          <SearchResults entries={props.entries} locale={locale} q={props.q} unit={props.unit} />
        ) : (
          <>
            <CategoryTiles locale={locale} sections={sections} unit={props.unit} />
            {sections.map((section) => (
              <CategorySectionView
                key={section.category}
                locale={locale}
                section={section}
                unit={props.unit}
              />
            ))}
          </>
        )}
      </div>

      <GuideFooter rows={props.allEntries.length} />
    </main>
  );
}

function GuideIntro(props: { locale: string; rows: number; unit: TemperatureUnit }) {
  return (
    <header className="pt-6 pb-4 sm:pt-10 sm:pb-6" id="sous-vide">
      <h1 className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-tight text-[var(--guide-ink)] sm:text-5xl">
        {m.sous_vide_title()}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {m.sous_vide_summary()}
      </p>
      <ThermalLegend locale={props.locale} unit={props.unit} />
      <details className="mt-3 max-w-2xl text-sm text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-[var(--guide-ink)] underline-offset-4 select-none hover:underline sm:min-h-0">
          {m.notes_summary()}
        </summary>
        <div className="mt-1 space-y-2 border-l-2 border-[var(--guide-copper)]/40 pl-3">
          <p>{m.sous_vide_thickness_note()}</p>
          <p>{m.food_safety_disclaimer()}</p>
          <p>{m.stats_line({ categories: SOUS_VIDE_CATEGORIES.length, rows: props.rows })}</p>
        </div>
      </details>
    </header>
  );
}

function ThermalLegend(props: { locale: string; unit: TemperatureUnit }) {
  const format = (temperatureC: number) =>
    formatTemperature(temperatureC, { locale: props.locale, unit: props.unit });
  return (
    <figure aria-label={m.temperature_scale()} className="mt-4 max-w-md">
      <div
        className="h-2 rounded-full"
        style={{ backgroundImage: thermalGradient(THERMAL_RANGE_C) }}
      />
      <figcaption className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{format(THERMAL_RANGE_C.min)}</span>
        <span>{m.temperature_scale()}</span>
        <span>{format(THERMAL_RANGE_C.max)}</span>
      </figcaption>
    </figure>
  );
}

function Toolbar(props: { q: string }) {
  return (
    <div className="sticky top-[var(--site-header-h)] z-10 -mx-4 bg-[color-mix(in_oklab,var(--background)_88%,transparent)] px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <SearchField q={props.q} />
      </div>
    </div>
  );
}

function SearchField(props: { q: string }) {
  const navigate = useNavigate({ from: "/" });

  return (
    <form
      action="/"
      className="relative"
      method="get"
      onSubmit={(event) => {
        // Enter just dismisses the keyboard; results already follow the field.
        event.preventDefault();
        event.currentTarget.querySelector("input")?.blur();
      }}
      role="search"
    >
      <MagnifyingGlassIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[var(--guide-copper)]"
      />
      <input
        aria-label={m.search_label()}
        autoComplete="off"
        className="h-13 w-full rounded-2xl border border-border/80 bg-[color-mix(in_oklab,var(--card)_94%,white)] pr-12 pl-12 text-base text-foreground shadow-[0_10px_30px_-18px_color-mix(in_oklab,var(--guide-ink)_60%,transparent)] transition-[box-shadow,border-color] outline-none placeholder:text-muted-foreground/80 focus-visible:border-[var(--guide-copper)] focus-visible:ring-3 focus-visible:ring-[var(--guide-copper)]/25 sm:h-12"
        defaultValue={props.q}
        enterKeyHint="search"
        name="q"
        onChange={(event) => {
          const q = event.currentTarget.value;
          void navigate({
            hash: "",
            replace: true,
            // Jump to the results once when a search starts; keep the scroll while refining.
            resetScroll: props.q.length === 0 && q.length > 0,
            search: (previous) => ({ ...previous, q }),
          });
        }}
        placeholder={m.search_entries_placeholder()}
        type="search"
      />
      {props.q.length > 0 ? (
        <button
          aria-label={m.clear_search()}
          className="absolute top-1/2 right-2 inline-flex size-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          onClick={(event) => {
            const field = event.currentTarget.form?.querySelector("input");
            if (field) {
              field.value = "";
              field.focus();
            }
            void navigate({
              hash: "",
              replace: true,
              resetScroll: false,
              search: (previous) => ({ ...previous, q: "" }),
            });
          }}
          type="button"
        >
          <XIcon aria-hidden className="size-5" />
        </button>
      ) : null}
    </form>
  );
}

function formatRange(
  range: { max: number; min: number },
  opts: { locale: string; unit: TemperatureUnit },
) {
  const min = formatTemperature(range.min, opts);
  const max = formatTemperature(range.max, opts);
  return min === max ? min : `${min}–${max}`;
}

function CategoryTiles(props: {
  locale: string;
  sections: ReadonlyArray<CategorySection>;
  unit: TemperatureUnit;
}) {
  return (
    <nav aria-label={m.jump_to_category()} className="pt-3 pb-2">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {props.sections.map((section) => {
          const label = categoryMessage[section.category]();
          return (
            <li key={section.category}>
              <Link
                className="group flex min-h-[5.25rem] touch-manipulation flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--card)_94%,white)] p-3 shadow-[0_14px_30px_-24px_color-mix(in_oklab,var(--guide-ink)_55%,transparent)] transition-[transform,border-color] hover:border-[var(--guide-copper)] active:translate-y-px"
                hash={section.category}
                to="/"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg leading-tight font-semibold text-[var(--guide-ink)]">
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {section.entries.length}
                  </span>
                </div>
                <div>
                  <div
                    className="h-1.5 rounded-full"
                    style={{ backgroundImage: thermalGradient(section.temperatureRangeC) }}
                  />
                  <span className="mt-1.5 block text-xs text-muted-foreground tabular-nums">
                    {formatRange(section.temperatureRangeC, {
                      locale: props.locale,
                      unit: props.unit,
                    })}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CategorySectionView(props: {
  locale: string;
  section: CategorySection;
  unit: TemperatureUnit;
}) {
  const label = categoryMessage[props.section.category]();

  return (
    <section
      className="scroll-mt-[calc(var(--site-header-h)+4.25rem)] pt-8 sm:pt-10"
      id={props.section.category}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--guide-ink)] sm:text-3xl">
            <Link
              aria-label={m.category_permalink_label({ category: label })}
              className="underline-offset-4 hover:underline"
              hash={props.section.category}
              to="/"
            >
              {label}
            </Link>
          </h2>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span
              aria-hidden
              className="inline-block h-1.5 w-10 rounded-full"
              style={{ backgroundImage: thermalGradient(props.section.temperatureRangeC) }}
            />
            {formatRange(props.section.temperatureRangeC, {
              locale: props.locale,
              unit: props.unit,
            })}
          </p>
        </div>
        <a
          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-[var(--guide-ink)]"
          href="#sous-vide"
        >
          <ArrowUpIcon aria-hidden className="size-3.5" />
          {m.back_to_top()}
        </a>
      </div>
      <CardGrid
        entries={props.section.entries}
        locale={props.locale}
        showCategory={false}
        unit={props.unit}
      />
    </section>
  );
}

function SearchResults(props: {
  entries: ReadonlyArray<SousVideEntry>;
  locale: string;
  q: string;
  unit: TemperatureUnit;
}) {
  const count = props.entries.length;
  const query = props.q.trim();

  return (
    <section aria-live="polite" className="pt-4">
      <p className="mb-3 text-sm text-muted-foreground">
        {count === 0
          ? m.no_results()
          : count === 1
            ? m.results_for_query_one({ query })
            : m.results_for_query({ count, query })}
      </p>
      {count > 0 ? (
        <CardGrid entries={props.entries} locale={props.locale} showCategory unit={props.unit} />
      ) : null}
    </section>
  );
}

function CardGrid(props: {
  entries: ReadonlyArray<SousVideEntry>;
  locale: string;
  showCategory: boolean;
  unit: TemperatureUnit;
}) {
  const groups = groupSousVideEntriesByCut(props.entries);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <CutCards
          group={group}
          key={group.cutId}
          locale={props.locale}
          showCategory={props.showCategory}
          unit={props.unit}
        />
      ))}
    </div>
  );
}

/**
 * One caption per cut, then a card per doneness step. The track list is
 * `auto-fill`, so a lone card keeps the same width as the cards of a
 * three-step cut beside it.
 */
function CutCards(props: {
  group: SousVideCutGroup;
  locale: string;
  showCategory: boolean;
  unit: TemperatureUnit;
}) {
  const group = props.group;

  return (
    <section
      className="scroll-mt-[calc(var(--site-header-h)+4.5rem)] target:[&>h3>a]:underline"
      id={group.cutId}
    >
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 font-display text-lg leading-snug font-semibold text-[var(--guide-ink)]">
        <Link
          aria-label={m.permalink_label()}
          className="underline-offset-4 hover:underline"
          hash={group.cutId}
          to="/"
        >
          {group.name}
        </Link>
        {props.showCategory ? (
          <span className="font-sans text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {categoryMessage[group.category]()}
          </span>
        ) : null}
      </h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:gap-3">
        {group.rows.map((entry) => (
          <li className="min-w-0" key={entry.id}>
            <EntryCard entry={entry} locale={props.locale} unit={props.unit} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntryCard(props: { entry: SousVideEntry; locale: string; unit: TemperatureUnit }) {
  const entry = props.entry;
  const swatch = temperatureSwatch(entry.temperatureC);
  const recommended = formatDurationRange(entry.recommendedMinutes, props.locale);
  const max =
    entry.maxMinutes === null ? null : formatDurationMinutes(entry.maxMinutes, props.locale);

  return (
    <article
      className="flex h-full scroll-mt-[calc(var(--site-header-h)+4.5rem)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--card)_94%,white)] shadow-[0_14px_30px_-24px_color-mix(in_oklab,var(--guide-ink)_55%,transparent)] target:ring-2 target:ring-[var(--guide-copper)]"
      id={entry.id}
    >
      <div
        className="flex flex-col gap-1 px-2.5 pt-2.5 pb-2 sm:px-3 sm:pt-3"
        style={{ backgroundColor: swatch.wash, color: swatch.ink }}
      >
        <span className="temp-number text-2xl leading-none font-semibold sm:text-[1.75rem]">
          {formatTemperature(entry.temperatureC, { locale: props.locale, unit: props.unit })}
        </span>
        <span className="min-h-[1em] truncate text-[0.65rem] font-semibold tracking-wide uppercase sm:text-[0.7rem]">
          {entry.doneness ?? ""}
        </span>
      </div>
      <p className="flex flex-1 flex-col px-2.5 pt-2 pb-2.5 text-xs text-muted-foreground tabular-nums sm:px-3 sm:pb-3">
        <span className="font-medium text-foreground/90">{recommended}</span>
        {max ? <span className="mt-auto block">{m.max_time_short({ time: max })}</span> : null}
      </p>
    </article>
  );
}

function GuideFooter(props: { rows: number }) {
  return (
    <footer className="mt-12 border-t border-border/70 pt-6 text-sm text-muted-foreground">
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
        {m.stats_line({ categories: SOUS_VIDE_CATEGORIES.length, rows: props.rows })}
      </p>
    </footer>
  );
}
