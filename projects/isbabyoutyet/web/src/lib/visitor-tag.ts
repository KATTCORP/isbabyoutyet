import { visitorTag } from "@isbabyoutyet/backend/src/visitorId";
import { queryOptions } from "@/lib/raf";
import { peekVisitorId } from "@/lib/use-visitor-id";

/**
 * This browser's visitor tag on a baby page, matched against the feed's
 * `visitorTag` to mark the visitor's own encouragements. The visitor id lives
 * in localStorage, so it is `ssr: false`. `null` until the visitor first
 * posts; invalidate it then.
 */
export function visitorTagQuery(babyId: string) {
  return queryOptions({
    queryFn: async () => {
      const visitorId = peekVisitorId();
      return visitorId ? await visitorTag({ babyId, visitorId }) : null;
    },
    queryKey: ["visitorTag", babyId],
    ssr: false,
    staleTime: Infinity,
  });
}
