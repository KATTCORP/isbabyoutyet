/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents, createBabyArgs, createEncouragementArgs } from "./test.setup";

test("baby and related writes leave a durable targeted purge job", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
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
  });
  expect(jobs[0]?.tags).toEqual(
    expect.arrayContaining([`baby-id:${created.babyId}`, "baby-public-id:baby-jones"]),
  );
  expect(jobs[0]?.version).toBeGreaterThanOrEqual(1);
});

test("profile locale changes purge every baby page without reading an unbounded baby list", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.profile.updateLocale, { locale: "en-GB" });
  await asAlice.mutation(api.profile.updateLocale, { locale: "sv" });

  const jobs = await t.run(async (ctx) => {
    return await ctx.db.query("cacheInvalidationJobs").collect();
  });

  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    key: "all-baby-pages",
    tags: ["baby-pages"],
    version: 2,
  });
});
