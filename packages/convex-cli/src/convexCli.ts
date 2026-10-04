import { Context, Effect, Layer, PlatformError, Schema, Stdio, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export class ConvexCliError extends Schema.TaggedError<ConvexCliError>()("ConvexCliError", {
  /** Subcommand only (`env set`, `run homepageDemo:refresh`): later args can be secrets. */
  command: Schema.String,
  exitCode: Schema.Number,
  stderr: Schema.String,
  stdout: Schema.String,
}) {
  /** stderr is already on the terminal (see `ConvexCli.layer`), so it stays out of the message. */
  override get message() {
    return `\`convex ${this.command}\` exited with code ${this.exitCode}`;
  }

  /** Everything the CLI printed, for matching known failures. */
  get output() {
    return `${this.stdout}\n${this.stderr}`;
  }
}

export interface ConvexCliRunOptions {
  /** Piped to the CLI's stdin, then closed. Use it for secrets: argv shows up in `ps` and logs. */
  readonly stdin?: string;
}

function collectText(stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) {
  return stream.pipe(Stream.decodeText(), Stream.mkString);
}

/** The Convex CLI (`pnpm convex …`) of one Convex project. */
export class ConvexCli extends Context.Service<
  ConvexCli,
  {
    /** Runs `convex <args>` and returns stdout, failing on a non-zero exit. */
    readonly run: (
      args: ReadonlyArray<string>,
      options?: ConvexCliRunOptions,
    ) => Effect.Effect<string, ConvexCliError | PlatformError.PlatformError>;
  }
>()("@workspace/convex-cli/ConvexCli") {
  /** Runs the CLI from `cwd`, the directory holding `convex/` and the `convex` dependency. */
  static readonly layer = (options: { readonly cwd: string }) =>
    Layer.effect(
      ConvexCli,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const stdio = yield* Stdio.Stdio;

        const run = Effect.fn("ConvexCli.run")(function* (
          args: ReadonlyArray<string>,
          runOptions?: ConvexCliRunOptions,
        ) {
          const handle = yield* spawner.spawn(
            ChildProcess.make("pnpm", ["convex", ...args], {
              cwd: options.cwd,
              stdin:
                runOptions?.stdin === undefined
                  ? "pipe"
                  : Stream.make(new TextEncoder().encode(runOptions.stdin)),
            }),
          );
          // Progress, `✔ …` confirmations, and errors go to stderr: show them live, keep them for callers.
          const stderr = handle.stderr.pipe(
            Stream.tap((chunk) => Stream.run(Stream.make(chunk), stdio.stderr())),
          );
          const [stdout, stderrText, exitCode] = yield* Effect.all(
            [collectText(handle.stdout), collectText(stderr), handle.exitCode],
            { concurrency: "unbounded" },
          );
          if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
            return yield* new ConvexCliError({
              command: args.slice(0, 2).join(" "),
              exitCode,
              stderr: stderrText,
              stdout,
            });
          }
          return stdout;
        }, Effect.scoped);

        return ConvexCli.of({ run });
      }),
    );
}
