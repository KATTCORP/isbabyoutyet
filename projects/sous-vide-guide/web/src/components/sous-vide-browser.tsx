import { ArrowSquareOutIcon, InfoIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";

import { cutHasGuideDetail, getCutGuide } from "@/data/cutGuide";
import type { SousVideCategory, SousVideEntry } from "@/data/sousVide";
import { SOUS_VIDE_CATEGORIES } from "@/data/sousVide";
import type { CategorySection } from "@/lib/categories";
import { groupEntriesByCategory } from "@/lib/categories";
import { createContentT } from "@/lib/content-t";
import { formatDurationMinutes, formatDurationRange } from "@/lib/duration";
import type { SousVideCutGroup } from "@/lib/group-cuts";
import { groupSousVideEntriesByCut } from "@/lib/group-cuts";
import { isSearchQuery } from "@/lib/search";
import { useActiveSection } from "@/lib/use-active-section";
import type { TemperatureUnit } from "@/lib/temperature";
import { formatTemperature } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { Button } from "@workspace/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer";
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

type BrowserProps = {
  allEntries: ReadonlyArray<SousVideEntry>;
  entries: ReadonlyArray<SousVideEntry>;
  /** Cut id for the open More info drawer (`?info=`), or "" when closed. */
  info: string;
  q: string;
  unit: TemperatureUnit;
};

/**
 * "Ladder" layout: rows collapse into one card per cut, with the doneness
 * steps (rare → medium → well done) as a ladder inside it. Search scrolls with
 * the page; the site header stays pinned, each category title (Fish, Pork, …)
 * sticks under it while that section is in view, and the category quick links
 * live in a thumb-reach dock at the bottom of the phone screen and in a sticky
 * row under the header on wider screens. The °C/°F switch lives in the site
 * header.
 */
export function SousVideBrowser(props: BrowserProps) {
  const locale = getLocale();
  const searching = isSearchQuery(props.q);
  const sections = groupEntriesByCategory(props.allEntries);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-12">
      <GuideIntro rows={props.allEntries.length} />

      <Toolbar q={props.q} />
      <CategoryDock
        count={props.entries.length}
        q={props.q}
        searching={searching}
        sections={sections}
      />

      <div>
        {searching ? (
          <SearchResults
            entries={props.entries}
            info={props.info}
            locale={locale}
            q={props.q}
            unit={props.unit}
          />
        ) : (
          sections.map((section) => (
            <CategorySectionView
              info={props.info}
              key={section.category}
              locale={locale}
              section={section}
              unit={props.unit}
            />
          ))
        )}
      </div>

      <GuideFooter rows={props.allEntries.length} />
    </main>
  );
}

