export type SentryRuntimeOptions = {
  dsn: string | undefined;
  environment: string | undefined;
  release: string | undefined;
};

function present(value: string | undefined) {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

/** The `Sentry.init` fields the browser and the server share. */
interface SentryInitOptions {
  readonly dsn: string;
  readonly environment: string | undefined;
  readonly release: string | undefined;
  readonly tracesSampleRate: number;
}

/** Shared `Sentry.init` fields. `null` when there is no DSN, so the SDK stays off. */
export function sentryInitOptions(opts: SentryRuntimeOptions): SentryInitOptions | null {
  if (opts.dsn === undefined || opts.dsn.length === 0) {
    return null;
  }
  return {
    dsn: opts.dsn,
    environment: present(opts.environment),
    release: present(opts.release),
    tracesSampleRate: 1,
  };
}
