import { TableHistory } from "convex-table-history";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ALL_BABY_PAGES_CACHE_TAG, babyIdCacheTag, babyPublicIdCacheTag } from "../src/cacheTags";
import { enqueueCacheInvalidation } from "./cacheInvalidation";

// Table history for the baby table, recorded via triggers on every write.
const babyAuditLog = new TableHistory<DataModel, "baby">(components.babyAuditLog);

const triggers = new Triggers<DataModel, MutationCtx>();
triggers.register("baby", babyAuditLog.trigger());

triggers.register("baby", async (ctx, change) => {
  const tags = new Set([babyIdCacheTag(change.id)]);
  if (change.oldDoc) {
    tags.add(babyPublicIdCacheTag(change.oldDoc.publicId));
  }
  if (change.newDoc) {
    tags.add(babyPublicIdCacheTag(change.newDoc.publicId));
  }
  await enqueueCacheInvalidation(ctx, {
    key: `baby:${change.id}`,
    tags: [...tags],
  });
});

async function enqueueRelatedBabyChange(ctx: MutationCtx, babyId: Id<"baby">) {
  const baby = await ctx.db.get("baby", babyId);
  const tags = [babyIdCacheTag(babyId)];
  if (baby) {
    tags.push(babyPublicIdCacheTag(baby.publicId));
  }
  await enqueueCacheInvalidation(ctx, {
    key: `baby:${babyId}`,
    tags,
  });
}

triggers.register("timelineItems", async (ctx, change) => {
  await enqueueRelatedBabyChange(ctx, (change.newDoc ?? change.oldDoc).babyId);
});
triggers.register("updates", async (ctx, change) => {
  await enqueueRelatedBabyChange(ctx, (change.newDoc ?? change.oldDoc).babyId);
});
triggers.register("encouragements", async (ctx, change) => {
  await enqueueRelatedBabyChange(ctx, (change.newDoc ?? change.oldDoc).babyId);
});
triggers.register("userProfiles", async (ctx, change) => {
  if (change.oldDoc?.locale === change.newDoc?.locale) {
    return;
  }
  await enqueueCacheInvalidation(ctx, {
    key: "all-baby-pages",
    tags: [ALL_BABY_PAGES_CACHE_TAG],
  });
});

/**
 * Mutation wrapper that records baby-table writes to the audit log.
 * It also durably enqueues Vercel cache deletion for writes to public baby-page
 * data. Use for every mutation that writes baby, timeline, update,
 * encouragement, or profile rows.
 */
export const mutationWithTriggers = customMutation(mutation, customCtx(triggers.wrapDB));
export const internalMutationWithTriggers = customMutation(
  internalMutation,
  customCtx(triggers.wrapDB),
);
