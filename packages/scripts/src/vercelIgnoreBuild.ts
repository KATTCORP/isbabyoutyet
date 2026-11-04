/**
 * Vercel `ignoreCommand` for a `projects/<name>/web` deploy, run from the
 * project's Root Directory: exit 0 skips the deploy, exit 1 builds.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Exit, Layer } from "effect";
import { BUILD, Git, SKIP, vercelIgnore } from "./vercelIgnore.ts";

vercelIgnore.pipe(
  Effect.provide(Git.layer.pipe(Layer.provideMerge(NodeServices.layer))),
  NodeRuntime.runMain({
    // Anything but a clean skip builds, including a layer that fails to start.
    teardown: (exit, onExit) => {
      onExit(Exit.isSuccess(exit) && exit.value === SKIP ? SKIP : BUILD);
    },
  }),
);
