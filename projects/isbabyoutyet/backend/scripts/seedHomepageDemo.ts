import path from "node:path";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Context, Effect, FileSystem, Layer, Option, Schema } from "effect";
import { Command, Flag } from "effect/cli";
import { FetchHttpClient, HttpBody, HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import sharp from "sharp";
import { renderBlurDataUrl, renderPageThumbnail, renderPushImage } from "../src/photoDerivatives";
import {
  HOMEPAGE_DEMO_PHOTO_FILES,
  HOMEPAGE_DEMO_PHOTO_KEYS,
  homepageDemoLocales,
} from "../src/homepageDemoFeed";
import type { HomepageDemoPhotoKey } from "../src/homepageDemoFeed";
import { isConvexPreviewWithoutFunctions } from "../src/previewDeploy";
import { ConvexCli } from "./convexCli";

const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";
const convexPackageDir = path.resolve(import.meta.dirname, "..");
const assetsDir = path.join(convexPackageDir, "assets/homepage-demo");

/** The Convex preview every `convex run` targets; `None` is the default deployment. */
export const ConvexPreviewName = Context.Reference<Option.Option<string>>(
  "@isbabyoutyet/backend/scripts/ConvexPreviewName",
  { defaultValue: Option.none },
);

/** @internal Exported for tests. */
export class ConvexRunOutputError extends Schema.TaggedError<ConvexRunOutputError>()(
  "ConvexRunOutputError",
  { functionName: Schema.String, stdout: Schema.String },
) {
  override get message() {
    return `Could not decode \`convex run ${this.functionName}\` output:\n${this.stdout}`;
  }
}

class GitLfsPullError extends Schema.TaggedError<GitLfsPullError>()("GitLfsPullError", {
  exitCode: Schema.Number,
}) {
  override get message() {
    return `\`git lfs pull\` exited with code ${this.exitCode}`;
  }
}

/** @internal Exported for tests. */
export class LfsPointersError extends Schema.TaggedError<LfsPointersError>()(
  "LfsPointersError",
  {},
) {
  override get message() {
    return "Homepage demo photos are still Git LFS pointers. Enable Git LFS for this checkout (Vercel: Project Settings → Git → Git LFS) and retry.";
  }
}

class ImageProcessingError extends Schema.TaggedError<ImageProcessingError>()(
  "ImageProcessingError",
  { cause: Schema.Defect(), filePath: Schema.String },
) {
  override get message() {
    return `Could not render derivatives of ${this.filePath}`;
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

const convexRun = Effect.fn("convexRun")(function* <S extends Schema.Constraint>(opts: {
  args: object;
  functionName: string;
  returns: S;
}) {
  const convex = yield* ConvexCli;
  const previewName = yield* ConvexPreviewName;
  const stdout = yield* convex.run([
    "run",
    opts.functionName,
    JSON.stringify(opts.args),
    ...Option.match(previewName, { onNone: () => [], onSome: (name) => ["--preview-name", name] }),
  ]);
  const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(opts.returns));
  return yield* Effect.firstSuccessOf(jsonCandidates(stdout).map((line) => decode(line))).pipe(
    Effect.mapError(() => new ConvexRunOutputError({ functionName: opts.functionName, stdout })),
  );
});

const readPhotos = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.forEach(HOMEPAGE_DEMO_PHOTO_KEYS, (key) => {
    const filePath = path.join(assetsDir, HOMEPAGE_DEMO_PHOTO_FILES[key]);
    return fs
      .readFile(filePath)
      .pipe(Effect.map((bytes) => ({ bytes: Buffer.from(bytes), filePath, key })));
  });
});

function isLfsPointer(photo: { bytes: Buffer }) {
  return photo.bytes.subarray(0, LFS_POINTER_PREFIX.length).toString("utf8") === LFS_POINTER_PREFIX;
}

