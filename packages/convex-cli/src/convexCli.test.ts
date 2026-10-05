import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Sink, Stdio, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { ConvexCli, ConvexCliError } from "./convexCli";

const encoder = new TextEncoder();

/** A spawner whose every process prints `output` and exits with `output.exitCode`. */
function fakeProcesses(output: { exitCode: number; stderr: string; stdout: string }) {
  const commands: Array<ChildProcess.StandardCommand> = [];
  const stderrTee: Array<string | Uint8Array> = [];
  const spawner = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        if (ChildProcess.isStandardCommand(command)) {
          commands.push(command);
        }
        return ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.exitCode)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.make(encoder.encode(output.stderr)),
          stdin: Sink.drain,
          stdout: Stream.make(encoder.encode(output.stdout)),
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );
  const stdio = Stdio.layerTest({
    stderr: () =>
      Sink.forEach((chunk) =>
        Effect.sync(() => {
          stderrTee.push(chunk);
        }),
      ),
  });
  const layer = ConvexCli.layer({ cwd: "/repo/backend" }).pipe(
    Layer.provide(Layer.merge(spawner, stdio)),
  );
  return { commands, layer, stderrTee };
}

function stdinText(command: ChildProcess.StandardCommand | undefined) {
  const stdin = command?.options.stdin;
  return Stream.isStream(stdin)
    ? stdin.pipe(Stream.decodeText(), Stream.mkString)
    : Effect.succeed(stdin);
}

describe("ConvexCli.layer", () => {
  it.effect("runs `pnpm convex` in the project dir, returning stdout and teeing stderr", () =>
    Effect.gen(function* () {
      const processes = fakeProcesses({ exitCode: 0, stderr: "✔ Done\n", stdout: "true\n" });

      const stdout = yield* ConvexCli.use((convex) => convex.run(["run", "demo:check"])).pipe(
        Effect.provide(processes.layer),
      );

      expect(stdout).toBe("true\n");
      expect(processes.stderrTee).toStrictEqual([encoder.encode("✔ Done\n")]);
      const [command] = processes.commands;
      expect([command?.command, command?.args, command?.options.cwd]).toStrictEqual([
        "pnpm",
        ["convex", "run", "demo:check"],
        "/repo/backend",
      ]);
      expect(yield* stdinText(command)).toBe("pipe");
    }),
  );

  it.effect("pipes `stdin` to the process", () =>
    Effect.gen(function* () {
      const processes = fakeProcesses({ exitCode: 0, stderr: "", stdout: "" });

      yield* ConvexCli.use((convex) =>
        convex.run(["env", "set", "--force"], { stdin: "SECRET='s3cr3t'\n" }),
      ).pipe(Effect.provide(processes.layer));

      expect(yield* stdinText(processes.commands[0])).toBe("SECRET='s3cr3t'\n");
    }),
  );

  it.effect("fails with only the subcommand in the message, keeping what it printed", () =>
    Effect.gen(function* () {
      const processes = fakeProcesses({ exitCode: 1, stderr: "✖ Nope\n", stdout: "partial" });

      const error = yield* ConvexCli.use((convex) =>
        convex.run(["env", "set", "SECRET", "s3cr3t"]),
      ).pipe(Effect.flip, Effect.provide(processes.layer));

      const expected = new ConvexCliError({
        command: "env set",
        exitCode: 1,
        stderr: "✖ Nope\n",
        stdout: "partial",
      });
      expect(error).toStrictEqual(expected);
      expect(expected.message).toBe("`convex env set` exited with code 1");
      expect(expected.output).toBe("partial\n✖ Nope\n");
    }),
  );
});
