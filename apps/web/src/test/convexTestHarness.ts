import type { ConvexQueryClient } from "@convex-dev/react-query";
import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";
import { QueryClient as QueryClientImpl } from "@tanstack/react-query";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, SchemaDefinition, UserIdentity } from "convex/server";
import type { Value } from "convex/values";
import {
  CONVEX_INFINITE_QUERY_KEY,
  convexInfiniteQueryFn,
  getConvexQueryPreloader,
  registerConvexInfiniteQueryClient,
} from "@workspace/convex-prefetch";
import { createAuth } from "@workspace/convex/convex/auth";
import schema from "@workspace/convex/convex/schema";
import { makeAsyncResource } from "@workspace/convex/convex/test.resource";
import { modules, registerComponents } from "@workspace/convex/convex/test.setup";
import { isPlainObject, isString } from "@workspace/runtime/guards";
import { installFetchHandler, stubJsdomWindow } from "@/test/stubJsdomWindow";

type SchemaTables =
  typeof schema extends SchemaDefinition<infer TTables, boolean> ? TTables : never;
/** Schema-typed so `t.run` / `t.action` callbacks can hand `ctx` to `createAuth`. */
type ConvexTestRoot = ReturnType<typeof convexTest<SchemaTables>>;
type ConvexTestCaller = ConvexTestRoot | ReturnType<ConvexTestRoot["withIdentity"]>;

type WatchQueryHandle = {
  localQueryResult: () => Value | undefined;
  onUpdate: (cb: () => void) => void;
};

type ConvexQueryRef = FunctionReference<"query">;
type ConvexMutationRef = FunctionReference<"mutation">;
type ConvexActionRef = FunctionReference<"action">;
type ConvexAuthTokenFetcher = (opts: {
  forceRefreshToken: boolean;
}) => Promise<string | null | undefined>;

type ConvexCallerQuery = <TArgs>(query: ConvexQueryRef, args: TArgs) => Promise<Value>;
type ConvexCallerMutation = <TArgs>(mutation: ConvexMutationRef, args: TArgs) => Promise<Value>;
type ConvexCallerAction = <TArgs>(action: ConvexActionRef, args: TArgs) => Promise<Value>;

export type IntegrationConvexClient = {
  action: ConvexCallerAction;
  clearAuth: () => void;
  mutation: ConvexCallerMutation;
  query: ConvexCallerQuery;
  setAuth: (
    fetchToken: ConvexAuthTokenFetcher,
    onChange: ((authenticated: boolean) => void) | undefined,
  ) => void;
  watchQuery: <TArgs>(query: ConvexQueryRef, args: TArgs) => WatchQueryHandle;
};

const AUTH_ROUTE_PREFIX = "/api/auth/";

/** `sub` of an unverified JWT — the Better Auth user id the Convex plugin minted it for. */
function jwtSubject(token: string) {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
    return isPlainObject(parsed) && isString(parsed.sub) ? parsed.sub : null;
  } catch {
    return null;
  }
}

export type ConvexTestHarness = {
  client: ConvexTestCaller;
  convexClient: IntegrationConvexClient;
  convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
  convexQueryClient: ConvexQueryClient;
  queryClient: QueryClient;
  t: ConvexTestRoot;
  /** Switch the active caller on the shared in-memory backend. */
  withIdentity: (identity: Partial<UserIdentity> | null) => ConvexTestHarness;
};

/**
 * Boots a shared in-memory Convex backend (`convex-test`) and wires it into the
 * same React Query + prefetch stack production uses — no `vi.mock("convex/*")`,
 * no hand-built query results.
 *
 * `/api/auth/*` is served by the real Better Auth handler (`createAuth`) on the
 * same backend, and a successful sign-in / sign-up flips the backend identity
 * exactly the way production does: the client hands the Convex JWT from the
 * response to `setAuth`, and the harness reads its `sub`. Tests can therefore
 * mount a route "as is" and submit its real form.
 */
