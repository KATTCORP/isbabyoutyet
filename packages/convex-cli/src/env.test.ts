import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Redacted } from "effect";
import { TestConsole } from "effect/testing";
import { ConvexEnvEncodingError, listEnv, setEnv } from "./env";
import { ConvexPreviewName } from "./previewName";
import { fakeConvexCli } from "./testing";

describe("listEnv", () => {
  it.effect("parses the dotenv lines `convex env list` prints", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() =>
        Effect.succeed("SITE_URL=https://example.com\nMOTD='hello # world'\nPEM='a\nb'\n"),
      );

      const env = yield* listEnv.pipe(Effect.provide(convex.layer));

      expect(env).toStrictEqual({
        MOTD: "hello # world",
        PEM: "a\nb",
        SITE_URL: "https://example.com",
      });
      expect(convex.calls).toStrictEqual([{ args: ["env", "list"], stdin: undefined }]);
    }),
  );
});

describe("setEnv", () => {
  it.effect("sets every variable in one call, with values on stdin and names in the log", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed(""));

      yield* setEnv({
        BETTER_AUTH_SECRET: Redacted.make("s3cr3t $HOME #1"),
        SITE_URL: "https://pr-123.example.com",
      }).pipe(
        Effect.provideService(ConvexPreviewName, Option.some("pr-123")),
        Effect.provide(convex.layer),
      );

      expect(convex.calls).toStrictEqual([
        {
          args: ["env", "set", "--force", "--preview-name", "pr-123"],
          stdin: "BETTER_AUTH_SECRET='s3cr3t $HOME #1'\nSITE_URL='https://pr-123.example.com'\n",
        },
      ]);
      expect(yield* TestConsole.logLines).toStrictEqual([
        "convex env set BETTER_AUTH_SECRET SITE_URL",
      ]);
    }),
  );

  it.effect("falls back to double quotes for a quote before a newline", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed(""));

      yield* setEnv({ MOTD: "it's\nfine" }).pipe(Effect.provide(convex.layer));

      expect(convex.calls[0]?.stdin).toBe('MOTD="it\'s\nfine"\n');
    }),
  );

  it.effect("skips the CLI when there is nothing to set", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed(""));

      yield* setEnv({}).pipe(Effect.provide(convex.layer));

      expect(convex.calls).toStrictEqual([]);
    }),
  );

  it.effect("refuses values that dotenv would change, naming only the variable", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed(""));

      const error = yield* setEnv({
        CRLF: Redacted.make("line one\r\nline two"),
        FINE: "plain",
      }).pipe(Effect.flip, Effect.provide(convex.layer));

      expect(error).toStrictEqual(new ConvexEnvEncodingError({ names: ["CRLF"] }));
      expect(error.message).not.toContain("line");
      expect(convex.calls).toStrictEqual([]);
    }),
  );
});
