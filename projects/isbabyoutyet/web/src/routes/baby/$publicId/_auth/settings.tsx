import { SettingsPanel } from "@/components/baby/settings-panel";
import { allKeyed, useQuery } from "@raf-query/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { FORBIDDEN } from "@isbabyoutyet/backend/src/types";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";
import { convexQuery } from "@workspace/convex-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useI18n } from "@/lib/i18n";
import { useBabySettingsOverlay } from "@/lib/overlay-nav";
import { ForbiddenDialog } from "@/routes/baby/$publicId/_auth/-forbidden-dialog";
import { managerDocToBabyData } from "@/routes/baby/$publicId/route";

export const Route = createFileRoute("/baby/$publicId/_auth/settings")({
  loader: async (opts) => {
    const babyRef = opts.params.publicId;
    const queryClient = opts.context.queryClient;
    const browserPush = queryClient.prefetch(browserPushCapabilityQuery, babyRef);
    const data = await allKeyed({
      coParentsList: queryClient.ensure(convexQuery(api.coParents.listForBaby), {
        babyId: babyRef,
      }),
      managerBaby: queryClient.ensure(convexQuery(api.baby.getManagerBaby), { babyId: babyRef }),
      myAccess: queryClient.ensure(convexQuery(api.coParents.myAccess), { babyId: babyRef }),
      vapidPublicKey: queryClient.ensure(convexQuery(api.pushSubscriptions.getPublicKey), {}),
    });
    return { ...data, browserPush, profile: opts.context.me };
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
  const [managerBabyDoc] = useQuery(convexQuery(api.baby.getManagerBaby), loaderData.managerBaby, {
    throwOnError: true,
  });
  const [myAccess] = useQuery(convexQuery(api.coParents.myAccess), loaderData.myAccess, {
    throwOnError: true,
  });
  const [profile] = useQuery(convexQuery(api.profile.get), loaderData.profile, {
    throwOnError: true,
  });
  if (managerBabyDoc === FORBIDDEN) {
    return <ForbiddenDialog overlay={settings} />;
  }
  const isOwner = myAccess.isOwner;
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
      profileLocale={profile?.locale ?? locale}
    />
  );
}
