import { Button } from "@workspace/ui/components/button";
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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@workspace/convex/convex/_generated/api";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { allKeyed, preloadedQueryOptions } from "@workspace/query-prefetch";
import { toast } from "sonner";
import { useCompleteOnboardingStep } from "@/components/onboarding/onboarding-host";
import { copyTextToClipboard } from "@/lib/copy-text";
import { browserImageFactory, prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyShareOverlay } from "@/lib/overlay-nav";
import { getBabySeo } from "@/lib/seo";
import { canonicalUrl } from "@/lib/site-url";
import { useTransientFlag } from "@/lib/use-transient-flag";

export const Route = createFileRoute("/baby/$publicId/share")({
  loader: async (opts) => {
    const publicId = opts.params.publicId;
    const data = await allKeyed({
      baby: opts.context.convexPreloader.ensureQueryData(api.baby.getByPublicId, {
        id: publicId,
      }),
      myAccess: opts.context.convexPreloader.ensureQueryData(api.coParents.myAccess, {
        babyId: publicId,
      }),
    });
    const babyDoc = data.baby.initialData;
    const sharePreview = babyDoc ? getBabySeo(babyDoc, publicId) : null;
    const imagePrefetch = prefetchBrowserImage(
      opts.context.queryClient,
      sharePreview?.imageUrl ?? "",
    );

    return {
      baby: data.baby,
      imagePrefetch,
      myAccess: data.myAccess,
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
  const babyQuery = usePreloadedConvexQuery(api.baby.getByPublicId, loaderData.baby);
  const myAccessQuery = usePreloadedConvexQuery(api.coParents.myAccess, loaderData.myAccess);
  const babyDoc = babyQuery.data;
  const sharePreview = babyDoc ? getBabySeo(babyDoc, params.publicId) : null;
  useQuery(
    preloadedQueryOptions(browserImageFactory, loaderData.imagePrefetch, () => {
      return sharePreview?.imageUrl ?? "";
    }),
  );
  if (!sharePreview) {
    throw notFound();
  }

  async function copyShareLink() {
    try {
      await copyTextToClipboard(loaderData.shareLink);
      showCopied();
      toast.success(t("Copied to clipboard"));
      if (myAccessQuery.data.canManage) {
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
