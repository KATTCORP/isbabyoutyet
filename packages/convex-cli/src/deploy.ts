import { Effect, Schema } from "effect";
import { ConvexCli } from "./convexCli";

/** `convex deploy` hands its `--cmd` the deployment URL in this variable. */
const URL_ENV_VAR = "CONVEX_DEPLOY_URL";

export class ConvexPushTimeoutError extends Schema.TaggedError<ConvexPushTimeoutError>()(
  "ConvexPushTimeoutError",
  {},
) {
  override get message() {
    return "`convex deploy` timed out pushing functions (start_push 408)";
  }
}

export class ConvexDeployOutputError extends Schema.TaggedError<ConvexDeployOutputError>()(
  "ConvexDeployOutputError",
  { stdout: Schema.String },
) {
  override get message() {
    return `\`convex deploy\` did not print the deployment URL:\n${this.stdout}`;
  }
}

/** A fresh deployment can hang on `start_push` and answer 408 after about five minutes. */
function isStartPushTimeout(output: string) {
  return /\/api\/deploy2\/start_push\s+408\b/i.test(output);
}

/**
 * `convex deploy <args>`, returning the deployment URL.
 *
 * The CLI runs `--cmd` after claiming the deployment and before pushing, with
 * the URL in an env var and stdio inherited, so `printenv` puts exactly that
 * URL on the stdout `ConvexCli` captures. The CLI's own logs go to stderr.
 */
export const deploy = Effect.fn("deploy")(function* (args: ReadonlyArray<string>) {
  const convex = yield* ConvexCli;
  const stdout = yield* convex
    .run([
      "deploy",
      "--cmd-url-env-var-name",
      URL_ENV_VAR,
      "--cmd",
      `printenv ${URL_ENV_VAR}`,
      ...args,
    ])
    .pipe(
      Effect.catchTag("ConvexCliError", (error) =>
        Effect.fail(isStartPushTimeout(error.output) ? new ConvexPushTimeoutError() : error),
      ),
    );
  const url = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\/\S+$/.test(line))
    .at(-1);
  if (url === undefined) {
    return yield* new ConvexDeployOutputError({ stdout });
  }
  return url;
});
