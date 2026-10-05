import { Effect, Layer } from "effect";
import { ConvexCli } from "./convexCli";
import type { ConvexCliError } from "./convexCli";

export interface ConvexCliCall {
  readonly args: ReadonlyArray<string>;
  readonly stdin: string | undefined;
}

/** A `ConvexCli` that answers every call with `reply`, recording each one in `calls`. */
export function fakeConvexCli(
  reply: (call: ConvexCliCall) => Effect.Effect<string, ConvexCliError>,
) {
  const calls: Array<ConvexCliCall> = [];
  const layer = Layer.succeed(
    ConvexCli,
    ConvexCli.of({
      run: (args, options) =>
        Effect.suspend(() => {
          const call = { args, stdin: options?.stdin };
          calls.push(call);
          return reply(call);
        }),
    }),
  );
  return { calls, layer };
}
