import path from "node:path";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { ConvexCli, listEnv, setEnv } from "@workspace/convex-cli";
import { Console, Effect, Layer } from "effect";
import webPush from "web-push";
import { staticLocalConvexEnvUpdates, vapidKeysAreSet } from "../src/localDevEnv";

const convexPackageDir = path.resolve(import.meta.dirname, "..");

export const ensureLocalConvexEnv = Effect.gen(function* () {
  const existing = yield* listEnv;
  const updates = staticLocalConvexEnvUpdates(existing);

  if (!vapidKeysAreSet(existing)) {
    const vapid = webPush.generateVAPIDKeys();
    updates.VAPID_PUBLIC_KEY = vapid.publicKey;
    updates.VAPID_PRIVATE_KEY = vapid.privateKey;
  }

  if (Object.keys(updates).length === 0) {
    yield* Console.log("Convex env already has the required local values.");
    return;
  }
  yield* setEnv(updates);
});

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  ensureLocalConvexEnv.pipe(
    Effect.provide(
      ConvexCli.layer({ cwd: convexPackageDir }).pipe(Layer.provide(NodeServices.layer)),
    ),
    NodeRuntime.runMain,
  );
}
