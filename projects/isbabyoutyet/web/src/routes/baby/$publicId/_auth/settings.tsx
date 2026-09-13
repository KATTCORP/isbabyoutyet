import { SettingsPanel } from "@/components/baby/settings-panel";
import { prefetchBrowserPushCapability } from "@/components/baby/notification-subscribe";
import { allKeyed } from "@workspace/query-prefetch";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { FORBIDDEN } from "@isbabyoutyet/backend/src/types";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useI18n } from "@/lib/i18n";
import { useBabySettingsOverlay } from "@/lib/overlay-nav";
import { ForbiddenDialog } from "@/routes/baby/$publicId/_auth/-forbidden-dialog";
import { managerDocToBabyData } from "@/routes/baby/$publicId/route";

export const Route = createFileRoute("/baby/$publicId/_auth/settings")({
  loader: async (opts) => {
    const babyRef = opts.params.publicId;
    const browserPush = prefetchBrowserPushCapability(opts.context.queryClient, babyRef);
    const data = await allKeyed({
      coParentsList: opts.context.convexPreloader.ensureQueryData(api.coParents.listForBaby, {
        babyId: babyRef,
      }),
      managerBaby: opts.context.convexPreloader.ensureQueryData(api.baby.getManagerBaby, {
        babyId: babyRef,
      }),
      myAccess: opts.context.convexPreloader.ensureQueryData(api.coParents.myAccess, {
        babyId: babyRef,
      }),
      profile: opts.context.convexPreloader.ensureQueryData(api.profile.get, {}),
      vapidPublicKey: opts.context.convexPreloader.ensureQueryData(
        api.pushSubscriptions.getPublicKey,
        {},
      ),
    });
    return { ...data, browserPush };
  },
  component: BabySettingsOverlay,
});

export function BabySettingsOverlay() {
  const { locale } = useI18n();
  const params = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const loaderData = Route.useLoaderData();
  const settings = useBabySettingsOverlay(params.publicId);
  const updateBaby = useMutation(api.baby.update);
  const removeBaby = useMutation(api.baby.remove);
  const redateMilestone = useMutation(api.updates.redateMilestone);
  const unmarkMilestone = useMutation(api.updates.unmarkMilestone);
  const managerBabyQuery = usePreloadedConvexQuery(api.baby.getManagerBaby, loaderData.managerBaby);
  const myAccessQuery = usePreloadedConvexQuery(api.coParents.myAccess, loaderData.myAccess);
  const profileQuery = usePreloadedConvexQuery(api.profile.get, loaderData.profile);
  if (managerBabyQuery.data === FORBIDDEN) {
    return <ForbiddenDialog overlay={settings} />;
  }
  const managerBabyDoc = managerBabyQuery.data;
  const isOwner = myAccessQuery.data.isOwner;
  const baby = managerDocToBabyData(managerBabyDoc);

  return (
    <SettingsPanel
      baby={baby}
      birthJourney={managerBabyDoc.birthJourney}
      coParents={{
        babyId: managerBabyDoc._id,
        isOwner,
        listing: loaderData.coParentsList,
      }}
      messagePush={{
        babyId: managerBabyDoc._id,
        browserPush: loaderData.browserPush,
        vapidPublicKey: loaderData.vapidPublicKey,
      }}
      onDelete={
        isOwner
          ? async () => {
              await removeBaby({ babyId: managerBabyDoc._id });
              void navigate({ to: "/dashboard" });
            }
          : null
      }
      onMilestoneRedate={async (milestone, occurredAt) => {
        await redateMilestone({
          babyId: managerBabyDoc._id,
          milestone,
          occurredAt: Date.parse(occurredAt),
        });
        await router.invalidate();
      }}
      onMilestoneRemove={async (milestone) => {
        await unmarkMilestone({ babyId: managerBabyDoc._id, milestone });
        await router.invalidate();
      }}
      onUpdate={async (update) => {
        await updateBaby({ id: managerBabyDoc._id, patch: update });
        await router.invalidate();
      }}
      overlay={settings}
      profileLocale={profileQuery.data?.locale ?? locale}
    />
  );
}
