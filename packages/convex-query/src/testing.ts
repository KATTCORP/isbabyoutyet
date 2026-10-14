import type { DefaultFunctionArgs, FunctionArgs, FunctionReturnType } from "convex/server";
import { getFunctionName } from "convex/server";
import type { AnyQueryReference, ConvexWatchClient } from "./reader.ts";

type Outcome =
  | { readonly error: unknown; readonly kind: "error" }
  | { readonly kind: "value"; readonly value: unknown };

interface Subscription {
  readonly args: DefaultFunctionArgs;
  readonly listeners: Set<() => void>;
  readonly name: string;
  outcome: Outcome | undefined;
  readonly query: AnyQueryReference;
}

/**
 * A {@link ConvexWatchClient} over any async query runner (an in-memory
 * backend such as `convex-test`), for tests. Like `ConvexReactClient`, one
 * subscription serves every watch of the same query and args, starting with
 * the first `onUpdate` and ending with the last unsubscribe. `refresh()`
 * re-runs every subscription, as the server would after a mutation.
 */
export function makeTestConvexClient(
  run: (
    query: AnyQueryReference,
    args: FunctionArgs<AnyQueryReference>,
  ) => Promise<FunctionReturnType<AnyQueryReference>>,
) {
  const subscriptions = new Map<string, Subscription>();

  const load = async (subscription: Subscription) => {
    try {
      subscription.outcome = {
        kind: "value",
        value: await run(subscription.query, subscription.args),
      };
    } catch (error) {
      subscription.outcome = { error, kind: "error" };
    }
    for (const listener of subscription.listeners) {
      listener();
    }
  };

  const client: ConvexWatchClient = {
    watchQuery: (query, args) => {
      const name = getFunctionName(query);
      const id = JSON.stringify([name, args]);
      return {
        localQueryResult: () => {
          const outcome = subscriptions.get(id)?.outcome;
          if (outcome?.kind === "error") {
            throw outcome.error;
          }
          return outcome?.value;
        },
        onUpdate: (callback) => {
          let subscription = subscriptions.get(id);
          if (!subscription) {
            subscription = { args, listeners: new Set(), name, outcome: undefined, query };
            subscriptions.set(id, subscription);
            void load(subscription);
          }
          const active = subscription;
          active.listeners.add(callback);
          return () => {
            active.listeners.delete(callback);
            if (active.listeners.size === 0 && subscriptions.get(id) === active) {
              subscriptions.delete(id);
            }
          };
        },
      };
    },
  };

  return {
    client,
    /** Re-run every live subscription and notify its watchers. */
    refresh: async () => {
      await Promise.all([...subscriptions.values()].map(load));
    },
    /** The queries and args currently subscribed. */
    subscriptions: () =>
      [...subscriptions.values()].map((subscription) => ({
        args: subscription.args,
        name: subscription.name,
      })),
  };
}
