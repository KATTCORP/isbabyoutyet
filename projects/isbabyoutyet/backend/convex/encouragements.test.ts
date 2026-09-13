import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, registerComponents, createBabyArgs, createEncouragementArgs } from "./test.setup";

const FIRST_PAGE = { cursor: null, numItems: 10 };

async function setupWithBaby() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const babyId: Id<"baby"> = await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Baby Smith",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "baby-smith",
      subscriptionCount: 0,
      userId: "alice",
    });
  });
  return { babyId, t };
}

test("visitors can create encouragements and list them", async () => {
  const { babyId, t } = await setupWithBaby();

  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId,
      message: "We can't wait to meet you!",
      visitorId: "visitor-1",
    }),
  );
  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "  Uncle Bob  ",
      babyId,
      message: "Good luck! ",
      visitorId: "visitor-2",
    }),
  );

  const result = await t.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: "visitor-2",
  });

  // Newest first; names and messages are trimmed; visitor credential and
  // metadata are never exposed — only an isMine marker for the caller
  expect(result.page).toMatchObject([
    { authorName: "Uncle Bob", isMine: true, message: "Good luck!" },
    { authorName: "Grandma", isMine: false, message: "We can't wait to meet you!" },
  ]);
  expect(result.page[0]).not.toHaveProperty("author");
  expect(result.page[0]).not.toHaveProperty("visitorId");
  expect(result.page[0]).not.toHaveProperty("userId");
  expect(result.page[0]).not.toHaveProperty("userAgent");

  const stored = await t.run(async (ctx) => {
    return await ctx.db
      .query("encouragements")
      .withIndex("by_babyId", (q) => q.eq("babyId", babyId))
      .collect();
  });
  expect(stored).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        author: { type: "visitor", visitorId: "visitor-1" },
        locale: null,
        timezone: null,
        userAgent: null,
      }),
      expect.objectContaining({
        author: { type: "visitor", visitorId: "visitor-2" },
        locale: null,
        timezone: null,
        userAgent: null,
      }),
    ]),
  );
});

test("create persists visitor metadata when provided", async () => {
  const { babyId, t } = await setupWithBaby();
  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId,
      locale: "en-US",
      message: "Hi!",
      timezone: "Europe/Stockholm",
      userAgent: "Mozilla/5.0",
      visitorId: "visitor-1",
    }),
  );
  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored).toMatchObject({
    author: { type: "visitor", visitorId: "visitor-1" },
    locale: "en-US",
    timezone: "Europe/Stockholm",
    userAgent: "Mozilla/5.0",
  });
});

test("create rejects a missing baby, blank name, overlong name, and blank message", async () => {
  const { babyId, t } = await setupWithBaby();

  await t.run(async (ctx) => {
    await ctx.db.delete(babyId);
  });
  await expect(
    t.mutation(
      api.encouragements.create,
      createEncouragementArgs({
        authorName: "Grandma",
        babyId,
        message: "Hi!",
        visitorId: "visitor-1",
      }),
    ),
  ).rejects.toThrow("Baby not found");

  const { babyId: babyId2, t: t2 } = await setupWithBaby();
  await expect(
    t2.mutation(
      api.encouragements.create,
      createEncouragementArgs({
        authorName: "   ",
        babyId: babyId2,
        message: "Hi!",
        visitorId: "visitor-1",
      }),
    ),
  ).rejects.toThrow("Name is required");
  await expect(
    t2.mutation(
      api.encouragements.create,
      createEncouragementArgs({
        authorName: "x".repeat(51),
        babyId: babyId2,
        message: "Hi!",
        visitorId: "visitor-1",
      }),
    ),
  ).rejects.toThrow("Name must be 50 characters or less");
  await expect(
    t2.mutation(
      api.encouragements.create,
      createEncouragementArgs({
        authorName: "Grandma",
        babyId: babyId2,
        message: "   ",
        visitorId: "visitor-1",
      }),
    ),
  ).rejects.toThrow("Message is required");
});

