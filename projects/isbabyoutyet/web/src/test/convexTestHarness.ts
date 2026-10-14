import { QueryClient } from "@raf-query/react";
import { connectConvexLive, ConvexReader } from "@workspace/convex-query";
import type { ConvexWatchClient } from "@workspace/convex-query";
import { makeTestConvexClient } from "@workspace/convex-query/testing";
import { convexTest } from "convex-test";
import type { FunctionReference, UserIdentity } from "convex/server";
import type { Value } from "convex/values";
import schema from "@isbabyoutyet/backend/convex/schema";
import { makeAsyncResource } from "@isbabyoutyet/backend/convex/test.resource";
import { modules, registerComponents } from "@isbabyoutyet/backend/convex/test.setup";
import { stubJsdomWindow } from "@/test/stubJsdomWindow";

type ConvexTestRoot = ReturnType<typeof convexTest>;
type ConvexTestCaller = ConvexTestRoot | ReturnType<ConvexTestRoot["withIdentity"]>;

type ConvexQueryRef = FunctionReference<"query">;
type ConvexMutationRef = FunctionReference<"mutation">;
type ConvexActionRef = FunctionReference<"action">;
type ConvexAuthTokenFetcher = () => Promise<string | null | undefined>;

type ConvexCallerQuery = <TArgs>(query: ConvexQueryRef, args: TArgs) => Promise<Value>;
type ConvexCallerMutation = <TArgs>(mutation: ConvexMutationRef, args: TArgs) => Promise<Value>;
type ConvexCallerAction = <TArgs>(action: ConvexActionRef, args: TArgs) => Promise<Value>;

export type IntegrationConvexClient = ConvexWatchClient & {
  action: ConvexCallerAction;
  clearAuth: () => void;
  mutation: ConvexCallerMutation;
  query: ConvexCallerQuery;
  setAuth: (fetchToken: ConvexAuthTokenFetcher, onChange: (authenticated: boolean) => void) => void;
};

export type ConvexTestHarness = {
  client: ConvexTestCaller;
  convexClient: IntegrationConvexClient;
  queryClient: QueryClient<ConvexReader>;
  /** Re-run every live query, as the server would after a write made through `client`. */
  refresh: () => Promise<void>;
  t: ConvexTestRoot;
  /** Switch the active caller on the shared in-memory backend. */
  withIdentity: (identity: Partial<UserIdentity> | null) => Promise<ConvexTestHarness>;
};

/**
 * Boots a shared in-memory Convex backend (`convex-test`) and wires it into the
 * same raf-query + live Convex stack production uses — no `vi.mock("convex/*")`,
 * no hand-built query results. Mutations, actions and identity switches re-run
 * every live query before they resolve, as the server pushes new results.
 */
export async function createConvexTestHarness(opts: { identity: Partial<UserIdentity> | null }) {
  const jsdomWindow = stubJsdomWindow();
  const t = convexTest(schema, modules);
  await registerComponents(t);
  let activeClient: ConvexTestCaller = opts.identity ? t.withIdentity(opts.identity) : t;

  function runQuery<TArgs>(query: ConvexQueryRef, args: TArgs) {
    // SAFETY: convex-test caller methods are generic over FunctionReference.
    return (activeClient.query as ConvexCallerQuery)(query, args);
  }

  function runMutation<TArgs>(mutation: ConvexMutationRef, args: TArgs) {
    // SAFETY: convex-test caller methods are generic over FunctionReference.
    return (activeClient.mutation as ConvexCallerMutation)(mutation, args);
  }

  function runAction<TArgs>(action: ConvexActionRef, args: TArgs) {
    // SAFETY: convex-test caller methods are generic over FunctionReference.
    return (activeClient.action as ConvexCallerAction)(action, args);
  }

  const backend = makeTestConvexClient(runQuery);

  const convexClient: IntegrationConvexClient = {
    action: async (action, args) => {
      const result = await runAction(action, args);
      await backend.refresh();
      return result;
    },
    clearAuth: () => {},
    mutation: async (mutation, args) => {
      const result = await runMutation(mutation, args);
      await backend.refresh();
      return result;
    },
    query: runQuery,
    setAuth: (_fetchToken, onChange) => {
      onChange(opts.identity !== null);
    },
    watchQuery: backend.client.watchQuery,
  };

  const queryClient = new QueryClient({
    isServer: false,
    layer: ConvexReader.layerWatch(backend.client),
  });
  const disconnect = connectConvexLive({ client: backend.client, queryClient });

  const harness: ConvexTestHarness = {
    get client() {
      return activeClient;
    },
    convexClient,
    queryClient,
    refresh: backend.refresh,
    get t() {
      return t;
    },
    async withIdentity(identity) {
      activeClient = identity ? t.withIdentity(identity) : t;
      await backend.refresh();
      return harness;
    },
  };

  return makeAsyncResource(harness, async () => {
    // Photo mutations schedule sharp thumbnail actions; let them finish while
    // the module graph is still alive instead of after environment teardown.
    await t.finishAllScheduledFunctions(() => {});
    disconnect();
    await queryClient.dispose();
    jsdomWindow.restore();
  });
}
