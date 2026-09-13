import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { GuideCard } from "@/components/guide-card";
import { GUIDES } from "@/data/guides";
import { filterGuides } from "@/lib/search";
import * as m from "@/paraglide/messages";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";

const homeSearchSchema = z.object({
  q: z.string().default(""),
});

export const Route = createFileRoute("/")({
  validateSearch: homeSearchSchema,
  component: HomePage,
  head: () => ({
    meta: [
      { title: `${m.app_name()} — ${m.tagline()}` },
      { name: "description", content: m.home_intro() },
    ],
  }),
});

function HomePage() {
  const search = Route.useSearch();
  const guides = filterGuides(GUIDES, search.q);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--kitchen-copper)]">
          {m.nav_guides()}
        </p>
        <h1 className="font-display text-5xl font-semibold tracking-tight text-[var(--kitchen-ink)] sm:text-6xl">
          {m.app_name()}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{m.home_intro()}</p>
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            render={<Link to="/guides/sous-vide" search={{ q: "", category: "all" }} />}
          >
            {m.browse_sous_vide()}
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{m.guides_heading()}</h2>
        <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            name="q"
            type="search"
            defaultValue={search.q}
            placeholder={m.search_guides_placeholder()}
            aria-label={m.search_guides_placeholder()}
            className="h-11 max-w-xl bg-background/80"
          />
          <Button type="submit" className="h-11">
            {m.submit_search()}
          </Button>
        </form>

        {guides.length === 0 ? (
          <p className="text-muted-foreground">{m.guides_empty()}</p>
        ) : (
          <div className="grid gap-4">
            {guides.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
