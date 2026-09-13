import { expect, test } from "vitest";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { patchOwnedBaby, seedOwnedBaby } from "@/test/convexTestSeed";

test("patchOwnedBaby throws when the baby row is gone", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await harness.t.run(async (ctx) => {
    await ctx.db.delete(baby.babyId);
  });

  await expect(
    patchOwnedBaby(harness, {
      id: baby.babyId,
      patch: { name: "Gone" },
    }),
  ).rejects.toThrow("Baby not found");
});

test("seedOwnedBaby without a due date uses the custom-message display mode", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: null, name: "Baby Smith" });
  const stored = await harness.t.run(async (ctx) => ctx.db.get(baby.babyId));
  expect(stored).toMatchObject({
    dueDate: null,
    dueDateDisplayMode: "message",
    publicDueDateText: null,
  });
});
