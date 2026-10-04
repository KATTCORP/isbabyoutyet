// @vitest-environment node
import { describe, expect, it } from "@effect/vitest";
import { ConvexCliError, ConvexPreviewName, ConvexRunOutputError } from "@workspace/convex-cli";
import type { ConvexCli } from "@workspace/convex-cli";
import { fakeConvexCli as fakeConvexCliFrom } from "@workspace/convex-cli/testing";
import { Effect, FileSystem, Layer, Option, Result, Schema, Sink, Stream } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import type { HttpClientRequest } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { TestConsole } from "effect/testing";
import sharp from "sharp";
import { HOMEPAGE_DEMO_PHOTO_KEYS, homepageDemoLocales } from "../src/homepageDemoFeed";
import { LfsPointersError, seedHomepageDemo, seedHomepageDemoPhotos } from "./seedHomepageDemo";

const UPLOAD_URL = "https://upload.convex.test/api/storage/upload";
const LFS_POINTER = new TextEncoder().encode("version https://git-lfs.github.com/spec/v1\n");
const jpeg = await sharp({
  create: { background: "#f80", channels: 3, height: 16, width: 16 },
})
  .jpeg()
  .toBuffer();

type Reply = (args: ReadonlyArray<string>) => Effect.Effect<string, ConvexCliError>;

/** A `ConvexCli` that answers `convex run <function>` from `replies`, recording every call's args. */
function fakeConvexCli(replies: Partial<Record<string, Reply>>) {
  const convex = fakeConvexCliFrom((call) => {
    const reply = replies[call.args[1] ?? ""];
    return reply ? reply(call.args) : Effect.die(`unexpected convex ${call.args.join(" ")}`);
  });
  const calls = () => convex.calls.map((call) => call.args);
  const callsTo = (functionName: string) => calls().filter((args) => args[1] === functionName);
  return { calls, callsTo, layer: convex.layer };
}

const seedingReplies = {
  "homepageDemo:generateUploadUrl": () => Effect.succeed(JSON.stringify(UPLOAD_URL)),
  "homepageDemo:hasCompletePhotoSet": () => Effect.succeed("false"),
  "homepageDemo:refresh": () =>
    Effect.succeed(JSON.stringify({ babyId: "baby", locale: "en", publicId: "demo" })),
} satisfies Record<string, Reply>;

function cliFailure(stderr: string) {
  return new ConvexCliError({
    command: "run homepageDemo:hasCompletePhotoSet",
    exitCode: 1,
    stderr,
    stdout: "",
  });
}

/** An `HttpClient` that answers each upload with `{ storageId: "upload-<n>" }`. */
function fakeUploads(opts: { reachable: boolean }) {
  const requests: Array<HttpClientRequest.HttpClientRequest> = [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.suspend(() => {
        requests.push(request);
        return opts.reachable
          ? Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json({ storageId: `upload-${requests.length}` }),
              ),
            )
          : Effect.fail(
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  cause: new TypeError("fetch failed"),
                  request,
                }),
              }),
            );
      }),
    ),
  );
  return { layer, requests };
}

/** Serves `files[n]` for the n-th read, then repeats the last one. */
function photoFiles(files: ReadonlyArray<Uint8Array>) {
  let reads = 0;
  return FileSystem.layerNoop({
    readFile: () => Effect.sync(() => files[Math.min(reads++, files.length - 1)] ?? jpeg),
  });
}

function fakeSpawner() {
  const commands: Array<ChildProcess.Command> = [];
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        commands.push(command);
        return ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );
  return { commands, layer };
}

