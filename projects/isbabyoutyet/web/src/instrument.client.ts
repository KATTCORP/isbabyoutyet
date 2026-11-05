import { initBrowserSentry } from "@workspace/sentry/browser";

initBrowserSentry({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_SENTRY_RELEASE,
});
