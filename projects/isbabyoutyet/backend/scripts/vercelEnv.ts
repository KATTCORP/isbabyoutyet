/**
 * What the Vercel build tasks (`deploy:vercel`, `configure:vercel`) read from
 * the environment. Each task works the plan out for itself, so neither has to
 * hand it to the other.
 */
import { Config, Effect, Schema } from "effect";
import { planConvexDeploy } from "../src/previewDeploy";

/** https://vercel.com/docs/environment-variables/system-environment-variables */
const VercelConfig = Config.all({
  branchUrl: Config.NonEmptyString("VERCEL_BRANCH_URL"),
  env: Config.Literals(["production", "preview"], "VERCEL_ENV"),
  gitRef: Config.NonEmptyString("VERCEL_GIT_COMMIT_REF"),
  productionUrl: Config.NonEmptyString("VERCEL_PROJECT_PRODUCTION_URL"),
});

const secret = (name: string) => Config.schema(Schema.Redacted(Schema.NonEmptyString), name);

/** Set on the Convex deployment, where `convex/` reads them through `convexEnv`. */
export const ConvexRuntimeConfig = Config.all({
  BETTER_AUTH_SECRET: secret("BETTER_AUTH_SECRET"),
  EMAIL_FROM: Config.NonEmptyString("EMAIL_FROM"),
  RESEND_API_KEY: secret("RESEND_API_KEY"),
  VAPID_PRIVATE_KEY: secret("VAPID_PRIVATE_KEY"),
  VAPID_PUBLIC_KEY: Config.NonEmptyString("VAPID_PUBLIC_KEY"),
  VAPID_SUBJECT: Config.NonEmptyString("VAPID_SUBJECT").pipe(
    Config.withDefault("mailto:admin@isbabyoutyet.com"),
  ),
});

/** Which Convex deployment this Vercel build targets, and the URL the site is served from. */
export const vercelDeployment = Effect.gen(function* () {
  const vercel = yield* VercelConfig;
  const isPreview = vercel.env === "preview";
  return {
    isPreview,
    plan: planConvexDeploy({ gitRef: vercel.gitRef, vercelEnv: vercel.env }),
    siteUrl: `https://${isPreview ? vercel.branchUrl : vercel.productionUrl}`,
  };
});
