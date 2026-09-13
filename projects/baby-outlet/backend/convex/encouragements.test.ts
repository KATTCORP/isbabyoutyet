import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, registerComponents } from "./test.setup";

const FIRST_PAGE = { numItems: 10, cursor: null };

async function setupWithBaby() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const babyId: Id<"baby"> = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      userId: "alice",
      ownerTokenIdentifier: "https://convex.test|alice",
      name: "Baby Smith",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: "baby-smith",
      birthJourney: "labor",
      lastActivityAt: 1,
      subscriptionCount: 0,
    });
  });
  return { t, babyId };
}

test("visitors can create encouragements and list them", async () => {
  const { t, babyId } = await setupWithBaby();

  await t.mutation(api.encouragements.create, {
    babyId,
    authorName: "Grandma",
    message: "We can't wait to meet you!",
    visitorId: "visitor-1",
  });
  await t.mutation(api.encouragements.create, {
    babyId,
    authorName: "  Uncle Bob  ",
    message: "Good luck! ",
    visitorId: "visitor-2",
  });

  const result = await t.query(api.encouragements.listByBaby, {
    babyId,
    visitorId: "visitor-2",
    paginationOpts: FIRST_PAGE,
  });

  // Newest first; names and messages are trimmed; visitor credential and
  // metadata are never exposed — only an isMine marker for the caller
  expect(result.page).toMatchObject([
    { authorName: "Uncle Bob", message: "Good luck!", isMine: true },
    { authorName: "Grandma", message: "We can't wait to meet you!", isMine: false },
  ]);
  expect(result.page[0]).not.toHaveProperty("visitorId");
  expect(result.page[0]).not.toHaveProperty("userAgent");
});

test("the author can edit their encouragement within the edit window", async () => {
  const { t, babyId } = await setupWithBaby();

  const encouragementId = await t.mutation(api.encouragements.create, {
    babyId,
    authorName: "Grandma",
    message: "Typo mesage",
    visitorId: "visitor-1",
  });

  await t.mutation(api.encouragements.update, {
    encouragementId,
    visitorId: "visitor-1",
    message: "Fixed message",
  });

  const result = await t.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
  });
  expect(result.page).toMatchObject([{ message: "Fixed message" }]);
});

test("editing is refused for the wrong visitor and after the edit window", async () => {
  const { t, babyId } = await setupWithBaby();

  const encouragementId = await t.mutation(api.encouragements.create, {
    babyId,
    authorName: "Grandma",
    message: "Original message",
    visitorId: "visitor-1",
  });

  // The visitorId is the edit credential — a different visitor is refused
  await expect(
    t.mutation(api.encouragements.update, {
      encouragementId,
      visitorId: "visitor-imposter",
      message: "Hijacked",
    }),
  ).rejects.toThrow("Not authorized to edit this encouragement");

  // ...and so is a stranger trying to delete it
  await expect(
    t.mutation(api.encouragements.remove, {
      encouragementId,
      visitorId: "visitor-imposter",
    }),
  ).rejects.toThrow("Not authorized to delete this encouragement");

  // After the 15-minute window even the author can no longer edit
  await t.run(async (ctx) => {
    await ctx.db.patch(encouragementId, { createdAt: Date.now() - 16 * 60 * 1000 });
  });
  await expect(
    t.mutation(api.encouragements.update, {
      encouragementId,
      visitorId: "visitor-1",
      message: "Too late",
    }),
  ).rejects.toThrow("Edit window has expired");
});

test("the baby's owner can remove an encouragement", async () => {
  const { t, babyId } = await setupWithBaby();

  const encouragementId = await t.mutation(api.encouragements.create, {
    babyId,
    authorName: "Stranger",
    message: "Something inappropriate",
    visitorId: "visitor-x",
  });

  const asUnrelatedUser = t.withIdentity({ subject: "bob" });
  await expect(
    asUnrelatedUser.mutation(api.encouragements.remove, { encouragementId }),
  ).rejects.toThrow("Not authorized to delete this encouragement");

  const asOwner = t.withIdentity({ subject: "alice" });
  await asOwner.mutation(api.encouragements.remove, { encouragementId });

  const result = await t.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
  });
  expect(result.page).toEqual([]);
});

test("removing an encouragement soft-deletes it so it can be recovered later", async () => {
  const { t, babyId } = await setupWithBaby();

  const encouragementId = await t.mutation(api.encouragements.create, {
    babyId,
    authorName: "Grandma",
    message: "Oops wrong baby",
    visitorId: "visitor-1",
  });

  await t.mutation(api.encouragements.remove, {
    encouragementId,
    visitorId: "visitor-1",
  });

  const listed = await t.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
  });
  expect(listed.page).toEqual([]);

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored?.deletedAt).toEqual(expect.any(Number));
  expect(stored?.message).toBe("Oops wrong baby");
});
