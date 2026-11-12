import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import type { Plugin, PluginOption } from "vite";
import { personalProjectSlug, SENTRY_ORG_SLUG } from "@workspace/sentry/project";

function present(value: string | undefined) {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

/**
 * `import.meta.env` defines for the browser SDK: the release (commit SHA) and
 * the Vercel environment (`production` / `preview`). Without the environment,
 * the browser falls back to Vite's `MODE`, which is `production` for every
 * build, previews included.
 *
 * @internal exported for tests
 */
export function sentryDefines(env: Record<string, string | undefined>) {
  const define: Record<string, string> = {};
  const release = present(env.SENTRY_RELEASE) ?? present(env.VERCEL_GIT_COMMIT_SHA);
  if (release !== undefined) {
    define["import.meta.env.VITE_SENTRY_RELEASE"] = JSON.stringify(release);
  }
  const environment = present(env.VERCEL_ENV);
  if (environment !== undefined) {
    define["import.meta.env.VITE_SENTRY_ENVIRONMENT"] = JSON.stringify(environment);
  }
  return define;
}

const SENTRY_SDK = "@sentry/tanstackstart-react";

/** As much of Vite's plugin context as {@link resolveSentrySdk} uses. */
type SdkResolver = {
  resolve(
    source: string,
    importer: string,
    options: { skipSelf: boolean },
  ): Promise<{ id: string } | null>;
};

/**
 * Sentry's plugin wraps an app's server entry (`src/server.ts`) with an import
 * of the SDK, which it resolves from the app. The apps depend on this package
 * and not on the SDK, so under pnpm that import fails the build: resolve it
 * from here, where the SDK is installed.
 *
 * @internal exported for tests
 */
export function resolveSentrySdk() {
  const here = import.meta.filename;
  return {
    enforce: "pre",
    name: "workspace-sentry-resolve-sdk",
    async resolveId(this: SdkResolver, source: string) {
      if (source !== SENTRY_SDK) {
        return null;
      }
      return await this.resolve(source, here, { skipSelf: true });
    },
  } satisfies Plugin;
}

/**
 * Release and environment defines, plus source-map upload when `SENTRY_AUTH_TOKEN` is set.
 * Spread this last in the Vite plugin list. Without the token, builds still
 * succeed and simply skip the upload.
 */
export function sentryVitePlugins(opts: { appName: string }): Array<PluginOption> {
  const authToken = present(process.env.SENTRY_AUTH_TOKEN);
  const plugins: Array<PluginOption> = [
    {
      config() {
        return { define: sentryDefines(process.env) };
      },
      name: "workspace-sentry-release",
    },
  ];
  if (authToken === undefined) {
    return plugins;
  }
  plugins.push(
    resolveSentrySdk(),
    sentryTanstackStart({
      authToken,
      org: SENTRY_ORG_SLUG,
      project: personalProjectSlug(opts.appName),
    }),
  );
  return plugins;
}
