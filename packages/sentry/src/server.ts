import { captureException, init, wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import { sentryInitOptions, type SentryRuntimeOptions } from "./initOptions.js";

export function initServerSentry(opts: SentryRuntimeOptions) {
  const options = sentryInitOptions(opts);
  if (options === null) {
    return;
  }
  init(options);
}

export { captureException, wrapFetchWithSentry };
