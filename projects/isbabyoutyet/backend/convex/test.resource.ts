/**
 * Explicit resource management helpers for tests.
 * Prefer `await using` + these helpers over try/finally or before/after hooks.
 */

/**
 * Takes a value and a dispose function and returns a new object that implements the Disposable interface.
 */
export function makeResource<T>(thing: T, dispose: () => void): T & Disposable {
  // SAFETY: This helper attaches Symbol.dispose onto the live test value.
  const it = thing as T & Partial<Disposable>;

  // eslint-disable-next-line no-restricted-syntax -- only place allowed to attach Symbol.dispose
  const existing = it[Symbol.dispose];

  // eslint-disable-next-line no-restricted-syntax -- only place allowed to attach Symbol.dispose
  it[Symbol.dispose] = () => {
    dispose();
    existing?.();
  };

  // SAFETY: This helper attaches Symbol.dispose onto the live test value.
  return it as T & Disposable;
}

/**
 * Takes a value and an async dispose function and returns a new object that implements the AsyncDisposable interface.
 */
export function makeAsyncResource<T>(thing: T, dispose: () => Promise<void>): T & AsyncDisposable {
  // SAFETY: This helper attaches Symbol.dispose onto the live test value.
  const it = thing as T & Partial<AsyncDisposable>;

  // eslint-disable-next-line no-restricted-syntax -- only place allowed to attach Symbol.asyncDispose
  const existing = it[Symbol.asyncDispose];

  // eslint-disable-next-line no-restricted-syntax -- only place allowed to attach Symbol.asyncDispose
  it[Symbol.asyncDispose] = async () => {
    await dispose();
    await existing?.();
  };

  // SAFETY: This helper attaches Symbol.dispose onto the live test value.
  return it as T & AsyncDisposable;
}
