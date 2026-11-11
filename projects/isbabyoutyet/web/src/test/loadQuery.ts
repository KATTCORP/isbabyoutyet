import type {
  ClientFor,
  DataOf,
  LoadEntry,
  LoadEntryOptions,
  QueryFactory,
  QueryHandle,
} from "@raf-query/react";
import { invalidateMany, load, prefetch, revalidate, swr } from "@raf-query/react";

type LoadArgs<TFactory extends QueryFactory> =
  | []
  | [input: Parameters<TFactory>[0]]
  | [input: Parameters<TFactory>[0], options: LoadEntryOptions];

/**
 * A loader's `load(queryClient, { query: swr(factory, input) })` for one
 * query: resolves with its handle once the cache has data, as the handles
 * route loaders pass to components.
 */
export async function loadQuery<TFactory extends QueryFactory>(
  queryClient: ClientFor<TFactory>,
  factory: TFactory,
  ...args: LoadArgs<TFactory>
): Promise<QueryHandle<TFactory>> {
  // SAFETY: `swr` takes the factory's input, which `args` passes on.
  // `ClientFor` checked the client against the factory; `load` can't through a type parameter.
  const entry: LoadEntry = swr(factory, ...(args as [never]));
  const [handles] = await load(queryClient, { query: entry });
  // SAFETY: the entry is this factory's, so its handle is too.
  return handles.query as QueryHandle<TFactory>;
}

/** {@link loadQuery} without waiting: a loader's `prefetch`, for readers to suspend on. */
export async function prefetchQuery<TFactory extends QueryFactory>(
  queryClient: ClientFor<TFactory>,
  factory: TFactory,
  ...args: LoadArgs<TFactory>
): Promise<QueryHandle<TFactory>> {
  // SAFETY: `prefetch` takes the factory's input, which `args` passes on.
  // `ClientFor` checked the client against the factory; `load` can't through a type parameter.
  const entry: LoadEntry = prefetch(factory, ...(args as [never]));
  const [handles] = await load(queryClient, { query: entry });
  // SAFETY: the entry is this factory's, so its handle is too.
  return handles.query as QueryHandle<TFactory>;
}

/**
 * Fetch one query now, cached or not, and resolve with its data: what a
 * refetch after an invalidation does.
 */
export async function fetchQueryData<TFactory extends QueryFactory>(
  queryClient: ClientFor<TFactory>,
  factory: TFactory,
  ...args: [] | [input: Parameters<TFactory>[0]]
): Promise<DataOf<TFactory>> {
  await invalidateMany(queryClient, factory);
  // SAFETY: `revalidate` takes the factory's input, which `args` passes on.
  // `ClientFor` checked the client against the factory; `load` can't through a type parameter.
  const entry: LoadEntry<QueryFactory, "revalidate"> = revalidate(factory, ...(args as [never]));
  const [, data] = await load(queryClient, { query: entry });
  // SAFETY: a `revalidate` entry's data is its factory's.
  return (data as { readonly query: DataOf<TFactory> }).query;
}
