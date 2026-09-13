const PRODUCTION_NOTIFICATION_DELAY_MS = 60_000;
const NON_PRODUCTION_NOTIFICATION_DELAY_MS = 10_000;

type VercelEnvironment = "production" | "preview" | undefined;

export function notificationScheduleDelayMs(
  vercelEnvironment: VercelEnvironment,
  nodeEnvironment: string | undefined,
) {
  const isProduction =
    vercelEnvironment === "production" ||
    (vercelEnvironment === undefined && nodeEnvironment === "production");

  return isProduction ? PRODUCTION_NOTIFICATION_DELAY_MS : NON_PRODUCTION_NOTIFICATION_DELAY_MS;
}
