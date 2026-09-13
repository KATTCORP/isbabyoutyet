import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createAuth } from "./auth";
import { modules, registerComponents, createBabyArgs, postUpdateArgs } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

async function signUp(
  t: Awaited<ReturnType<typeof setup>>,
  opts: { email: string; name: string; password: string },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: opts.email,
        name: opts.name,
        password: opts.password,
      },
    });
    return result.user.id;
  });
}

async function signIn(
  t: Awaited<ReturnType<typeof setup>>,
  opts: { email: string; password: string },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signInEmail({
      body: {
        email: opts.email,
        password: opts.password,
      },
    });
    return result.user.id;
  });
}

test("owner can add an existing user as co-parent; co-parent can post updates", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "alice@example.com",
    name: "Alice",
    password: "password123",
  });
  const bobId = await signUp(t, {
    email: "bob@example.com",
    name: "Bob",
    password: "password123",
  });

  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Shared Baby",
    }),
  );

  await expect(
    asBob.mutation(
      api.updates.post,
      postUpdateArgs({
        babyId: created.babyId,
        message: "Nope",
      }),
    ),
  ).rejects.toThrow("Not authorized");

  const inviteResult = await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "bob@example.com",
  });
  expect(inviteResult).toEqual({ status: "added" });

  const updateId = await asBob.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      message: "Labour vibes",
    }),
  );

  const stored = await t.run(async (ctx) => ctx.db.get(updateId));
  expect(stored?.postedByUserId).toBe(bobId);

  const bobBabies = await asBob.query(api.baby.listByUser, {});
  expect(bobBabies).toMatchObject([{ _id: created.babyId, role: "coParent" }]);

  await expect(asBob.mutation(api.baby.remove, { babyId: created.babyId })).rejects.toThrow(
    "Not authorized",
  );

  const access = await asBob.query(api.coParents.myAccess, { babyId: created.babyId });
  expect(access).toEqual({ canManage: true, isCoParent: true, isOwner: false });
});

test("inviting an unknown email creates a pending invite claimed on sign-up", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  const asAlice = t.withIdentity({ subject: aliceId });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-01",
      name: "Pending Invite Baby",
    }),
  );

  const inviteResult = await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "newbie@example.com",
  });
  expect(inviteResult).toEqual({ status: "invited" });

  const listed = await asAlice.query(api.coParents.listForBaby, { babyId: created.babyId });
  if (listed === "forbidden") {
    throw new Error("expected manager access");
  }
  expect(listed.invites).toMatchObject([{ email: "newbie@example.com" }]);
  expect(listed.coParents).toEqual([]);

  const newbieId = await signUp(t, {
    email: "newbie@example.com",
    name: "Newbie",
    password: "password123",
  });
  const asNewbie = t.withIdentity({ subject: newbieId });

  const after = await asAlice.query(api.coParents.listForBaby, { babyId: created.babyId });
  if (after === "forbidden") {
    throw new Error("expected manager access");
  }
  expect(after.invites).toEqual([]);
  expect(after.coParents).toMatchObject([{ email: "newbie@example.com" }]);
  expect(after.coParents[0]).not.toHaveProperty("userId");

  expect(await asNewbie.query(api.baby.listByUser, {})).toMatchObject([
    { _id: created.babyId, role: "coParent" },
  ]);
});

test("pending invite is claimed when an existing user signs in", async () => {
  const t = await setup();
  const newbieId = await signUp(t, {
    email: "returning@example.com",
    name: "Returning",
    password: "password123",
  });
  const aliceId = await signUp(t, {
    email: "owner2@example.com",
    name: "Owner",
    password: "password123",
  });
  const asAlice = t.withIdentity({ subject: aliceId });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-15",
      name: "Sign-in Claim Baby",
    }),
  );

  await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "returning@example.com",
  });

  await signIn(t, {
    email: "returning@example.com",
    password: "password123",
  });

  const asReturning = t.withIdentity({ subject: newbieId });
  expect(await asReturning.query(api.baby.listByUser, {})).toMatchObject([
    { _id: created.babyId, role: "coParent" },
  ]);
});

