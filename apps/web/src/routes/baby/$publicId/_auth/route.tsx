import { authServer } from "@/lib/auth-server";
import { loadSignedInProfile } from "@/lib/signed-in-profile";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getAuthToken = createServerFn({ method: "GET" }).handler(async () => {
  return await authServer.getToken();
});

export const Route = createFileRoute("/baby/$publicId/_auth")({
  /**
   * Same signed-in profile check as `/_auth`. Manager access is left to the
   * child overlays (settings / post), which show a forbidden dialog when
   * `getManagerBaby` is `FORBIDDEN`. Expired sessions bounce to the baby-page
   * login overlay.
   */
  beforeLoad: async (opts) => {
    const session = await loadSignedInProfile({
      context: opts.context,
      fetchToken: async () => (await getAuthToken()) ?? null,
    });
    if (!session) {
      throw redirect({
        params: { publicId: opts.params.publicId },
        replace: true,
        search: { redirect: opts.location.pathname },
        to: "/baby/$publicId/login",
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
  },
  component: BabyManagerAuthLayout,
});

function BabyManagerAuthLayout() {
  return <Outlet />;
}
