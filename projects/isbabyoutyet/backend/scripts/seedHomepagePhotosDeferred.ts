import path from "node:path";
import { NodeRuntime } from "@effect/platform-node";
import { ConvexCli } from "@workspace/convex-cli";
import { Console, Effect, FileSystem, Schedule, Schema } from "effect";
import { homepageDemoSeedLayer, seedHomepageDemoPhotos } from "./seedHomepageDemo";

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
  seedHomepagePhotosDeferred(seedHomepageDemoPhotos).pipe(
    Effect.provide(homepageDemoSeedLayer),
    NodeRuntime.runMain,
  );
}
