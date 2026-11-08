/**
 * The oldest browsers the web apps support. Chrome and Edge 109 are the last
 * releases for Windows 7 and 8. iOS 15 is the last release for the iPhone 6s
 * and 7, and 15.4 is its first release with `Intl.supportedValuesOf`, which
 * core-js does not polyfill.
 */
export const BROWSER_FLOOR = {
  chrome: "109",
  edge: "109",
  firefox: "115",
  ios: "15.4",
  safari: "15.4",
} as const;

/** `BROWSER_FLOOR` as Vite `build.target` entries, so syntax is lowered to the same floor. */
export const BUILD_TARGET = Object.entries(BROWSER_FLOOR).map(
  ([browser, version]) => `${browser}${version}`,
);

/**
 * Browsers with all of these load no polyfills. Each is the newest built-in
 * of its group: `toSorted` (Chrome 110, Safari 16), `Object.groupBy` and
 * `Promise.withResolvers` (Chrome 119, Safari 17.4), and Set methods (Chrome
 * 122, Firefox 127). Built-ins newer than these are not polyfilled for
 * browsers that pass the check, so add one here before relying on it.
 */
export const MODERN_FEATURE_CHECK = [
  "[].toSorted",
  "Object.groupBy",
  "Promise.withResolvers",
  "Set.prototype.union",
].join("&&");
