import { Button } from "@workspace/ui/components/button";
import { allKeyed, useQuery } from "@raf-query/react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCompleteOnboardingStep } from "@/components/onboarding/onboarding-host";
import { copyTextToClipboard } from "@/lib/copy-text";
import { prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyShareOverlay } from "@/lib/overlay-nav";
import { getBabySeo } from "@/lib/seo";
import { canonicalUrl } from "@/lib/site-url";
import { useTransientFlag } from "@/lib/use-transient-flag";

export const Route = createFileRoute("/baby/$publicId/share")({
  loader: async (opts) => {
    const queryClient = opts.context.queryClient;
    const publicId = opts.params.publicId;
    const data = await allKeyed({
      baby: queryClient.ensure(convexQuery(api.baby.getByPublicId), { id: publicId }),
      myAccess: queryClient.ensure(convexQuery(api.coParents.myAccess), { babyId: publicId }),
    });
    const babyDoc = queryClient.getData(convexQuery(api.baby.getByPublicId), { id: publicId });
    if (babyDoc) {
      prefetchBrowserImage(queryClient, getBabySeo(babyDoc, publicId).imageUrl);
    }

    return {
      ...data,
      shareLink: canonicalUrl(`/baby/${publicId}`),
    };
  },
  component: BabyShareOverlay,
});

export function BabyShareOverlay() {
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const completeOnboardingStep = useCompleteOnboardingStep();
  const { t } = useI18n();
  const [copied, showCopied] = useTransientFlag(2000);
  const share = useBabyShareOverlay(params.publicId);
  const [babyData] = useQuery(convexQuery(api.baby.getByPublicId), loaderData.baby);
  const [myAccessData] = useQuery(convexQuery(api.coParents.myAccess), loaderData.myAccess);
  const sharePreview = babyData ? getBabySeo(babyData, params.publicId) : null;
  if (!sharePreview) {
    throw notFound();
  }

  async function copyShareLink() {
    try {
      await copyTextToClipboard(loaderData.shareLink);
      showCopied();
      toast.success(t("Copied to clipboard"));
      if (myAccessData.canManage) {
        void completeOnboardingStep({ stepId: "share_link" });
      }
    } catch (error) {
      toast.error(
        t("Failed to copy to clipboard: {{detail}}", {
          detail: error instanceof Error ? error.message : t("Unknown error"),
        }),
      );
    }
  }

  return (
    <Dialog {...share.rootProps}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Share the Link")}</DialogTitle>
          <DialogDescription>{t("This is how your page will look when shared.")}</DialogDescription>
        </DialogHeader>
        <Card>
          <img
            alt={sharePreview.title}
            className="aspect-1200/630 w-full object-cover"
            height={630}
            src={sharePreview.imageUrl}
            width={1200}
          />
          <CardHeader>
            <CardTitle className="line-clamp-2">{sharePreview.title}</CardTitle>
            <CardDescription className="line-clamp-2">{sharePreview.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="truncate text-xs text-muted-foreground">{loaderData.shareLink}</p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={() => {
                void copyShareLink();
              }}
            >
              {copied ? <CheckCircleIcon data-icon="inline-start" /> : null}
              {copied ? t("Copied!") : t("Copy link to share")}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
