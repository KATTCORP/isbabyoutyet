/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents, createBabyArgs, createEncouragementArgs } from "./test.setup";

test("baby and related writes leave a durable targeted purge job", async () => {
  const t = convexTest(schema, modules);
  registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );
  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      name: "Baby Jones",
    },
  });
  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId: created.babyId,
      message: "We cannot wait!",
      visitorId: "visitor-1",
    }),
  );

  const jobs = await t.run(async (ctx) => {
    return await ctx.db.query("cacheInvalidationJobs").collect();
  });

  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    attempts: 0,
    key: `baby:${created.babyId}`,
    tags: [`baby:${created.babyId}`],
  });
  // One job, however many writes: each one after the first asks for a purge
  // after the one in flight.
  expect(jobs[0]?.version).toBeGreaterThan(1);
});

test("a profile's language or time zone change purges the babies its owner's pages inherit from", async () => {
  const t = convexTest(schema, modules);
  registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });
  const pendingKeys = async () => {
    return await t.run(async (ctx) => {
      const jobs = await ctx.db.query("cacheInvalidationJobs").collect();
      return jobs.map((job) => job.key).toSorted();
    });
  };
  const clearJobs = async () => {
    await t.run(async (ctx) => {
      for (const job of await ctx.db.query("cacheInvalidationJobs").collect()) {
        await ctx.db.delete(job._id);
      }
    });
  };

  const first = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Baby Smith" }),
  );
  const second = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2027-01-01", name: "Baby Jones" }),
  );
  await asBob.mutation(api.baby.create, createBabyArgs({ dueDate: "2026-09-01", name: "Bobby" }));
  const aliceBabies = [`baby:${first.babyId}`, `baby:${second.babyId}`].toSorted();

  await clearJobs();
  await asAlice.mutation(api.profile.updateLocale, { locale: "sv" });
  expect(await pendingKeys()).toEqual(aliceBabies);

  await clearJobs();
  await asAlice.mutation(api.profile.updateTimeZone, { timeZone: "Asia/Tokyo" });
  expect(await pendingKeys()).toEqual(aliceBabies);

  // Saving the same values changes no page.
  await clearJobs();
  await asAlice.mutation(api.profile.updateLocale, { locale: "sv" });
  await asAlice.mutation(api.profile.updateTimeZone, { timeZone: "Asia/Tokyo" });
  expect(await pendingKeys()).toEqual([]);
});

test("a job purges twice: at once, and again when its watchdog first runs", async () => {
  const t = convexTest(schema, modules);
  registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Baby Smith" }),
  );
  const pendingJob = async () => {
    return await t.run(async (ctx) => await ctx.db.query("cacheInvalidationJobs").first());
  };
  const job = await pendingJob();
  if (!job) {
    throw new Error("Expected a purge job");
  }

  // The first purge leaves the job for the watchdog.
  await t.mutation(internal.cacheInvalidation.complete, {
    jobId: job._id,
    version: job.version,
  });
  expect(await pendingJob()).toMatchObject({ attempts: 0 });

  await t.mutation(internal.cacheInvalidation.retryPending, { jobId: job._id });
  expect(await pendingJob()).toMatchObject({ attempts: 1 });

  await t.mutation(internal.cacheInvalidation.complete, {
    jobId: job._id,
    version: job.version,
  });
  expect(await pendingJob()).toBeNull();
});
