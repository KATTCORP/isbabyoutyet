import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import type { PluginOption } from "vite";
import { personalProjectSlug, SENTRY_ORG_SLUG } from "@workspace/sentry/project";

function present(value: string | undefined) {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

/**
 * Release define, plus source-map upload when `SENTRY_AUTH_TOKEN` is set.
 * Spread this last in the Vite plugin list. Without the token, builds still
 * succeed and simply skip the upload.
 */
export function sentryVitePlugins(opts: { appName: string }): Array<PluginOption> {
  const release = present(process.env.SENTRY_RELEASE) ?? present(process.env.VERCEL_GIT_COMMIT_SHA);
  const authToken = present(process.env.SENTRY_AUTH_TOKEN);
  const plugins: Array<PluginOption> = [
    {
      config() {
        if (release === undefined) {
          return {};
        }
        return {
          define: {
            "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release),
          },
        };
      },
      name: "workspace-sentry-release",
    },
  ];
  if (authToken === undefined) {
    return plugins;
  }
  plugins.push(
    sentryTanstackStart({
      authToken,
      org: SENTRY_ORG_SLUG,
      project: personalProjectSlug(opts.appName),
    }),
  );
  return plugins;
}
