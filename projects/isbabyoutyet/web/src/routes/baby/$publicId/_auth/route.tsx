import { load, swr } from "@raf-query/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export const Route = createFileRoute("/baby/$publicId/_auth")({
  // The same signed-in check as `/_auth`; signed out, or with an expired
  // session, it goes to the baby page's login overlay. Whether the profile
  // may manage this baby is the overlays' to show (settings and post open a
  // forbidden dialog when `getManagerBaby` is `FORBIDDEN`).
  //
  // The page stays in the baby's language: this returns no locale.
  loader: async (opts) => {
    const [, data] = await load(opts.context.queryClient, {
      me: swr(convexQuery(api.profile.get), {}),
    });
    if (!data.me) {
      throw redirect({
        params: { publicId: opts.params.publicId },
        replace: true,
        search: { redirect: opts.location.pathname },
        to: "/baby/$publicId/login",
      });
    }
  },
  component: BabyManagerAuthLayout,
});

function BabyManagerAuthLayout() {
  return <Outlet />;
}
