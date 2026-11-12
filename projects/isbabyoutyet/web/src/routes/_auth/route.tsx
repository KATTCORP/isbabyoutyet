import { load, swr } from "@raf-query/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { noIndexHeaders } from "@/lib/robots";

export const Route = createFileRoute("/_auth")({
  headers() {
    return {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      Vary: "Cookie",
      ...noIndexHeaders(),
    };
  },
  // Signed-in pages only. In the browser `profile.get` is cached and live:
  // login, signup and sign-out wait for it to settle (`waitForMe`) before
  // they navigate here, and an expired session flips it to `null`, so this
  // waits for nothing there.
  //
  // Child loaders start beside this one. Signed out, their queries answer
  // `null` or fail, and the router lets this redirect win over both.
  loader: async (opts) => {
    const [, data] = await load(opts.context.queryClient, {
      me: swr(convexQuery(api.profile.get), {}),
    });
    if (!data.me) {
      throw redirect({
        replace: true,
        search: { redirect: opts.location.pathname },
        to: "/auth/login",
      });
    }
    // The dashboard is in the profile's language. The root document reads it
    // (`documentLocale`), which this file can't show.
    // oxlint-disable-next-line workspace/no-unused-loader-data
    return { locale: data.me.locale };
  },
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
