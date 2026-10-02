import path from "node:path";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Layer, Schedule, Schema } from "effect";
import { ConvexCli } from "./convexCli";
import { seedHomepageDemoPhotos } from "./seedHomepageDemo";

const convexPackageDir = path.resolve(import.meta.dirname, "..");
export const HOMEPAGE_DEMO_PHOTOS_PENDING_MARKER = path.join(
  convexPackageDir,
  ".seed-photos-pending.local",
);

class ConvexNotReadyError extends Schema.TaggedError<ConvexNotReadyError>()("ConvexNotReadyError", {
  cause: Schema.Defect(),
}) {
  override get message() {
    return "Timed out waiting for Convex dev backend before seeding homepage photos";
  }
}

class HomepagePhotoSeedError extends Schema.TaggedError<HomepagePhotoSeedError>()(
  "HomepagePhotoSeedError",
  { cause: Schema.Defect() },
) {}

/** Polls a cheap query once a second, for up to 120 attempts, until `convex dev` serves it. */
export const waitForConvexReady = Effect.gen(function* () {
  const convex = yield* ConvexCli;
  yield* convex.run(["run", "homepageDemo:hasCompletePhotoSet", "{}"]).pipe(
    Effect.retry({ schedule: Schedule.spaced("1 second"), times: 119 }),
    Effect.mapError((cause) => new ConvexNotReadyError({ cause })),
  );
});

/** Runs `seedPhotos` once Convex is up, if `seed:mark-photos-pending` left a marker. */
export const seedHomepagePhotosDeferred = Effect.fn("seedHomepagePhotosDeferred")(function* <E, R>(
  seedPhotos: Effect.Effect<unknown, E, R>,
) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(HOMEPAGE_DEMO_PHOTOS_PENDING_MARKER))) {
    return;
  }

  yield* Console.log("Homepage demo photos pending — waiting for Convex dev backend...");
  yield* waitForConvexReady;
  yield* seedPhotos;
  yield* fs.remove(HOMEPAGE_DEMO_PHOTOS_PENDING_MARKER);
  yield* Console.log("Homepage demo photos seeded.");
});

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  seedHomepagePhotosDeferred(
    Effect.tryPromise({
      catch: (cause) => new HomepagePhotoSeedError({ cause }),
      try: () => seedHomepageDemoPhotos({}),
    }),
  ).pipe(
    Effect.provide(ConvexCli.layer.pipe(Layer.provideMerge(NodeServices.layer))),
    NodeRuntime.runMain,
  );
}
