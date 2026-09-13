import { PhotoLightbox } from "@/components/baby/photo-lightbox";
import { prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyPhotoOverlay } from "@/lib/overlay-nav";
import { useLastMatch } from "@/lib/use-last-match";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/baby/$publicId/photo")({
  loader: async (opts) => {
    const baby = await opts.context.convexPreloader.ensureQueryData(api.baby.getByPublicId, {
      id: opts.params.publicId,
    });
    const babyDoc = baby.initialData;
    if (!babyDoc?.photoUrl) {
      throw notFound();
    }
    const imagePrefetch = prefetchBrowserImage(opts.context.queryClient, babyDoc.photoUrl);
    return {
      baby,
      imagePrefetch,
    };
  },
  component: BabyPhotoOverlay,
});

export function BabyPhotoOverlay() {
  const { t } = useI18n();
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const photo = useBabyPhotoOverlay(params.publicId);

  const babyQuery = usePreloadedConvexQuery(api.baby.getByPublicId, loaderData.baby);
  const babyDoc = useLastMatch(babyQuery.data, (v) => {
    if (!v?.photoUrl) {
      return false;
    }
    return true;
  });
  if (!babyDoc?.photoUrl) {
    throw notFound();
  }

  return (
    <PhotoLightbox
      alt={t("Photo of {{name}}", { name: babyDoc.name })}
      blurDataUrl={babyDoc.blurDataUrl ?? null}
      overlay={photo}
      photoUrl={babyDoc.photoUrl}
    />
  );
}
