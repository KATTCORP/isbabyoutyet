import type { QueryClient } from "@raf-query/react";
import type { ConvexReader } from "@workspace/convex-query";
import type { ConvexHttpClient } from "convex/browser";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export type SignedInProfileContext = {
  convexHttpClient: ConvexHttpClient | null;
  queryClient: QueryClient<ConvexReader>;
  token: string | null | undefined;
};

/**
 * Shared signed-in signal for `/_auth` and baby manager overlays.
 *
 * SSR: cookie token, then `profile.get`. Client: cached `profile.get` —
 * login, signup, and sign-out wait for me to settle (`waitForMe`) before
 * they navigate here. An expired session flips the cache to null.
 *
 * Returns `null` when the user is not signed in so callers can bounce to
 * their own login (dashboard `/auth/login` vs baby-page overlay).
 *
 * `locale` is the signed-in profile language for dashboard `/_auth`. Baby
 * manager overlays must not put it in route context — the baby page already
 * set `resolvedLocale`, and a later match would overwrite it.
 */
export async function loadSignedInProfile(opts: {
  context: SignedInProfileContext;
  fetchToken: () => Promise<string | null>;
}) {
  const queryClient = opts.context.queryClient;
  let token = opts.context.token;

  if (globalThis.window === undefined) {
    token = token ?? (await opts.fetchToken());
    if (!token) {
      return null;
    }
    opts.context.convexHttpClient?.setAuth(token);
  }

  // Route context must serialize, so it carries the profile's fields, not a
  // query handle: child loaders `ensure` `profile.get` again, a cache hit.
  await queryClient.ensure(convexQuery(api.profile.get), {});
  const me = queryClient.getData(convexQuery(api.profile.get), {});
  if (!me) {
    return null;
  }
  return {
    isAdmin: me.isAdmin,
    locale: me.locale,
    token,
  };
}
