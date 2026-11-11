import type { AppQueryClient } from "@/lib/query-client";
import { load, swr } from "@raf-query/react";
import type { ConvexHttpClient } from "convex/browser";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export type SignedInProfileContext = {
  convexHttpClient: ConvexHttpClient | null;
  queryClient: AppQueryClient;
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
 * their own login (dashboard `/auth/login` vs baby-page overlay). Otherwise
 * route context gets the profile's handle (`me`) plus the fields routing
 * reads directly.
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

  const [handles, data] = await load(queryClient, { me: swr(convexQuery(api.profile.get), {}) });
  if (!data.me) {
    return null;
  }
  return {
    isAdmin: data.me.isAdmin,
    locale: data.me.locale,
    /** `profile.get`'s handle, for child routes to read with `useQuery`. */
    me: handles.me,
    token,
  };
}
