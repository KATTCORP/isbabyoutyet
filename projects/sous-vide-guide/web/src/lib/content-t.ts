/**
 * Content-string translator for static sous-vide rows.
 *
 * Product copy for guide entries uses English (en-GB) literals as message keys —
 * the same pattern as isbabyoutyet's `t("Literal")` — while UI chrome stays on
 * Paraglide `m.*` snake_case accessors. Catalogs are the shared
 * `messages/{locale}.json` files Paraglide also compiles.
 */
import enGBMessages from "../../messages/en-GB.json";
import enUSMessages from "../../messages/en-US.json";
import svMessages from "../../messages/sv.json";

type MessageCatalogFile = {
  readonly [key: string]: string;
};

/** Strip the inlang schema key; remaining keys are translation message ids. */
function withoutSchema(messages: MessageCatalogFile) {
  const catalog: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    if (key === "$schema") {
      continue;
    }
    catalog[key] = value;
  }
  return catalog;
}

const enGB = withoutSchema(enGBMessages);

const catalogs = {
  "en-GB": enGB,
  "en-US": withoutSchema(enUSMessages),
  sv: withoutSchema(svMessages),
} as const;

type SchemaKey = "$schema";
type ContentKey = Exclude<keyof typeof enGBMessages, SchemaKey>;

export type ContentT = (message: ContentKey) => string;

function resolveCatalog(locale: string) {
  if (locale === "en-GB" || locale === "en-US" || locale === "sv") {
    return catalogs[locale];
  }
  return enGB;
}

/**
 * Look up `message` in the active locale catalog, falling back to en-GB, then
 * the key itself (so missing rows still render something readable).
 */
export function createContentT(locale: string): ContentT {
  const catalog = resolveCatalog(locale);
  return (message) => catalog[message] ?? enGB[message] ?? message;
}
