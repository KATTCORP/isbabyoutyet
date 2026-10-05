import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
} from "convex/server";
import type { InfiniteData } from "@tanstack/react-query";
import type { PaginatedQueryReference, PaginationArgs } from "./convexInfiniteQuery.js";

declare const convexQueryBrand: unique symbol;
declare const convexInfiniteQueryBrand: unique symbol;

/** Public Convex query function reference. */
export type QueryReference = FunctionReference<"query", "public">;

/**
 * Convex 1.46 added `_fn` on {@link FunctionReference} for stricter callback
 * checking. That slot is a function type, so branding handles with the full
 * reference makes TanStack Start reject loader data as non-serializable.
 * Brand with everything except `_fn` (type-only; runtime values stay plain).
 */
type SerializableFunctionReferenceBrand<TQuery extends FunctionReference<any, any>> = Omit<
  TQuery,
  "_fn"
>;

/**
 * Fire-and-forget handle for a Convex query started in a loader (or during
 * render via {@link useInitiateConvexQuery}). Serializable: stores only the
 * function args; the brand is type-only.
 */
export interface InitiatedConvexQuery<TQuery extends QueryReference> {
  readonly [convexQueryBrand]?: SerializableFunctionReferenceBrand<TQuery>;
  readonly input: FunctionArgs<TQuery>;
}

/** Awaited loader handle for a Convex query; carries `initialData`. */
export interface PreloadedConvexQuery<
  TQuery extends QueryReference,
> extends InitiatedConvexQuery<TQuery> {
  readonly initialData: FunctionReturnType<TQuery>;
}

/**
 * Fire-and-forget handle for a paginated Convex query. `numItems` is stored so
 * the read site can rebuild the same `initialPageParam` without re-declaring
 * the page size.
 */
export interface InitiatedConvexInfiniteQuery<TQuery extends PaginatedQueryReference> {
  readonly [convexInfiniteQueryBrand]?: SerializableFunctionReferenceBrand<TQuery>;
  readonly input: PaginationArgs<TQuery>;
  readonly numItems: number;
}

/** Awaited loader handle for a paginated Convex query. */
export interface PreloadedConvexInfiniteQuery<
  TQuery extends PaginatedQueryReference,
> extends InitiatedConvexInfiniteQuery<TQuery> {
  readonly initialData: InfiniteData<FunctionReturnType<TQuery>, PaginationOptions>;
}
