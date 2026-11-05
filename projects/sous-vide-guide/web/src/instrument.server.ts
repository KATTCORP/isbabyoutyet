import { initServerSentry } from "@workspace/sentry/server";

initServerSentry({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? import.meta.env.MODE,
  release: import.meta.env.VITE_SENTRY_RELEASE,
});
