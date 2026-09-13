import type { Milestone, NotifiableStatus } from "@baby-outlet/backend/src/types";
import type { TranslationKey } from "@/lib/i18n";

export const MILESTONE_LABEL_KEYS = {
  labor_started: "Labour started",
  gone_to_hospital: "Gone to hospital",
  born: "Baby born",
} as const satisfies Record<Milestone, TranslationKey>;

export const NOTIFICATION_LABEL_KEYS = {
  ...MILESTONE_LABEL_KEYS,
  photo_added: "Photo added",
  update_posted: "Update posted",
} as const satisfies Record<NotifiableStatus, TranslationKey>;
