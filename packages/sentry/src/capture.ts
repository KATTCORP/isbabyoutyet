import { isPlainObject, isString } from "@workspace/runtime/guards";

export type CaptureRuntime = "convex" | "email";

export type CaptureExceptionOptions = {
  cause: unknown;
  dsn: string | null;
  environment: string;
  fetchImpl: typeof fetch;
  release: string | null;
  runtime: CaptureRuntime;
};

type StackFrame = {
  colno: number;
  filename: string;
  function: string;
  in_app: boolean;
  lineno: number;
};

const FRAME = /^at (?:async )?(?:(.*?) )?\(?(.+?):(\d+):(\d+)\)?$/;

function stackFrames(stack: string | null) {
  if (stack === null) {
    return null;
  }
  const frames: Array<StackFrame> = [];
  for (const line of stack.split("\n")) {
    const match = FRAME.exec(line.trim());
    if (match === null) {
      continue;
    }
    const functionName = match[1];
    const filename = match[2];
    const lineNumber = match[3];
    const columnNumber = match[4];
    if (filename === undefined || lineNumber === undefined || columnNumber === undefined) {
      continue;
    }
    const lineno = Number(lineNumber);
    const colno = Number(columnNumber);
    if (Number.isNaN(lineno) || Number.isNaN(colno)) {
      continue;
    }
    frames.push({
      colno,
      filename,
      function: functionName ?? "<anonymous>",
      in_app: !filename.includes("node_modules"),
      lineno,
    });
  }
  if (frames.length === 0) {
    return null;
  }
  // V8 prints the newest frame first. Sentry wants the oldest first.
  return frames.toReversed();
}

function exceptionValue(cause: unknown) {
  if (cause instanceof Error) {
    return {
      message: cause.message,
      name: cause.name.length === 0 ? "Error" : cause.name,
      stack: cause.stack ?? null,
    };
  }
  return { message: "Non-Error exception", name: "Error", stack: null };
}

function envelopeTarget(dsn: string) {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\//, "");
  if (publicKey.length === 0 || projectId.length === 0 || url.host.length === 0) {
    return null;
  }
  return {
    envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    publicKey,
  };
}

function hostEnv() {
  // Email templates typecheck without `@types/node`, and Convex does not always
  // expose a typed `process`. Read the host env through the global object.
  const host: unknown = globalThis;
  if (!isPlainObject(host)) {
    return null;
  }
  const processHost = host.process;
  if (!isPlainObject(processHost)) {
    return null;
  }
  const env = processHost.env;
  if (!isPlainObject(env)) {
    return null;
  }
  return env;
}

function readEnv(name: string) {
  const env = hostEnv();
  if (env === null) {
    return null;
  }
  const value = env[name];
  if (!isString(value) || value.length === 0) {
    return null;
  }
  return value;
}

/**
 * Report one exception to Sentry's envelope endpoint.
 * Convex's isolate cannot load the TanStack SDK. Use this only when a function
 * catches an error and does not rethrow. Uncaught errors are reported by
 * Convex's own integration. A missing or unusable DSN, or a failed request,
 * does not throw.
 */
export async function captureException(opts: CaptureExceptionOptions) {
  if (opts.dsn === null) {
    return;
  }
  const target = envelopeTarget(opts.dsn);
  if (target === null) {
    return;
  }
  const value = exceptionValue(opts.cause);
  const frames = stackFrames(value.stack);
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const exceptionItem =
    frames === null
      ? { type: value.name, value: value.message }
      : { stacktrace: { frames }, type: value.name, value: value.message };
  const event = {
    environment: opts.environment,
    event_id: eventId,
    exception: {
      values: [exceptionItem],
    },
    level: "error",
    platform: "javascript",
    release: opts.release ?? undefined,
    tags: { runtime: opts.runtime },
    timestamp: Date.now() / 1000,
  };
  const payload = JSON.stringify(event);
  const body = [
    JSON.stringify({
      dsn: opts.dsn,
      event_id: eventId,
      sent_at: new Date().toISOString(),
    }),
    JSON.stringify({
      length: new TextEncoder().encode(payload).length,
      type: "event",
    }),
    payload,
  ].join("\n");

  try {
    await opts.fetchImpl(target.envelopeUrl, {
      body,
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=workspace-sentry/0.0.0`,
      },
      method: "POST",
    });
  } catch {
    // Reporting must not replace the original failure.
  }
}

/**
 * Reads `SENTRY_DSN` from the process environment. No-ops when it is unset.
 * For an error that is caught and not rethrown. Uncaught Convex errors use
 * the deployment's Sentry integration instead.
 */
export function captureConfiguredException(opts: { cause: unknown; runtime: CaptureRuntime }) {
  const environment = readEnv("VERCEL_ENV") ?? readEnv("NODE_ENV") ?? "development";
  return captureException({
    cause: opts.cause,
    dsn: readEnv("SENTRY_DSN"),
    environment,
    fetchImpl: fetch,
    release: readEnv("VERCEL_GIT_COMMIT_SHA"),
    runtime: opts.runtime,
  });
}
