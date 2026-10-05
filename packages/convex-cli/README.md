# Convex CLI — the `convex` command as Effect services

Scripts that seed, configure, or deploy a Convex project shell out to the
Convex CLI. This package wraps that CLI once, so each script states what it
wants (`runFunction`, `setEnv`, …) instead of assembling argv, capturing
output, and parsing it by hand.

```ts
import path from "node:path";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { ConvexCli, ConvexPreviewName, listEnv, runFunction, setEnv } from "@workspace/convex-cli";
import { Effect, Layer, Option, Redacted, Schema } from "effect";

const program = Effect.gen(function* () {
  const env = yield* listEnv;
  if (env.SITE_URL === undefined) {
    yield* setEnv({ SITE_URL: "https://example.com", API_KEY: Redacted.make("…") });
  }
  return yield* runFunction({
    args: {},
    functionName: "homepageDemo:hasCompletePhotoSet",
    returns: Schema.Boolean,
  });
});

program.pipe(
  Effect.provideService(ConvexPreviewName, Option.some("my-branch")),
  Effect.provide(ConvexCli.layer({ cwd: path.resolve("projects/app/backend") })),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
```

| Export              | What it does                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConvexCli`         | Service with `run(args, { stdin })`: runs `pnpm convex …` in `cwd`, tees stderr to the terminal, returns stdout, fails with `ConvexCliError` on a non-zero exit. |
| `ConvexPreviewName` | `Option<string>` reference. `Some(name)` makes the helpers below add `--preview-name name`.                                                                      |
| `runFunction`       | `convex run <fn> <json args>`, decoding the printed result with a `Schema` (`ConvexRunOutputError` if nothing decodes).                                          |
| `listEnv`           | `convex env list`, parsed into a record.                                                                                                                         |
| `setEnv`            | One `convex env set --force` for many variables, sent as dotenv text on stdin.                                                                                   |
| `deploy`            | `convex deploy <flags>`, returning the deployment URL. A `start_push` 408 fails with `ConvexPushTimeoutError`, so callers can retry it.                          |

## Secrets stay out of argv and logs

`setEnv` accepts plain strings or `Redacted` values and pipes them on stdin,
the path the CLI's own help recommends
(`npx convex env set --force < .env.convex`). Only variable names are logged.
`ConvexCliError` keeps just the subcommand (`env set`), because later
arguments can be secrets.

Values are quoted the way `dotenv.parse` (the parser `convex env set` uses)
reads them back unchanged. The few values no quoting can carry, such as ones
containing a carriage return, fail with `ConvexEnvEncodingError`, which names
the variables but not their values.

## Getting the deployment URL from `convex deploy`

`convex deploy --cmd <command>` runs the command after claiming the
deployment and before pushing, with the URL in `--cmd-url-env-var-name`, and
inherits stdio. `deploy` passes `--cmd 'printenv CONVEX_DEPLOY_URL'`, so the
URL is the only thing on stdout (the CLI logs to stderr). That avoids temp
files, and slow build steps don't have to run inside `--cmd`.

## Testing

`@workspace/convex-cli/testing` exports `fakeConvexCli(reply)`, a `ConvexCli`
layer that answers each call with `reply` and records `{ args, stdin }`, so
tests for code built on this package never spawn the CLI.

```ts
import { it } from "@effect/vitest";
import { fakeConvexCli } from "@workspace/convex-cli/testing";

it.effect("sets SITE_URL", () =>
  Effect.gen(function* () {
    const convex = fakeConvexCli(() => Effect.succeed(""));
    yield* setEnv({ SITE_URL: "https://example.com" }).pipe(Effect.provide(convex.layer));
    expect(convex.calls[0]?.stdin).toBe("SITE_URL='https://example.com'\n");
  }),
);
```

## References

- [`convex deploy`](https://docs.convex.dev/cli/reference/deploy),
  [`convex env`](https://docs.convex.dev/cli/reference/env), and
  [`convex run`](https://docs.convex.dev/cli/reference/run) CLI reference
- [Environment variables](https://docs.convex.dev/production/environment-variables)
