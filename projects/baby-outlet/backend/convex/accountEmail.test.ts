import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, components } from "./_generated/api";
import schema from "./schema";
import { createAuth } from "./auth";
import { modules, registerComponents, createBabyArgs } from "./test.setup";

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

async function findAuthUser(t: Awaited<ReturnType<typeof setup>>, userId: string) {
  return await t.query(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: userId }],
  });
}

test("anonymous callers cannot change email", async () => {
  const t = await setup();
  await expect(
    t.mutation(api.accountEmail.change, { newEmail: "new@example.com" }),
  ).rejects.toThrow("Not authenticated");
});

test("changing email updates the Better Auth user and clears verification", async () => {
  const t = await setup();
  const userId = await signUp(t, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        update: { emailVerified: true },
        where: [{ field: "_id", value: userId }],
      },
    });
  });

  await t.withIdentity({ subject: userId }).mutation(api.accountEmail.change, {
    newEmail: " ada.new@example.com ",
  });

  const user = await findAuthUser(t, userId);
  expect(user).toMatchObject({
    email: "ada.new@example.com",
    emailVerified: false,
  });
});

test("changing email rejects the current address and taken addresses", async () => {
  const t = await setup();
  const adaId = await signUp(t, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  await signUp(t, {
    email: "grace@example.com",
    name: "Grace",
    password: "password123",
  });
  const asAda = t.withIdentity({ subject: adaId });

  await expect(
    asAda.mutation(api.accountEmail.change, { newEmail: "ADA@example.com" }),
  ).rejects.toThrow("Choose a different email address.");
  await expect(
    asAda.mutation(api.accountEmail.change, { newEmail: "grace@example.com" }),
  ).rejects.toThrow("Email already in use");
});

test("changing email claims pending co-parent invites for the new address", async () => {
  const t = await setup();
  const ownerId = await signUp(t, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  const adaId = await signUp(t, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  const asOwner = t.withIdentity({ subject: ownerId });
  const created = await asOwner.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-01",
      name: "Shared Baby",
    }),
  );
  await asOwner.mutation(api.coParents.invite, {
    babyId: created.babyId,
    email: "ada.new@example.com",
  });

  await t.withIdentity({ subject: adaId }).mutation(api.accountEmail.change, {
    newEmail: "ada.new@example.com",
  });

  const listed = await asOwner.query(api.coParents.listForBaby, { babyId: created.babyId });
  if (listed === "forbidden") {
    throw new Error("expected manager access");
  }
  expect(listed.invites).toEqual([]);
  expect(listed.coParents).toMatchObject([{ email: "ada.new@example.com" }]);
});
