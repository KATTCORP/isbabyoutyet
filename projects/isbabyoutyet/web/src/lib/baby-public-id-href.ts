import { CANONICAL_ORIGIN } from "@/lib/site-url";

/**
 * Replace `/baby/{fromPublicId}` in the current href, keeping the rest of the
 * path, query, and hash. Used to canonicalize a rotated slug without sending
 * overlays back to the baby index.
 */
export function replaceBabyPublicId(opts: {
  fromPublicId: string;
  href: string;
  toPublicId: string;
}) {
  const url = new URL(opts.href, CANONICAL_ORIGIN);
  const fromPrefix = `/baby/${opts.fromPublicId}`;
  if (url.pathname !== fromPrefix && !url.pathname.startsWith(`${fromPrefix}/`)) {
    throw new Error(`Cannot replace baby public id in ${opts.href}: not under ${fromPrefix}`);
  }
  url.pathname = `/baby/${opts.toPublicId}${url.pathname.slice(fromPrefix.length)}`;
  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    replace: true as const,
  };
}
