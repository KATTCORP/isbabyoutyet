/** Sentry org that owns every personal app in this monorepo. */
export const SENTRY_ORG_SLUG = "trpclabs";

/** Prefix for every Sentry project, existing and future. */
export const PERSONAL_PROJECT_PREFIX = "personal-";

/**
 * Sentry project slug for one app. `isbabyoutyet` becomes
 * `personal-isbabyoutyet`. A name that already has the prefix is unchanged.
 */
export function personalProjectSlug(appName: string) {
  if (appName.startsWith(PERSONAL_PROJECT_PREFIX)) {
    return appName;
  }
  return `${PERSONAL_PROJECT_PREFIX}${appName}`;
}

const BACKEND_SUFFIX = "-backend";

/**
 * Node.js Sentry project for a Convex backend. `isbabyoutyet` becomes
 * `personal-isbabyoutyet-backend`. Convex's exception integration expects
 * that platform, separate from the web app's JavaScript project.
 */
export function personalBackendProjectSlug(appName: string) {
  const slug = personalProjectSlug(appName);
  if (slug.endsWith(BACKEND_SUFFIX)) {
    return slug;
  }
  return `${slug}${BACKEND_SUFFIX}`;
}