export async function createConvexTestHarness(opts: { identity: Partial<UserIdentity> | null }) {
  const jsdomWindow = stubJsdomWindow();
  const t = convexTest(schema, modules);
  await registerComponents(t);
  let activeClient: ConvexTestCaller = opts.identity ? t.withIdentity(opts.identity) : t;

  const authRoutes = installFetchHandler(async (request) => {
    if (!new URL(request.url).pathname.startsWith(AUTH_ROUTE_PREFIX)) {
      return null;
    }
    // Production serves these from a Convex HTTP action, so run the handler in
    // an action ctx (password-reset mail delivery insists on one).
    const served = await t.action(async (ctx) => {
      const response = await createAuth(ctx).handler(request);
      return {
        body: await response.text(),
        headers: [...response.headers.entries()],
        status: response.status,
      };
    });
    return new Response(served.body, { headers: served.headers, status: served.status });
  });

  const watchCache = new Map<object, Map<string, Value>>();
  let queryClientForInvalidation: QueryClient | null = null;

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

  function invalidateConvexQueries() {
    if (!queryClientForInvalidation) {
      return;
    }
    void queryClientForInvalidation.invalidateQueries({ queryKey: ["convexQuery"] });
    void queryClientForInvalidation.invalidateQueries({ queryKey: [CONVEX_INFINITE_QUERY_KEY] });
    for (const queryCache of watchCache.values()) {
      queryCache.clear();
    }
  }

  const convexClient: IntegrationConvexClient = {
    action: async (action, args) => {
      const result = await runAction(action, args);
      invalidateConvexQueries();
      return result;
    },
    clearAuth: () => {
      harness.withIdentity(null);
    },
    mutation: async (mutation, args) => {
      const result = await runMutation(mutation, args);
      invalidateConvexQueries();
      return result;
    },
    query: runQuery,
    setAuth: (fetchToken, onChange) => {
      void fetchToken({ forceRefreshToken: false }).then((token) => {
        const subject = token ? jwtSubject(token) : null;
        harness.withIdentity(subject === null ? null : { subject });
        onChange?.(subject !== null);
      });
    },
    watchQuery: (query, args) => {
      // SAFETY: Test fixture is a subset of the production type.
      let queryCache = watchCache.get(query as object);
      if (!queryCache) {
        queryCache = new Map<string, Value>();
        // SAFETY: Test fixture is a subset of the production type.
        watchCache.set(query as object, queryCache);
      }
      const argsKey = JSON.stringify(args ?? {});
      let subscriber: (() => void) | null = null;
      void runQuery(query, args ?? {}).then((result) => {
        queryCache.set(argsKey, result);
        subscriber?.();
      });
      return {
        localQueryResult: () => queryCache.get(argsKey),
        onUpdate: (cb) => {
          subscriber = cb;
          return () => {
            subscriber = null;
          };
        },
      };
    },
  };

  const convexQueryClientFields = {
    connect: (nextQueryClient: QueryClient) => {
      queryClientForInvalidation = nextQueryClient;
    },
    convexClient,
    hashFn: () => JSON.stringify,
    queryFn: () => Promise.resolve(null),
    // Same key shape as production so the QueryClient's default queryFn (below)
    // resolves it against convex-test. `waitForMe` observes `profile.get` this way.
    queryOptions: <TArgs>(query: ConvexQueryRef, args: TArgs) => ({
      // SAFETY: convexQuery is generic over FunctionReference; only the key is used.
      queryKey: convexQuery(query, args as never).queryKey,
    }),
    serverHttpClient: undefined,
  } as const;
  // @ts-expect-error — stand-in only implements the members this harness reads
  const convexQueryClient: ConvexQueryClient = convexQueryClientFields;

  registerConvexInfiniteQueryClient(convexQueryClient);

  const queryClient = new QueryClientImpl({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        queryFn: createIntegrationQueryFn(() => activeClient, convexQueryClient),
        retry: false,
        staleTime: 0,
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const harness: ConvexTestHarness = {
    get client() {
      return activeClient;
    },
    convexClient,
    convexPreloader: getConvexQueryPreloader(queryClient),
    convexQueryClient,
    queryClient,
    get t() {
      return t;
    },
    withIdentity(identity) {
      activeClient = identity ? t.withIdentity(identity) : t;
      invalidateConvexQueries();
      return harness;
    },
  };

  return makeAsyncResource(harness, async () => {
    // @ts-expect-error — teardown clears the registered client
    registerConvexInfiniteQueryClient(null);
    queryClient.clear();
    authRoutes.release();
    jsdomWindow.restore();
  });
}

function createIntegrationQueryFn(
  getClient: () => ConvexTestCaller,
  convexQueryClient: ConvexQueryClient,
) {
  const infiniteQueryFn = convexInfiniteQueryFn(convexQueryClient);

  return async (context: QueryFunctionContext) => {
    const tag = context.queryKey[0];
    const funcName = parseQueryKeyString(context.queryKey[1]);
    const caller = getClient();
    if (tag === "convexQuery" && funcName !== null) {
      const args = context.queryKey[2] ?? {};
      // SAFETY: convex-test caller methods are generic over FunctionReference.
      return await (caller.query as ConvexCallerQuery)(
        makeFunctionReference<"query">(funcName),
        args,
      );
    }
    if (tag === "convexAction" && funcName !== null) {
      const args = context.queryKey[2] ?? {};
      // SAFETY: convex-test caller methods are generic over FunctionReference.
      return await (caller.action as ConvexCallerAction)(
        makeFunctionReference<"action">(funcName),
        args,
      );
    }
    if (tag === CONVEX_INFINITE_QUERY_KEY) {
      // SAFETY: Test fixture is a subset of the production type.
      return await infiniteQueryFn(context as Parameters<typeof infiniteQueryFn>[0]);
    }
    return undefined;
  };
}

function parseQueryKeyString(value: QueryFunctionContext["queryKey"][number]) {
  if (
    value === null ||
    value === undefined ||
    value === true ||
    value === false ||
    Array.isArray(value) ||
    isPlainObject(value)
  ) {
    return null;
  }
  if (!isString(value)) {
    return null;
  }
  return value;
}
