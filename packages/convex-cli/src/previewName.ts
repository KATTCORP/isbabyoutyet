import { Context, Effect, Option } from "effect";

/**
 * The Convex preview deployment that `runFunction`, `listEnv`, and `setEnv`
 * target. `None` leaves the choice to the CLI: `CONVEX_DEPLOYMENT` locally,
 * the deploy key's deployment in CI.
 */
export const ConvexPreviewName = Context.Reference<Option.Option<string>>(
  "@workspace/convex-cli/ConvexPreviewName",
  { defaultValue: Option.none },
);

export const previewNameArgs = Effect.map(
  ConvexPreviewName,
  Option.match({ onNone: () => [], onSome: (name) => ["--preview-name", name] }),
);
