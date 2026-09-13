import { Dialog, DialogContent } from "@workspace/ui/components/dialog";
import { XIcon } from "@phosphor-icons/react";
import { useI18n } from "@/lib/i18n";
import { BlurImage } from "@/components/blur-image";
import type { OverlayControl } from "@/lib/overlay-nav";

type PhotoLightboxProps = {
  alt: string;
  blurDataUrl: string | null;
  overlay: OverlayControl;
  photoUrl: string;
};

export function PhotoLightbox(props: PhotoLightboxProps) {
  const { t } = useI18n();

  return (
    <Dialog {...props.overlay.rootProps}>
      <DialogContent
        className="max-w-3xl border-0 bg-transparent p-0 shadow-none"
        showCloseButton={false}
      >
        <button
          aria-label={t("Close photo")}
          className="absolute -top-12 right-0 rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
          onClick={props.overlay.close}
          type="button"
        >
          <XIcon className="h-6 w-6" />
        </button>
        <BlurImage
          alt={props.alt}
          blurDataUrl={props.blurDataUrl}
          className="h-auto max-h-[80vh] w-full rounded-lg object-contain"
          src={props.photoUrl}
        />
      </DialogContent>
    </Dialog>
  );
}
