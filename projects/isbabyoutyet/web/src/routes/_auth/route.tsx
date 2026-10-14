import { authServer } from "@/lib/auth-server";
import { loadSignedInProfile } from "@/lib/signed-in-profile";
import type { SignedInProfileContext } from "@/lib/signed-in-profile";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { noIndexHeaders } from "@/lib/robots";

// Server function to check authentication
const getAuthToken = createServerFn({ method: "GET" }).handler(async () => {
  return await authServer.getToken();
});

function redirectToLogin(pathname: string): never {
  throw redirect({
    replace: true,
    search: { redirect: pathname },
    to: "/auth/login",
  });
}

/**
 * The `/_auth` guard, with the auth-token round-trip taken as a dependency
 * (defaulted to the real `createServerFn` one by the route) so tests can drive
 * both the SSR and client branches — the real server function throws outside
 * an actual TanStack Start request.
 *
 * @internal exported for tests
 */
export async function resolveAuthGuard(opts: {
  context: SignedInProfileContext;
  fetchToken: () => Promise<string | null>;
  pathname: string;
}) {
  const session = await loadSignedInProfile({
    context: opts.context,
    fetchToken: opts.fetchToken,
  });
  if (!session) {
    redirectToLogin(opts.pathname);
  }
  return session;
}

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

  beforeLoad: async (opts) => {
    return await resolveAuthGuard({
      context: opts.context,
      fetchToken: async () => (await getAuthToken()) ?? null,
      pathname: opts.location.pathname,
    });
  },
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
