import { useEffect } from "react";
import { toast } from "sonner";
import { isHomepageDemoPublicId } from "@isbabyoutyet/backend/src/seedCredentials";
import { useI18n } from "@/lib/i18n";
import { createDismissedIdsStore, useIsDismissed } from "@/lib/use-dismissed-ids";

const demoToastDismissals = createDismissedIdsStore();

function demoToastId(publicId: string) {
  return `homepage-demo-${publicId}`;
}

/** @internal */
export function resetDemoToastDismissals() {
  demoToastDismissals.clear();
}

/**
 * Persistent Sonner info toast on homepage demo babies. Owns the dismiss
 * store and show/dismiss against Sonner's toast manager so Got it plays the
 * built-in exit animation.
 */
export function useDemoToast(opts: { enabled: boolean; publicId: string }) {
  const { t } = useI18n();
  const dismissed = useIsDismissed(demoToastDismissals, opts.publicId);
  const shouldShow = opts.enabled && isHomepageDemoPublicId(opts.publicId) && !dismissed;
  const toastId = demoToastId(opts.publicId);
  const title = t("This is a demo baby");
  const description = t("Feel free to post test messages — we reset this demo daily.");
  const actionLabel = t("Got it");

  useEffect(() => {
    if (!shouldShow) {
      return;
    }
    // Cleanup `toast.dismiss` also fires `onDismiss`. Only persist when the
    // visitor closed the toast (Got it, X, swipe) — not on unmount.
    let persistOnDismiss = true;
    toast.info(title, {
      action: {
        label: actionLabel,
        onClick: () => {
          toast.dismiss(toastId);
        },
      },
      description,
      duration: Infinity,
      id: toastId,
      onDismiss: () => {
        if (!persistOnDismiss) {
          return;
        }
        demoToastDismissals.dismiss(opts.publicId);
      },
    });
    return () => {
      persistOnDismiss = false;
      toast.dismiss(toastId);
    };
  }, [shouldShow, toastId, title, description, actionLabel, opts.publicId]);
}
