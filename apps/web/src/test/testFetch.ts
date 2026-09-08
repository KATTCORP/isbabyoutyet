/**
 * Per-test HTTP dispatcher for the jsdom test environment.
 *
 * Vitest `setupFiles` entry. better-auth's `createAuthClient` captures
 * `globalThis.fetch` when `@/lib/auth-client` is evaluated, so a
 * `vi.stubGlobal("fetch")` inside a test body is never seen by the auth client.
 * This module wraps `fetch` once, before any test module loads, and lets
 * tests (via `createConvexTestHarness`) plug handlers in and out.
 *
 * Handlers are consulted newest-first so a harness created inside a test
 * shadows anything registered earlier in the same worker. Unmatched requests
 * fall through to the host `fetch`.
 */
import { makeResource } from "@workspace/convex/convex/test.resource";

/** Return `null` to decline a request and let the next handler see it. */
export type FetchHandler = (request: Request) => Promise<Response | null>;

const fetchHandlers: Array<FetchHandler> = [];
const hostFetch = globalThis.fetch;

async function dispatchingFetch(input: RequestInfo | URL, init: RequestInit | undefined) {
  const request = new Request(input, init);
  for (let index = fetchHandlers.length - 1; index >= 0; index -= 1) {
    const handler = fetchHandlers[index];
    if (!handler) {
      continue;
    }
    const response = await handler(request.clone());
    if (response) {
      return response;
    }
  }
  return await hostFetch(request);
}
globalThis.fetch = dispatchingFetch;

/**
 * Serve matching requests from the test process until the returned resource
 * is released.
 */
export function installFetchHandler(handler: FetchHandler) {
  fetchHandlers.push(handler);
  const release = () => {
    const index = fetchHandlers.lastIndexOf(handler);
    if (index !== -1) {
      fetchHandlers.splice(index, 1);
    }
  };
  return makeResource({ release }, release);
}
