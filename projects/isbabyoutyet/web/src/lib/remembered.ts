/**
 * What a visitor's browser remembers between posts, like the id their
 * messages are theirs by. Cookies, not `localStorage`, so the server can
 * read and set them too when a browser posts a form by itself.
 *
 * Nothing the server renders may depend on them. A baby page is the same for
 * every anonymous visitor (`cache.ts`), and these cookies do not make a
 * request personal (`personal-cache-key.ts`). The page's JS reads them once
 * it runs.
 */
export type Remembered = { name: string; value: string };

const ONE_YEAR_SECONDS = 31_536_000;
const CHANGE_EVENT = "remembered-change";

/** A `Set-Cookie` value, which `document.cookie` takes as well. */
export function rememberedCookie(remembered: Remembered, opts: { secure: boolean }) {
  const secure = opts.secure ? "; Secure" : "";
  const value = encodeURIComponent(remembered.value);
  return `${remembered.name}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

/** Reads one value out of a request's `Cookie` header, or out of `document.cookie`. */
export function readRemembered(cookies: string | null, name: string) {
  const prefix = `${name}=`;
  const found = (cookies ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(prefix));
  if (found === undefined) {
    return null;
  }
  try {
    return decodeURIComponent(found.slice(prefix.length)) || null;
  } catch {
    // Not a value this site wrote.
    return null;
  }
}

/** What this browser remembers under `name`. `null` on the server. */
export function recallInBrowser(name: string) {
  if (globalThis.document === undefined) {
    return null;
  }
  return readRemembered(document.cookie, name);
}

export function rememberInBrowser(remembered: ReadonlyArray<Remembered>) {
  const secure = location.protocol === "https:";
  for (const one of remembered) {
    document.cookie = rememberedCookie(one, { secure });
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** For `useSyncExternalStore`: tells of what {@link rememberInBrowser} wrote in this tab. */
export function subscribeToRemembered(notify: () => void) {
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}
