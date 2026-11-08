# `@workspace/browser-support`

Lets web app code use modern built-ins (`toSorted`, `Object.groupBy`,
`Promise.withResolvers`, Set methods, …) while still running on older
browsers, without charging modern browsers for it.

## Browser floor

[`src/targets.ts`](src/targets.ts) sets the oldest supported browsers:
Chrome/Edge 109 (the last on Windows 7 and 8), Firefox 115 ESR, and
Safari/iOS 15.4 (iPhone 6s and 7 stop at iOS 15).

## How it works

`legacyPolyfills()` (Vite plugin, from `./vite`) does two things:

- **Syntax:** sets the client `build.target` to the floor, so Vite lowers
  syntax those browsers can't parse. This costs about 0.3% of the gzipped
  client JS.
- **Built-ins:** a compiler can't add missing functions, so at build time it
  bundles every stable `core-js` module the floor needs (per `core-js-compat`)
  into one hashed classic script, `assets/legacy-polyfills-<hash>.js`
  (about 32 KB gzipped). In dev, the plugin serves the same file.

`legacyPolyfillsHeadScripts()` (from `./head`) goes in the root route's
`head().scripts`. It renders a ~150-byte inline check. Only when one of
`MODERN_FEATURE_CHECK`'s built-ins is missing does it `document.write` the
polyfill script tag. That tag blocks the parser, and the app's module scripts
are deferred, so polyfills always run before any app code. Modern browsers run
one check and download nothing.

Built-ins newer than `MODERN_FEATURE_CHECK` (for example, iterator helpers)
are not polyfilled for browsers that pass the check. Before relying on one,
add it to the check.

## Wire a new TanStack Start app

1. Add `legacyPolyfills()` to the Vite plugins.
2. Add `scripts: legacyPolyfillsHeadScripts()` to the root route's `head()`.
