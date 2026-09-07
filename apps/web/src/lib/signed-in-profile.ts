import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ConvexQueryPreloader } from "@workspace/convex-prefetch";
import { api } from "@workspace/convex/convex/_generated/api";
import type { ConvexReactClient } from "convex/react";

export type SignedInProfileContext = {
  convexClient: ConvexReactClient;
  convexPreloader: ConvexQueryPreloader;
  convexQueryClient: ConvexQueryClient;
  queryClient: QueryClient;
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
  const preloader = opts.context.convexPreloader;

  if (globalThis.window === undefined) {
    const token = opts.context.token ?? (await opts.fetchToken());
    if (!token) {
      return null;
    }
    opts.context.convexQueryClient.serverHttpClient?.setAuth(token);

    const profileHandle = await preloader.ensureQueryData(api.profile.get, {});
    const profile = profileHandle.initialData;
    if (!profile) {
      return null;
    }
    return {
      locale: profile.locale,
      profile: profileHandle,
      token,
    };
  }

  const profileHandle = await preloader.ensureQueryData(api.profile.get, {});
  const profile = profileHandle.initialData;
  if (!profile) {
    return null;
  }
  return {
    locale: profile.locale,
    profile: profileHandle,
    token: opts.context.token,
  };
}
