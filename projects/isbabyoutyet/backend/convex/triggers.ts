import { TableHistory } from "convex-table-history";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { babyCacheTag } from "../src/cacheTags";
import { enqueueCachePurge } from "./cacheInvalidation";

// Table history for the baby table, recorded via triggers on every write.
const babyAuditLog = new TableHistory<DataModel, "baby">(components.babyAuditLog);

const triggers = new Triggers<DataModel, MutationCtx>();
triggers.register("baby", babyAuditLog.trigger());

// Everything the web app's CDN shares about a baby carries the baby's cache
// tag, so a write to any table its public page reads purges that tag.
triggers.register("baby", async (ctx, change) => {
  await enqueueCachePurge(ctx, babyCacheTag(change.id));
});
triggers.register("timelineItems", async (ctx, change) => {
  await enqueueCachePurge(ctx, babyCacheTag((change.newDoc ?? change.oldDoc).babyId));
});
triggers.register("updates", async (ctx, change) => {
  await enqueueCachePurge(ctx, babyCacheTag((change.newDoc ?? change.oldDoc).babyId));
});
triggers.register("encouragements", async (ctx, change) => {
  await enqueueCachePurge(ctx, babyCacheTag((change.newDoc ?? change.oldDoc).babyId));
});

/** The most babies one owner's dashboard lists (`listBabiesForUser`). */
const MAX_OWNED_BABIES = 100;

// A baby page inherits its language and time zone from its owner's profile
// (`resolveBabyPreferences`).
triggers.register("userProfiles", async (ctx, change) => {
  const profile = change.newDoc ?? change.oldDoc;
  if (
    change.oldDoc?.locale === change.newDoc?.locale &&
    change.oldDoc?.timeZone === change.newDoc?.timeZone
  ) {
    return;
  }
  const babies = await ctx.db
    .query("baby")
    .withIndex("by_ownerTokenIdentifier", (q) =>
      q.eq("ownerTokenIdentifier", profile.tokenIdentifier),
    )
    .take(MAX_OWNED_BABIES);
  for (const baby of babies) {
    await enqueueCachePurge(ctx, babyCacheTag(baby._id));
  }
});

/**
 * Mutation wrapper that records baby-table writes to the audit log and
 * purges the baby's cache tag. Use it for every mutation that writes baby,
 * timeline, update, encouragement, or profile rows.
 */
export const mutationWithTriggers = customMutation(mutation, customCtx(triggers.wrapDB));
export const internalMutationWithTriggers = customMutation(
  internalMutation,
  customCtx(triggers.wrapDB),
);
