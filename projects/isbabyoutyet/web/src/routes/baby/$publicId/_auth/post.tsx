import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { allKeyed, useQuery } from "@raf-query/react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { FormGuardProvider } from "@/components/Form";
import { UpdateComposer } from "@/components/baby/timeline";
import { useCompleteOnboardingStep } from "@/components/onboarding/onboarding-host";
import { FORBIDDEN } from "@isbabyoutyet/backend/src/types";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useBabyPostOverlay } from "@/lib/overlay-nav";
import { ForbiddenDialog } from "@/routes/baby/$publicId/_auth/-forbidden-dialog";
import { managerDocToBabyData } from "@/routes/baby/$publicId/route";

export const Route = createFileRoute("/baby/$publicId/_auth/post")({
  loader: async (opts) => {
    const queryClient = opts.context.queryClient;
    const babyRef = opts.params.publicId;
    return await allKeyed({
      managerBaby: queryClient.ensure(convexQuery(api.baby.getManagerBaby), {
        babyId: babyRef,
      }),
      subscriptionCount: queryClient.ensure(
        convexQuery(api.pushSubscriptions.getSubscriptionCount),
        {
          babyId: babyRef,
        },
      ),
    });
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
  const [managerBabyData] = useQuery(convexQuery(api.baby.getManagerBaby), loaderData.managerBaby);
  const [subscriptionCountData] = useQuery(
    convexQuery(api.pushSubscriptions.getSubscriptionCount),
    loaderData.subscriptionCount,
  );
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
