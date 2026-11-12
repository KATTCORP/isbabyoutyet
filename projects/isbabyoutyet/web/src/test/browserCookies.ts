/** Drops every cookie the test page holds, so one test's visitor is not the next one's. */
export function clearBrowserCookies() {
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  }
}

export function setBrowserCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/`;
}
