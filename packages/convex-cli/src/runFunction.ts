import { Effect, Schema } from "effect";
import { ConvexCli } from "./convexCli";
import { previewNameArgs } from "./previewName";

export class ConvexRunOutputError extends Schema.TaggedError<ConvexRunOutputError>()(
  "ConvexRunOutputError",
  { functionName: Schema.String, stdout: Schema.String },
) {
  override get message() {
    return `Could not decode \`convex run ${this.functionName}\` output:\n${this.stdout}`;
  }
}

/** `convex run` prints the return value as JSON, sometimes after log lines; take the last line that decodes. */
function jsonCandidates(stdout: string) {
  const trimmed = stdout.trim();
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return [trimmed, ...lines.toReversed()];
}

/** `convex run <functionName> <args>` on the `ConvexPreviewName` deployment, decoding the result with `returns`. */
export const runFunction = Effect.fn("runFunction")(function* <S extends Schema.Constraint>(opts: {
  readonly args: object;
  readonly functionName: string;
  readonly returns: S;
}) {
  const convex = yield* ConvexCli;
  const stdout = yield* convex.run([
    "run",
    opts.functionName,
    JSON.stringify(opts.args),
    ...(yield* previewNameArgs),
  ]);
  const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(opts.returns));
  return yield* Effect.firstSuccessOf(jsonCandidates(stdout).map((line) => decode(line))).pipe(
    Effect.mapError(() => new ConvexRunOutputError({ functionName: opts.functionName, stdout })),
  );
});
