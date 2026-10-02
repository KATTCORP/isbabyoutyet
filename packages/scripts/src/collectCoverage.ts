import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { Argument, Command } from "effect/cli";

const REPORTS = "{projects/*/*,packages/*}/coverage/{coverage-summary.json,lcov.info}";

class NoReportsError extends Schema.TaggedError<NoReportsError>()("NoReportsError", {}) {
  override get message() {
    return "No workspace coverage reports found. Run `turbo run test:coverage` first.";
  }
}

const collectCoverage = Command.make(
  "collect-coverage",
  {
    outDir: Argument.String("out-dir").pipe(
      Argument.withDescription("Destination; replaced with <workspace>/<report> copies"),
    ),
  },
  Effect.fn(function* (args) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* fs.remove(args.outDir, { force: true, recursive: true });

    const reports = yield* fs.glob(REPORTS);
    const workspaces = yield* Effect.forEach(
      reports,
      Effect.fnUntraced(function* (report) {
        const workspace = path.dirname(path.dirname(report));
        const target = path.join(args.outDir, workspace);
        yield* fs.makeDirectory(target, { recursive: true });
        yield* fs.copyFile(report, path.join(target, path.basename(report)));
        return workspace;
      }),
      { concurrency: "unbounded" },
    );

    for (const workspace of new Set(workspaces.toSorted())) {
      yield* Console.log(`Collected ${workspace}`);
    }

    if (workspaces.length === 0) {
      return yield* new NoReportsError();
    }
  }),
);

collectCoverage.pipe(
  Command.run({ version: "0.0.0" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
