import type { PreviewBabyData } from "@isbabyoutyet/backend/src/types";
import { milestoneVisibilityForPreset } from "@isbabyoutyet/backend/src/types";
import { DEFAULT_TIME_ZONE } from "@isbabyoutyet/backend/src/timeZone";
import { z } from "zod";

/**
 * Search params of `/preview`. The page and its OG card (`/og/preview`) read
 * the same params, so a preview link and its card always match.
 */
export const previewSearchSchema = z.object({
  babyBorn: z.string().nullable().optional(),
  babyBornMessage: z.string().nullable().optional(),
  birthJourney: z
    .union([
      z.literal("labor"),
      z.literal("home_birth"),
      z.literal("planned_c_section"),
      z.literal("custom"),
    ])
    .optional(),
  dueDate: z.string().nullable().optional(),
  dueDateDisplayMode: z.union([z.literal("exact"), z.literal("message")]).optional(),
  hospitalMessage: z.string().nullable().optional(),
  laborStarted: z.string().nullable().optional(),
  laborStartedMessage: z.string().nullable().optional(),
  name: z.string().default("Baby"),
  publicDueDateText: z.string().nullable().optional(),
  settings: z.boolean().optional(),
  share: z.boolean().optional(),
  theme: z.string().nullable().optional(),
  wentToHospital: z.string().nullable().optional(),
});

export type PreviewSearch = z.infer<typeof previewSearchSchema>;

/** The preview's baby: a week from its due date unless the search says otherwise. */
export function previewBabyFromSearch(search: PreviewSearch): PreviewBabyData {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  return {
    babyBorn: null,
    babyBornMessage: null,
    dueDate: dueDate.toISOString(),
    dueDateDisplayMode: "exact",
    hospitalMessage: null,
    laborStarted: null,
    laborStartedMessage: null,
    photoId: null,
    publicDueDateText: null,
    theme: null,
    timeZone: DEFAULT_TIME_ZONE,
    wentToHospital: null,
    ...search,
    milestoneVisibility: milestoneVisibilityForPreset(search.birthJourney ?? "labor"),
  };
}
