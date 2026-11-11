import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { visitorTag } from "@isbabyoutyet/backend/src/visitorId";
import { readConvexQuery } from "@workspace/convex-query";
import { queryOptions } from "@/lib/raf";
import { peekVisitorId } from "@/lib/use-visitor-id";

/**
 * This browser's visitor tag on a baby page, matched against the feed's
 * `visitorTag` to mark the visitor's own encouragements. The visitor id lives
 * in localStorage, so it is `ssr: false`. `null` until the visitor first
 * posts; invalidate it then.
 *
 * Named by the page's public id, like the page's other queries, so the
 * loader starts it beside them. Tags are salted with the baby's own id,
 * which is the page's baby query: the same subscription, not another request.
 */
export function visitorTagQuery(publicId: string) {
  return queryOptions({
    queryFn: async (context) => {
      const visitorId = peekVisitorId();
      if (!visitorId) {
        return null;
      }
      const baby = await readConvexQuery(context, {
        args: { id: publicId },
        query: api.baby.getByPublicId,
      });
      return baby ? await visitorTag({ babyId: baby._id, visitorId }) : null;
    },
    queryKey: ["visitorTag", publicId],
    ssr: false,
    staleTime: Infinity,
  });
}
