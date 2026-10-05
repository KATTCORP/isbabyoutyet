import path from "node:path";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { ConvexCli, ConvexPreviewName, runFunction } from "@workspace/convex-cli";
import { Array as Arr, Console, Effect, FileSystem, Layer, Option, Schema } from "effect";
import { Command, Flag } from "effect/cli";
import { FetchHttpClient, HttpBody, HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import sharp from "sharp";
import { renderBlurDataUrl, renderPageThumbnail, renderPushImage } from "../src/photoDerivatives";
import { HOMEPAGE_DEMO_PHOTO_FILES, HOMEPAGE_DEMO_PHOTO_KEYS } from "../src/homepageDemoFeed";
import type { HomepageDemoPhotoKey } from "../src/homepageDemoFeed";

const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";
const convexPackageDir = path.resolve(import.meta.dirname, "..");
const assetsDir = path.join(convexPackageDir, "assets/homepage-demo");

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

const UploadResponse = Schema.Struct({ storageId: Schema.NonEmptyString });

const postBytes = Effect.fn("postBytes")(function* (opts: { bytes: Buffer; uploadUrl: string }) {
  const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
  const response = yield* client.post(opts.uploadUrl, {
    body: HttpBody.uint8Array(new Uint8Array(opts.bytes), "image/jpeg"),
  });
  const payload = yield* HttpClientResponse.schemaBodyJson(UploadResponse)(response);
  return payload.storageId;
});

/** Storage ids per photo; `refreshAll` with `{}` seeds the fixture text without photos. */
type UploadedPhotos = Partial<
  Record<
    HomepageDemoPhotoKey,
    { blurDataUrl: string; photoId: string; pushImageId: string; thumbnailId: string }
  >
>;

const PhotoUploadUrls = Schema.Array(
  Schema.Struct({ photo: Schema.String, pushImage: Schema.String, thumbnail: Schema.String }),
);

/**
 * Renders every photo while one `convex run` fetches all the upload URLs, then
 * POSTs every render at once.
 * A local backend must outlive this script for the POSTs to land, so run it
 * under `convex dev` (`pnpm dev` does, via `--start`), not a bare `convex run`.
 */
const uploadHomepageDemoPhotos = Effect.gen(function* () {
  const photos = yield* loadPhotosFromDisk;
  const [rendered, uploadUrls] = yield* Effect.all(
    [
      Effect.forEach(
        photos,
        (photo) => renderDerivatives(photo).pipe(Effect.map((renders) => ({ photo, renders }))),
        { concurrency: "unbounded" },
      ),
      runFunction({
        args: { count: photos.length },
        functionName: "homepageDemo:generatePhotoUploadUrls",
        returns: PhotoUploadUrls,
      }),
    ],
    { concurrency: "unbounded" },
  );
  const uploads = Arr.zipWith(rendered, uploadUrls, (item, urls) => ({ ...item, urls }));
  const uploaded = yield* Effect.forEach(
    uploads,
    (upload) =>
      Effect.all(
        {
          blurDataUrl: Effect.succeed(upload.renders.blurDataUrl),
          photoId: postBytes({ bytes: upload.renders.photo, uploadUrl: upload.urls.photo }),
          pushImageId: postBytes({
            bytes: upload.renders.pushImage,
            uploadUrl: upload.urls.pushImage,
          }),
          thumbnailId: postBytes({
            bytes: upload.renders.thumbnail,
            uploadUrl: upload.urls.thumbnail,
          }),
        },
        { concurrency: "unbounded" },
      ).pipe(
        Effect.tap(() => Console.log(`Uploaded ${upload.photo.key} (${upload.photo.filePath})`)),
        Effect.map((ids) => [upload.photo.key, ids] as const),
      ),
    { concurrency: "unbounded" },
  );
  return Object.fromEntries(uploaded);
});

const RefreshResults = Schema.Array(
  Schema.Struct({ babyId: Schema.String, locale: Schema.String, publicId: Schema.String }),
);

const refreshHomepageDemoLocales = Effect.fn("refreshHomepageDemoLocales")(function* (
  photos: UploadedPhotos,
) {
  const results = yield* runFunction({
    args: { photos },
    functionName: "homepageDemo:refreshAll",
    returns: RefreshResults,
  });
  for (const result of results) {
    yield* Console.log(`Homepage demo seeded (${result.locale}): /baby/${result.publicId}`);
  }
});

const isPhotoSetComplete = runFunction({
  args: {},
  functionName: "homepageDemo:hasCompletePhotoSet",
  returns: Schema.Boolean,
});

const attachPhotos = Effect.gen(function* () {
  yield* refreshHomepageDemoLocales(yield* uploadHomepageDemoPhotos);
});

/** Fixture babies + timeline text only — no sharp work or storage uploads. */
export const seedHomepageDemoContent = refreshHomepageDemoLocales({});

/** Resize, upload, and attach homepage demo photos to every locale baby. */
export const seedHomepageDemoPhotos = Effect.gen(function* () {
  if (yield* isPhotoSetComplete) {
    return yield* Console.log("Homepage demo photos already stored — skipping uploads.");
  }
  yield* attachPhotos;
});

/**
 * The fixture text, then the photos, unless the demo is already complete.
 * `photos: "best-effort"` turns a failed photo upload into a warning: the
 * text is seeded by then, and the next run retries the photos.
 */
export const seedHomepageDemo = Effect.fn("seedHomepageDemo")(function* (opts: {
  photos: "best-effort" | "required";
}) {
  if (yield* isPhotoSetComplete) {
    return yield* Console.log("Homepage demo already initialized — daily cron handles resets.");
  }
  yield* seedHomepageDemoContent;
  if (opts.photos === "required") {
    return yield* attachPhotos;
  }
  yield* attachPhotos.pipe(
    Effect.catch((error) =>
      Console.error(
        `⚠️  Homepage demo photos were not stored (${error.message}). The text is seeded; the next run retries the photos.`,
      ),
    ),
  );
});

/** Everything the seeds need on a real machine. */
export const homepageDemoSeedLayer = Layer.mergeAll(
  ConvexCli.layer({ cwd: convexPackageDir }),
  FetchHttpClient.layer,
).pipe(Layer.provideMerge(NodeServices.layer));

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
        onNone: () => seedHomepageDemo({ photos: "required" }),
        onSome: (only) => seeds[only],
      }).pipe(Effect.provideService(ConvexPreviewName, flags.previewName)),
  ).pipe(
    Command.run({ version: "0.0.0" }),
    Effect.provide(homepageDemoSeedLayer),
    NodeRuntime.runMain,
  );
}
