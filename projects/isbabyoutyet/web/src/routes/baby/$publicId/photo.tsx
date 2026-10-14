import { PhotoLightbox } from "@/components/baby/photo-lightbox";
import { useQuery } from "@raf-query/react";
import { queries } from "@/lib/convex-queries";
import { prefetchBrowserImage } from "@/lib/image-prefetch";
import { useI18n } from "@/lib/i18n";
import { useBabyPhotoOverlay } from "@/lib/overlay-nav";
import { useLastMatch } from "@/lib/use-last-match";
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/baby/$publicId/photo")({
  loader: async (opts) => {
    const queryClient = opts.context.queryClient;
    const input = { id: opts.params.publicId };
    const baby = await queryClient.ensure(queries.baby.getByPublicId, input);
    const babyDoc = queryClient.getData(queries.baby.getByPublicId, input);
    if (!babyDoc?.photoUrl) {
      throw notFound();
    }
    prefetchBrowserImage(queryClient, babyDoc.photoUrl);
    return { baby };
  },
  component: BabyPhotoOverlay,
});

export function BabyPhotoOverlay() {
  const { t } = useI18n();
  const params = Route.useParams();
  const loaderData = Route.useLoaderData();
  const photo = useBabyPhotoOverlay(params.publicId);

  const [babyData] = useQuery(queries.baby.getByPublicId, loaderData.baby);
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