function seed<A, E>(
  program: Effect.Effect<
    A,
    E,
    | ConvexCli
    | FileSystem.FileSystem
    | HttpClient.HttpClient
    | ChildProcessSpawner.ChildProcessSpawner
  >,
  services: {
    convex: Layer.Layer<ConvexCli>;
    files?: Layer.Layer<FileSystem.FileSystem>;
    spawner?: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>;
    uploads?: Layer.Layer<HttpClient.HttpClient>;
  },
) {
  return Effect.gen(function* () {
    const result = yield* Effect.result(program);
    const logs = yield* TestConsole.logLines;
    return { logs, result };
  }).pipe(
    Effect.provideService(ConvexPreviewName, Option.some("pr-123")),
    Effect.provide(
      Layer.mergeAll(
        services.convex,
        services.files ?? photoFiles([jpeg]),
        services.spawner ?? fakeSpawner().layer,
        services.uploads ?? fakeUploads({ reachable: true }).layer,
      ),
    ),
  );
}

const RefreshArgs = Schema.fromJsonString(
  Schema.Struct({
    locale: Schema.String,
    photos: Schema.Record(
      Schema.String,
      Schema.Struct({
        blurDataUrl: Schema.String,
        photoId: Schema.String,
        pushImageId: Schema.String,
        thumbnailId: Schema.String,
      }),
    ),
  }),
);