test("only the owner can manage co-parents and delete the baby", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "alice2@example.com",
    name: "Alice",
    password: "password123",
  });
  const bobId = await signUp(t, {
    email: "bob2@example.com",
    name: "Bob",
    password: "password123",
  });
  const carolId = await signUp(t, {
    email: "carol@example.com",
    name: "Carol",
    password: "password123",
  });

  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-11-01",
      name: "Owned Baby",
    }),
  );
  await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "bob2@example.com",
  });

  await expect(
    asBob.mutation(api.coParents.invite, {
      babyId: created.babyId,
      email: "carol@example.com",
    }),
  ).rejects.toThrow("Not authorized");

  await asBob.mutation(api.coParents.leave, { babyId: created.babyId });
  expect(await asBob.query(api.baby.listByUser, {})).toEqual([]);

  // Re-add bob, then owner removes
  await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "bob2@example.com",
  });
  const listed = await asAlice.query(api.coParents.listForBaby, { babyId: created.babyId });
  if (listed === "forbidden") {
    throw new Error("expected manager access");
  }
  const bobRow = listed.coParents[0];
  expect(bobRow).not.toHaveProperty("userId");
  await asAlice.mutation(api.coParents.removeCoParent, { coParentId: bobRow!._id });

  // Pending invite cancel + duplicate invite refusal
  await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "pending@example.com",
  });
  await expect(
    asAlice.mutation(api.coParents.invite, {
      babyId: created.babyId,
      email: "pending@example.com",
    }),
  ).rejects.toThrow("An invite is already pending");

  const withInvite = await asAlice.query(api.coParents.listForBaby, { babyId: created.babyId });
  if (withInvite === "forbidden") {
    throw new Error("expected manager access");
  }
  const inviteId = withInvite.invites[0]?._id;
  expect(inviteId).toBeTruthy();
  await asAlice.mutation(api.coParents.cancelInvite, { inviteId: inviteId! });

  await expect(
    asAlice.mutation(api.coParents.invite, {
      babyId: created.babyId,
      email: "not-an-email",
    }),
  ).rejects.toThrow("Enter a valid email address");

  await expect(
    asAlice.mutation(api.coParents.invite, {
      babyId: created.babyId,
      email: "alice2@example.com",
    }),
  ).rejects.toThrow("You already own this page");

  // carol unused except ensuring signup works for invite refusal path
  expect(carolId).toBeTruthy();

  const ownerAccess = await asAlice.query(api.coParents.myAccess, { babyId: created.babyId });
  expect(ownerAccess).toEqual({ canManage: true, isCoParent: false, isOwner: true });

  const anonAccess = await t.query(api.coParents.myAccess, { babyId: created.babyId });
  expect(anonAccess).toEqual({ canManage: false, isCoParent: false, isOwner: false });
});

test("manager-only listings return forbidden for visitors instead of throwing", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Gated Baby",
    }),
  );

  // Signed-in non-manager and anonymous visitors get the sentinel, so the
  // baby route loader can query these homogeneously for everyone.
  expect(await asBob.query(api.coParents.listForBaby, { babyId: created.babyId })).toBe(
    "forbidden",
  );
  expect(await t.query(api.coParents.listForBaby, { babyId: created.babyId })).toBe("forbidden");
  expect(await asBob.query(api.baby.getScheduledNotifications, { babyId: created.babyId })).toBe(
    "forbidden",
  );
  expect(await t.query(api.baby.getScheduledNotifications, { babyId: created.babyId })).toBe(
    "forbidden",
  );
});

test("claimPendingInvites clears pending invites addressed to the page owner", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "owner-invite@example.com",
    name: "Alice",
    password: "password123",
  });
  const asAlice = t.withIdentity({ subject: aliceId });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Owned Baby",
    }),
  );

  const inviteId = await t.run(async (ctx) => {
    return await ctx.db.insert("babyCoParentInvites", {
      babyId: created.babyId,
      createdAt: Date.now(),
      email: "owner-invite@example.com",
      invitedByUserId: "someone-else",
    });
  });

  await asAlice.mutation(api.coParents.claimPendingInvites, {});

  const invite = await t.run(async (ctx) => ctx.db.get(inviteId));
  expect(invite?.deletedAt).toEqual(expect.any(Number));
  const coParents = await t.run(async (ctx) =>
    ctx.db
      .query("babyCoParents")
      .withIndex("by_babyId", (q) => q.eq("babyId", created.babyId))
      .collect(),
  );
  expect(coParents).toHaveLength(0);
});

test("leaving a page drops that co-parent's message-notification subscriptions", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "owner-push@example.com",
    name: "Owner",
    password: "password123",
  });
  const bobId = await signUp(t, {
    email: "coparent-push@example.com",
    name: "Bob",
    password: "password123",
  });
  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Shared Notify Baby",
    }),
  );
  await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "coparent-push@example.com",
  });
  await asBob.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "bob-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/bob-inbox",
    p256dh: "bob-key",
    userAgent: "Mozilla/5.0",
  });
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/bob-inbox",
    }),
  ).toBe(true);

  await asBob.mutation(api.coParents.leave, { babyId: created.babyId });
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/bob-inbox",
    }),
  ).toBe(false);
});

test("removing a co-parent drops their message-notification subscriptions", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "owner-remove-push@example.com",
    name: "Owner",
    password: "password123",
  });
  const bobId = await signUp(t, {
    email: "coparent-remove-push@example.com",
    name: "Bob",
    password: "password123",
  });
  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Remove Notify Baby",
    }),
  );
  await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "coparent-remove-push@example.com",
  });
  await asBob.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "bob-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/bob-removed",
    p256dh: "bob-key",
    userAgent: "Mozilla/5.0",
  });
  const listed = await asAlice.query(api.coParents.listForBaby, { babyId: created.babyId });
  if (listed === "forbidden") {
    throw new Error("expected manager access");
  }
  const bobRow = listed.coParents[0];
  if (!bobRow) {
    throw new Error("expected co-parent row");
  }
  await asAlice.mutation(api.coParents.removeCoParent, { coParentId: bobRow._id });
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/bob-removed",
    }),
  ).toBe(false);
});
