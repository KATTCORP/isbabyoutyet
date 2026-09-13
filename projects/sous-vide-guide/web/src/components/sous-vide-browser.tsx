import { ArrowUpIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { cn } from "@workspace/ui/lib/utils";

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

const SEARCH_FIELD_ID = "guide-search";
const RESULTS_ID = "results";

type BrowserProps = {
  allEntries: ReadonlyArray<SousVideEntry>;
  entries: ReadonlyArray<SousVideEntry>;
  q: string;
  unit: TemperatureUnit;
};

/**
 * "Ledger" layout: one dense reference table per category, a sticky live
 * search field, and category quick links (a horizontal strip on phones, a
 * sticky table of contents on wide screens). The °C/°F switch lives in the
 * site header.
 */
export function SousVideBrowser(props: BrowserProps) {
  const locale = getLocale();
  const searching = isSearchQuery(props.q);
  const sections = groupEntriesByCategory(props.allEntries);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <GuideIntro rows={props.allEntries.length} />

      <div className="lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <nav
            aria-label={m.jump_to_category()}
            className="sticky top-[calc(var(--site-header-h)+1.5rem)]"
          >
            <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {m.jump_to_category()}
            </p>
            <ul className="space-y-0.5">
              {sections.map((section) => (
                <li key={section.category}>
                  <QuickLink section={section} variant="list" />
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0">
          <Toolbar q={props.q} searching={searching} sections={sections} />

          <div className="scroll-mt-[calc(var(--site-header-h)+5.5rem)]" id={RESULTS_ID}>
            {searching ? (
              <SearchResults
                entries={props.entries}
                locale={locale}
                q={props.q}
                unit={props.unit}
              />
            ) : (
              sections.map((section) => (
                <CategorySectionView
                  key={section.category}
                  locale={locale}
                  section={section}
                  unit={props.unit}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <GuideFooter rows={props.allEntries.length} />
    </main>
  );
}

function GuideIntro(props: { rows: number }) {
  return (
    <header className="py-6 sm:py-10" id="sous-vide">
      <p className="text-xs font-semibold tracking-[0.14em] text-[var(--guide-copper)] uppercase">
        {m.stats_line({ categories: SOUS_VIDE_CATEGORIES.length, rows: props.rows })}
      </p>
      <h1 className="mt-2 font-display text-[1.75rem] leading-[1.1] font-semibold tracking-tight text-[var(--guide-ink)] sm:text-5xl">
        {m.sous_vide_title()}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {m.sous_vide_summary()}
      </p>
      <details className="group mt-3 max-w-2xl text-sm text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-[var(--guide-ink)] underline-offset-4 select-none hover:underline sm:min-h-0">
          {m.notes_summary()}
        </summary>
        <div className="mt-1 space-y-2 border-l-2 border-[var(--guide-copper)]/40 pl-3">
          <p>{m.sous_vide_thickness_note()}</p>
          <p>{m.food_safety_disclaimer()}</p>
        </div>
      </details>
    </header>
  );
}

function Toolbar(props: {
  q: string;
  searching: boolean;
  sections: ReadonlyArray<CategorySection>;
}) {
  return (
    <div className="sticky top-[var(--site-header-h)] z-10 -mx-4 border-b border-border/70 bg-[color-mix(in_oklab,var(--background)_90%,transparent)] px-4 pt-2 pb-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-4 lg:px-4 lg:pb-3">
      <SearchField q={props.q} />
      <nav
        aria-label={m.jump_to_category()}
        className={cn("mt-2 lg:hidden", props.searching && "hidden")}
      >
        <ul className="quick-strip -mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          {props.sections.map((section) => (
            <li className="snap-start" key={section.category}>
              <QuickLink section={section} variant="chip" />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function SearchField(props: { q: string }) {
  const navigate = useNavigate({ from: "/" });

  return (
    <form
      action="/"
      className="relative flex-1"
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
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        aria-label={m.search_label()}
        autoComplete="off"
        className="h-12 w-full rounded-full border border-border bg-[color-mix(in_oklab,var(--card)_92%,white)] pr-11 pl-10.5 text-base text-foreground shadow-[0_1px_0_color-mix(in_oklab,var(--guide-ink)_6%,transparent)] transition-colors outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 sm:h-11"
        defaultValue={props.q}
        enterKeyHint="search"
        id={SEARCH_FIELD_ID}
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
          className="absolute top-1/2 right-1.5 inline-flex size-9 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
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
          <XIcon aria-hidden className="size-4.5" />
        </button>
      ) : null}
    </form>
  );
}

function QuickLink(props: { section: CategorySection; variant: "chip" | "list" }) {
  const label = categoryMessage[props.section.category]();
  const count = props.section.entries.length;

  if (props.variant === "list") {
    return (
      <Link
        className="flex min-h-9 items-center justify-between gap-3 rounded-lg px-2.5 text-sm text-foreground/90 transition-colors hover:bg-[color-mix(in_oklab,var(--guide-copper)_12%,transparent)] hover:text-[var(--guide-ink)]"
        hash={props.section.category}
        to="/"
      >
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </Link>
    );
  }

  return (
    <Link
      className="inline-flex h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-border/80 bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-3 text-sm font-medium whitespace-nowrap text-foreground transition-colors hover:border-[var(--guide-copper)] hover:text-[var(--guide-ink)]"
      hash={props.section.category}
      to="/"
    >
      <span>{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </Link>
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
      className="scroll-mt-[calc(var(--site-header-h)+5.75rem)] pt-7 lg:scroll-mt-[calc(var(--site-header-h)+3rem)] lg:pt-8"
      id={props.section.category}
    >
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-[var(--guide-ink)] pb-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--guide-ink)]">
          <Link
            aria-label={m.category_permalink_label({ category: label })}
            className="underline-offset-4 hover:underline"
            hash={props.section.category}
            to="/"
          >
            {label}
          </Link>{" "}
          <span className="font-sans text-sm font-normal text-muted-foreground tabular-nums">
            {props.section.entries.length}
          </span>
        </h2>
        <a
          className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide transition-colors hover:text-[var(--guide-ink)]"
          href="#sous-vide"
        >
          <ArrowUpIcon aria-hidden className="size-3.5" />
          {m.back_to_top()}
        </a>
      </div>
      <EntryTable
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
    <section aria-live="polite" className="pt-5">
      <p className="text-sm text-muted-foreground">
        {count === 0
          ? m.no_results()
          : count === 1
            ? m.results_for_query_one({ query })
            : m.results_for_query({ count, query })}
      </p>
      {count > 0 ? (
        <EntryTable entries={props.entries} locale={props.locale} showCategory unit={props.unit} />
      ) : null}
    </section>
  );
}

function EntryTable(props: {
  entries: ReadonlyArray<SousVideEntry>;
  locale: string;
  showCategory: boolean;
  unit: TemperatureUnit;
}) {
  const groups = groupSousVideEntriesByCut(props.entries);

  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col />
        <col className="w-[4.75rem] sm:w-24" />
        <col className="w-[6.25rem] sm:w-36" />
      </colgroup>
      <thead>
        <tr className="text-left text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          <th className="py-2 pr-2 font-semibold" scope="col">
            {m.column_cut()}
          </th>
          <th className="py-2 text-right font-semibold" scope="col">
            {m.column_temperature()}
          </th>
          <th className="py-2 pl-2 text-right font-semibold" scope="col">
            {m.column_time()}
          </th>
        </tr>
      </thead>
      {groups.map((group) => (
        <CutRows
          group={group}
          key={group.cutId}
          locale={props.locale}
          showCategory={props.showCategory}
          unit={props.unit}
        />
      ))}
    </table>
  );
}

/**
 * One `<tbody>` per cut. Cuts with several doneness steps get a heading row
 * with the name once, then one row per step; single-step cuts stay one row.
 */
function CutRows(props: {
  group: SousVideCutGroup;
  locale: string;
  showCategory: boolean;
  unit: TemperatureUnit;
}) {
  const group = props.group;
  const category = props.showCategory ? categoryMessage[group.category]() : null;
  const single = group.rows.length === 1 ? group.rows[0] : undefined;

  if (single !== undefined) {
    const detail = [category, single.doneness].filter((part) => part !== null).join(" · ");
    return (
      <tbody className="border-t border-border/70" id={group.cutId}>
        <EntryRow
          detail={detail}
          entry={single}
          label={<CutName cutId={group.cutId} name={group.name} />}
          locale={props.locale}
          unit={props.unit}
        />
      </tbody>
    );
  }

  return (
    <tbody
      className="scroll-mt-[calc(var(--site-header-h)+6rem)] border-t border-border/70 lg:scroll-mt-[calc(var(--site-header-h)+3.5rem)]"
      id={group.cutId}
    >
      <tr>
        <th
          className="pt-3 pb-1 text-left font-medium text-[var(--guide-ink)]"
          colSpan={3}
          scope="rowgroup"
        >
          <CutName cutId={group.cutId} name={group.name} />
          {category !== null ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{category}</span>
          ) : null}
        </th>
      </tr>
      {group.rows.map((entry) => (
        <EntryRow
          detail=""
          entry={entry}
          key={entry.id}
          label={
            <span className="block pl-3 text-sm text-foreground/90">{entry.doneness ?? "—"}</span>
          }
          locale={props.locale}
          unit={props.unit}
        />
      ))}
    </tbody>
  );
}

function CutName(props: { cutId: string; name: string }) {
  return (
    <Link
      aria-label={m.permalink_label()}
      className="font-medium text-[var(--guide-ink)] underline-offset-4 hover:underline"
      hash={props.cutId}
      to="/"
    >
      {props.name}
    </Link>
  );
}

function EntryRow(props: {
  detail: string;
  entry: SousVideEntry;
  label: ReactNode;
  locale: string;
  unit: TemperatureUnit;
}) {
  const entry = props.entry;
  const recommended = formatDurationRange(entry.recommendedMinutes, props.locale);
  const max =
    entry.maxMinutes === null ? null : formatDurationMinutes(entry.maxMinutes, props.locale);

  return (
    <tr
      className="scroll-mt-[calc(var(--site-header-h)+6rem)] align-top target:bg-[color-mix(in_oklab,var(--guide-copper)_12%,transparent)] lg:scroll-mt-[calc(var(--site-header-h)+3.5rem)]"
      id={entry.id}
    >
      <td className="py-2.5 pr-2">
        {props.label}
        {props.detail.length > 0 ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{props.detail}</span>
        ) : null}
      </td>
      <td className="py-2.5 text-right">
        <span className="temp-number text-lg leading-6 font-semibold text-[var(--guide-copper)]">
          {formatTemperature(entry.temperatureC, { locale: props.locale, unit: props.unit })}
        </span>
      </td>
      <td className="py-2.5 pl-2 text-right text-sm text-foreground/90 tabular-nums">
        <span className="block leading-6">{recommended}</span>
        {max ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {m.max_time_short({ time: max })}
          </span>
        ) : null}
      </td>
    </tr>
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