describe("seedHomepageDemoPhotos", () => {
  it.effect("skips uploads when every photo is already stored", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli({
        "homepageDemo:hasCompletePhotoSet": () => Effect.succeed("[CONVEX Q] log line\ntrue\n"),
      });

      const run = yield* seed(seedHomepageDemoPhotos, { convex: convex.layer });

      expect(run.result).toStrictEqual(Result.succeed(undefined));
      expect(run.logs).toStrictEqual(["Homepage demo photos already stored — skipping uploads."]);
      expect(convex.calls()).toStrictEqual([
        ["run", "homepageDemo:hasCompletePhotoSet", "{}", "--preview-name", "pr-123"],
      ]);
    }),
  );

  it.effect("skips a preview that has no functions yet", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli({
        "homepageDemo:hasCompletePhotoSet": () =>
          Effect.fail(cliFailure("✖ No functions found for this deployment")),
      });

      const run = yield* seed(seedHomepageDemoPhotos, { convex: convex.layer });

      expect(run.result).toStrictEqual(Result.succeed(undefined));
      expect(run.logs).toStrictEqual([
        "Convex preview has no functions — skipping photo seed (merge-queue skip or missing preview)",
      ]);
    }),
  );

  it.effect("fails on any other Convex CLI error", () =>
    Effect.gen(function* () {
      const failure = cliFailure("✖ Network error");
      const convex = fakeConvexCli({
        "homepageDemo:hasCompletePhotoSet": () => Effect.fail(failure),
      });

      const run = yield* seed(seedHomepageDemoPhotos, { convex: convex.layer });

      expect(run.result).toStrictEqual(Result.fail(failure));
    }),
  );

  it.effect("fails with the raw output when `convex run` prints something undecodable", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli({
        "homepageDemo:hasCompletePhotoSet": () => Effect.succeed("maybe"),
      });

      const run = yield* seed(seedHomepageDemoPhotos, { convex: convex.layer });

      expect(run.result).toStrictEqual(
        Result.fail(
          new ConvexRunOutputError({
            functionName: "homepageDemo:hasCompletePhotoSet",
            stdout: "maybe",
          }),
        ),
      );
    }),
  );

  it.effect(
    "uploads three renders per photo, then refreshes every locale with their storage ids",
    () =>
      Effect.gen(function* () {
        const convex = fakeConvexCli(seedingReplies);
        const uploads = fakeUploads({ reachable: true });

        const run = yield* seed(seedHomepageDemoPhotos, {
          convex: convex.layer,
          uploads: uploads.layer,
        });

        expect(run.result).toStrictEqual(Result.succeed(undefined));
        expect(uploads.requests).toHaveLength(HOMEPAGE_DEMO_PHOTO_KEYS.length * 3);
        for (const request of uploads.requests) {
          const contentType = "contentType" in request.body ? request.body.contentType : null;
          expect([request.method, request.url, contentType]).toStrictEqual([
            "POST",
            UPLOAD_URL,
            "image/jpeg",
          ]);
        }
        expect(
          convex.calls().every((args) => args.slice(-2).join(" ") === "--preview-name pr-123"),
        ).toBe(true);

        const refreshes = convex
          .callsTo("homepageDemo:refresh")
          .map((args) => Schema.decodeUnknownSync(RefreshArgs)(args[2]));
        expect(refreshes.map((args) => args.locale)).toStrictEqual(homepageDemoLocales());
        expect(refreshes[0]?.photos.bump).toMatchObject({
          blurDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
          photoId: "upload-1",
          pushImageId: "upload-3",
          thumbnailId: "upload-2",
        });
        expect(Object.keys(refreshes[0]?.photos ?? {})).toStrictEqual([
          ...HOMEPAGE_DEMO_PHOTO_KEYS,
        ]);
        expect(run.logs.filter((line) => String(line).startsWith("Uploaded "))).toHaveLength(
          HOMEPAGE_DEMO_PHOTO_KEYS.length,
        );
      }),
  );

  it.effect("fails when an upload POST cannot reach the backend", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(seedingReplies);

      const run = yield* seed(seedHomepageDemoPhotos, {
        convex: convex.layer,
        uploads: fakeUploads({ reachable: false }).layer,
      });

      const error = Option.getOrThrow(Result.getFailure(run.result));
      expect(HttpClientError.isHttpClientError(error)).toBe(true);
      expect(convex.callsTo("homepageDemo:refresh")).toStrictEqual([]);
    }),
  );

  it.effect("pulls Git LFS objects when the checkout only has pointers", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(seedingReplies);
      const spawner = fakeSpawner();
      const pointers = HOMEPAGE_DEMO_PHOTO_KEYS.map(() => LFS_POINTER);

      const run = yield* seed(seedHomepageDemoPhotos, {
        convex: convex.layer,
        files: photoFiles([...pointers, jpeg]),
        spawner: spawner.layer,
      });

      expect(run.result).toStrictEqual(Result.succeed(undefined));
      expect(
        spawner.commands.map((command) =>
          ChildProcess.isStandardCommand(command)
            ? [command.command, ...command.args.slice(0, 2)]
            : [],
        ),
      ).toStrictEqual([["git", "lfs", "pull"]]);
      expect(run.logs[0]).toBe("Git LFS pointer files detected — running git lfs pull");
    }),
  );

  it.effect("fails when photos are still Git LFS pointers after pulling", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(seedingReplies);

      const run = yield* seed(seedHomepageDemoPhotos, {
        convex: convex.layer,
        files: photoFiles([LFS_POINTER]),
      });

      expect(run.result).toStrictEqual(Result.fail(new LfsPointersError()));
      expect(convex.callsTo("homepageDemo:generateUploadUrl")).toStrictEqual([]);
    }),
  );
});

describe("seedHomepageDemo", () => {
  it.effect("leaves an initialized demo to the daily cron", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli({
        "homepageDemo:hasCompletePhotoSet": () => Effect.succeed("true"),
      });

      const run = yield* seed(seedHomepageDemo, { convex: convex.layer });

      expect(run.logs).toStrictEqual([
        "Homepage demo already initialized — daily cron handles resets.",
      ]);
      expect(convex.calls()).toHaveLength(1);
    }),
  );

  it.effect("seeds the fixture text first, then the photos", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(seedingReplies);

      const run = yield* seed(seedHomepageDemo, { convex: convex.layer });

      expect(run.result).toStrictEqual(Result.succeed(undefined));
      const photoCounts = convex
        .callsTo("homepageDemo:refresh")
        .map((args) => Object.keys(Schema.decodeUnknownSync(RefreshArgs)(args[2]).photos).length);
      const locales = homepageDemoLocales().length;
      expect(photoCounts).toStrictEqual([
        ...Array.from({ length: locales }, () => 0),
        ...Array.from({ length: locales }, () => HOMEPAGE_DEMO_PHOTO_KEYS.length),
      ]);
    }),
  );
});
