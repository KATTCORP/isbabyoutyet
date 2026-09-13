import { authServer } from "@/lib/auth-server";
import { loadSignedInProfile } from "@/lib/signed-in-profile";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { noIndexHeaders } from "@/lib/robots";

// Server function to check authentication
const getAuthToken = createServerFn({ method: "GET" }).handler(async () => {
  return await authServer.getToken();
});

export const Route = createFileRoute("/_auth")({
  headers() {
    return {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      Vary: "Cookie",
      // Prefer header over route `head` — TanStack's head+beforeLoad typing
      // currently collapses child beforeLoad to `never` when the layout sets head.
      ...noIndexHeaders(),
    };
  },

  /** Signed-in users continue; everyone else goes to login with a return path. */
  beforeLoad: async (opts) => {
    const session = await loadSignedInProfile({
      context: opts.context,
      fetchToken: async () => (await getAuthToken()) ?? null,
    });
    if (!session) {
      throw redirect({
        replace: true,
        search: { redirect: opts.location.pathname },
        to: "/auth/login",
      });
    }
    return session;
  },
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
