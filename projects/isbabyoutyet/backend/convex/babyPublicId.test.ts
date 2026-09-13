import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  generateUniquePublicId,
  isPublicIdTaken,
  normalizePublicId,
  slugifyPublicId,
  transferBabyPublicId,
} from "./babyPublicId";
import { modules, registerComponents, createBabyArgs } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

test("slugifyPublicId strips punctuation and collapses separators", () => {
  expect(slugifyPublicId("  Baby Smith! ")).toBe("baby-smith");
  expect(slugifyPublicId("Baby__Smith -- Jr")).toBe("baby-smith-jr");
  expect(slugifyPublicId("!!!")).toBe("");
});

test("normalizePublicId rejects slugs that contain no letters or numbers", () => {
  expect(normalizePublicId("Baby 2")).toBe("baby-2");
  expect(() => normalizePublicId("!!!")).toThrow("Public ID must contain letters or numbers");
});

test("isPublicIdTaken reserves demo slugs, current occupants, and other owners' history", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Working Title" }),
  );
  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: { name: "Final Name" },
  });

  const aliceToken = await t.run(async (ctx) => {
    const baby = await ctx.db.get(created.babyId);
    if (!baby) {
      throw new Error("missing baby");
    }
    return baby.ownerTokenIdentifier;
  });

  await t.run(async (ctx) => {
    expect(
      await isPublicIdTaken({
        db: ctx.db,
        excludeTokenIdentifier: "other",
        publicId: "juniper-hale",
      }),
    ).toBe(true);
    expect(
      await isPublicIdTaken({
        db: ctx.db,
        excludeTokenIdentifier: "other",
        publicId: "final-name",
      }),
    ).toBe(true);
    expect(
      await isPublicIdTaken({
        db: ctx.db,
        excludeTokenIdentifier: "other",
        publicId: "working-title",
      }),
    ).toBe(true);
    expect(
      await isPublicIdTaken({
        db: ctx.db,
        excludeTokenIdentifier: aliceToken,
        publicId: "working-title",
      }),
    ).toBe(false);
    expect(
      await isPublicIdTaken({
        db: ctx.db,
        excludeTokenIdentifier: "other",
        publicId: "brand-new-slug",
      }),
    ).toBe(false);
  });
});

test("isPublicIdTaken treats history whose baby row is gone as free", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Ghost" }),
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("babyPublicIdHistory", {
      babyId: created.babyId,
      publicId: "orphan-slug",
    });
    await ctx.db.delete(created.babyId);
    expect(
      await isPublicIdTaken({
        db: ctx.db,
        excludeTokenIdentifier: "other",
        publicId: "orphan-slug",
      }),
    ).toBe(false);
  });
});

test("generateUniquePublicId appends -1, -2 when the base slug is taken", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.baby.create, createBabyArgs({ dueDate: "2026-09-01", name: "River" }));
  await asAlice.mutation(api.baby.create, createBabyArgs({ dueDate: "2026-09-01", name: "River" }));

  const asBob = t.withIdentity({ subject: "bob" });
  const third = await asBob.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "River" }),
  );
  expect(third.publicId).toBe("river-2");

  await t.run(async (ctx) => {
    const next = await generateUniquePublicId({
      baseName: "River",
      db: ctx.db,
      excludeTokenIdentifier: "https://convex.test|carol",
    });
    expect(next).toBe("river-3");
  });
});

test("transferBabyPublicId clears the destination slug's history so the claimant owns it", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const occupant = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Canonical" }),
  );
  await asAlice.mutation(api.baby.update, {
    id: occupant.babyId,
    patch: { name: "Alice Baby" },
  });
  expect(await t.query(api.baby.getByPublicId, { id: "canonical" })).toMatchObject({
    _id: occupant.babyId,
  });

  const asBob = t.withIdentity({ subject: "bob" });
  const claimant = await asBob.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Real Baby" }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(claimant.babyId, { publicId: "baby-2" });
  });

  await t.run(async (ctx) => {
    const result = await transferBabyPublicId(ctx, {
      actorEmail: null,
      actorTokenIdentifier: "https://convex.test|staff",
      actorUserId: "staff",
      fromPublicId: "baby-2",
      motivation: "Give the real page the canonical slug",
      toPublicId: "canonical",
    });
    expect(result).toEqual({
      displacedPublicId: null,
      fromPublicId: "baby-2",
      toPublicId: "canonical",
    });
  });

  expect(await t.query(api.baby.getByPublicId, { id: "canonical" })).toMatchObject({
    _id: claimant.babyId,
    publicId: "canonical",
  });
  expect(await t.query(api.baby.getByPublicId, { id: "baby-2" })).toMatchObject({
    _id: claimant.babyId,
    publicId: "canonical",
  });
  expect(await t.query(api.baby.getByPublicId, { id: "alice-baby" })).toMatchObject({
    _id: occupant.babyId,
    publicId: "alice-baby",
  });
});
