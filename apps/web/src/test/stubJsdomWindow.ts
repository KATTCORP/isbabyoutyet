/**
 * jsdom is missing (or only "Not implemented") a handful of Window APIs that
 * real components need: next-themes `matchMedia`, observer-based layout,
 * TanStack Router scroll restoration, Paraglide `location.reload()`, and
 * convex-test Blob hashing through SubtleCrypto.
 *
 * Module mocks (`vi.mock`) stay banned. `vi.stubGlobal` / `vi.spyOn` are the
 * allowed exception for these third-party host APIs. Prefer `await using` on
 * `stubJsdomWindow()`, or go through `renderResource` / the router and Convex
 * test helpers so most tests never call this directly.
 *
 * This file is also a Vitest `setupFiles` entry so better-auth's broadcast
 * channel, focus manager, and online manager are replaced — and `fetch` is
 * wrapped in a per-test dispatcher ({@link installFetchHandler}) — *before*
 * that package loads. Window stubs are not installed at import time.
 */

import { webcrypto } from "node:crypto";

import { makeResource } from "@workspace/convex/convex/test.resource";
import { isFunction, isPlainObject } from "@workspace/runtime/guards";
import { vi } from "vitest";

const kAuthBroadcastChannel = Symbol.for("better-auth:broadcast-channel");
const kAuthFocusManager = Symbol.for("better-auth:focus-manager");
const kAuthOnlineManager = Symbol.for("better-auth:online-manager");

class StubAuthBroadcastChannel {
  subscribe() {
    return () => {};
  }

  post() {}

  setup() {
    return () => {};
  }
}

class StubAuthFocusManager {
  subscribe() {
    return () => {};
  }

  setFocused() {}

  setup() {
    return () => {};
  }
}

class StubAuthOnlineManager {
  isOnline = true;

  subscribe() {
    return () => {};
  }

  setOnline() {}

  setup() {
    return () => {};
  }
}

// better-auth's default host cleanup uses window/document after jsdom tears
// down (broadcast: window.removeEventListener, focus: document.removeEventListener,
// online: window.removeEventListener). Vitest reports that as an unhandled
// error from leftover nanostores session-refresh cleanup. Never restore:
// leftover cleanup must keep hitting these no-ops.
Object.assign(globalThis, {
  [kAuthBroadcastChannel]: new StubAuthBroadcastChannel(),
  [kAuthFocusManager]: new StubAuthFocusManager(),
  [kAuthOnlineManager]: new StubAuthOnlineManager(),
});

/**
 * A test-registered HTTP handler. Return `null` to let the request fall
 * through to the next handler (and finally the host `fetch`).
 */
export type FetchHandler = (request: Request) => Promise<Response | null>;

const fetchHandlers = new Set<FetchHandler>();
const hostFetch = globalThis.fetch;

// better-auth's `createAuthClient` captures `globalThis.fetch` when the module
// loads (`customFetchImpl: fetch`), so a `vi.stubGlobal("fetch")` inside a test
// is never seen by the auth client. Install one dispatcher here — before
// better-auth is imported — and let tests plug handlers in and out.
async function dispatchingFetch(input: RequestInfo | URL, init: RequestInit | undefined) {
  const request = new Request(input, init);
  for (const handler of fetchHandlers) {
    const response = await handler(request.clone());
    if (response) {
      return response;
    }
  }
  return await hostFetch(request);
}
globalThis.fetch = dispatchingFetch;

/**
 * Serve matching requests from the test process for the lifetime of the
 * returned resource. The Convex test harness uses this to answer
 * `/api/auth/*` with the real Better Auth handler on its in-memory backend.
 */
export function installFetchHandler(handler: FetchHandler) {
  fetchHandlers.add(handler);
  const release = () => {
    fetchHandlers.delete(handler);
  };
  return makeResource({ release }, release);
}

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

/**
 * jsdom matchMedia stand-in. next-themes still calls the deprecated
 * `addListener` / `removeListener` pair, so the stub implements those
 * methods on a local type instead of `MediaQueryList`.
 */
export function createMatchMediaStub(query: string, matches = false) {
  return {
    addEventListener(_type: string, _listener: EventListenerOrEventListenerObject) {},
    addListener(_listener: (event: MediaQueryListEvent) => void) {},
    dispatchEvent() {
      return false;
    },
    matches,
    media: query,
    onchange: null,
    removeEventListener(_type: string, _listener: EventListenerOrEventListenerObject) {},
    removeListener(_listener: (event: MediaQueryListEvent) => void) {},
  };
}

function stubMatchMedia(query: string) {
  return createMatchMediaStub(query);
}

/**
 * Replace `window.matchMedia` with {@link createMatchMediaStub} and return a
 * restore function. Use this instead of assigning a `MediaQueryList` so
 * next-themes can keep calling deprecated `addListener` without linting that
 * type.
 */
export function installMatchMediaStub(matches: (query: string) => boolean) {
  const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
  function matchMedia(query: string) {
    return createMatchMediaStub(query, matches(query));
  }
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });
  return () => {
    if (previous) {
      Object.defineProperty(window, "matchMedia", previous);
      return;
    }
    Reflect.deleteProperty(window, "matchMedia");
  };
}

