import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/copy-text";
import { useI18n } from "@/lib/i18n";
import { useTransientFlag } from "@/lib/use-transient-flag";

type PreviewShareDialogProps = {
  /** Absolute URL that reopens this exact preview (name, dates, theme). */
  link: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

/**
 * Share dialog for `/preview`. A preview has no saved page (and so no OG
 * card), so it shares the preview URL itself.
 */
export function PreviewShareDialog(props: PreviewShareDialogProps) {
  const { t } = useI18n();
  const [copied, showCopied] = useTransientFlag(2000);

  async function copyLink() {
    try {
      await copyTextToClipboard(props.link);
      showCopied();
      toast.success(t("Copied to clipboard"));
    } catch (error) {
      toast.error(
        t("Failed to copy to clipboard: {{detail}}", {
          detail: error instanceof Error ? error.message : t("Unknown error"),
        }),
      );
    }
  }

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Share the Link")}</DialogTitle>
          <DialogDescription>
            {t("Anyone with this link sees this exact preview.")}
          </DialogDescription>
        </DialogHeader>
        <p className="truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {props.link}
        </p>
        <Button
          className="w-full"
          onClick={() => {
            void copyLink();
          }}
        >
          {copied ? <CheckCircleIcon data-icon="inline-start" /> : null}
          {copied ? t("Copied!") : t("Copy link to share")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