function GuideIntro(props: { rows: number }) {
  return (
    <header className="pt-6 pb-3 sm:pt-10 sm:pb-5" id="sous-vide">
      <h1 className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-tight text-[var(--guide-ink)] sm:text-5xl">
        {m.sous_vide_title()}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {m.sous_vide_summary()}
      </p>
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

function Toolbar(props: { q: string }) {
  return (
    <div className="py-2">
      <SearchField q={props.q} />
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
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        aria-label={m.search_label()}
        autoComplete="off"
        className="h-12 w-full rounded-xl border border-border/80 bg-[color-mix(in_oklab,var(--card)_94%,var(--surface-mix))] pr-12 pl-12 text-base text-foreground shadow-[0_1px_0_color-mix(in_oklab,var(--guide-ink)_6%,transparent)] transition-colors outline-none placeholder:text-muted-foreground/80 focus-visible:border-[var(--guide-ink)] focus-visible:ring-3 focus-visible:ring-[var(--guide-ink)]/15"
        defaultValue={props.q}
        enterKeyHint="search"
        name="q"
        onChange={(event) => {
          const q = event.currentTarget.value;
          void navigate({
            hash: "",
            replace: true,
            resetScroll: false,
            search: (previous) => ({ ...previous, q }),
          });
        }}
        placeholder={m.search_entries_placeholder()}
        type="search"
      />
      {props.q.length > 0 ? (
        <button
          aria-label={m.clear_search()}
          className="absolute top-1/2 right-2 inline-flex size-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
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

/**
 * Bottom dock on phones (thumb reach, above the home indicator); on wider
 * screens it becomes a sticky row directly under the site header. While a
 * search is active it shows the result count instead of the links.
 */
function CategoryDock(props: {
  count: number;
  q: string;
  searching: boolean;
  sections: ReadonlyArray<CategorySection>;
}) {
  const query = props.q.trim();
  const active = useActiveSection({
    enabled: !props.searching,
    ids: props.sections.map((section) => section.category),
    onChange: revealQuickLink,
  });

  return (
    <nav
      aria-label={m.jump_to_category()}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-[color-mix(in_oklab,var(--background)_86%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:sticky sm:top-[var(--site-header-h)] sm:z-10 sm:-mx-6 sm:border-t-0 sm:border-b sm:pb-0"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2 sm:px-6">
        {props.searching ? (
          <p
            aria-live="polite"
            className="min-h-10 truncate px-1 text-sm leading-10 text-muted-foreground"
          >
            {props.count === 0
              ? m.no_results()
              : props.count === 1
                ? m.results_for_query_one({ query })
                : m.results_for_query({ count: props.count, query })}
          </p>
        ) : (
          <div className="quick-strip relative -my-1 min-w-0 flex-1 snap-x overflow-x-auto py-1">
            <ul className="inline-flex rounded-lg border border-border/70 bg-background/80 p-0.5">
              {props.sections.map((section) => {
                const isActive = section.category === active;
                return (
                  <li className="snap-start" key={section.category}>
                    <Link
                      activeOptions={{ exact: true, includeHash: true }}
                      className={cn(
                        "inline-flex h-10 shrink-0 touch-manipulation items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors sm:h-9",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-[color-mix(in_oklab,var(--guide-ink)_6%,transparent)] hover:text-foreground",
                      )}
                      data-quick-link={section.category}
                      hash={section.category}
                      to="/"
                    >
                      <span>{categoryMessage[section.category]()}</span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          isActive ? "text-primary-foreground/75" : "text-muted-foreground/80",
                        )}
                      >
                        {section.entries.length}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
}

/** Keeps the highlighted quick link centred in the horizontally scrolling strip. */
function revealQuickLink(id: string) {
  const link = document.querySelector<HTMLElement>(`[data-quick-link="${id}"]`);
  const strip = link?.closest<HTMLElement>(".quick-strip");
  if (!link || !strip || strip.scrollWidth <= strip.clientWidth) {
    return;
  }
  strip.scrollTo({
    behavior: "smooth",
    left: link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2,
  });
}

function CategorySectionView(props: {
  info: string;
  locale: string;
  section: CategorySection;
  unit: TemperatureUnit;
}) {
  const label = categoryMessage[props.section.category]();
  const groups = groupSousVideEntriesByCut(props.section.entries);

  return (
    <section
      className="scroll-mt-[calc(var(--site-header-h)+0.5rem)] pt-7 sm:scroll-mt-[calc(var(--site-header-h)+3.5rem)] sm:pt-9"
      id={props.section.category}
    >
      {/*
        Sticks under the site header (and under the sm+ quick-link dock) for the
        length of this section, so Fish / Pork / … stay visible while you browse
        that category's cards. scroll-mt on cut cards accounts for this bar.
      */}
      <h2 className="sticky top-[var(--site-header-h)] z-[9] -mx-4 mb-3 flex items-baseline gap-2 border-b border-border/50 bg-[color-mix(in_oklab,var(--background)_88%,transparent)] px-4 py-2 font-display text-2xl font-semibold tracking-tight text-[var(--guide-ink)] backdrop-blur-md sm:top-[calc(var(--site-header-h)+3.5rem)] sm:-mx-6 sm:px-6">
        <Link
          aria-label={m.category_permalink_label({ category: label })}
          className="underline-offset-4 hover:underline"
          hash={props.section.category}
          to="/"
        >
          {label}
        </Link>
        <span className="font-sans text-sm font-normal text-muted-foreground tabular-nums">
          {props.section.entries.length}
        </span>
      </h2>
      <IngredientList
        groups={groups}
        info={props.info}
        locale={props.locale}
        showCategory={false}
        unit={props.unit}
      />
    </section>
  );
}

function SearchResults(props: {
  entries: ReadonlyArray<SousVideEntry>;
  info: string;
  locale: string;
  q: string;
  unit: TemperatureUnit;
}) {
  const count = props.entries.length;
  const query = props.q.trim();
  const groups = groupSousVideEntriesByCut(props.entries);

  return (
    <section className="pt-4">
      <p className="mb-3 text-sm text-muted-foreground sm:hidden">
        {count === 0
          ? m.no_results()
          : count === 1
            ? m.results_for_query_one({ query })
            : m.results_for_query({ count, query })}
      </p>
      {count > 0 ? (
        <IngredientList
          groups={groups}
          info={props.info}
          locale={props.locale}
          showCategory
          unit={props.unit}
        />
      ) : null}
    </section>
  );
}

function IngredientList(props: {
  groups: ReadonlyArray<SousVideCutGroup>;
  info: string;
  locale: string;
  showCategory: boolean;
  unit: TemperatureUnit;
}) {
  return (
    <ul className="grid gap-3">
      {props.groups.map((group) => (
        <li className="min-w-0" key={group.cutId}>
          <IngredientCard
            group={group}
            info={props.info}
            locale={props.locale}
            showCategory={props.showCategory}
            unit={props.unit}
          />
        </li>
      ))}
    </ul>
  );
}

function IngredientCard(props: {
  group: SousVideCutGroup;
  info: string;
  locale: string;
  showCategory: boolean;
  unit: TemperatureUnit;
}) {
  const steps = props.group.rows;
  const single = steps.length === 1;
  const t = createContentT(props.locale);
  const starts = steps.map((step) => step.start);
  const showDetail = cutHasGuideDetail({
    cutId: props.group.cutId,
    starts,
    t,
  });
  const sharedStart = sharedIngredientStart(starts);

  return (
    <article
      className="scroll-mt-[calc(var(--site-header-h)+3.25rem)] rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--card)_94%,var(--surface-mix))] px-4 pt-3.5 pb-2 shadow-[0_14px_30px_-24px_color-mix(in_oklab,var(--guide-ink)_55%,transparent)] target:ring-2 target:ring-[var(--guide-copper)] sm:scroll-mt-[calc(var(--site-header-h)+6.75rem)]"
      id={props.group.cutId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight font-semibold text-[var(--guide-ink)]">
            <Link
              aria-label={m.permalink_label()}
              className="underline-offset-4 hover:underline"
              hash={props.group.cutId}
              to="/"
            >
              {props.group.name}
            </Link>
          </h3>
          {sharedStart !== null ? (
            <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {sharedStart === "fridge" ? m.start_from_fridge() : m.start_from_room()}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.showCategory ? (
            <span className="text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {categoryMessage[props.group.category]()}
            </span>
          ) : null}
          {showDetail ? (
            <CutDetailDrawer group={props.group} info={props.info} locale={props.locale} />
          ) : null}
        </div>
      </div>
      <ol
        className={cn(
          "relative mt-2",
          !single &&
            "before:absolute before:top-4 before:bottom-4 before:left-[0.3rem] before:w-px before:bg-[color-mix(in_oklab,var(--guide-copper)_45%,transparent)]",
        )}
      >
        {steps.map((entry, index) => (
          <DonenessStep
            entry={entry}
            index={index}
            key={entry.id}
            locale={props.locale}
            total={steps.length}
            unit={props.unit}
          />
        ))}
      </ol>
    </article>
  );
}

function sharedIngredientStart(starts: ReadonlyArray<SousVideEntry["start"]>) {
  const first = starts[0];
  if (first === undefined || first === null) {
    return null;
  }
  for (const start of starts) {
    if (start !== first) {
      return null;
    }
  }
  return first;
}

function CutDetailDrawer(props: { group: SousVideCutGroup; info: string; locale: string }) {
  const navigate = useNavigate({ from: "/" });
  const t = createContentT(props.locale);
  const guide = getCutGuide(props.group.cutId, t);
  const open = props.info === props.group.cutId;
  const starts = [
    ...new Set(props.group.rows.map((row) => row.start).filter((start) => start !== null)),
  ];

  function setInfoOpen(nextOpen: boolean) {
    void navigate({
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        info: nextOpen ? props.group.cutId : "",
      }),
    });
  }

  return (
    <Drawer
      onOpenChange={(nextOpen) => {
        if (nextOpen !== open) {
          setInfoOpen(nextOpen);
        }
      }}
      open={open}
      showSwipeHandle
    >
      <Button
        aria-label={m.more_info()}
        className="size-11"
        onClick={() => {
          setInfoOpen(true);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <InfoIcon />
      </Button>
      <DrawerContent className="mx-auto w-full max-w-3xl">
        <DrawerHeader className="text-left">
          <DrawerTitle>{props.group.name}</DrawerTitle>
          <DrawerDescription>{m.more_info()}</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
          {starts.length > 0 ? (
            <p className="text-sm text-foreground/90">
              {starts
                .map((start) => (start === "fridge" ? m.start_from_fridge() : m.start_from_room()))
                .join(" · ")}
            </p>
          ) : null}
          {guide !== null && guide.notes.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-[var(--guide-ink)]">
                {m.guide_notes_heading()}
              </h4>
              <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
                {guide.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {guide !== null && guide.references.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-[var(--guide-ink)]">
                {m.guide_references_heading()}
              </h4>
              <ul className="flex flex-col gap-2">
                {guide.references.map((reference) => (
                  <li key={reference.href}>
                    <a
                      className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--guide-copper)] underline-offset-4 hover:underline"
                      href={reference.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ArrowSquareOutIcon className="size-4 shrink-0" />
                      <span>{reference.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <DrawerFooter>
          <Button
            className="min-h-11 w-full"
            onClick={() => {
              setInfoOpen(false);
            }}
            type="button"
            variant="secondary"
          >
            {m.close_detail()}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function DonenessStep(props: {
  entry: SousVideEntry;
  index: number;
  locale: string;
  total: number;
  unit: TemperatureUnit;
}) {
  const entry = props.entry;
  const recommended = formatDurationRange(entry.recommendedMinutes, props.locale);
  const max =
    entry.maxMinutes === null ? null : formatDurationMinutes(entry.maxMinutes, props.locale);
  // Dots fill in as the bath gets hotter: hollow for the first step, solid for the last.
  const fill = props.total === 1 ? 1 : props.index / (props.total - 1);

  return (
    <li
      className="grid scroll-mt-[calc(var(--site-header-h)+3.25rem)] grid-cols-[0.85rem_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 py-2 target:rounded-lg target:bg-[color-mix(in_oklab,var(--guide-copper)_12%,transparent)] sm:scroll-mt-[calc(var(--site-header-h)+6.75rem)]"
      id={entry.id}
    >
      <span
        aria-hidden
        className="relative top-px inline-block size-[0.65rem] rounded-full border-[1.5px] border-[var(--guide-copper)]"
        style={{
          backgroundColor: `color-mix(in oklab, var(--guide-copper) ${Math.round(fill * 100)}%, var(--card))`,
        }}
      />
      <span className="truncate text-sm text-foreground/90">{entry.doneness}</span>
      <span className="temp-number text-lg leading-6 font-semibold text-[var(--guide-copper)]">
        {formatTemperature(entry.temperatureC, { locale: props.locale, unit: props.unit })}
      </span>
      <span className="min-w-[5.5rem] text-right text-sm text-foreground/90 tabular-nums">
        {recommended}
        {max ? (
          <span className="block text-xs text-muted-foreground">
            {m.max_time_short({ time: max })}
          </span>
        ) : null}
      </span>
    </li>
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
