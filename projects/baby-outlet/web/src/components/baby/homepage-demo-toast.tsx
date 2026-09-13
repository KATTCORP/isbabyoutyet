import { useI18n } from "@/lib/i18n";
import { Info } from "@phosphor-icons/react";
import { isHomepageDemoPublicId } from "@baby-outlet/backend/src/seedCredentials";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item";
import { useEffect } from "react";
import { toast } from "sonner";

const HOMEPAGE_DEMO_TOAST_ID = "homepage-demo-baby";

type HomepageDemoToastProps = {
  publicId: string;
};

/**
 * Persistent notice on the public homepage demo baby so visitors know they
 * can try posting without affecting a real family.
 */
export function HomepageDemoToast(props: HomepageDemoToastProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!isHomepageDemoPublicId(props.publicId)) return;

    toast.custom(
      () => (
        <Item
          variant="outline"
          className="min-w-[300px] max-w-sm border-primary/40 bg-background shadow-lg"
        >
          <ItemMedia className="size-10 rounded-full bg-primary/10">
            <Info className="size-5 text-primary" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t("This is a demo baby")}</ItemTitle>
            <ItemDescription>
              {t("Feel free to post test messages — they get cleared on each deploy.")}
            </ItemDescription>
          </ItemContent>
        </Item>
      ),
      {
        id: HOMEPAGE_DEMO_TOAST_ID,
        duration: Infinity,
        closeButton: true,
      },
    );

    return () => {
      toast.dismiss(HOMEPAGE_DEMO_TOAST_ID);
    };
  }, [props.publicId, t]);

  return null;
}
