import { useEffect } from "react";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import type { EncouragementFormDraft } from "@/lib/encouragement-message-draft";
import {
  ENCOURAGEMENT_MESSAGE_DRAFT_DEBOUNCE_MS,
  writeEncouragementFormDraft,
} from "@/lib/encouragement-message-draft";

/**
 * Debounced sessionStorage sync for encouragement form drafts, keyed per baby.
 */
export function useEncouragementMessageDraft(
  opts: { babyId: Id<"baby"> } & EncouragementFormDraft,
) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeEncouragementFormDraft(opts.babyId, {
        authorName: opts.authorName,
        message: opts.message,
      });
    }, ENCOURAGEMENT_MESSAGE_DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [opts.babyId, opts.authorName, opts.message]);
}
