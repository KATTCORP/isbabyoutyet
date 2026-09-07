export {
  CONVEX_INFINITE_QUERY_KEY,
  convexInfiniteQuery,
  convexInfiniteQueryFn,
  type PaginatedQueryReference,
  type PaginationArgs,
} from "./convexInfiniteQuery.js";

export type {
  InitiatedConvexInfiniteQuery,
  InitiatedConvexQuery,
  PreloadedConvexInfiniteQuery,
  PreloadedConvexQuery,
  QueryReference,
} from "./handles.js";

export { getConvexQueryPreloader, type ConvexQueryPreloader } from "./preloader.js";
export {
  preloadedConvexQueryOptions,
  useInitiateConvexQuery,
  usePreloadedConvexQuery,
} from "./usePreloadedConvexQuery.js";
export { usePreloadedConvexInfiniteQuery } from "./usePreloadedConvexInfiniteQuery.js";
