import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { createAuth, resolveAuthBaseUrl, sendAuthResetPassword } from "./auth";
import { components } from "./_generated/api";
import schema from "./schema";
import { makeResource } from "./test.resource";
import { modules, registerComponents } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

function withoutVercelEnv() {
  const previousVercelEnv = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  return makeResource({}, () => {
    if (previousVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = previousVercelEnv;
    }
  });
}

test("auth base URL prefers the web origin after preview env sync", () => {
  expect(resolveAuthBaseUrl("https://preview.example", "https://convex.example")).toBe(
    "https://preview.example",
  );
});

test("auth base URL falls back to the Convex origin during preview bootstrap", () => {
  expect(resolveAuthBaseUrl(undefined, "https://convex.example")).toBe("https://convex.example");
});

test("sendAuthResetPassword rejects query and mutation contexts", async () => {
  const t = await setup();
  await expect(
    t.run(async (ctx) => {
      await sendAuthResetPassword(ctx, {
        url: "https://isbabyoutyet.com/auth/reset-password?token=abc",
        user: { email: "parent@example.com" },
      });
    }),
  ).rejects.toThrow("Action context required");
});

test("sendAuthResetPassword delivers through Convex env from an action ctx", async () => {
  await using _env = withoutVercelEnv();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await using _restore = makeResource({}, () => {
    log.mockRestore();
  });

  const t = await setup();
  await t.action(async (ctx) => {
    await sendAuthResetPassword(ctx, {
      url: "https://isbabyoutyet.com/auth/reset-password?token=abc",
      user: { email: "parent@example.com" },
    });
  });

  expect(log).toHaveBeenCalledWith(
    "email.skipped_local_delivery",
    expect.objectContaining({
      to: "parent@example.com",
    }),
  );
  expect(log).toHaveBeenCalledWith("https://isbabyoutyet.com/auth/reset-password?token=abc");
});

test("createAuth sendResetPassword uses the action-only delivery helper", async () => {
  await using _env = withoutVercelEnv();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await using _restore = makeResource({}, () => {
    log.mockRestore();
  });

  const t = await setup();
  await t.action(async (ctx) => {
    const auth = createAuth(ctx);
    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword;
    if (sendResetPassword === undefined) {
      throw new Error("expected sendResetPassword");
    }

    await sendResetPassword({
      token: "abc",
      url: "https://isbabyoutyet.com/auth/reset-password?token=abc",
      user: {
        createdAt: new Date(0),
        email: "parent@example.com",
        emailVerified: false,
        id: "user_1",
        name: "Parent",
        updatedAt: new Date(0),
      },
    });
  });

  expect(log).toHaveBeenCalledWith(
    "email.skipped_local_delivery",
    expect.objectContaining({
      to: "parent@example.com",
    }),
  );
  expect(log).toHaveBeenCalledWith("https://isbabyoutyet.com/auth/reset-password?token=abc");
});

test("createAuth leaves Better Auth change-email off so profile updates skip mail", async () => {
  const t = await setup();
  await t.action(async (ctx) => {
    const auth = createAuth(ctx);
    expect(auth.options.user?.changeEmail).toEqual({ enabled: false });
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(auth.options.emailAndPassword?.onPasswordReset).toEqual(expect.any(Function));
  });
});

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

test("completing a password reset marks the account email verified", async () => {
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
        update: { emailVerified: false },
        where: [{ field: "_id", value: userId }],
      },
    });
  });

  await t.action(async (ctx) => {
    const auth = createAuth(ctx);
    const onPasswordReset = auth.options.emailAndPassword?.onPasswordReset;
    if (onPasswordReset === undefined) {
      throw new Error("expected onPasswordReset");
    }
    await onPasswordReset({
      user: {
        createdAt: new Date(0),
        email: "ada@example.com",
        emailVerified: false,
        id: userId,
        name: "Ada",
        updatedAt: new Date(0),
      },
    });
  });

  expect(await findAuthUser(t, userId)).toMatchObject({
    email: "ada@example.com",
    emailVerified: true,
  });
});
