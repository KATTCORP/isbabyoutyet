import dotenv from "dotenv";
import { Console, Effect, Redacted, Schema } from "effect";
import { ConvexCli } from "./convexCli";
import { previewNameArgs } from "./previewName";

export class ConvexEnvEncodingError extends Schema.TaggedError<ConvexEnvEncodingError>()(
  "ConvexEnvEncodingError",
  { names: Schema.Array(Schema.String) },
) {
  override get message() {
    return `Cannot pass ${this.names.join(", ")} to \`convex env set\` as dotenv text without changing the value`;
  }
}

/**
 * `NAME=<quoted value>` in the first quote style that `dotenv.parse` (what
 * `convex env set` reads stdin with) reads back unchanged, else single quotes.
 */
function dotenvLine(entry: readonly [string, string]) {
  const [name, value] = entry;
  const lines = ["'", '"', "`"].map((quote) => `${name}=${quote}${value}${quote}\n`);
  return lines.find((line) => dotenv.parse(line)[name] === value) ?? `${name}='${value}'\n`;
}

/** Every variable on the `ConvexPreviewName` deployment. */
export const listEnv = Effect.gen(function* () {
  const convex = yield* ConvexCli;
  return dotenv.parse(yield* convex.run(["env", "list", ...(yield* previewNameArgs)]));
});

/**
 * Sets every variable in one `convex env set --force`, overwriting changed
 * values. Values travel as dotenv text on stdin, so they never reach argv or
 * the logs; only names are printed.
 */
export const setEnv = Effect.fn("setEnv")(function* (
  vars: Readonly<Record<string, string | Redacted.Redacted<string>>>,
) {
  const names = Object.keys(vars);
  if (names.length === 0) {
    return;
  }
  const values = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [
      name,
      Redacted.isRedacted(value) ? Redacted.value(value) : value,
    ]),
  );
  const dotenvText = Object.entries(values).map(dotenvLine).join("");
  const parsed = dotenv.parse(dotenvText);
  const unencodable = names.filter((name) => parsed[name] !== values[name]);
  if (unencodable.length > 0) {
    return yield* new ConvexEnvEncodingError({ names: unencodable });
  }

  yield* Console.log(`convex env set ${names.join(" ")}`);
  const convex = yield* ConvexCli;
  yield* convex.run(["env", "set", "--force", ...(yield* previewNameArgs)], {
    stdin: dotenvText,
  });
});
