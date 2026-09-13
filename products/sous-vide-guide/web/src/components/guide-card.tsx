import { Link } from "@tanstack/react-router";

import type { GuideSummary } from "@/data/guides";
import { pickLocalized } from "@/data/sousVide";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { Badge } from "@workspace/ui/components/badge";

export function GuideCard(props: { guide: GuideSummary }) {
  const locale = getLocale();
  const title = pickLocalized(props.guide.title, locale);
  const summary = pickLocalized(props.guide.summary, locale);

  return (
    <Link
      to="/guides/sous-vide"
      search={(prev) => ({
        q: "",
        category: "all",
        unit: prev.unit,
      })}
      className="surface-panel group block rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-3">
        <Badge variant="secondary">{m.guide_badge_reference()}</Badge>
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--guide-ink)] group-hover:text-[var(--guide-copper)]">
        {title}
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{summary}</p>
      <span className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--guide-copper)]">
        {m.browse_sous_vide()} →
      </span>
    </Link>
  );
}
