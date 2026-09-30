import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { PASSKEY_EMAIL_TAKEN_CODE } from "../src/passkey";
import { createAuth } from "./auth";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

async function signUpWithPassword(
  t: Awaited<ReturnType<typeof setup>>,
  opts: { email: string; name: string },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: opts.email,
        name: opts.name,
        password: "password123",
      },
    });
    return result.user.id;
  });
}

test("sign-in methods are hidden until someone is signed in", async () => {
  const t = await setup();
  expect(await t.query(api.signInMethods.get, {})).toBeNull();
});

test("a password account reports a password and no devices", async () => {
  const t = await setup();
  const userId = await signUpWithPassword(t, { email: "ada@example.com", name: "Ada" });
  const asUser = t.withIdentity({ subject: userId });
  expect(await asUser.query(api.signInMethods.get, {})).toEqual({
    hasPassword: true,
    passkeys: [],
  });
});

test("prepare refuses an email that already has a password", async () => {
  const t = await setup();
  await signUpWithPassword(t, { email: "ada@example.com", name: "Ada" });
  await expect(
    t.mutation(internal.passkeySignup.prepare, { email: "ada@example.com", name: "Ada" }),
  ).rejects.toThrow(PASSKEY_EMAIL_TAKEN_CODE);
});

test("provision creates a passkey-only user that a retry can reuse", async () => {
  const t = await setup();
  expect(
    await t.mutation(internal.passkeySignup.prepare, {
      email: "new@example.com",
      name: "New Parent",
    }),
  ).toBeNull();

  const userId = await t.mutation(internal.passkeySignup.provision, {
    email: "new@example.com",
    name: "New Parent",
  });
  expect(
    await t.mutation(internal.passkeySignup.prepare, {
      email: "new@example.com",
      name: "New Parent",
    }),
  ).toBe(userId);

  const asUser = t.withIdentity({ subject: userId });
  expect(await asUser.query(api.signInMethods.get, {})).toEqual({
    hasPassword: false,
    passkeys: [],
  });
});

test("a stored passkey shows up on the account", async () => {
  const t = await setup();
  const userId = await t.mutation(internal.passkeySignup.provision, {
    email: "new@example.com",
    name: "New Parent",
  });
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        data: {
          aaguid: null,
          backedUp: false,
          counter: 0,
          createdAt: 1,
          credentialID: "cred-1",
          deviceType: "singleDevice",
          name: "Kitchen laptop",
          publicKey: "pk",
          transports: null,
          userId,
        },
        model: "passkey",
      },
    });
  });

  const asUser = t.withIdentity({ subject: userId });
  const methods = await asUser.query(api.signInMethods.get, {});
  expect(methods?.hasPassword).toBe(false);
  expect(methods?.passkeys).toEqual([
    {
      aaguid: null,
      createdAt: 1,
      id: methods?.passkeys[0]?.id,
      name: "Kitchen laptop",
    },
  ]);
  expect(methods?.passkeys[0]?.id).toEqual(expect.any(String));
});

test("prepare refuses once a passkey exists", async () => {
  const t = await setup();
  const userId = await t.mutation(internal.passkeySignup.provision, {
    email: "new@example.com",
    name: "New Parent",
  });
  await t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        data: {
          backedUp: false,
          counter: 0,
          credentialID: "cred-1",
          deviceType: "singleDevice",
          publicKey: "pk",
          userId,
        },
        model: "passkey",
      },
    });
  });

  await expect(
    t.mutation(internal.passkeySignup.prepare, { email: "new@example.com", name: "New Parent" }),
  ).rejects.toThrow(PASSKEY_EMAIL_TAKEN_CODE);
});
