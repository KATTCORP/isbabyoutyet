import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { FunctionArgs } from "convex/server";
import { convexInfiniteQuery } from "./convexInfiniteQuery.js";
import type { PaginatedQueryReference, PaginationArgs } from "./convexInfiniteQuery.js";
import type {
  InitiatedConvexInfiniteQuery,
  InitiatedConvexQuery,
  PreloadedConvexInfiniteQuery,
  PreloadedConvexQuery,
  QueryReference,
} from "./handles.js";

function noop(): void {}

/**
 * Awaits Convex queries in a route loader and returns serializable handles.
 * The Convex function reference IS the interface — no per-query factory:
 *
 * @example
 * // Created once in getRouter() and passed on router context as convexPreloader.
 * loader: async (opts) => {
 *   const preloader = opts.context.convexPreloader;
 *   return await allKeyed({
 *     profile: preloader.ensureQueryData(api.profile.get, {}),
 *     timeline: preloader.ensureInfiniteQueryData(api.timeline.listByBaby, {
 *       args: { babyId },
 *       numItems: 20,
 *     }),
 *   });
 * };
 *
 * function Page() {
 *   const loaderData = Route.useLoaderData();
 *   const profileQuery = usePreloadedConvexQuery(api.profile.get, loaderData.profile);
 *   // ...
 * }
 */
export type ConvexQueryPreloader = ReturnType<typeof getConvexQueryPreloader>;

export function getConvexQueryPreloader(queryClient: QueryClient) {
  return {
    /** Awaits a Convex query and returns a {@link PreloadedConvexQuery} handle. */
    async ensureQueryData<TQuery extends QueryReference>(
      funcRef: TQuery,
      args: FunctionArgs<TQuery>,
    ): Promise<PreloadedConvexQuery<TQuery>> {
      const options = convexQuery(funcRef, args);
      const initialData = await queryClient.query({ ...options, staleTime: "static" });
      return { initialData, input: args };
    },

    /**
     * Fetches a Convex query even when the TanStack cache already has data and
     * returns a {@link PreloadedConvexQuery} handle with the fresh snapshot.
     */
    async fetchQueryData<TQuery extends QueryReference>(
      funcRef: TQuery,
      args: FunctionArgs<TQuery>,
    ): Promise<PreloadedConvexQuery<TQuery>> {
      const options = convexQuery(funcRef, args);
      const initialData = await queryClient.query({
        ...options,
        staleTime: 0,
      });
      return { initialData, input: args };
    },

    /**
     * Awaits the first page of a paginated Convex query and returns a
     * {@link PreloadedConvexInfiniteQuery} handle.
     */
    async ensureInfiniteQueryData<TQuery extends PaginatedQueryReference>(
      funcRef: TQuery,
      opts: {
        args: PaginationArgs<TQuery>;
        numItems: number;
      },
    ): Promise<PreloadedConvexInfiniteQuery<TQuery>> {
      const options = convexInfiniteQuery(funcRef, {
        args: opts.args,
        initialNumItems: opts.numItems,
      });
      const initialData = await queryClient.infiniteQuery({ ...options, staleTime: "static" });
      return {
        initialData,
        input: opts.args,
        numItems: opts.numItems,
      };
    },

    /**
     * Starts a Convex query WITHOUT awaiting it and returns an
     * {@link InitiatedConvexQuery} handle — the suspense read site blocks
     * instead of the loader. Use on client navigations so they commit
     * immediately; SSR should keep awaiting via `ensureQueryData` so the
     * first paint is complete.
     */
    initiateQueryData<TQuery extends QueryReference>(
      funcRef: TQuery,
      args: FunctionArgs<TQuery>,
    ): InitiatedConvexQuery<TQuery> {
      const options = convexQuery(funcRef, args);
      queryClient.query(options).catch(noop);
      return { input: args };
    },

    /**
     * Starts the first page of a paginated Convex query WITHOUT awaiting it
     * and returns an {@link InitiatedConvexInfiniteQuery} handle.
     */
    initiateInfiniteQueryData<TQuery extends PaginatedQueryReference>(
      funcRef: TQuery,
      opts: {
        args: PaginationArgs<TQuery>;
        numItems: number;
      },
    ): InitiatedConvexInfiniteQuery<TQuery> {
      const options = convexInfiniteQuery(funcRef, {
        args: opts.args,
        initialNumItems: opts.numItems,
      });
      queryClient.infiniteQuery(options).catch(noop);
      return { input: opts.args, numItems: opts.numItems };
    },
  };
}
