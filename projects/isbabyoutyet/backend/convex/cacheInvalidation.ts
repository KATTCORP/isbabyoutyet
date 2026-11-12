import { v } from "convex/values";
import { deriveCachePurgeToken } from "../src/cacheTags";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

/** When the watchdog first runs: it purges again, and retries from then on. */
const INITIAL_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

const cacheInvalidationJobValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("cacheInvalidationJobs"),
  attempts: v.number(),
  createdAt: v.number(),
  key: v.string(),
  tags: v.array(v.string()),
  version: v.number(),
});

function retryDelay(attempts: number) {
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** Math.min(attempts, 3), MAX_RETRY_DELAY_MS);
}

function isLocalSite(siteUrl: string) {
  const hostname = new URL(siteUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Purges one cache tag from the web app's CDN, durably: the job and its
 * watchdog commit in the same transaction as the data change. The watchdog
 * is a scheduled mutation (exactly-once) and keeps launching the idempotent
 * purge action until Vercel acknowledges the deletion. A tag that already
 * has a job waiting is purged once more after the one in flight.
 *
 * Every job purges twice: at once, and again when the watchdog first runs
 * (`complete`). A page rendered from the data before the change can reach
 * the CDN after the first purge, and the second one drops it.
 */
export async function enqueueCachePurge(ctx: MutationCtx, tag: string) {
  const existing = await ctx.db
    .query("cacheInvalidationJobs")
    .withIndex("by_key", (q) => q.eq("key", tag))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, { version: existing.version + 1 });
    return existing._id;
  }

  const jobId = await ctx.db.insert("cacheInvalidationJobs", {
    attempts: 0,
    createdAt: Date.now(),
    key: tag,
    tags: [tag],
    version: 1,
  });
  await ctx.scheduler.runAfter(0, internal.cacheInvalidation.purge, { jobId });
  await ctx.scheduler.runAfter(INITIAL_RETRY_DELAY_MS, internal.cacheInvalidation.retryPending, {
    jobId,
  });
  return jobId;
}

export const getPending = internalQuery({
  args: { jobId: v.id("cacheInvalidationJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
  returns: v.union(cacheInvalidationJobValidator, v.null()),
});

export const purge = internalAction({
  args: { jobId: v.id("cacheInvalidationJobs") },
  handler: async (ctx, args) => {
    const job: Doc<"cacheInvalidationJobs"> | null = await ctx.runQuery(
      internal.cacheInvalidation.getPending,
      { jobId: args.jobId },
    );
    if (!job) {
      return null;
    }

    const secret = env.BETTER_AUTH_SECRET;
    const siteUrl = env.SITE_URL;
    if (!secret || !siteUrl) {
      throw new Error("Cache purge requires BETTER_AUTH_SECRET and SITE_URL");
    }

    if (isLocalSite(siteUrl)) {
      const completed: null = await ctx.runMutation(internal.cacheInvalidation.complete, {
        jobId: job._id,
        version: job.version,
      });
      return completed;
    }

    const response = await fetch(new URL("/api/cache/purge", siteUrl), {
      body: JSON.stringify({ tags: job.tags }),
      headers: {
        Authorization: `Bearer ${await deriveCachePurgeToken(secret)}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Cache purge failed with status ${response.status}`);
    }

    const completed: null = await ctx.runMutation(internal.cacheInvalidation.complete, {
      jobId: job._id,
      version: job.version,
    });
    return completed;
  },
  returns: v.null(),
});

export const complete = internalMutation({
  args: {
    jobId: v.id("cacheInvalidationJobs"),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }
    if (job.version !== args.version) {
      await ctx.scheduler.runAfter(0, internal.cacheInvalidation.purge, { jobId: job._id });
      return null;
    }
    if (job.attempts === 0) {
      // The first purge. The watchdog runs the second, which ends the job.
      return null;
    }
    await ctx.db.delete(job._id);
    return null;
  },
  returns: v.null(),
});

export const retryPending = internalMutation({
  args: { jobId: v.id("cacheInvalidationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }

    const attempts = job.attempts + 1;
    await ctx.db.patch(job._id, { attempts });
    await ctx.scheduler.runAfter(0, internal.cacheInvalidation.purge, { jobId: job._id });
    await ctx.scheduler.runAfter(retryDelay(attempts), internal.cacheInvalidation.retryPending, {
      jobId: job._id,
    });
    return null;
  },
  returns: v.null(),
});
