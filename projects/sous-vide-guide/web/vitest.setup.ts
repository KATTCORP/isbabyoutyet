/**
 * jsdom logs "Not implemented: Window's scrollTo()" on every call, and TanStack
 * Router's scroll restoration calls it on each navigation. Tests that care
 * still `vi.spyOn(window, "scrollTo")`. In node-environment files this only
 * adds an unused global.
 */
globalThis.scrollTo = () => {};
