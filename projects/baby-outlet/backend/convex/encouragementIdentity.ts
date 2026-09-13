import type { QueryCtx } from "./_generated/server";
import { appIdentity } from "./authIdentity";
import type { EncouragementAuthor } from "./encouragementAuthor";

export type { EncouragementAuthor, EncouragementOwnership } from "./encouragementAuthor";
export {
  encouragementAuthorValidator,
  encouragementHasUserId,
  encouragementIsMine,
  storedEncouragementAuthor,
  storedEncouragementAuthorFromCaller,
} from "./encouragementAuthor";

export async function resolveEncouragementAuthor(
  ctx: Pick<QueryCtx, "auth">,
  visitorId: string | null,
): Promise<EncouragementAuthor | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    return {
      type: "user",
      userId: appIdentity(identity).authUserId,
      visitorId,
    };
  }
  if (visitorId) {
    return { type: "visitor", visitorId };
  }
  return null;
}
