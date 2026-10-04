import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { compareCoverage } from "./coverageComparison";

Command.make(
  "compare-coverage",
  {
    baselineDir: Argument.String("baseline-dir").pipe(
      Argument.withDescription("PR base reports: <workspace>/coverage-summary.json"),
    ),
    currentDir: Argument.String("current-dir").pipe(
      Argument.withDescription("This run's reports: <workspace>/coverage-summary.json"),
    ),
  },
  compareCoverage,
).pipe(Command.run({ version: "0.0.0" }), Effect.provide(NodeServices.layer), NodeRuntime.runMain);
