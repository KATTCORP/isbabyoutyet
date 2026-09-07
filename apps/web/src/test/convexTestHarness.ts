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
} from "@workspace/convex-prefetch";
import { CookieJar } from "tough-cookie";
import schema from "@workspace/convex/convex/schema";
import { makeAsyncResource } from "@workspace/convex/convex/test.resource";
import { modules, registerComponents } from "@workspace/convex/convex/test.setup";
import { isPlainObject, isString } from "@workspace/runtime/guards";
import { stubJsdomWindow } from "@/test/stubJsdomWindow";
import { installFetchHandler } from "@/test/testFetch";

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

/**
 * `sub` of a JWT the real Better Auth handler just minted. Deliberately
 * unverified: convex-test's `withIdentity` cannot reproduce Convex's JWKS
 * check anyway, so this is identity plumbing, not security coverage.
 */
function jwtSubject(token: string) {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return isPlainObject(parsed) && isString(parsed.sub) ? parsed.sub : null;
  } catch {
    return null;
  }
}

function hasRequestBody(method: string) {
  return method !== "GET" && method !== "HEAD";
}

export type ConvexTestHarness = {
  client: ConvexTestCaller;
  convexClient: IntegrationConvexClient;
  convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
  convexQueryClient: ConvexQueryClient;
  /** The "browser's" cookies for `/api/auth/*` — Better Auth's session lives here. */
  cookieJar: CookieJar;
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
 * `/api/auth/*` requests from the real auth client are routed into the
 * backend's HTTP router (`t.fetch` → `http.ts` → Better Auth), with the
 * harness playing the browser: it keeps the session cookies in
 * {@link ConvexTestHarness.cookieJar} and, after a successful write, refetches
 * live queries the way production's Convex subscription would push them.
 * A sign-in / sign-up flips the backend identity exactly as in production —
 * the client hands the Convex JWT from the response to `setAuth`, and the
 * harness reads its `sub`. Tests can therefore mount a route "as is" and
 * submit its real form.
 */
export async function createConvexTestHarness(opts: { identity: Partial<UserIdentity> | null }) {
  const jsdomWindow = stubJsdomWindow();
  const t = convexTest(schema, modules);
  await registerComponents(t);
  let activeClient: ConvexTestCaller = opts.identity ? t.withIdentity(opts.identity) : t;

  const watchCache = new Map<object, Map<string, Value>>();
  let queryClientForInvalidation: QueryClient | null = null;

  const cookieJar = new CookieJar();
  const authRoutes = installFetchHandler(async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(AUTH_ROUTE_PREFIX)) {
      return null;
    }
    const headers = new Headers(request.headers);
    const cookie = await cookieJar.getCookieString(request.url);
    if (cookie) {
      headers.set("cookie", cookie);
    }
    const response = await t.fetch(`${url.pathname}${url.search}`, {
      body: hasRequestBody(request.method) ? await request.arrayBuffer() : undefined,
      headers,
      method: request.method,
    });
    for (const setCookie of response.headers.getSetCookie()) {
      await cookieJar.setCookie(setCookie, request.url, { ignoreError: true });
    }
    if (response.ok && hasRequestBody(request.method)) {
      // Reactivity emulation: convex-test has no websocket push, so refetch
      // what a Better Auth write (name change, sign-out, …) would have updated.
      invalidateConvexQueries();
    }
    return response;
  });

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
    cookieJar,
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
