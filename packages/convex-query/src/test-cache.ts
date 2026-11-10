import type { InfiniteQueryFactory, InputOf, QueryClient, QueryFactory } from "@raf-query/react";
import { entryOf, fetchEntry, isInvalidated, pageParamAfter } from "@raf-query/core/internal";

/**
 * Paging without React, for tests: what `useInfiniteQuery`'s
 * `fetchNextPage` / `fetchPreviousPage`, `hasNextPage` / `hasPreviousPage`
 * and `refetch` do, through the kernel they call.
 */
export function pagesOf<TFactory extends InfiniteQueryFactory>(
  queryClient: QueryClient,
  query: { factory: TFactory; input: InputOf<TFactory> },
) {
  const entry = () => entryOf(queryClient, query.factory, query.input);
  const fetchPage = async (direction: "next" | "previous") => {
    const outcome = await fetchEntry(entry(), { direction });
    if (!outcome.ok) {
      throw outcome.error;
    }
  };
  const hasPage = (direction: "next" | "previous") => {
    const current = entry();
    const options = current.options;
    if (!current.state.hasData || !options || !("getNextPageParam" in options)) {
      return false;
    }
    // SAFETY: a paged entry's data is `InfiniteData`, and its options are paged options.
    return (
      pageParamAfter(
        options as Parameters<typeof pageParamAfter>[0],
        current.state.data as Parameters<typeof pageParamAfter>[1],
        direction,
      ) !== undefined
    );
  };
  return {
    fetchNextPage: () => fetchPage("next"),
    fetchPreviousPage: () => fetchPage("previous"),
    hasNextPage: () => hasPage("next"),
    hasPreviousPage: () => hasPage("previous"),
    refetch: async () => {
      const outcome = await fetchEntry(entry());
      if (!outcome.ok) {
        throw outcome.error;
      }
    },
  };
}

/** Whether an invalidation newer than the entry's data covers it: a reader would refetch it. */
export function isInvalidatedEntry<TFactory extends QueryFactory>(
  queryClient: QueryClient,
  query: { factory: TFactory; input: InputOf<TFactory> },
) {
  return isInvalidated(entryOf(queryClient, query.factory, query.input));
}
