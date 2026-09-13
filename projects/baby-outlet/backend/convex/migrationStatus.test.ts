import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerMigrationsComponent } from "./test.setup";

test("deployment status waits for every required table migration", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  expect(await t.query(internal.migrations.deploymentStatus, {})).toEqual({
    isDone: false,
    failed: [],
  });
  expect(await t.query(internal.migrations.historicalDeploymentStatus, {})).toEqual({
    isDone: false,
    failed: [],
  });
});

test("deployment migrations have separate historical and newly-added runners", async () => {
  const t = convexTest(schema, modules);
  await registerMigrationsComponent(t);

  await expect(
    t.mutation(internal.migrations.runAll, {
      oneBatchOnly: true,
    }),
  ).resolves.toBeTruthy();
  await expect(
    t.mutation(internal.migrations.runBirthJourneyBackfill, {
      oneBatchOnly: true,
    }),
  ).resolves.toBeTruthy();
  await expect(
    t.mutation(internal.migrations.runDueDateDisplayBackfill, {
      oneBatchOnly: true,
    }),
  ).resolves.toBeTruthy();
  await expect(
    t.mutation(internal.migrations.runPushImageBackfill, {
      oneBatchOnly: true,
    }),
  ).resolves.toBeTruthy();
});