function stubWindowScroll() {}

function jsdomLocationInternals() {
  for (const symbol of Object.getOwnPropertySymbols(window.location)) {
    const candidate = Object.getOwnPropertyDescriptor(window.location, symbol)?.value;
    if (
      isPlainObject(candidate) &&
      isFunction(candidate.reload) &&
      isFunction(candidate.assign) &&
      isFunction(candidate.replace)
    ) {
      return candidate;
    }
  }
  throw new Error("jsdom Location internals were not found");
}

function patchJsdomLocation() {
  const internals = jsdomLocationInternals();
  const previousReload = internals.reload;
  const previousAssign = internals.assign;
  const previousReplace = internals.replace;
  const previousNavigate = Object.getOwnPropertyDescriptor(internals, "_locationObjectNavigate");

  internals.reload = stubWindowScroll;
  internals.assign = stubWindowScroll;
  internals.replace = stubWindowScroll;
  Object.defineProperty(internals, "_locationObjectNavigate", {
    configurable: true,
    value: stubWindowScroll,
    writable: true,
  });

  return () => {
    internals.reload = previousReload;
    internals.assign = previousAssign;
    internals.replace = previousReplace;
    if (previousNavigate) {
      Object.defineProperty(internals, "_locationObjectNavigate", previousNavigate);
    } else {
      Reflect.deleteProperty(internals, "_locationObjectNavigate");
    }
  };
}

function isArrayBuffer(data: BufferSource): data is ArrayBuffer {
  return Object.prototype.isPrototypeOf.call(ArrayBuffer.prototype, data);
}

function digestBytes(data: BufferSource) {
  if (isArrayBuffer(data)) {
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(new Uint8Array(data));
    return bytes;
  }
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return bytes;
}

function patchCryptoSubtle() {
  const subtle = globalThis.crypto.subtle;
  const previousDigest = subtle.digest.bind(subtle);
  const nodeDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
  subtle.digest = (algorithm, data) => nodeDigest(algorithm, digestBytes(data));
  return () => {
    subtle.digest = previousDigest;
  };
}

let installCount = 0;
let restoreInstalled: (() => void) | null = null;

function installJsdomWindowStubs() {
  // Fill only missing constructors. Tests that install their own matchMedia or
  // IntersectionObserver (viewport / infinite-scroll) must keep those doubles.
  const previousScrollTo = window.scrollTo;
  const previousScroll = window.scroll;
  const previousScrollBy = window.scrollBy;
  const addedMatchMedia = !isFunction(globalThis.matchMedia);
  const addedIntersectionObserver = !isFunction(globalThis.IntersectionObserver);
  const addedResizeObserver = !isFunction(globalThis.ResizeObserver);
  const addedElementScrollTo = !isFunction(Element.prototype.scrollTo);
  const addedScrollIntoView = !isFunction(Element.prototype.scrollIntoView);

  if (addedMatchMedia) {
    vi.stubGlobal("matchMedia", stubMatchMedia);
  }
  if (addedIntersectionObserver) {
    vi.stubGlobal("IntersectionObserver", StubObserver);
  }
  if (addedResizeObserver) {
    vi.stubGlobal("ResizeObserver", StubObserver);
  }
  vi.stubGlobal("scrollTo", stubWindowScroll);
  vi.stubGlobal("scroll", stubWindowScroll);
  vi.stubGlobal("scrollBy", stubWindowScroll);

  if (addedScrollIntoView) {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: stubWindowScroll,
      writable: true,
    });
  }
  if (addedElementScrollTo) {
    Element.prototype.scrollTo = stubWindowScroll;
  }

  const restoreLocation = patchJsdomLocation();
  const restoreCrypto = patchCryptoSubtle();

  return () => {
    restoreCrypto();
    restoreLocation();
    if (addedElementScrollTo) {
      Reflect.deleteProperty(Element.prototype, "scrollTo");
    }
    if (addedScrollIntoView) {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
    if (addedMatchMedia) {
      Reflect.deleteProperty(globalThis, "matchMedia");
    }
    if (addedIntersectionObserver) {
      Reflect.deleteProperty(globalThis, "IntersectionObserver");
    }
    if (addedResizeObserver) {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
    vi.stubGlobal("scrollTo", previousScrollTo);
    vi.stubGlobal("scroll", previousScroll);
    vi.stubGlobal("scrollBy", previousScrollBy);
  };
}

function acquireJsdomWindowStubs() {
  if (installCount === 0) {
    restoreInstalled = installJsdomWindowStubs();
  }
  installCount += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    installCount -= 1;
    if (installCount === 0) {
      restoreInstalled?.();
      restoreInstalled = null;
    }
  };
}

/**
 * Installs jsdom host-API stubs for the lifetime of the returned resource.
 * Nested calls share one install (refcount); restoring is idempotent.
 */
export function stubJsdomWindow() {
  const restore = acquireJsdomWindowStubs();
  return makeResource({ restore }, restore);
}
