import type { QueryClient } from "@raf-query/react";
import type { DefaultFunctionArgs } from "convex/server";
import { Predicate } from "effect";
import type { PageDirection } from "./queries.ts";

/** First element of every `convexQuery` key. */
export const CONVEX_QUERY_KEY = "convexQuery";

/** First element of every `convexPaginatedQuery` key. */
export const CONVEX_PAGINATED_QUERY_KEY = "convexPaginatedQuery";

/** A cache entry, as the client's events and entry map hold it. */
export type CacheEntry = NonNullable<ReturnType<QueryClient["~entries"]["get"]>>;

/** An entry's data, as the cache holds it: whatever its `queryFn` resolved with. */
export type EntryData = CacheEntry["state"]["data"];

/** A Convex cache entry, decoded from its key. */
export type LiveKey =
  | { readonly args: DefaultFunctionArgs; readonly kind: "query"; readonly name: string }
  | {
      readonly args: DefaultFunctionArgs;
      readonly kind: "paginated";
      readonly name: string;
      readonly numItems: number;
    };

/** The entry `key` addresses, or `null` unless one of this package's factories made it. */
export function liveKey(key: CacheEntry["key"]): LiveKey | null {
  const tag = key[0];
  const name = key[1];
  if (!Predicate.isString(name)) {
    return null;
  }
  const args = key[2];
  if (!Predicate.isObject(args)) {
    return null;
  }
  if (tag === CONVEX_QUERY_KEY && key.length === 3) {
    return { args, kind: "query", name };
  }
  const numItems = key[3];
  if (tag === CONVEX_PAGINATED_QUERY_KEY && key.length === 4 && Predicate.isNumber(numItems)) {
    return { args, kind: "paginated", name, numItems };
  }
  return null;
}

/** A loaded page's cursor, and the direction it was loaded in (`null` on one-way pages). */
export interface PageStart {
  readonly cursor: string | null;
  readonly direction: PageDirection | null;
}

/** A loaded page: where it starts, how many items it was loaded with, and a two-way query's start. */
export interface LoadedPage extends PageStart {
  /** Where a two-way query's pages start; absent on one-way pages. */
  readonly from?: string | null;
  readonly numItems: number;
}

/** `data`'s pages, or `null` unless every page param is one this package's factories make. */
export function loadedPages(data: EntryData): ReadonlyArray<LoadedPage> | null {
  if (!Predicate.hasProperty(data, "pageParams") || !Array.isArray(data.pageParams)) {
    return null;
  }
  const pages: Array<LoadedPage> = [];
  for (const param of data.pageParams) {
    if (!Predicate.hasProperty(param, "cursor")) {
      return null;
    }
    const cursor = param.cursor;
    if (cursor !== null && !Predicate.isString(cursor)) {
      return null;
    }
    const direction = Predicate.hasProperty(param, "direction") ? param.direction : null;
    if (direction !== null && direction !== "forward" && direction !== "backward") {
      return null;
    }
    if (!Predicate.hasProperty(param, "numItems") || !Predicate.isNumber(param.numItems)) {
      return null;
    }
    if (!Predicate.hasProperty(param, "from")) {
      pages.push({ cursor, direction, numItems: param.numItems });
      continue;
    }
    const from = param.from;
    if (from !== null && !Predicate.isString(from)) {
      return null;
    }
    pages.push({ cursor, direction, from, numItems: param.numItems });
  }
  return pages;
}

/** Where the page that starts at `start` sits in `pages`, or -1 once it is gone. */
export function pageIndex(pages: ReadonlyArray<PageStart> | null, start: PageStart) {
  return (pages ?? []).findIndex(
    (candidate) => candidate.cursor === start.cursor && candidate.direction === start.direction,
  );
}