test("the author can edit their encouragement within the edit window", async () => {
  const { babyId, t } = await setupWithBaby();

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId,
      message: "Typo mesage",
      visitorId: "visitor-1",
    }),
  );

  await t.mutation(api.encouragements.update, {
    encouragementId,
    message: "Fixed message",
    visitorId: "visitor-1",
  });

  const result = await t.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(result.page).toMatchObject([{ message: "Fixed message" }]);
});

test("editing is refused for the wrong visitor and after the edit window", async () => {
  const { babyId, t } = await setupWithBaby();

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId,
      message: "Original message",
      visitorId: "visitor-1",
    }),
  );

  // The visitorId is the edit credential — a different visitor is refused
  await expect(
    t.mutation(api.encouragements.update, {
      encouragementId,
      message: "Hijacked",
      visitorId: "visitor-imposter",
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
      message: "Too late",
      visitorId: "visitor-1",
    }),
  ).rejects.toThrow("Edit window has expired");
});

test("the baby's owner can remove an encouragement", async () => {
  const { babyId, t } = await setupWithBaby();

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Stranger",
      babyId,
      message: "Something inappropriate",
      visitorId: "visitor-x",
    }),
  );

  const asUnrelatedUser = t.withIdentity({ subject: "bob" });
  await expect(
    asUnrelatedUser.mutation(api.encouragements.remove, { encouragementId, visitorId: null }),
  ).rejects.toThrow("Not authorized to delete this encouragement");

  const asOwner = t.withIdentity({ subject: "alice" });
  await asOwner.mutation(api.encouragements.remove, { encouragementId, visitorId: null });

  const result = await t.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(result.page).toEqual([]);
});

test("removing an encouragement soft-deletes it so it can be recovered later", async () => {
  const { babyId, t } = await setupWithBaby();

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId,
      message: "Oops wrong baby",
      visitorId: "visitor-1",
    }),
  );

  await t.mutation(api.encouragements.remove, {
    encouragementId,
    visitorId: "visitor-1",
  });

  const listed = await t.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(listed.page).toEqual([]);

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored?.deletedAt).toEqual(expect.any(Number));
  expect(stored?.message).toBe("Oops wrong baby");
});

test("visitor messages notify opted-in owners; deletes retract the push instead of sending one", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Notify Baby",
    }),
  );
  await asAlice.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "owner-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/owner-inbox",
    p256dh: "owner-key",
    userAgent: "Mozilla/5.0",
  });

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId: created.babyId,
      message: "Thinking of you!",
      visitorId: "visitor-1",
    }),
  );
  await t.finishInProgressScheduledFunctions();
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/owner-inbox",
    }),
  ).toBe(true);

  await t.mutation(api.encouragements.update, {
    encouragementId,
    message: "Thinking of you both!",
    visitorId: "visitor-1",
  });
  await t.finishInProgressScheduledFunctions();
  const afterEdit = await t.query(api.encouragements.listByBaby, {
    babyId: created.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: "visitor-1",
  });
  expect(afterEdit.page).toMatchObject([{ message: "Thinking of you both!" }]);

  await t.mutation(api.encouragements.remove, {
    encouragementId,
    visitorId: "visitor-1",
  });
  await t.finishInProgressScheduledFunctions();
  const afterDelete = await t.query(api.encouragements.listByBaby, {
    babyId: created.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: "visitor-1",
  });
  expect(afterDelete.page).toEqual([]);
});

test("a signed-in author stores their user id without changing the typed name", async () => {
  const { babyId, t } = await setupWithBaby();
  const asAlice = t.withIdentity({ subject: "alice" });

  const encouragementId = await asAlice.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma Alice",
      babyId,
      message: "From my account",
      visitorId: "alice-browser",
    }),
  );

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored).toMatchObject({
    author: { type: "user", userId: "alice", visitorId: "alice-browser" },
    authorName: "Grandma Alice",
    visitorId: "alice-browser",
  });
  expect(stored).not.toHaveProperty("userId");

  const listed = await asAlice.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: "different-browser",
  });
  expect(listed.page).toMatchObject([{ authorName: "Grandma Alice", isMine: true }]);
  expect(listed.page[0]).not.toHaveProperty("author");
  expect(listed.page[0]).not.toHaveProperty("userId");
});

