import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { milestoneVisibilityForPreset } from "../src/types";
import { loadMilestoneDates } from "./timeline";

async function toBabyBaseDto(ctx: QueryCtx, baby: Doc<"baby">) {
  const milestoneDates = await loadMilestoneDates(ctx, baby._id);
  const {
    userId: _userId,
    ownerTokenIdentifier: _ownerTokenIdentifier,
    lastActivityAt: _lastActivityAt,
    subscriptionCount: _subscriptionCount,
    birthJourney: _birthJourney,
    dueDate: _dueDate,
    dueDateDisplayMode: _dueDateDisplayMode,
    publicDueDateText: _publicDueDateText,
    ...publicBaby
  } = baby;
  return {
    ...publicBaby,
    ...milestoneDates,
    milestoneVisibility: milestoneVisibilityForPreset(baby.birthJourney),
  };
}

/** Public projection physically omits whichever due-date field is inactive. */
export async function toBabyDto(ctx: QueryCtx, baby: Doc<"baby">) {
  const publicBaby = await toBabyBaseDto(ctx, baby);
  switch (baby.dueDateDisplayMode) {
    case "exact": {
      if (!baby.dueDate) {
        throw new Error("Exact due date display requires a due date");
      }
      return {
        ...publicBaby,
        dueDateDisplayMode: "exact" as const,
        dueDate: baby.dueDate,
      };
    }
    case "message": {
      if (!baby.publicDueDateText) {
        throw new Error("Message due date display requires public text");
      }
      return {
        ...publicBaby,
        dueDateDisplayMode: "message" as const,
        publicDueDateText: baby.publicDueDateText,
      };
    }
  }
}

export async function toManagerBabyDto(ctx: QueryCtx, baby: Doc<"baby">) {
  return {
    ...(await toBabyBaseDto(ctx, baby)),
    birthJourney: baby.birthJourney,
    dueDate: baby.dueDate,
    dueDateDisplayMode: baby.dueDateDisplayMode,
    publicDueDateText: baby.publicDueDateText,
  };
}
