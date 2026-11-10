import type { InputOf, QueryClient, QueryFactory } from "@raf-query/react";
import { entryOf, isInvalidated } from "@raf-query/core/internal";

/** Whether an invalidation newer than the entry's data covers it: a reader would refetch it. */
export function isInvalidatedEntry<TFactory extends QueryFactory>(
  queryClient: QueryClient,
  query: { factory: TFactory; input: InputOf<TFactory> },
) {
  return isInvalidated(entryOf(queryClient, query.factory, query.input));
}
