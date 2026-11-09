import { Button } from "@workspace/ui/components/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Link } from "@tanstack/react-router";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";

type PreviewShareDialogProps = {
  /** `/og` + the preview URL: this preview's share card. */
  imageUrl: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The page title the card would be shared with. */
  title: string;
};

/**
 * Share dialog for `/preview`. It shows the share card the page would get,
 * but a preview has no link worth sending, so it asks them to create a page.
 */
export function PreviewShareDialog(props: PreviewShareDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Share the Link")}</DialogTitle>
          <DialogDescription>{t("This is how your page will look when shared.")}</DialogDescription>
        </DialogHeader>
        <Card>
          <img
            alt={props.title}
            className="aspect-1200/630 w-full object-cover"
            height={OG_IMAGE_HEIGHT}
            src={props.imageUrl}
            width={OG_IMAGE_WIDTH}
          />
          <CardHeader>
            <CardTitle className="line-clamp-2">{props.title}</CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-stretch gap-3">
            <p className="text-center text-sm text-muted-foreground">
              {t("This is just a preview. Create your page to get a link you can share.")}
            </p>
            <Button className="w-full" nativeButton={false} render={<Link to="/auth/signup" />}>
              {t("Create your page 🎈")}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