const pullLfsFiles = Effect.gen(function* () {
  yield* Console.log("Git LFS pointer files detected — running git lfs pull");
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make(
      "git",
      ["lfs", "pull", "--include", "projects/isbabyoutyet/backend/assets/homepage-demo/**"],
      { cwd: path.resolve(convexPackageDir, "../../.."), stderr: "inherit", stdout: "inherit" },
    ),
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new GitLfsPullError({ exitCode });
  }
});

const loadPhotosFromDisk = Effect.gen(function* () {
  const photos = yield* readPhotos;
  if (!photos.some(isLfsPointer)) {
    return photos;
  }
  yield* pullLfsFiles;
  const pulled = yield* readPhotos;
  if (pulled.some(isLfsPointer)) {
    return yield* new LfsPointersError();
  }
  return pulled;
});

/** The four sharp renders are independent, so they run at once on libuv's thread pool. */
function renderDerivatives(photo: { bytes: Buffer; filePath: string }) {
  const render = <A>(promise: () => Promise<A>) =>
    Effect.tryPromise({
      catch: (cause) => new ImageProcessingError({ cause, filePath: photo.filePath }),
      try: promise,
    });
  return Effect.all(
    {
      blurDataUrl: render(() => renderBlurDataUrl(photo.bytes)),
      photo: render(() =>
        sharp(photo.bytes)
          .rotate()
          .resize({ fit: "inside", height: 1600, width: 1600, withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer(),
      ),
      pushImage: render(() => renderPushImage(photo.bytes)),
      thumbnail: render(() => renderPageThumbnail(photo.bytes)),
    },
    { concurrency: "unbounded" },
  );
}

function isLoopbackUploadUrl(uploadUrl: string) {
  const hostname = new URL(uploadUrl).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

const UploadResponse = Schema.Struct({ storageId: Schema.NonEmptyString });

const postBytes = Effect.fn("postBytes")(function* (opts: { bytes: Buffer; uploadUrl: string }) {
  const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
  const response = yield* client.post(opts.uploadUrl, {
    body: HttpBody.uint8Array(new Uint8Array(opts.bytes), "image/jpeg"),
  });
  const payload = yield* HttpClientResponse.schemaBodyJson(UploadResponse)(response);
  return payload.storageId;
});

/**
 * POST to the upload URL. A local anonymous backend started by `convex run`
 * dies when that command exits, so its 127.0.0.1:3210 URL refuses the POST;
 * only then store bytes through `storePhoto`. That fallback cannot be used on
 * Linux/Vercel: resized JPEGs exceed Linux MAX_ARG_STRLEN (~128KiB) as a
 * `convex run` argv. Under `pnpm dev`, `convex dev` keeps the backend up.
 */
const uploadBytes = Effect.fn("uploadBytes")(function* (bytes: Buffer) {
  const uploadUrl = yield* convexRun({
    args: {},
    functionName: "homepageDemo:generateUploadUrl",
    returns: Schema.String,
  });
  const post = postBytes({ bytes, uploadUrl });
  if (!isLoopbackUploadUrl(uploadUrl)) {
    return yield* post;
  }
  return yield* post.pipe(
    Effect.catchReason("HttpClientError", "TransportError", () =>
      convexRun({
        args: { bytes: { $bytes: bytes.toString("base64") }, contentType: "image/jpeg" },
        functionName: "homepageDemo:storePhoto",
        returns: Schema.String,
      }),
    ),
  );
});

/** Storage ids per photo; `refresh` with `{}` seeds the fixture text without photos. */
type UploadedPhotos = Partial<
  Record<
    HomepageDemoPhotoKey,
    { blurDataUrl: string; photoId: string; pushImageId: string; thumbnailId: string }
  >
>;

/** Uploads stay one at a time: concurrent `convex run`s would each try to start a local backend. */
const uploadHomepageDemoPhotos = Effect.gen(function* () {
  const photos = yield* loadPhotosFromDisk;
  const uploaded = yield* Effect.forEach(photos, (photo) =>
    Effect.gen(function* () {
      const prepared = yield* renderDerivatives(photo);
      const photoId = yield* uploadBytes(prepared.photo);
      const thumbnailId = yield* uploadBytes(prepared.thumbnail);
      const pushImageId = yield* uploadBytes(prepared.pushImage);
      yield* Console.log(`Uploaded ${photo.key} (${photo.filePath})`);
      const ids = { blurDataUrl: prepared.blurDataUrl, photoId, pushImageId, thumbnailId };
      return [photo.key, ids] as const;
    }),
  );
  return Object.fromEntries(uploaded);
});

const RefreshResult = Schema.Struct({
  babyId: Schema.String,
  locale: Schema.String,
  publicId: Schema.String,
});

const refreshHomepageDemoLocales = Effect.fn("refreshHomepageDemoLocales")(function* (
  photos: UploadedPhotos,
) {
  for (const locale of homepageDemoLocales()) {
    const result = yield* convexRun({
      args: { locale, photos },
      functionName: "homepageDemo:refresh",
      returns: RefreshResult,
    });
    yield* Console.log(`Homepage demo seeded (${locale}): /baby/${result.publicId}`);
  }
});

/** Merge-queue Vercel builds never push Convex, so the preview may have no functions yet. */
const photoSetStatus = convexRun({
  args: {},
  functionName: "homepageDemo:hasCompletePhotoSet",
  returns: Schema.Boolean,
}).pipe(
  Effect.map((complete) => (complete ? ("complete" as const) : ("incomplete" as const))),
  Effect.catchTag("ConvexCliError", (error) =>
    isConvexPreviewWithoutFunctions(error.output)
      ? Effect.succeed("no-functions" as const)
      : Effect.fail(error),
  ),
);

const logNoFunctionsSkip = Console.log(
  "Convex preview has no functions — skipping photo seed (merge-queue skip or missing preview)",
);

/** Fixture babies + timeline text only — no sharp work or storage uploads. */
export const seedHomepageDemoContent = refreshHomepageDemoLocales({});

/** Resize, upload, and attach homepage demo photos to every locale baby. */
export const seedHomepageDemoPhotos = Effect.gen(function* () {
  switch (yield* photoSetStatus) {
    case "complete":
      return yield* Console.log("Homepage demo photos already stored — skipping uploads.");
    case "no-functions":
      return yield* logNoFunctionsSkip;
    case "incomplete":
      break;
  }
  yield* refreshHomepageDemoLocales(yield* uploadHomepageDemoPhotos);
});

export const seedHomepageDemo = Effect.gen(function* () {
  switch (yield* photoSetStatus) {
    case "complete":
      return yield* Console.log("Homepage demo already initialized — daily cron handles resets.");
    case "no-functions":
      return yield* logNoFunctionsSkip;
    case "incomplete":
      break;
  }
  yield* seedHomepageDemoContent;
  yield* seedHomepageDemoPhotos;
});

/** Everything the seeds need on a real machine. */
export const homepageDemoSeedLayer = Layer.mergeAll(ConvexCli.layer, FetchHttpClient.layer).pipe(
  Layer.provideMerge(NodeServices.layer),
);

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  const seeds = { content: seedHomepageDemoContent, photos: seedHomepageDemoPhotos };
  Command.make(
    "seed-homepage-demo",
    {
      only: Flag.Literals("only", ["content", "photos"]).pipe(
        Flag.optional,
        Flag.withDescription("Seed only the fixture text or only the photos (default: both)"),
      ),
      previewName: Flag.String("preview-name").pipe(
        Flag.optional,
        Flag.withDescription("Convex preview deployment to seed"),
      ),
    },
    (flags) =>
      Option.match(flags.only, {
        onNone: () => seedHomepageDemo,
        onSome: (only) => seeds[only],
      }).pipe(Effect.provideService(ConvexPreviewName, flags.previewName)),
  ).pipe(
    Command.run({ version: "0.0.0" }),
    Effect.provide(homepageDemoSeedLayer),
    NodeRuntime.runMain,
  );
}
