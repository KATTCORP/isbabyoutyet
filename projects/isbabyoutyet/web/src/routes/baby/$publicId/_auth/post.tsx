import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { FormGuardProvider } from "@/components/Form";
import { UpdateComposer } from "@/components/baby/timeline";
import { useCompleteOnboardingStep } from "@/components/onboarding/onboarding-host";
import { allKeyed } from "@workspace/query-prefetch";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { FORBIDDEN } from "@isbabyoutyet/backend/src/types";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useBabyPostOverlay } from "@/lib/overlay-nav";
import { ForbiddenDialog } from "@/routes/baby/$publicId/_auth/-forbidden-dialog";
import { managerDocToBabyData } from "@/routes/baby/$publicId/route";

export const Route = createFileRoute("/baby/$publicId/_auth/post")({
  loader: async (opts) => {
    const babyRef = opts.params.publicId;
    return await allKeyed({
      managerBaby: opts.context.convexPreloader.ensureQueryData(api.baby.getManagerBaby, {
        babyId: babyRef,
      }),
      subscriptionCount: opts.context.convexPreloader.ensureQueryData(
        api.pushSubscriptions.getSubscriptionCount,
        { babyId: babyRef },
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
  const managerBabyQuery = usePreloadedConvexQuery(api.baby.getManagerBaby, loaderData.managerBaby);
  const subscriptionCountQuery = usePreloadedConvexQuery(
    api.pushSubscriptions.getSubscriptionCount,
    loaderData.subscriptionCount,
  );
  if (managerBabyQuery.data === FORBIDDEN) {
    return <ForbiddenDialog overlay={post} />;
  }
  const managerBabyDoc = managerBabyQuery.data;
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
            subscriptionCount={
              subscriptionCountQuery.data === FORBIDDEN ? 0 : subscriptionCountQuery.data
            }
          />
        </FormGuardProvider>
      </DialogContent>
    </Dialog>
  );
}
