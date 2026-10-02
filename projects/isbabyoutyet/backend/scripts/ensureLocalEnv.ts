import path from "node:path";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import webPush from "web-push";
import {
  parseConvexEnvList,
  staticLocalConvexEnvUpdates,
  vapidKeysAreSet,
} from "../src/localDevEnv";
import { ConvexCli } from "./convexCli";

export const ensureLocalConvexEnv = Effect.gen(function* () {
  const convex = yield* ConvexCli;
  const existing = parseConvexEnvList(yield* convex.run(["env", "list"]));
  const updates = staticLocalConvexEnvUpdates(existing);

  if (!vapidKeysAreSet(existing)) {
    const vapid = webPush.generateVAPIDKeys();
    updates.VAPID_PUBLIC_KEY = vapid.publicKey;
    updates.VAPID_PRIVATE_KEY = vapid.privateKey;
  }

  const entries = Object.entries(updates);
  if (entries.length === 0) {
    yield* Console.log("Convex env already has the required local values.");
    return;
  }

  for (const [key, value] of entries) {
    yield* Console.log(`convex env set ${key}`);
    yield* convex.run(["env", "set", key, value]);
  }
});

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  ensureLocalConvexEnv.pipe(
    Effect.provide(ConvexCli.layer.pipe(Layer.provide(NodeServices.layer))),
    NodeRuntime.runMain,
  );
}
