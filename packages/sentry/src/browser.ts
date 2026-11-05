import {
  addIntegration,
  captureException,
  getClient,
  init,
  tanstackRouterBrowserTracingIntegration,
} from "@sentry/tanstackstart-react";
import type { ErrorInfo } from "react";
import { sentryInitOptions, type SentryRuntimeOptions } from "./initOptions.js";

export function initBrowserSentry(opts: SentryRuntimeOptions) {
  const options = sentryInitOptions(opts);
  if (options === null) {
    return;
  }
  init(options);
}

export function addRouterTracing(
  router: Parameters<typeof tanstackRouterBrowserTracingIntegration>[0],
) {
  if (router.isServer || getClient() === undefined) {
    return;
  }
  addIntegration(tanstackRouterBrowserTracingIntegration(router));
}

/** Router `defaultOnCatch`. Errors caught by the router's own boundary are not automatic. */
export function reportRouterError(cause: unknown, _errorInfo: ErrorInfo) {
  if (getClient() === undefined) {
    return;
  }
  captureException(cause);
}
