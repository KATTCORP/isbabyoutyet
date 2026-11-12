import { PhotoLightbox } from "@/components/baby/photo-lightbox";
import { load, swr, useQuery } from "@raf-query/react";
import { use } from "react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyPhotoOverlay } from "@/lib/overlay-nav";
import { useLastMatch } from "@/lib/use-last-match";
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/baby/$publicId/photo")({
  loader: async (opts) => {
    const queryClient = opts.context.queryClient;
    const [handles, data] = await load(queryClient, {
      baby: swr(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId }),
    });
    if (!data.baby?.photoUrl) {
      throw notFound();
    }
    prefetchBrowserImage(queryClient, data.baby.photoUrl);
    return handles;
  },
  component: BabyPhotoOverlay,
});

export function BabyPhotoOverlay() {
  const { t } = useI18n();
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const photo = useBabyPhotoOverlay(params.publicId);

  const [babyDataThenable] = useQuery(convexQuery(api.baby.getByPublicId), loaderData.baby);
  const babyData = use(babyDataThenable);
  const babyDoc = useLastMatch(babyData, (v) => {
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
