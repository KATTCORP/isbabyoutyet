import { PhotoLightbox } from "@/components/baby/photo-lightbox";
import { browserImageFactory, prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyUpdatePhotoOverlay } from "@/lib/overlay-nav";
import { useLastMatch } from "@/lib/use-last-match";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { preloadedQueryOptions } from "@workspace/query-prefetch";

export const Route = createFileRoute("/baby/$publicId/updates/$updateId/photo")({
  loader: async (opts) => {
    const updatePhoto = await opts.context.convexPreloader.ensureQueryData(
      api.timeline.getUpdatePhoto,
      {
        babyId: opts.params.publicId,
        updateId: opts.params.updateId,
      },
    );
    if (!updatePhoto.initialData) {
      throw notFound();
    }
    const imagePrefetch = prefetchBrowserImage(
      opts.context.queryClient,
      updatePhoto.initialData.photoUrl,
    );
    return {
      imagePrefetch,
      updatePhoto,
    };
  },
  component: BabyUpdatePhotoOverlay,
});

export function BabyUpdatePhotoOverlay() {
  const { t } = useI18n();
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const photo = useBabyUpdatePhotoOverlay({
    publicId: params.publicId,
    updateId: params.updateId,
  });
  useQuery(preloadedQueryOptions(browserImageFactory, loaderData.imagePrefetch));
  const updatePhotoQuery = usePreloadedConvexQuery(
    api.timeline.getUpdatePhoto,
    loaderData.updatePhoto,
  );
  const updatePhoto = useLastMatch(updatePhotoQuery.data, (v) => !!v);
  if (!updatePhoto) {
    throw notFound();
  }

  return (
    <PhotoLightbox
      alt={t("Photo of {{name}}", { name: updatePhoto.babyName })}
      blurDataUrl={updatePhoto.blurDataUrl}
      overlay={photo}
      photoUrl={updatePhoto.photoUrl}
    />
  );
}
