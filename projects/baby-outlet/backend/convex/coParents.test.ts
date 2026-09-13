import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createAuth } from "./auth";
import { modules, registerComponents } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

async function signUp(
  t: Awaited<ReturnType<typeof setup>>,
  opts: { email: string; password: string; name: string },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: opts.email,
        password: opts.password,
        name: opts.name,
      },
    });
    return result.user.id;
  });
}

test("owner can add an existing user as co-parent; co-parent can post updates", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "alice@example.com",
    password: "password123",
    name: "Alice",
  });
  const bobId = await signUp(t, {
    email: "bob@example.com",
    password: "password123",
    name: "Bob",
  });

  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Shared Baby",
    dueDate: "2026-09-01",
  });

  await expect(
    asBob.mutation(api.updates.post, {
      babyId: created.babyId,
      message: "Nope",
    }),
  ).rejects.toThrow("Not authorized");

  const inviteResult = await asAlice.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "bob@example.com",
  });
  expect(inviteResult).toEqual({ status: "added" });

  const updateId = await asBob.mutation(api.updates.post, {
    babyId: created.babyId,
    message: "Labour vibes",
  });

  const stored = await t.run(async (ctx) => ctx.db.get(updateId));
  expect(stored?.postedByUserId).toBe(bobId);

  const bobBabies = await asBob.query(api.baby.listByUser, {});
  expect(bobBabies).toMatchObject([{ _id: created.babyId, role: "coParent" }]);

  await expect(asBob.mutation(api.baby.remove, { babyId: created.babyId })).rejects.toThrow(
    "Not authorized",
  );

  const access = await asBob.query(api.coParents.myAccess, { babyId: created.babyId });
  expect(access).toEqual({ isOwner: false, isCoParent: true, canManage: true });
});

test("inviting an unknown email creates a pending invite claimed on sign-in", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "owner@example.com",
    password: "password123",
    name: "Owner",
  });
  const asAlice = t.withIdentity({ subject: aliceId });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Pending Invite Baby",
    dueDate: "2026-10-01",
  });

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
    password: "password123",
    name: "Newbie",
  });
  const asNewbie = t.withIdentity({ subject: newbieId });

  const claimed = await asNewbie.mutation(api.coParents.claimPendingInvites, {});
  expect(claimed).toEqual({ claimed: 1 });

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

test("only the owner can manage co-parents and delete the baby", async () => {
  const t = await setup();
  const aliceId = await signUp(t, {
    email: "alice2@example.com",
    password: "password123",
    name: "Alice",
  });
  const bobId = await signUp(t, {
    email: "bob2@example.com",
    password: "password123",
    name: "Bob",
  });
  const carolId = await signUp(t, {
    email: "carol@example.com",
    password: "password123",
    name: "Carol",
  });

  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Owned Baby",
    dueDate: "2026-11-01",
  });
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
  expect(ownerAccess).toEqual({ isOwner: true, isCoParent: false, canManage: true });

  const anonAccess = await t.query(api.coParents.myAccess, { babyId: created.babyId });
  expect(anonAccess).toEqual({ isOwner: false, isCoParent: false, canManage: false });
});

test("manager-only listings return forbidden for visitors instead of throwing", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Gated Baby",
    dueDate: "2026-09-01",
  });

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
