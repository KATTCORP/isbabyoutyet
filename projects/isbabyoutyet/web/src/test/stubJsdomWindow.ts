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
 * channel, focus manager, and online manager are replaced *before* that
 * package loads. Window stubs are not installed at import time.
 */

import { webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";

import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { isFunction } from "@workspace/runtime/guards";
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

const NAVIGATION_NOT_IMPLEMENTED = "Not implemented: navigation to another Document";

/** @internal exported for tests */
export function jsdomVirtualConsole() {
  // Vitest's jsdom environment exposes the JSDOM instance as the `jsdom`
  // global (see `vitest/jsdom`); jsdom itself ships no types.
  const dom: unknown = Reflect.get(globalThis, "jsdom");
  const virtualConsole: unknown =
    typeof dom === "object" && dom !== null ? Reflect.get(dom, "virtualConsole") : undefined;
  if (!(virtualConsole instanceof EventEmitter)) {
    throw new Error("jsdom virtual console was not found");
  }
  return virtualConsole;
}

function isNavigationNotImplemented(error: unknown) {
  return error instanceof Error && error.message.startsWith(NAVIGATION_NOT_IMPLEMENTED);
}

/**
 * jsdom cannot load another document, so `location.reload()` / `assign()` /
 * `replace()` / `href =` already leave the URL alone and only report
 * "Not implemented" through the virtual console. Drop just that report; every
 * other event still reaches the listeners Vitest installed.
 */
function silenceJsdomNavigation() {
  const virtualConsole = jsdomVirtualConsole();
  const previousEmit = Object.getOwnPropertyDescriptor(virtualConsole, "emit");
  const emit = virtualConsole.emit.bind(virtualConsole);
  virtualConsole.emit = (eventName: string | symbol, ...args: Array<unknown>) => {
    if (eventName === "jsdomError" && isNavigationNotImplemented(args[0])) {
      return false;
    }
    return emit(eventName, ...args);
  };

  return () => {
    if (previousEmit) {
      Object.defineProperty(virtualConsole, "emit", previousEmit);
      return;
    }
    Reflect.deleteProperty(virtualConsole, "emit");
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

type InstallState = {
  count: number;
  restore: (() => void) | null;
};

declare global {
  // Lives on the global, not in module scope: with `isolate: false` this file
  // is re-evaluated as a setup file for every test file, so module-scoped
  // counters would fork while earlier holders still own the install.
  var jsdomWindowStubInstall: InstallState | undefined;
}

function installState() {
  globalThis.jsdomWindowStubInstall ??= { count: 0, restore: null };
  return globalThis.jsdomWindowStubInstall;
}

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

  const restoreLocation = silenceJsdomNavigation();
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
  const state = installState();
  if (state.count === 0) {
    state.restore = installJsdomWindowStubs();
  }
  state.count += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    state.count -= 1;
    if (state.count === 0) {
      state.restore?.();
      state.restore = null;
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
