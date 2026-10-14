import { PhotoLightbox } from "@/components/baby/photo-lightbox";
import { useQuery } from "@raf-query/react";
import { queries } from "@/lib/convex-queries";
import { prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyUpdatePhotoOverlay } from "@/lib/overlay-nav";
import { useLastMatch } from "@/lib/use-last-match";
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/baby/$publicId/updates/$updateId/photo")({
  loader: async (opts) => {
    const queryClient = opts.context.queryClient;
    const input = { babyId: opts.params.publicId, updateId: opts.params.updateId };
    const updatePhoto = await queryClient.ensure(queries.timeline.getUpdatePhoto, input);
    const updatePhotoDoc = queryClient.getData(queries.timeline.getUpdatePhoto, input);
    if (!updatePhotoDoc) {
      throw notFound();
    }
    prefetchBrowserImage(queryClient, updatePhotoDoc.photoUrl);
    return { updatePhoto };
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
  const [updatePhotoData] = useQuery(queries.timeline.getUpdatePhoto, loaderData.updatePhoto);
  const updatePhoto = useLastMatch(updatePhotoData, (v) => !!v);
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
