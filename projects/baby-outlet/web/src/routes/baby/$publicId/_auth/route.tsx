import { authServer } from "@/lib/auth-server";
import { loadSignedInProfile } from "@/lib/signed-in-profile";
import type { SignedInProfileContext } from "@/lib/signed-in-profile";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getAuthToken = createServerFn({ method: "GET" }).handler(async () => {
  return await authServer.getToken();
});

function redirectToBabyLogin(opts: { pathname: string; publicId: string }): never {
  throw redirect({
    params: { publicId: opts.publicId },
    replace: true,
    search: { redirect: opts.pathname },
    to: "/baby/$publicId/login",
  });
}

/**
 * Same signed-in profile check as `/_auth`. Manager access is left to the
 * child overlays (settings / post), which show a forbidden dialog when
 * `getManagerBaby` is `FORBIDDEN`. Expired sessions bounce to the baby-page
 * login overlay.
 *
 * @internal exported for tests
 */
export async function resolveBabyManagerGuard(opts: {
  context: SignedInProfileContext;
  fetchToken: () => Promise<string | null>;
  pathname: string;
  publicId: string;
}) {
  const session = await loadSignedInProfile({
    context: opts.context,
    fetchToken: opts.fetchToken,
  });
  if (!session) {
    redirectToBabyLogin({
      pathname: opts.pathname,
      publicId: opts.publicId,
    });
  }
  // Root reduces locale from route matches (last match wins). The parent baby
  // route already set `resolvedLocale`; forwarding the profile locale here
  // would switch a Swedish baby page to the owner's saved language on /post
  // and /settings.
  return {
    profile: session.profile,
    token: session.token,
  };
}

export const Route = createFileRoute("/baby/$publicId/_auth")({
  beforeLoad: async (opts) => {
    return await resolveBabyManagerGuard({
      context: opts.context,
      fetchToken: async () => (await getAuthToken()) ?? null,
      pathname: opts.location.pathname,
      publicId: opts.params.publicId,
    });
  },
  component: BabyManagerAuthLayout,
});

function BabyManagerAuthLayout() {
  return <Outlet />;
}
