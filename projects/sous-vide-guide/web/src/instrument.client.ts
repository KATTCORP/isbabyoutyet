import { init } from "@sentry/tanstackstart-react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  init({
    dsn,
    tracesSampleRate: 1,
  });
}
