import { PhotoLightbox } from "@/components/baby/photo-lightbox";
import { load, swr, useQuery } from "@raf-query/react";
import { use } from "react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyUpdatePhotoOverlay } from "@/lib/overlay-nav";
import { useLastMatch } from "@/lib/use-last-match";
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/baby/$publicId/updates/$updateId/photo")({
  loader: async (opts) => {
    const queryClient = opts.context.queryClient;
    const input = { babyId: opts.params.publicId, updateId: opts.params.updateId };
    const [handles, data] = await load(queryClient, {
      updatePhoto: swr(convexQuery(api.timeline.getUpdatePhoto), input),
    });
    if (!data.updatePhoto) {
      throw notFound();
    }
    prefetchBrowserImage(queryClient, data.updatePhoto.photoUrl);
    return handles;
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
  const [updatePhotoDataThenable] = useQuery(
    convexQuery(api.timeline.getUpdatePhoto),
    loaderData.updatePhoto,
  );
  const updatePhotoData = use(updatePhotoDataThenable);
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
