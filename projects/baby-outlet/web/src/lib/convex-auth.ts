import { convexQuery } from "@convex-dev/react-query";
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { authClient } from "./auth-client";

/**
 * Establishes Convex auth state on the browser client at creation time.
 *
 * `expectAuth` keeps the websocket paused until the first `setAuth`, and
 * convex/react's `ConvexProviderWithAuth` only ever calls `setAuth` for
 * signed-in users — left alone, an anonymous visitor's client-side queries
 * would hang forever. The creation-time fetcher below resolves BOTH states
 * before React even mounts: a token authenticates, no token resumes the
 * socket as anonymous. `ConvexBetterAuthProvider` supersedes this fetcher
 * once its session effect runs and owns login/logout transitions from there.
 *
 * The session-store subscription keeps the /_auth guard's session signal
 * honest: when better-auth resolves to "no session" (e.g. expiry noticed on
 * focus — sign-out itself does a full reload), a stale profile must not
 * survive in the query cache and let the guard skip its token check.
 */
export function setupClientConvexAuth(
  convexQueryClient: ConvexQueryClient,
  queryClient: QueryClient,
) {
  convexQueryClient.convexClient.setAuth(async () => {
    const result = await authClient.convex
      .token({ fetchOptions: { throw: false } })
      .catch(() => null);
    return result?.data?.token ?? null;
  });

  authClient.$store.atoms.session?.subscribe((session) => {
    if (session && !session.isPending && !session.data) {
      queryClient.setQueryData(convexQuery(api.profile.get, {}).queryKey, null);
    }
  });
}
