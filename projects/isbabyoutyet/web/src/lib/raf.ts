import { bindQueryOptions, bindUseQueryClient } from "@raf-query/react";
import type { makeQueryClient } from "./query-client";

/**
 * raf-query's builders, bound to the app's client: `queryOptions` takes the
 * options that client's parts declare (`retry`, `refetchOnWindowFocus`, …)
 * and its `queryFn`s get their context (`convex`). Import them from here,
 * not from `@raf-query/react`, whose own `queryOptions` takes neither.
 */
export const queryOptions = bindQueryOptions<typeof makeQueryClient>();

/** The app's client from the nearest provider: it runs the app's factories. */
export const useQueryClient = bindUseQueryClient<typeof makeQueryClient>();
