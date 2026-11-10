import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { load, swr, useQuery } from "@raf-query/react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { FormGuardProvider } from "@/components/Form";
import { UpdateComposer } from "@/components/baby/timeline";
import { useCompleteOnboardingStep } from "@/components/onboarding/onboarding-host";
import { FORBIDDEN } from "@isbabyoutyet/backend/src/types";
import { createFileRoute } from "@tanstack/react-router";
import { use, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useBabyPostOverlay } from "@/lib/overlay-nav";
import { ForbiddenDialog } from "@/routes/baby/$publicId/_auth/-forbidden-dialog";
import { managerDocToBabyData } from "@/routes/baby/$publicId/route";

export const Route = createFileRoute("/baby/$publicId/_auth/post")({
  loader: async (opts) => {
    const babyRef = opts.params.publicId;
    const [handles] = await load(opts.context.queryClient, {
      managerBaby: swr(convexQuery(api.baby.getManagerBaby), { babyId: babyRef }),
      subscriptionCount: swr(convexQuery(api.pushSubscriptions.getSubscriptionCount), {
        babyId: babyRef,
      }),
    });
    return handles;
  },
  component: BabyPostUpdateOverlay,
});

export function BabyPostUpdateOverlay() {
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const completeOnboardingStep = useCompleteOnboardingStep();
  const { t } = useI18n();
  const post = useBabyPostOverlay(params.publicId);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [managerBabyDataThenable] = useQuery(
    convexQuery(api.baby.getManagerBaby),
    loaderData.managerBaby,
  );
  const managerBabyData = use(managerBabyDataThenable);
  const [subscriptionCountDataThenable] = useQuery(
    convexQuery(api.pushSubscriptions.getSubscriptionCount),
    loaderData.subscriptionCount,
  );
  const subscriptionCountData = use(subscriptionCountDataThenable);
  if (managerBabyData === FORBIDDEN) {
    return <ForbiddenDialog overlay={post} />;
  }
  const managerBabyDoc = managerBabyData;
  const baby = managerDocToBabyData(managerBabyDoc);

  return (
    <Dialog {...post.rootProps}>
      <DialogContent className="sm:max-w-lg" initialFocus={contentRef} ref={contentRef}>
        <DialogTitle className="sr-only">{t("Post an update")}</DialogTitle>
        <FormGuardProvider guard={post.guard}>
          <UpdateComposer
            baby={baby}
            babyId={managerBabyDoc._id}
            babyName={managerBabyDoc.name}
            onPosted={() => {
              void completeOnboardingStep({ stepId: "post_update" });
              post.close();
            }}
            subscriptionCount={subscriptionCountData === FORBIDDEN ? 0 : subscriptionCountData}
          />
        </FormGuardProvider>
      </DialogContent>
    </Dialog>
  );
}
