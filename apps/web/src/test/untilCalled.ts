/** Structural view of a `vi.fn()` / `vi.spyOn()` mock — avoids generic gymnastics. */
type Spy = { mock: { calls: ReadonlyArray<unknown> } };

// Captured at import so `vi.useFakeTimers()` inside a test cannot stall the wait.
const realSetTimeout = globalThis.setTimeout;
const POLL_MS = 10;

/**
 * Resolves once `spy` has been called again after this point.
 *
 * For asserting the outcome of a real auth flow driven through the UI —
 * sign-in, sign-up, password change — where the in-memory backend does
 * genuine scrypt hashing and JWT minting. That legitimately takes hundreds
 * of milliseconds on a busy CPU, and `vi.waitFor`'s fixed 1 s budget (sized
 * for cheap UI settles) is not a repo decision about how long a test may
 * take: the test timeout is. This waits within that instead.
 *
 * Assert on the call afterwards (`expect(spy).toHaveBeenCalledWith(...)`);
 * keep `vi.waitFor` for synchronous UI and validation.
 */
export function untilCalled(spy: Spy) {
  const callsBefore = spy.mock.calls.length;
  return new Promise<void>((resolve) => {
    const check = () => {
      if (spy.mock.calls.length > callsBefore) {
        resolve();
        return;
      }
      realSetTimeout(check, POLL_MS);
    };
    check();
  });
}
