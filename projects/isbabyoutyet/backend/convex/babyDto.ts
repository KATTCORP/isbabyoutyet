import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { babyOgImageHash } from "../src/babyOgImage";
import { milestoneVisibilityForPreset } from "../src/types";
import type { MilestoneDates, MilestoneVisibility } from "../src/types";
import { loadMilestoneDates } from "./timeline";
import { resolveBabyPreferences } from "./babyPreferences";
import type { BabyPreferences } from "./babyPreferences";

/** What every projection shares: no owner identity, counters, or due-date fields. */
type BabyBaseDto = Omit<
  Doc<"baby">,
  | "birthJourney"
  | "dueDate"
  | "dueDateDisplayMode"
  | "lastActivityAt"
  | "ownerTokenIdentifier"
  | "publicDueDateText"
  | "subscriptionCount"
  | "userId"
> &
  MilestoneDates &
  BabyPreferences & { milestoneVisibility: MilestoneVisibility };

type ExactDueDateBabyDto = BabyBaseDto & { dueDate: string; dueDateDisplayMode: "exact" };

type MessageDueDateBabyDto = BabyBaseDto & {
  dueDateDisplayMode: "message";
  publicDueDateText: string | undefined;
};

export type BabyDto = (ExactDueDateBabyDto | MessageDueDateBabyDto) & { ogImageHash: string };

export type ManagerBabyDto = BabyBaseDto &
  Pick<Doc<"baby">, "birthJourney" | "dueDate" | "dueDateDisplayMode" | "publicDueDateText">;

async function toBabyBaseDto(ctx: QueryCtx, baby: Doc<"baby">): Promise<BabyBaseDto> {
  const [milestoneDates, preferences] = await Promise.all([
    loadMilestoneDates(ctx, baby._id),
    resolveBabyPreferences(ctx.db, baby),
  ]);
  const {
    birthJourney: _birthJourney,
    dueDate: _dueDate,
    dueDateDisplayMode: _dueDateDisplayMode,
    lastActivityAt: _lastActivityAt,
    ownerTokenIdentifier: _ownerTokenIdentifier,
    publicDueDateText: _publicDueDateText,
    subscriptionCount: _subscriptionCount,
    userId: _userId,
    ...publicBaby
  } = baby;
  return {
    ...publicBaby,
    ...milestoneDates,
    ...preferences,
    milestoneVisibility: milestoneVisibilityForPreset(baby.birthJourney),
  };
}

function ogImageHashForPublicBaby(baby: ExactDueDateBabyDto | MessageDueDateBabyDto) {
  return babyOgImageHash({
    babyBorn: baby.babyBorn,
    dueDate: baby.dueDateDisplayMode === "exact" ? baby.dueDate : null,
    dueDateDisplayMode: baby.dueDateDisplayMode,
    laborStarted: baby.laborStarted,
    locale: baby.resolvedLocale,
    milestoneVisibility: baby.milestoneVisibility,
    name: baby.name,
    photoId: baby.photoId ?? null,
    publicDueDateText:
      baby.dueDateDisplayMode === "message" ? (baby.publicDueDateText ?? null) : null,
    theme: baby.theme ?? null,
    timeZone: baby.timeZone,
    wentToHospital: baby.wentToHospital,
  });
}

/** Public projection physically omits whichever due-date field is inactive. */
export async function toBabyDto(ctx: QueryCtx, baby: Doc<"baby">): Promise<BabyDto> {
  const publicBaby = await toBabyBaseDto(ctx, baby);
  switch (baby.dueDateDisplayMode) {
    case "exact": {
      if (!baby.dueDate) {
        throw new Error("Exact due date display requires a due date");
      }
      const dto: ExactDueDateBabyDto = {
        ...publicBaby,
        dueDate: baby.dueDate,
        dueDateDisplayMode: "exact",
      };
      return { ...dto, ogImageHash: ogImageHashForPublicBaby(dto) };
    }
    case "message": {
      const dto: MessageDueDateBabyDto = {
        ...publicBaby,
        dueDateDisplayMode: "message",
        publicDueDateText: baby.publicDueDateText?.trim(),
      };
      return { ...dto, ogImageHash: ogImageHashForPublicBaby(dto) };
    }
    default: {
      const _exhaustive: never = baby.dueDateDisplayMode;
      return _exhaustive;
    }
  }
}

export async function toManagerBabyDto(ctx: QueryCtx, baby: Doc<"baby">): Promise<ManagerBabyDto> {
  return {
    ...(await toBabyBaseDto(ctx, baby)),
    birthJourney: baby.birthJourney,
    dueDate: baby.dueDate,
    dueDateDisplayMode: baby.dueDateDisplayMode,
    publicDueDateText: baby.publicDueDateText,
  };
}