test("a signed-in author can edit and delete on a new visitor id after claiming", async () => {
  const { babyId, t } = await setupWithBaby();

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Guest Name",
      babyId,
      message: "Posted before I signed in",
      visitorId: "guest-browser",
    }),
  );

  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.encouragements.claimVisitorEncouragements, {
    visitorId: "guest-browser",
  });

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored).toMatchObject({
    author: { type: "user", userId: "alice", visitorId: "guest-browser" },
    authorName: "Guest Name",
    visitorId: "guest-browser",
  });
  expect(stored).not.toHaveProperty("userId");

  await asAlice.mutation(api.encouragements.update, {
    encouragementId,
    message: "Edited after sign-in",
    visitorId: "new-browser",
  });
  const listed = await asAlice.query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: "new-browser",
  });
  expect(listed.page).toMatchObject([
    { authorName: "Guest Name", isMine: true, message: "Edited after sign-in" },
  ]);

  await asAlice.mutation(api.encouragements.remove, {
    encouragementId,
    visitorId: "new-browser",
  });
  expect(
    (
      await asAlice.query(api.encouragements.listByBaby, {
        babyId,
        paginationOpts: FIRST_PAGE,
        visitorId: "new-browser",
      })
    ).page,
  ).toEqual([]);
});

test("claiming a visitor id does not steal comments already linked to another user", async () => {
  const { babyId, t } = await setupWithBaby();

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Bob",
      babyId,
      message: "Already claimed",
      visitorId: "shared-browser",
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(encouragementId, {
      author: { type: "user", userId: "bob", visitorId: "shared-browser" },
    });
  });

  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.encouragements.claimVisitorEncouragements, {
    visitorId: "shared-browser",
  });

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored).toMatchObject({
    author: { type: "user", userId: "bob", visitorId: "shared-browser" },
    authorName: "Bob",
  });
});

test("claiming a visitor id does not steal homepage-demo fixture comments", async () => {
  const { babyId, t } = await setupWithBaby();
  const encouragementId = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId,
      kind: "encouragement",
      postedAt: 100,
    });
    return await ctx.db.insert("encouragements", {
      author: { type: "visitor", visitorId: "demo-browser" },
      authorName: "Demo Aunt",
      babyId,
      createdAt: 100,
      demoFixture: true,
      message: "Seeded fixture",
      timelineItemId,
      visitorId: "demo-browser",
    });
  });

  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.encouragements.claimVisitorEncouragements, {
    visitorId: "demo-browser",
  });

  const stored = await t.run(async (ctx) => ctx.db.get(encouragementId));
  expect(stored).toMatchObject({
    author: { type: "visitor", visitorId: "demo-browser" },
    authorName: "Demo Aunt",
    demoFixture: true,
  });
});

test("claiming visitor encouragements requires authentication", async () => {
  const { t } = await setupWithBaby();
  await expect(
    t.mutation(api.encouragements.claimVisitorEncouragements, { visitorId: "guest-browser" }),
  ).rejects.toThrow("Not authenticated");
});

test("a manager posting or deleting a message does not notify owners", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Quiet Delete Baby",
    }),
  );
  await asAlice.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "owner-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/owner-inbox",
    p256dh: "owner-key",
    userAgent: "Mozilla/5.0",
  });

  const managerPostId = await asAlice.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Alice",
      babyId: created.babyId,
      message: "Owner note",
      visitorId: "owner-visitor",
    }),
  );
  await t.finishInProgressScheduledFunctions();

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Stranger",
      babyId: created.babyId,
      message: "Please delete me",
      visitorId: "visitor-x",
    }),
  );
  await t.finishInProgressScheduledFunctions();

  await asAlice.mutation(api.encouragements.remove, {
    encouragementId,
    visitorId: null,
  });
  await asAlice.mutation(api.encouragements.remove, {
    encouragementId: managerPostId,
    visitorId: null,
  });
  await t.finishInProgressScheduledFunctions();

  const listed = await t.query(api.encouragements.listByBaby, {
    babyId: created.babyId,
    paginationOpts: FIRST_PAGE,
    visitorId: null,
  });
  expect(listed.page).toEqual([]);
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/owner-inbox",
    }),
  ).toBe(true);
});
