import { queryOptions } from "@raf-query/react";
import { visitorTag } from "@isbabyoutyet/backend/src/visitorId";
import { Effect } from "effect";
import { peekVisitorId } from "@/lib/use-visitor-id";

/**
 * This browser's visitor tag on a baby page, matched against the feed's
 * `visitorTag` to mark the visitor's own encouragements. The visitor id lives
 * in localStorage, so it never runs on the server (`ssr: false`). `null` until
 * the visitor first posts; invalidate it then.
 *
 * An Effect with a `never` error, so readers can pass `throwOnError: true`:
 * with the client's `layer`, a plain promise `queryFn` still resolves to a
 * `Result` at runtime while its types say plain data.
 */
export function visitorTagQuery(babyId: string) {
  return queryOptions({
    queryFn: () => {
      const visitorId = peekVisitorId();
      return visitorId
        ? Effect.promise(() => visitorTag({ babyId, visitorId }))
        : Effect.succeed(null);
    },
    queryKey: ["visitorTag", babyId],
    ssr: false,
    staleTime: Infinity,
  });
}
